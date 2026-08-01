import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';
import { CurrentContext } from '@common/request-context/current-context.decorator';
import { RequestContextData } from '@common/request-context/request-context.types';

import { DeclarePolicyDto } from './dto/declare-policy.dto';
import { DeclareHealthCoverageDto } from './dto/declare-health-coverage.dto';
import { UpdateHealthCoverageDto } from './dto/update-health-coverage.dto';

/**
 * Junta coverage.health_coverages (obra social/prepaga) y
 * coverage.travel_assistance_certificates (asistencia al viajero) en
 * una sola respuesta — el brief las pide como "coberturas" sin
 * distinguir origen desde la perspectiva del viajero. Filtra
 * explícitamente por member_id del propio person_id (no solo confía en
 * hc_select, que también deja ver coberturas de members ajenos si el
 * tenant tiene consentimiento — eso es para el lado operador, acá es
 * estrictamente "lo mío").
 */
@ApiTags('me')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('me/coverages')
export class MeCoveragesController {
  constructor(private readonly txManager: TenantTransactionManager) {}

  @Get()
  async list(@CurrentContext() context: RequestContextData) {
    return this.txManager.runInTransaction(async (queryRunner) => {
      /**
       * Obra social / prepaga — independiente de member_id (ver
       * proposed-healthcare-plans.sql): filtra directo por person_id,
       * no por member_id como el resto de este archivo, porque un
       * viajero sin ninguna empresa de asistencia asociada puede
       * igual tener esto cargado.
       */
      const healthCoverages = await queryRunner.query(
        `SELECT hc.id, hc.coverage_name, hc.coverage_type_id,
                hc.provider_id, prov.name AS provider_label, prov.code AS provider_code,
                hc.plan_id, hp.name AS plan_name,
                hc.member_number, hc.contractor_name,
                hc.policy_number, hc.valid_from, hc.valid_until, hc.status_id,
                hc.is_primary, hc.notes,
                (prov.lifecycle_status <> 'ACTIVE' OR hp.lifecycle_status <> 'ACTIVE') AS pending_review
         FROM coverage.health_coverages hc
         LEFT JOIN coverage.healthcare_providers prov ON prov.id = hc.provider_id
         LEFT JOIN coverage.healthcare_plans hp ON hp.id = hc.plan_id
         WHERE hc.person_id = $1
         ORDER BY hc.is_primary DESC, hc.valid_from DESC NULLS LAST`,
        [context.personId],
      );

      const certificates = await queryRunner.query(
        `SELECT cert.id, cert.certificate_number, cert.valid_from,
                cert.valid_until, cert.status_id
         FROM coverage.travel_assistance_certificates cert
         JOIN core.members m ON m.id = cert.member_id
         WHERE m.person_id = $1`,
        [context.personId],
      );

      /**
       * Distinto de travelAssistanceCertificates (documento formal
       * emitido, enrollment_id NOT NULL ahí): esto es la relación de
       * cobertura en sí — la crea automáticamente el matching de pólizas
       * (core.try_match_partner_record/try_match_pending_records_for_
       * person) apenas la empresa de asistencia carga la póliza o el
       * viajero carga su documento, sin necesitar que se emita un
       * certificado aparte. status_authority distingue si la cargó la
       * empresa (PARTNER_API/LOCAL_RECORD, validada) o el propio viajero
       * (MEMBER_DECLARED, todavía no validada).
       */
      const enrollments = await queryRunner.query(
        `SELECT tae.id, tae.policy_number, tae.valid_from, tae.valid_until,
                tae.status_id, tae.status_authority, ap.name AS plan_name,
                t.name AS tenant_name
         FROM coverage.travel_assistance_enrollments tae
         JOIN core.members m ON m.id = tae.member_id
         LEFT JOIN coverage.assistance_plans ap ON ap.id = tae.plan_id
         LEFT JOIN core.tenants t ON t.id = tae.tenant_id
         WHERE m.person_id = $1`,
        [context.personId],
      );

      const declaredPolicies = await queryRunner.query(
        `SELECT mdp.id, mdp.policy_number, mdp.declared_at, mdp.approved_at,
                mdp.rejected_at, mdp.rejection_reason, t.name AS tenant_name
         FROM core.member_declared_policies mdp
         JOIN core.members m ON m.id = mdp.member_id
         LEFT JOIN core.tenants t ON t.id = mdp.tenant_id
         WHERE m.person_id = $1
         ORDER BY mdp.declared_at DESC`,
        [context.personId],
      );

      return {
        healthCoverages,
        travelAssistanceCertificates: certificates,
        travelAssistanceEnrollments: enrollments,
        declaredPolicies,
      };
    });
  }

  /**
   * Empresas activas para que el viajero elija "quién me asegura" al
   * declarar su propia póliza — solo id+nombre (core.list_active_companies,
   * SECURITY DEFINER), nunca el resto de columnas de core.tenants
   * (contacto, razón social), que siguen protegidas por su RLS normal.
   */
  @Get('companies')
  async companies() {
    return this.txManager.runInTransaction((queryRunner) =>
      queryRunner.query(`SELECT * FROM core.list_active_companies()`),
    );
  }

