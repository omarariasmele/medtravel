import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { join } from 'path';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';

const AVATARS_DIR = join(process.cwd(), 'uploads', 'avatars');

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
    const { personId, scope, expiresAt, canSubmitNote, translatedProfile, translatedLanguage } =
      request.shareContext;

    // Bug real reportado en vivo: acá antes se releía translated_profile
    // con un SELECT normal contra emergency.tokens, pero la única RLS
    // policy de esa tabla (tokens_titular) exige app.current_person_id/
    // current_tenant_id — GUCs que NUNCA están seteadas en este flujo
    // público/anónimo (el médico no tiene sesión). El SELECT devolvía 0
    // filas siempre, en silencio, y el link caía al español pese a que
    // la traducción sí se había guardado bien al generarlo. Ahora se
    // toma directo de shareContext: emergency.redeem_share_token() ya
    // es SECURITY DEFINER y ya leía la fila completa del token para
    // validarlo, así que devolver también estas dos columnas ahí evita
    // un segundo query que RLS bloquea.
    const profile = await this.txManager.runInTransaction(async (queryRunner) => {
      await queryRunner.query(
        `SELECT set_config('app.emergency_token_active', 'true', true)`,
      );
      await queryRunner.query(
        `SELECT set_config('app.emergency_token_person_id', $1, true)`,
        [personId],
      );
      return buildSharedProfile(queryRunner, personId, scope);
    });

    // `language` le dice al frontend en qué idioma mostrar el resto de
    // la pantalla (títulos, labels de catálogo como género/grupo
    // sanguíneo) — ver shared-profile-view.tsx.
    return {
      ...profile,
      ...(translatedProfile ?? {}),
      expiresAt,
      canSubmitNote,
      language: translatedLanguage ?? 'es',
    };
  }

  /**
   * Foto de perfil del viajero para el médico que entra por QR/link —
   * mismo mecanismo de las dos GUCs que read() (activa el camino #2 de
   * clinical.has_clinical_access), nunca un directorio estático público.
   */
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @UseGuards(EmergencyShareTokenGuard)
  @Get(':token/photo')
  async getPhoto(
    @Req() request: ShareRequest,
    @Res() res: Response,
  ): Promise<void> {
    const { personId } = request.shareContext;

    const row = await this.txManager.runInTransaction(async (queryRunner) => {
      await queryRunner.query(
        `SELECT set_config('app.emergency_token_active', 'true', true)`,
      );
      await queryRunner.query(
        `SELECT set_config('app.emergency_token_person_id', $1, true)`,
        [personId],
      );
      const [summary] = await queryRunner.query(
        `SELECT * FROM clinical.get_patient_summary($1)`,
        [personId],
      );
      return summary;
    });

    if (!row?.photo_path) {
      throw new NotFoundException('Sin foto de perfil');
    }

    res.sendFile(row.photo_path, { root: AVATARS_DIR });
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
