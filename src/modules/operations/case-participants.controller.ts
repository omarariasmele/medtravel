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
import { RlsCrudService } from '@common/database/rls-crud.service';
import { EventsGateway } from '@modules/events/events.gateway';

import { CaseParticipantEntity } from './entities/case-participant.entity';

/**
 * Fuera del CRUD genérico a propósito (gap #8, ver SCHEMA_GAPS.md):
 * necesita su propio path anidado bajo el caso (no un recurso plano
 * `/operations/:resource`) y emite `case_update` por Socket.io después
 * de cada alta/baja, igual que EmergencyCasesController — el panel web
 * necesita ver en vivo cuando cambia la lista de participantes de un
 * caso que tiene abierto. La visibilidad/escritura real la resuelven las
 * políticas RLS de case_participants (proposed-tenant-access-model.sql):
 * operador/superadmin con acceso al tenant puede gestionar; un
 * participante activo (member u operador) solo puede leer la lista de
 * su propio caso.
 */
@ApiTags('operations/case-participants')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('operations/cases/:caseId/participants')
export class CaseParticipantsController {
  private readonly crud: RlsCrudService<CaseParticipantEntity>;

  constructor(
    txManager: TenantTransactionManager,
    private readonly eventsGateway: EventsGateway,
  ) {
    this.crud = new RlsCrudService(txManager, CaseParticipantEntity);
  }

  @Get()
  findAll(@Param('caseId') caseId: string) {
    return this.crud.findAll({ caseId });
  }

  @Post()
  async create(
    @Param('caseId') caseId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const created = await this.crud.create({ ...body, caseId });
    this.eventsGateway.emitCaseUpdate(caseId, { participantsChanged: true });
    return created;
  }

  /**
   * "Quitar" un participante es un PATCH (is_active=false, left_at=NOW()),
   * no un DELETE — no hay GRANT DELETE en case_participants y no hace
   * falta: el historial de quién estuvo en el chat de un caso es en sí
   * mismo un dato de auditoría que no conviene borrar.
   */
  @Patch(':id')
  async update(
    @Param('caseId') caseId: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    const updated = await this.crud.update(id, body);
    this.eventsGateway.emitCaseUpdate(caseId, { participantsChanged: true });
    return updated;
  }
}
