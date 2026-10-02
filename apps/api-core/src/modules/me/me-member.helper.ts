import { NotFoundException } from '@nestjs/common';
import { QueryRunner } from 'typeorm';

/**
 * Resuelve a qué core.members pertenece el viajero autenticado. Si pasa
 * memberId explícito, RLS (members_tenant_or_self) ya garantiza que no
 * pueda ser de otra persona — igual se valida acá para dar un 404 claro
 * en vez de dejar que la FK de la tabla hija falle más abajo. Si no lo
 * pasa, toma el primero — la mayoría de los viajeros en el MVP solo
 * tienen una membership; elegir entre varias queda para cuando haga
 * falta un selector real en el cliente.
 */
export async function resolveMemberId(
  queryRunner: QueryRunner,
  personId: string,
  explicitMemberId?: string,
): Promise<string> {
  const rows = await queryRunner.query(
    `SELECT id FROM core.members WHERE person_id = $1 ORDER BY created_at LIMIT 1`,
    [personId],
  );

  if (explicitMemberId) {
    const match = await queryRunner.query(
      `SELECT id FROM core.members WHERE id = $1 AND person_id = $2`,
      [explicitMemberId, personId],
    );
    if (!match[0]) {
      throw new NotFoundException('No sos titular de ese member');
    }
    return explicitMemberId;
  }

  if (!rows[0]) {
    throw new NotFoundException(
      'Todavía no tenés ninguna cobertura/membership asociada',
    );
  }
  return rows[0].id;
}

/**
 * Igual que resolveMemberId, pero para features que NO requieren
 * cobertura (compartir ficha con un médico vía QR/link) — un viajero
 * "sin cobertura" (sin core.members) tiene que poder generarlas igual,
 * así que acá la ausencia de member NO es un error: se devuelve
 * memberId=null y el caller inserta con person_id en su lugar
 * (emergency.tokens/access_log aceptan ambos, ver gap #35).
 */
export async function resolveShareOwner(
  queryRunner: QueryRunner,
  personId: string,
  explicitMemberId?: string,
): Promise<{ memberId: string | null; personId: string }> {
  if (explicitMemberId) {
    const match = await queryRunner.query(
      `SELECT id FROM core.members WHERE id = $1 AND person_id = $2`,
      [explicitMemberId, personId],
    );
    if (!match[0]) {
      throw new NotFoundException('No sos titular de ese member');
    }
    return { memberId: explicitMemberId, personId };
  }

  const rows = await queryRunner.query(
    `SELECT id FROM core.members WHERE person_id = $1 ORDER BY created_at LIMIT 1`,
    [personId],
  );
  return { memberId: rows[0]?.id ?? null, personId };
}

export interface ActiveTenantResolution {
  tenantId: string;
  memberId: string;
  isPlatformTenant: boolean;
}

/**
 * Fase 1 — a qué empresa (tenant) le corresponde la marca/funciones que
 * ve este viajero. A diferencia de resolveMemberId (que asume "la
 * primera membership alcanza"), acá hace falta elegir bien porque un
 * viajero puede tener enrollments vigentes en más de una empresa.
 *
 * Sin enrollments vigentes → resuelve al tenant de plataforma
 * (is_platform_tenant = TRUE, hoy OYSGROUP). No es un caso especial
 * hardcodeado: OYSGROUP es una fila real de core.tenants con su propia
 * marca/flags, así que un viajero autogestionado ve exactamente lo que
 * OYSGROUP tenga configurado, ni más ni menos — pedido explícito del
 * usuario ("OYSGROUP debería también tener todo parametrizado").
 */
export async function resolveActiveTenant(
  queryRunner: QueryRunner,
  personId: string,
): Promise<ActiveTenantResolution> {
  const candidates = await queryRunner.query(
    `SELECT DISTINCT ON (t.id) t.id AS tenant_id, m.id AS member_id
     FROM coverage.travel_assistance_enrollments e
     JOIN core.members m ON m.id = e.member_id
     JOIN core.tenants t ON t.id = e.tenant_id
     WHERE m.person_id = $1
       AND e.status_id = params.catalog_id('ENROLLMENT_STATUS', 'ACTIVE')
       AND e.valid_from <= (NOW() AT TIME ZONE e.timezone_rule)
       AND e.valid_until >= (NOW() AT TIME ZONE e.timezone_rule)
     ORDER BY t.id, (e.status_authority = 'PARTNER_API') DESC,
              e.last_verified_at DESC NULLS LAST, e.valid_from DESC`,
    [personId],
  );

  if (candidates.length === 0) {
    const [platform] = await queryRunner.query(
      `SELECT id FROM core.tenants WHERE is_platform_tenant = TRUE LIMIT 1`,
    );
    if (!platform) {
      throw new NotFoundException('No hay tenant de plataforma configurado');
    }
    const memberRow = await resolveShareOwner(queryRunner, personId);
    return {
      tenantId: platform.id,
      memberId: memberRow.memberId ?? platform.id,
      isPlatformTenant: true,
    };
  }

  if (candidates.length === 1) {
    return {
      tenantId: candidates[0].tenant_id,
      memberId: candidates[0].member_id,
      isPlatformTenant: false,
    };
  }

  const [preference] = await queryRunner.query(
    `SELECT bp.active_member_id, m.tenant_id
     FROM core.member_branding_preferences bp
     JOIN core.members m ON m.id = bp.active_member_id
     WHERE bp.person_id = $1`,
    [personId],
  );
  if (preference && candidates.some((c: { tenant_id: string }) => c.tenant_id === preference.tenant_id)) {
    return { tenantId: preference.tenant_id, memberId: preference.active_member_id, isPlatformTenant: false };
  }

  return { tenantId: candidates[0].tenant_id, memberId: candidates[0].member_id, isPlatformTenant: false };
}
