import {
  Body,
  ConflictException,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { QueryFailedError } from 'typeorm';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';
import { CurrentContext } from '@common/request-context/current-context.decorator';
import { RequestContextData } from '@common/request-context/request-context.types';

import { AddDocumentDto } from './dto/add-document.dto';

/**
 * Carga el documento de identidad del viajero (core.external_identifiers,
 * cifrado + blind index — mismo patrón que
 * professionals-registration.controller.ts). Sirve para dos cosas: (1)
 * identificar al viajero de forma exacta, (2) disparar el matching contra
 * pólizas ya cargadas por una empresa de asistencia
 * (core.partner_member_records) que estaban esperando este documento —
 * ver proposed-partner-matching-function.sql.
 */
@ApiTags('me')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('me/document')
export class MeDocumentController {
  constructor(
    private readonly txManager: TenantTransactionManager,
    private readonly config: ConfigService,
  ) {}

  private blindIndex(value: string): string {
    const key = this.config.get<string>('DB_BLIND_INDEX_KEY')!;
    return createHmac('sha256', key)
      .update(value.trim().toLowerCase())
      .digest('hex');
  }

  @Post()
  async add(
    @CurrentContext() context: RequestContextData,
    @Body() dto: AddDocumentDto,
  ) {
    const docNumberIdx = this.blindIndex(dto.docNumber);
    const blindIndexKey = this.config.get<string>('DB_BLIND_INDEX_KEY')!;

    try {
      return await this.txManager.runInTransaction(async (queryRunner) => {
        const [identifier] = await queryRunner.query(
          `INSERT INTO core.external_identifiers
             (person_id, doc_type_id, doc_number, doc_number_idx, issuing_country_id, is_primary)
           VALUES ($1, $2, core.encrypt_pii($3), $4, $5, TRUE)
           RETURNING id, doc_type_id, issuing_country_id, created_at`,
          [
            context.personId,
            dto.docTypeId,
            dto.docNumber,
            docNumberIdx,
            dto.countryId ?? null,
          ],
        );

        const [{ code: docTypeCode }] = await queryRunner.query(
          `SELECT code FROM params.catalog_values WHERE id = $1`,
          [dto.docTypeId],
        );

        const matched: Array<{ id: string }> = await queryRunner.query(
          `SELECT * FROM core.try_match_pending_records_for_person($1, $2, $3, $4)`,
          [context.personId, docNumberIdx, docTypeCode, blindIndexKey],
        );

        return { ...identifier, matchedPolicies: matched.length };
      });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as QueryFailedError & { code?: string }).code === '23505'
      ) {
        throw new ConflictException('Ya cargaste ese documento antes');
      }
      throw error;
    }
  }
}