  /**
   * El viajero declara su propia póliza cuando la empresa todavía no la
   * cargó — no crea un enrollment real (el viajero no elige el plan
   * exacto de la empresa), queda pendiente en core.member_declared_policies
   * hasta que un operador de esa empresa la apruebe (ver PartnerRecordsController
   * en coverage/partner-records.controller.ts).
   */
  @Post('declare')
  async declare(
    @CurrentContext() context: RequestContextData,
    @Body() dto: DeclarePolicyDto,
  ) {
    return this.txManager.runInTransaction(async (queryRunner) => {
      const [{ declare_member_policy: id }] = await queryRunner.query(
        `SELECT core.declare_member_policy($1, $2, $3) AS declare_member_policy`,
        [context.personId, dto.tenantId, dto.policyNumber],
      );
      return { id };
    });
  }

  /**
   * Alta de obra social/prepaga — a diferencia de declare() de arriba
   * (asistencia al viajero), esto NO pasa por ningún member/tenant: es
   * un hecho de la persona (ver proposed-healthcare-plans.sql).
   * provider_name/coverage_name se completan server-side con el label
   * del catálogo elegido, así el resto de las lecturas existentes
   * (ej. travelers-overview) siguen viendo un texto legible aunque no
   * lean provider_value_id/plan_id.
   */
  @Post('health')
  async declareHealth(
    @CurrentContext() context: RequestContextData,
    @Body() dto: DeclareHealthCoverageDto,
  ) {
    return this.txManager.runInTransaction(async (queryRunner) => {
      const [provider] = await queryRunner.query(
        `SELECT name, provider_type_id FROM coverage.healthcare_providers WHERE id = $1`,
        [dto.providerId],
      );
      const [plan] = await queryRunner.query(
        `SELECT name FROM coverage.healthcare_plans WHERE id = $1`,
        [dto.planId],
      );

      const [row] = await queryRunner.query(
        `INSERT INTO coverage.health_coverages
           (person_id, coverage_name, coverage_type_id, provider_name,
            provider_id, plan_id, member_number, contractor_name,
            valid_from, valid_until, status_id, is_primary, notes)
         VALUES
           ($1, $2, $3, $4,
            $5, $6, $7, $8,
            $9, $10, params.catalog_id('HEALTH_COVERAGE_STATUS', 'ACTIVE'), $11, $12)
         RETURNING id`,
        [
          context.personId,
          plan.name,
          provider.provider_type_id,
          provider.name,
          dto.providerId,
          dto.planId,
          dto.memberNumber ?? null,
          dto.contractorName ?? null,
          dto.validFrom,
          dto.validUntil ?? null,
          dto.isPrimary ?? false,
          dto.notes ?? null,
        ],
      );
      return { id: row.id };
    });
  }

  /**
   * Corregir datos o cerrar una afiliación vieja (seteando validUntil)
   * al cambiar de prepaga/obra social — nunca un DELETE (hc_no_delete).
   * RLS (hc_update) ya exige que sea el propio titular.
   */
  @Patch('health/:id')
  async updateHealth(
    @Param('id') id: string,
    @Body() dto: UpdateHealthCoverageDto,
  ) {
    return this.txManager.runInTransaction(async (queryRunner) => {
      const sets: string[] = [];
      const values: unknown[] = [];
      let i = 1;
      const push = (column: string, value: unknown) => {
        sets.push(`${column} = $${i++}`);
        values.push(value);
      };

      if (dto.providerId !== undefined) {
        const [provider] = await queryRunner.query(
          `SELECT name FROM coverage.healthcare_providers WHERE id = $1`,
          [dto.providerId],
        );
        push('provider_id', dto.providerId);
        push('provider_name', provider.name);
      }
      if (dto.planId !== undefined) {
        const [plan] = await queryRunner.query(
          `SELECT name FROM coverage.healthcare_plans WHERE id = $1`,
          [dto.planId],
        );
        push('plan_id', dto.planId);
        push('coverage_name', plan.name);
      }
      if (dto.memberNumber !== undefined) push('member_number', dto.memberNumber);
      if (dto.contractorName !== undefined) push('contractor_name', dto.contractorName);
      if (dto.validFrom !== undefined) push('valid_from', dto.validFrom);
      if (dto.validUntil !== undefined) push('valid_until', dto.validUntil);
      if (dto.isPrimary !== undefined) push('is_primary', dto.isPrimary);
      if (dto.notes !== undefined) push('notes', dto.notes);

      if (sets.length === 0) {
        return { id };
      }

      values.push(id);
      const [row] = await queryRunner.query(
        `UPDATE coverage.health_coverages SET ${sets.join(', ')} WHERE id = $${i} RETURNING id`,
        values,
      );
      return { id: row.id };
    });
  }
}
