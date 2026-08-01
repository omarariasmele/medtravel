import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';
import { CurrentContext } from '@common/request-context/current-context.decorator';
import { RequestContextData } from '@common/request-context/request-context.types';

import { resolveMemberId } from './me-member.helper';
import { CreateEmergencyCaseDto } from './dto/create-emergency-case.dto';

/**
 * A diferencia del resto de /me/* (trips, clinical, etc.), crear un caso
 * no es un INSERT directo: además de la fila en emergency_cases hay que
 * agregar al viajero como case_participants para que pueda entrar a la
 * sala de chat de SU propio caso (case_participants_insert es
 * deliberadamente solo para operador/superadmin). Por eso esto pasa por
 * operations.create_member_emergency_case() (SECURITY DEFINER), no por
 * un INSERT armado acá — ver proposed-member-emergency-cases.sql.
 */
@ApiTags('me')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('me/emergency-cases')
export class MeEmergencyCasesController {
  constructor(private readonly txManager: TenantTransactionManager) {}

  @Get()
  async list(@CurrentContext() context: RequestContextData) {
    return this.txManager.runInTransaction((queryRunner) =>
      queryRunner.query(
        `SELECT ec.id, ec.case_number, ec.status_id, ec.priority_id,
                ec.initial_description, ec.patient_symptoms,
                ec.resolution_notes, ec.resolved_at, ec.closed_at,
                ec.created_at, ec.updated_at, ch.id AS channel_id
         FROM operations.emergency_cases ec
         JOIN core.members m ON m.id = ec.member_id
         LEFT JOIN operations.chat_channels ch ON ch.case_id = ec.id
         WHERE m.person_id = $1
         ORDER BY ec.created_at DESC`,
        [context.personId],
      ),
    );
  }

  @Post()
  async create(
    @CurrentContext() context: RequestContextData,
    @Body() dto: CreateEmergencyCaseDto,
  ) {
    return this.txManager.runInTransaction(async (queryRunner) => {
      const memberId = await resolveMemberId(
        queryRunner,
        context.personId!,
        dto.memberId,
      );

      const rows = await queryRunner.query(
        `SELECT * FROM operations.create_member_emergency_case($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          context.personId,
          memberId,
          dto.initialDescription,
          dto.patientSymptoms ?? null,
          dto.patientConscious ?? null,
          dto.latitude ?? null,
          dto.longitude ?? null,
          dto.locationAccuracy ?? null,
        ],
      );
      return rows[0];
    });
  }
}
