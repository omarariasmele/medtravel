import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';

import { DataAuditEventEntity } from './entities/data-audit-event.entity';

/**
 * Solo lectura a propósito: audit.data_audit_events es append-only
 * (triggers deny_audit_update/deny_audit_delete la protegen a nivel de
 * DB, ver 001_audit.sql) — no pasa por el CRUD genérico porque ese
 * expone POST/PATCH/DELETE. La política audit_select ya scopea por
 * tenant_id = app.current_tenant_id, así que no hace falta filtrar acá.
 */
@ApiTags('audit/events')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('audit/events')
export class AuditEventsController {
  constructor(private readonly txManager: TenantTransactionManager) {}

  @Get()
  findAll(@Query('limit') limit?: string) {
    const take = Math.min(Number(limit) || 50, 200);
    return this.txManager.runInTransaction((queryRunner) =>
      queryRunner.manager.find(DataAuditEventEntity, {
        order: { performedAt: 'DESC' },
        take,
      }),
    );
  }
}
