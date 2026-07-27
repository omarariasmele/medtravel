import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';
import { RlsCrudService } from '@common/database/rls-crud.service';
import { EventsGateway } from '@modules/events/events.gateway';

import { EmergencyCaseEntity } from './entities/emergency-case.entity';

/**
 * Igual que el CRUD genérico (GET/POST/PATCH, sin DELETE — un caso no se
 * borra, se cierra vía status_id), pero separado del registro genérico de
 * operations.registry.ts para poder emitir `case_update` por Socket.io
 * (EventsGateway) después de cada actualización — los participantes
 * conectados a la sala del caso (ver events.gateway.ts) se enteran en
 * vivo de cambios de estado/prioridad/asignación sin tener que hacer
 * polling.
 */
@ApiTags('operations/emergency-cases')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('operations/emergency-cases')
export class EmergencyCasesController {
  private readonly crud: RlsCrudService<EmergencyCaseEntity>;

  constructor(
    txManager: TenantTransactionManager,
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
  async update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    const updated = await this.crud.update(id, body);
    this.eventsGateway.emitCaseUpdate(id, updated);
    return updated;
  }
}
