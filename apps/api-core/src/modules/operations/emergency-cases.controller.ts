import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';
import { RlsCrudService } from '@common/database/rls-crud.service';
import { EventsGateway } from '@modules/events/events.gateway';

import { EmergencyCaseEntity } from './entities/emergency-case.entity';

interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    canCloseCases: boolean;
  };
}

/** Códigos de params.catalog_values (dominio CASE_STATUS) que representan un cierre. */
const CLOSING_STATUS_CODES = ['RESOLVED', 'CLOSED'];

/**
 * Igual que el CRUD genérico (GET/POST/PATCH, sin DELETE — un caso no se
 * borra, se cierra vía status_id), pero separado del registro genérico de
 * operations.registry.ts por dos motivos: emitir `case_update` por
 * Socket.io después de cada actualización (EventsGateway), y aplicar las
 * reglas de cierre de caso que el CRUD genérico no conoce — resolutionTypeId
 * y resolutionNotes ya existían como columnas desde el schema base pero
 * nada las completaba ni las exigía (ver
 * proposed-case-resolution-types.sql para el catálogo que faltaba).
 */
@ApiTags('operations/emergency-cases')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('operations/emergency-cases')
export class EmergencyCasesController {
  private readonly crud: RlsCrudService<EmergencyCaseEntity>;

  constructor(
    private readonly txManager: TenantTransactionManager,
    private readonly eventsGateway: EventsGateway,
  ) {
    this.crud = new RlsCrudService(txManager, EmergencyCaseEntity);
  }

  @Get()
  findAll(@Query() query: Record<string, string>) {
    return this.crud.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.crud.findOne(id);
  }

  @Post()
  create(@Body() body: Record<string, unknown>) {
    return this.crud.create(body);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() request: AuthenticatedRequest,
  ) {
    const current = await this.crud.findOne(id);
    const nextStatusId =
      (body.statusId as string | undefined) ?? current.statusId;

    if (nextStatusId !== current.statusId) {
      const closingCode = await this.closingStatusCode(nextStatusId);
      if (closingCode) {
        if (!request.user.canCloseCases) {
          throw new ForbiddenException(
            'Tu rol de operador no tiene permiso para cerrar casos.',
          );
        }

        const resolutionTypeId =
          (body.resolutionTypeId as string | undefined) ??
          current.resolutionTypeId;
        const resolutionNotes =
          (body.resolutionNotes as string | undefined) ??
          current.resolutionNotes;
        if (!resolutionTypeId || !resolutionNotes?.trim()) {
          throw new BadRequestException(
            'Para cerrar un caso hace falta indicar resolutionTypeId y resolutionNotes.',
          );
        }

        body.resolutionTypeId = resolutionTypeId;
        body.resolutionNotes = resolutionNotes;
        body.resolvedAt = current.resolvedAt ?? new Date();
        if (closingCode === 'CLOSED') {
          body.closedAt = current.closedAt ?? new Date();
        }
        body.closedBy = request.user.userId;
      }
    }

    const updated = await this.crud.update(id, body);
    this.eventsGateway.emitCaseUpdate(id, updated);
    return updated;
  }

  /** Devuelve el code (CASE_STATUS) de statusId si es RESOLVED/CLOSED, null si no. */
  private async closingStatusCode(statusId: string): Promise<string | null> {
    const rows: Array<{ code: string }> = await this.txManager.runInTransaction(
      (queryRunner) =>
        queryRunner.query(
          `SELECT cv.code FROM params.catalog_values cv
           JOIN params.domain_catalogs d ON d.id = cv.domain_id
           WHERE d.code = 'CASE_STATUS' AND cv.id = $1`,
          [statusId],
        ),
    );
    const code = rows[0]?.code;
    return code && CLOSING_STATUS_CODES.includes(code) ? code : null;
  }
}
