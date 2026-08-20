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
