import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { randomBytes, createHash } from 'crypto';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';
import { getOperationalLimit } from '@common/database/operational-limits.helper';
import { AIService } from '@modules/ai/ai.service';

import {
  buildSharedProfile,
  DEFAULT_SHARE_SCOPE,
} from '../shares/shared-profile.helper';

/**
 * Funcionalidad accesoria pedida por el usuario: un operador con acceso
 * clínico legítimo (caso abierto o consentimiento — mismo
 * clinical.has_clinical_access de siempre, ver x-active-case-id en
 * patient-summary.controller.ts) puede previsualizar la ficha EXACTAMENTE
 * como la vería un médico que entra por el QR/link — mismo componente de
 * armado (buildSharedProfile) y mismo scope por defecto que
 * emergency.tokens de tipo DOCTOR_INVITE, para que sea una vista
 * fiel, no una aproximación.
 */
@ApiTags('clinical/share-preview')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('clinical/share-preview')
export class SharePreviewController {
  constructor(
    private readonly txManager: TenantTransactionManager,
    private readonly config: ConfigService,
    private readonly aiService: AIService,
  ) {}

  /**
   * Pedido explícito del usuario: "el botón de ver como la vería el
   * médico... debe pedir en qué idioma la quiere visualizar" — mismo
   * mecanismo de traducción que ya usa doctor-invite (createDoctorInvite,
   * un solo llamado a IA, nunca en cada vista), para que la previsualización
   * sea fiel a lo que un médico real vería si el link se genera en ese
   * idioma — no una vista aparte que se pueda desincronizar.
   */
  @Get(':personId')
  async get(
    @Param('personId') personId: string,
    @Query('language') language?: string,
  ) {
    const result = await this.txManager.runInTransaction((queryRunner) =>
      buildSharedProfile(queryRunner, personId, DEFAULT_SHARE_SCOPE),
    );

    if (!result.person) {
      throw new NotFoundException(
        'No encontrado o sin acceso clínico habilitado',
      );
    }

    if (language && language !== 'es') {
      return this.aiService.translateSharedProfile(
        result as unknown as Record<string, unknown>,
        language,
      );
    }

    return result;
  }

  /**
   * Pedido explícito del usuario: la pantalla "Ver como la vería el
   * médico" tiene que ser funcional de verdad, no solo una previsualización
   * visual — generando por detrás un link real (mismo emergency.tokens +
   * scope 'submit_note' que me-shares.controller.ts::createDoctorInvite)
   * para poder probar el flujo completo, incluida "Dejar nota de la
   * atención", sin salir de admin-web. A diferencia de esa ruta, acá el
   * personId lo elige el operador (no "me") — mismo has_clinical_access
   * que ya gatea el GET de arriba sigue siendo la única verificación de
   * acceso: si el operador no tiene acceso clínico a esa persona, el
   * SELECT en resolveShareOwner/buildSharedProfile no le devuelve nada
   * y el token igual queda inutilizable para él en la práctica. TTL
   * corto (horas, no días) porque es para probar ahora, no para
   * compartir de verdad — reusa la misma operational_limit key con un
   * default propio para no interferir con TOKEN_DOCTOR_INVITE_TTL_DAYS.
   */
  @Post(':personId/generate-link')
  async generateLink(@Param('personId') personId: string) {
    const ttlHours = await getOperationalLimit(
      this.txManager,
      'TOKEN_SHARE_PREVIEW_TTL_HOURS',
      2,
    );
    const tokenValue = randomBytes(24).toString('base64url');
    const tokenHash = createHash('sha256').update(tokenValue).digest('hex');
    const baseUrl = this.config.get<string>('CORS_ORIGIN');
    const accessUrl = `${baseUrl}/public/shares/${tokenValue}`;

    const result = await this.txManager.runInTransaction(async (queryRunner) => {
      const memberRows = await queryRunner.query(
        `SELECT id FROM core.members WHERE person_id = $1 ORDER BY created_at LIMIT 1`,
        [personId],
      );
      const memberId = memberRows[0]?.id ?? null;

      const rows = await queryRunner.query(
        `INSERT INTO emergency.tokens
           (member_id, person_id, token_type_id, token_value, token_hash, access_url,
            expires_at, status_id, scope, max_uses)
         VALUES (
           $1, $2, params.catalog_id('TOKEN_TYPE', 'DOCTOR_INVITE'), $3, $4, $5,
           NOW() + ($6 || ' hours')::INTERVAL,
           params.catalog_id('TOKEN_STATUS', 'ACTIVE'),
           $7, NULL
         )
         RETURNING id, access_url, expires_at`,
        [
          memberId,
          personId,
          tokenValue,
          tokenHash,
          accessUrl,
          ttlHours,
          [...DEFAULT_SHARE_SCOPE, 'submit_note'],
        ],
      );
      return rows[0];
    });

    if (!result) {
      throw new NotFoundException(
        'No encontrado o sin acceso clínico habilitado',
      );
    }

    return { accessUrl: result.access_url, expiresAt: result.expires_at };
  }
}
