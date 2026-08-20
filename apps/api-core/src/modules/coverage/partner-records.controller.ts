import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseArrayPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { randomUUID } from 'crypto';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';

import { CreatePartnerRecordDto } from './dto/create-partner-record.dto';
import { ApproveDeclaredPolicyDto } from './dto/approve-declared-policy.dto';
import { AssignPlanDto } from './dto/assign-plan.dto';

interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    tenantId?: string;
    canManageConfig: boolean;
  };
}

/**
 * Carga de pólizas por parte de la empresa de seguros/asistencia al
 * viajero — para SU PROPIO tenant siempre, salvo que sea un superadmin
 * de plataforma (canManageConfig), que puede indicar explícitamente
 * ?tenantId= para cargar en nombre de una empresa real (necesario
 * porque el superadmin no tiene "su propia" empresa de asistencia —
 * gap #44, pedido del usuario tras ver que "Cargar póliza" no dejaba
 * elegir la empresa). Un operador normal (no superadmin) NUNCA puede
 * pasar tenantId — se ignora silenciosamente si lo hace, para que una
 * empresa jamás pueda cargar pólizas a nombre de otra. Después de cada
 * INSERT dispara core.try_match_partner_record() para ver si el
 * viajero ya está registrado (ver proposed-partner-matching-function.sql).
 * No pasa por RlsCrudService: la lógica de negocio real (matching) vive
 * acá, no en un CRUD genérico.
 */
@ApiTags('coverage/partner-records')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('coverage/partner-member-records')
export class PartnerRecordsController {
  constructor(
    private readonly txManager: TenantTransactionManager,
    private readonly config: ConfigService,
  ) {}

  @Get()
  async list() {
    return this.txManager.runInTransaction((queryRunner) =>
      queryRunner.query(
        `SELECT pmr.id, pmr.tenant_id, t.name AS tenant_name, pmr.partner_ref_id,
                core.decrypt_pii(pmr.raw_name) AS raw_name,
                pmr.raw_doc_type, core.decrypt_pii(pmr.raw_doc_number) AS raw_doc_number,
                pmr.raw_gender, pmr.policy_number, pmr.plan_code,
                pmr.valid_from, pmr.valid_until, pmr.import_batch_id, pmr.imported_at,
                cv.code AS import_status
         FROM core.partner_member_records pmr
         JOIN params.catalog_values cv ON cv.id = pmr.import_status_id
         LEFT JOIN core.tenants t ON t.id = pmr.tenant_id
         ORDER BY pmr.imported_at DESC
         LIMIT 500`,
      ),
    );
  }

  /**
   * Declaraciones propias del viajero (core.member_declared_policies) que
   * todavía no aprobó la empresa — el operador necesita verlas para saber
   * que "hay un viajero con la app que dice tener una póliza nuestra sin
   * validar". RLS ya scopea por tenant/config-admin.
   */
  @Get('declared')
  async listDeclared() {
    return this.txManager.runInTransaction((queryRunner) =>
      queryRunner.query(
        `SELECT mdp.id, mdp.tenant_id, t.name AS tenant_name, mdp.policy_number,
                mdp.declared_at, mdp.approved_at, mdp.rejected_at,
                core.decrypt_pii(p.first_name) AS first_name,
                core.decrypt_pii(p.last_name) AS last_name
         FROM core.member_declared_policies mdp
         JOIN core.members m ON m.id = mdp.member_id
         JOIN core.persons p ON p.id = m.person_id
         LEFT JOIN core.tenants t ON t.id = mdp.tenant_id
         WHERE mdp.approved_at IS NULL AND mdp.rejected_at IS NULL
         ORDER BY mdp.declared_at DESC
         LIMIT 500`,
      ),
    );
  }

