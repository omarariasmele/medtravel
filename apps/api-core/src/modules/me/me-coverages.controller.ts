import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';
import { CurrentContext } from '@common/request-context/current-context.decorator';
import { RequestContextData } from '@common/request-context/request-context.types';

import { DeclarePolicyDto } from './dto/declare-policy.dto';

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
      const healthCoverages = await queryRunner.query(
        `SELECT hc.id, hc.coverage_name, hc.coverage_type_id, hc.provider_name,
                hc.policy_number, hc.valid_from, hc.valid_until, hc.status_id,
                hc.is_primary
         FROM coverage.health_coverages hc
         JOIN core.members m ON m.id = hc.member_id
         WHERE m.person_id = $1`,
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
}
