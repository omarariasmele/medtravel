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

  /**
   * emergency_cases no tiene país/ciudad como columnas propias — vive
   * en operations.trip_destinations vía destination_id (gap #53). El
   * CRUD genérico no resuelve JOINs, de ahí este endpoint chico aparte.
   */
  /**
   * chat_channels no está en el CRUD genérico (gap #8, nunca tuvo RLS
   * propia) — este JOIN arranca desde emergency_cases, así que hereda
   * su RLS real (cases_access) para autorizar antes de exponer el
   * channelId. El chat en sí (mensajes, join/send) va por Socket.io
   * (events.gateway.ts), esto solo resuelve QUÉ sala unir.
   */
  @Get(':id/chat')
  async chat(@Param('id') id: string) {
    const [row] = await this.txManager.runInTransaction((queryRunner) =>
      queryRunner.query(
        `SELECT ch.id AS "channelId"
         FROM operations.emergency_cases ec
         JOIN operations.chat_channels ch ON ch.case_id = ec.id
         WHERE ec.id = $1`,
        [id],
      ),
    );
    return row ?? {};
  }

  @Get(':id/location')
  async location(@Param('id') id: string) {
    const [row] = await this.txManager.runInTransaction((queryRunner) =>
      queryRunner.query(
        `SELECT ec.incident_latitude AS latitude, ec.incident_longitude AS longitude,
                td.city, cv.label_es AS "countryLabel", db.code AS "detectedBy"
         FROM operations.emergency_cases ec
         LEFT JOIN operations.trip_destinations td ON td.id = ec.destination_id
         LEFT JOIN params.catalog_values cv ON cv.id = td.country_id
         LEFT JOIN params.catalog_values db ON db.id = ec.destination_detected_by_id
         WHERE ec.id = $1`,
        [id],
      ),
    );
    return row ?? {};
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