  /**
   * Aprobar una declaración propia — recién acá se elige el plan real
   * (core.approve_member_declared_policy), porque el viajero nunca tuvo
   * por qué conocer el catálogo interno de planes de la empresa.
   */
  @Post('declared/:id/approve')
  async approveDeclared(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: ApproveDeclaredPolicyDto,
  ) {
    return this.txManager.runInTransaction(async (queryRunner) => {
      const [{ approve_member_declared_policy: enrollmentId }] =
        await queryRunner.query(
          `SELECT core.approve_member_declared_policy($1, $2, $3, $4, $5) AS approve_member_declared_policy`,
          [id, dto.planId, dto.validFrom, dto.validUntil, request.user.userId],
        );
      return { enrollmentId };
    });
  }

  @Post()
  async create(
    @Req() request: AuthenticatedRequest,
    @Body(new ParseArrayPipe({ items: CreatePartnerRecordDto }))
    dtos: CreatePartnerRecordDto[],
    @Query('tenantId') tenantIdOverride?: string,
  ) {
    const tenantId =
      request.user.canManageConfig && tenantIdOverride
        ? tenantIdOverride
        : request.user.tenantId;

    if (!tenantId) {
      throw new ForbiddenException(
        'Solo un operador de una empresa puede cargar pólizas.',
      );
    }
    const blindIndexKey = this.config.get<string>('DB_BLIND_INDEX_KEY')!;
    const batchId = randomUUID();

    return this.txManager.runInTransaction(async (queryRunner) => {
      const results = [];
      for (const dto of dtos) {
        const [row] = await queryRunner.query(
          `INSERT INTO core.partner_member_records
             (tenant_id, partner_ref_id, raw_name, raw_doc_type, raw_doc_number, raw_gender,
              policy_number, plan_code, valid_from, valid_until, import_status_id, import_batch_id)
           VALUES ($1, $2, core.encrypt_pii($3), $4, core.encrypt_pii($5), $6, $7, $8, $9, $10,
              params.catalog_id('IMPORT_STATUS', 'PENDING'), $11)
           RETURNING id`,
          [
            tenantId,
            dto.partnerRefId,
            dto.rawName ?? null,
            dto.rawDocType ?? null,
            dto.rawDocNumber ?? null,
            dto.rawGender ?? null,
            dto.policyNumber,
            dto.planCode ?? null,
            dto.validFrom,
            dto.validUntil,
            batchId,
          ],
        );

        const [match] = await queryRunner.query(
          `SELECT * FROM core.try_match_partner_record($1, $2)`,
          [row.id, blindIndexKey],
        );

        results.push({
          id: row.id,
          partnerRefId: dto.partnerRefId,
          matched: match.matched,
          memberId: match.member_id,
        });
      }
      return results;
    });
  }

  /**
   * Asignar/corregir el plan de una póliza ya emparejada con un viajero
   * (gap #45) — recién acá se crea el enrollment real y el estado pasa
   * de MATCHED_NO_PLAN a MATCHED definitivo. Mismo control de acceso
   * que create(): un operador normal solo puede editar pólizas de su
   * propio tenant, un superadmin puede editar cualquiera.
   */
  @Patch(':id/plan')
  async assignPlan(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: AssignPlanDto,
  ) {
    return this.txManager.runInTransaction(async (queryRunner) => {
      const [record] = await queryRunner.query(
        `SELECT tenant_id FROM core.partner_member_records WHERE id = $1`,
        [id],
      );
      if (!record) {
        throw new NotFoundException('Póliza no encontrada');
      }
      if (!request.user.canManageConfig && record.tenant_id !== request.user.tenantId) {
        throw new ForbiddenException('No podés editar pólizas de otra empresa');
      }

      const [result] = await queryRunner.query(
        `SELECT * FROM core.assign_plan_to_partner_record($1, $2)`,
        [id, dto.planCode],
      );
      if (!result.ok) {
        throw new BadRequestException(
          'Esta póliza todavía no está emparejada con ningún viajero.',
        );
      }
      return { enrollmentId: result.enrollment_id };
    });
  }
}
