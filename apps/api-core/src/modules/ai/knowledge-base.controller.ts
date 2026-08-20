import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { QueryRunner } from 'typeorm';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';
import { ConfigAccessGuard } from '@common/auth/config-access.guard';
import { CurrentContext } from '@common/request-context/current-context.decorator';
import { RequestContextData } from '@common/request-context/request-context.types';

import {
  CreateKnowledgeBaseEntryDto,
  UpdateKnowledgeBaseEntryDto,
} from './dto/knowledge-base-entry.dto';

/**
 * "Base de conocimiento" del asistente de IA — pedido explícito del
 * usuario: poder ir cargando información propia de la operación desde
 * la web, sin recompilar nada. Cada entrada tiene uno o más "alcances"
 * (`scopes`, dominio KB_ENTRY_SCOPE, tabla puente
 * ai.knowledge_base_entry_scopes) que deciden a qué asistente(s) se le
 * inyecta: chat de emergencia (`respondInEmergencyChat`), asistente de
 * carga de ficha médica (`healthChat`), o asistente de ayuda de uso de
 * la app (`appHelpChat`) — pedido explícito del usuario de replicar
 * este mecanismo para los tres (ver ai.service.ts). Restringido a
 * canManageConfig completo (lectura y escritura): a diferencia de
 * params.app_settings, esto no lo necesita la app móvil en ningún
 * momento, solo el backend.
 */
@ApiTags('ai/knowledge-base')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), ConfigAccessGuard)
@Controller('ai/knowledge-base')
export class KnowledgeBaseController {
  constructor(private readonly txManager: TenantTransactionManager) {}

  @Get()
  list() {
    return this.txManager.runInTransaction((queryRunner) =>
      queryRunner.query(
        `SELECT k.id, k.title, k.content, k.active,
                COALESCE(
                  (SELECT array_agg(cv.code ORDER BY cv.display_order)
                   FROM ai.knowledge_base_entry_scopes s
                   JOIN params.catalog_values cv ON cv.id = s.scope_id
                   WHERE s.entry_id = k.id),
                  ARRAY[]::varchar[]
                ) AS scopes,
                k.created_at, k.updated_at
         FROM ai.knowledge_base_entries k
         ORDER BY k.created_at DESC`,
      ),
    );
  }

  @Post()
  async create(
    @Body() dto: CreateKnowledgeBaseEntryDto,
    @CurrentContext() context: RequestContextData,
  ) {
    const scopes = dto.scopes?.length ? dto.scopes : ['EMERGENCY_CHAT'];
    return this.txManager.runInTransaction(async (queryRunner) => {
      const [entry] = await queryRunner.query(
        `INSERT INTO ai.knowledge_base_entries (title, content, created_by)
         VALUES ($1, $2, $3)
         RETURNING id, title, content, active, created_at, updated_at`,
        [dto.title, dto.content, context.userId],
      );
      await this.setScopes(queryRunner, entry.id, scopes);
      return { ...entry, scopes };
    });
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateKnowledgeBaseEntryDto,
  ) {
    return this.txManager.runInTransaction(async (queryRunner) => {
      const [entry] = await queryRunner.query(
        `UPDATE ai.knowledge_base_entries
         SET title = COALESCE($2, title),
             content = COALESCE($3, content),
             active = COALESCE($4, active),
             updated_at = NOW()
         WHERE id = $1
         RETURNING id, title, content, active, created_at, updated_at`,
        [id, dto.title ?? null, dto.content ?? null, dto.active ?? null],
      );
      if (!entry) {
        throw new NotFoundException('No existe esa entrada de la base de conocimiento');
      }
      if (dto.scopes) {
        await this.setScopes(queryRunner, id, dto.scopes);
      }
      const scopes = await queryRunner.query(
        `SELECT cv.code FROM ai.knowledge_base_entry_scopes s
         JOIN params.catalog_values cv ON cv.id = s.scope_id
         WHERE s.entry_id = $1 ORDER BY cv.display_order`,
        [id],
      );
      return { ...entry, scopes: scopes.map((s: { code: string }) => s.code) };
    });
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.txManager.runInTransaction((queryRunner) =>
      queryRunner.query(`DELETE FROM ai.knowledge_base_entries WHERE id = $1`, [id]),
    );
    return { ok: true };
  }

  private async setScopes(
    queryRunner: QueryRunner,
    entryId: string,
    scopes: string[],
  ): Promise<void> {
    await queryRunner.query(
      `DELETE FROM ai.knowledge_base_entry_scopes WHERE entry_id = $1`,
      [entryId],
    );
    for (const code of scopes) {
      await queryRunner.query(
        `INSERT INTO ai.knowledge_base_entry_scopes (entry_id, scope_id)
         VALUES ($1, params.catalog_id('KB_ENTRY_SCOPE', $2))`,
        [entryId, code],
      );
    }
  }
}
