import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';

import {
  EmergencyShareTokenGuard,
  ShareRequest,
} from './emergency-share-token.guard';
import { buildSharedProfile } from './shared-profile.helper';
import { SubmitShareNoteDto } from './dto/submit-share-note.dto';

interface SubmitNoteRow {
  ok: boolean;
  draft_id: string;
  claim_token_value: string | null;
}

/**
 * Portal público sin cuenta: el médico entra con el link/QR que le
 * compartió el viajero. Nunca pasa por AuthGuard('jwt') — mismo patrón
 * "público real" que /auth/login (el proyecto no tiene guard JWT
 * global, ver app.module.ts). Rate limiting es la única protección
 * posible acá, igual que en auth.controller.ts.
 */
@ApiTags('public/shares')
@Controller('public/shares')
export class PublicSharesController {
  constructor(private readonly txManager: TenantTransactionManager) {}

  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @UseGuards(EmergencyShareTokenGuard)
  @Get(':token')
  async read(@Req() request: ShareRequest) {
    const { personId, scope, expiresAt, canSubmitNote } = request.shareContext;

    const profile = await this.txManager.runInTransaction(
      async (queryRunner) => {
        await queryRunner.query(
          `SELECT set_config('app.emergency_token_active', 'true', true)`,
        );
        await queryRunner.query(
          `SELECT set_config('app.emergency_token_person_id', $1, true)`,
          [personId],
        );
        return buildSharedProfile(queryRunner, personId, scope);
      },
    );

    return { ...profile, expiresAt, canSubmitNote };
  }

  /**
   * Nota anónima del médico, sin registro. Valida el token de nuevo
   * (independiente del GET — puede llamarse después de haber leído, o
   * directamente) porque requiere 'submit_note' en el scope, algo que
   * un token de emergencia normal (DYNAMIC_QR) no tiene.
   */
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post(':token/notes')
  async addNote(
    @Param('token') token: string,
    @Body() dto: SubmitShareNoteDto,
    @Req() request: Request,
  ) {
    const [result]: SubmitNoteRow[] = await this.txManager.runInTransaction(
      (queryRunner) =>
        queryRunner.query(
          `SELECT * FROM emergency.submit_anonymous_share_note($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            token,
            dto.accessorName,
            dto.accessorEmail ?? null,
            dto.accessorSpecialty ?? null,
            dto.accessorInstitution ?? null,
            dto.recommendations ?? null,
            dto.treatment ?? null,
            dto.notes ?? null,
            request.ip,
          ],
        ),
    );

    if (!result?.ok) {
      throw new NotFoundException('Link no válido o vencido');
    }

    return { id: result.draft_id, claimToken: result.claim_token_value };
  }
}
