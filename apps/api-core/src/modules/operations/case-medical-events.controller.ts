import { Controller, Get, Post, Body, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';
import { RlsCrudService } from '@common/database/rls-crud.service';
import { EventsGateway } from '@modules/events/events.gateway';

import { CaseMedicalEventEntity } from './entities/case-medical-event.entity';

interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
  };
}

/**
 * Separado del CRUD genérico (antes vivía en operations.registry.ts) por
 * un solo motivo: "quién agregó la nota" nunca se guardaba —
 * registered_by_id existía en la tabla desde el baseline pero ningún
 * caller lo completaba, y el historial del caso quedaba sin ningún
 * rastro de autoría (reportado por el usuario, importante para
 * seguimiento). Se resuelve server-side a partir del JWT, nunca
 * confiando en lo que mande el cliente — mismo criterio que closedBy en
 * emergency-cases.controller.ts.
 */
@ApiTags('operations/case-medical-events')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('operations/case-medical-events')
export class CaseMedicalEventsController {
  private readonly crud: RlsCrudService<CaseMedicalEventEntity>;

  constructor(
    private readonly txManager: TenantTransactionManager,
    private readonly eventsGateway: EventsGateway,
  ) {
    this.crud = new RlsCrudService(txManager, CaseMedicalEventEntity);
  }

  @Get()
  findAll(@Query() query: Record<string, string>) {
    return this.crud.findAll(query);
  }

  @Post()
  async create(
    @Body() body: Record<string, unknown>,
    @Req() request: AuthenticatedRequest,
  ) {
    const operatorId = await this.resolveOperatorId(request.user.userId);
    const created = await this.crud.create({
      ...body,
      registeredById: operatorId ?? null,
    });
    // Sin esto, "Historial del caso" solo se actualizaba saliendo y
    // volviendo a entrar (pedido explícito del usuario) — mismo evento
    // que ya usa case-participants.controller.ts para su propio cambio.
    this.eventsGateway.emitCaseUpdate(body.caseId as string, {
      historyChanged: true,
    });
    return created;
  }

  private async resolveOperatorId(userId: string): Promise<string | null> {
    const rows = await this.txManager.runInTransaction((queryRunner) =>
      queryRunner.query(
        `SELECT id FROM operations.operators WHERE user_id = $1`,
        [userId],
      ),
    );
    return rows[0]?.id ?? null;
  }
}
