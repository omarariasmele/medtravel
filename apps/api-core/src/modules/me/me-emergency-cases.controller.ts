import { Body, Controller, Get, Logger, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';
import { CurrentContext } from '@common/request-context/current-context.decorator';
import { RequestContextData } from '@common/request-context/request-context.types';
import { AIService } from '@modules/ai/ai.service';

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
  private readonly logger = new Logger(MeEmergencyCasesController.name);

  constructor(
    private readonly txManager: TenantTransactionManager,
    private readonly aiService: AIService,
  ) {}

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
    const created = await this.txManager.runInTransaction(async (queryRunner) => {
      const memberId = await resolveMemberId(
        queryRunner,
        context.personId!,
        dto.memberId,
      );

      const rows = await queryRunner.query(
        `SELECT * FROM operations.create_member_emergency_case($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          context.personId,
          memberId,
          dto.initialDescription,
          dto.patientSymptoms ?? null,
          dto.patientConscious ?? null,
          dto.latitude ?? null,
          dto.longitude ?? null,
          dto.locationAccuracy ?? null,
          dto.countryId ?? null,
          dto.city ?? null,
        ],
      );
      return rows[0];
    });

    // Pedido explícito del usuario: "el primer contacto deberia
    // manejarlo la IA" — se dispara DESPUÉS de que el caso ya se
    // confirmó creado (el mensaje inicial nunca puede tumbar el alta
    // del caso, que es lo crítico acá). El viajero todavía no se unió
    // a la sala de sockets en este punto, así que no hace falta emitir
    // nada — el mensaje ya va a estar en el historial cuando entre.
    this.aiService.respondInEmergencyChat(created.id, { isGreeting: true }).catch((error) => {
      this.logger.error(
        `No se pudo generar el saludo de IA para el caso ${created.id}: ${(error as Error).message}`,
      );
    });

    return created;
  }
}
