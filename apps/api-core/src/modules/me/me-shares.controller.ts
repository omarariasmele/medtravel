import { Body, Controller, Logger, Post, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { randomBytes, createHash } from 'crypto';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';
import { getOperationalLimit } from '@common/database/operational-limits.helper';
import { CurrentContext } from '@common/request-context/current-context.decorator';
import { RequestContextData } from '@common/request-context/request-context.types';
import { MailService } from '@modules/mail/mail.service';
import { AIService } from '@modules/ai/ai.service';

import { resolveShareOwner } from './me-member.helper';
import { CreateDoctorInviteDto } from './dto/create-doctor-invite.dto';
import { DEFAULT_SHARE_SCOPE, buildSharedProfile } from '../shares/shared-profile.helper';

@ApiTags('me')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('me/shares')
export class MeSharesController {
  private readonly logger = new Logger(MeSharesController.name);

  constructor(
    private readonly txManager: TenantTransactionManager,
    private readonly config: ConfigService,
    private readonly mailService: MailService,
    private readonly aiService: AIService,
  ) {}

  /**
   * Invitación para que un médico/institución vea la ficha del viajero
   * y deje una nota, sin necesitar cuenta — mismo patrón que
   * me-emergency.controller.ts::generateQr (token_value + hash, TTL
   * desde operational_limits, nunca hardcodeado). A diferencia de
   * DYNAMIC_QR, el scope acá incluye 'submit_note' — es lo único que
   * distingue un token que solo lee de uno que además admite que el
   * médico escriba (ver emergency.submit_anonymous_share_note).
   */
  @Post('doctor-invite')
  async createDoctorInvite(
    @CurrentContext() context: RequestContextData,
    @Body() dto: CreateDoctorInviteDto,
  ) {
    const ttlDays = await getOperationalLimit(
      this.txManager,
      'TOKEN_DOCTOR_INVITE_TTL_DAYS',
      7,
    );
    const tokenValue = randomBytes(24).toString('base64url');
    const tokenHash = createHash('sha256').update(tokenValue).digest('hex');
    const baseUrl = this.config.get<string>('CORS_ORIGIN');
    const accessUrl = `${baseUrl}/public/shares/${tokenValue}`;

    let travelerFirstName: string | undefined;

    const result = await this.txManager.runInTransaction(async (queryRunner) => {
      const owner = await resolveShareOwner(
        queryRunner,
        context.personId!,
        dto.memberId,
      );

      if (dto.recipientEmail) {
        const [person] = await queryRunner.query(
          `SELECT core.decrypt_pii(first_name) AS first_name FROM core.persons WHERE id = $1`,
          [context.personId],
        );
        travelerFirstName = person?.first_name as string | undefined;
      }

      // Pedido explícito del usuario: elegir el idioma en que el
      // médico ve la ficha — se traduce UNA vez acá (no en cada vista
      // del link, ver public-shares.controller.ts) con IA.
      let translatedProfile: Record<string, unknown> | null = null;
      if (dto.language && dto.language !== 'es') {
        const profile = await buildSharedProfile(
          queryRunner,
          owner.personId,
          [...DEFAULT_SHARE_SCOPE, 'submit_note'],
        );
        translatedProfile = await this.aiService.translateSharedProfile(
          profile as unknown as Record<string, unknown>,
          dto.language,
        );
      }

      const rows = await queryRunner.query(
        `INSERT INTO emergency.tokens
           (member_id, person_id, token_type_id, token_value, token_hash, access_url,
            expires_at, status_id, scope, max_uses, translated_profile, translated_language)
         VALUES (
           $1, $2, params.catalog_id('TOKEN_TYPE', 'DOCTOR_INVITE'), $3, $4, $5,
           NOW() + ($6 || ' days')::INTERVAL,
           params.catalog_id('TOKEN_STATUS', 'ACTIVE'),
           $7, $8, $9::jsonb, $10
         )
         RETURNING id, access_url, expires_at`,
        [
          owner.memberId,
          owner.personId,
          tokenValue,
          tokenHash,
          accessUrl,
          ttlDays,
          [...DEFAULT_SHARE_SCOPE, 'submit_note'],
          dto.maxUses ?? null,
          translatedProfile ? JSON.stringify(translatedProfile) : null,
          translatedProfile ? dto.language : null,
        ],
      );
      return rows[0];
    });

    // Pedido explícito del usuario: poder mandar el link por mail
    // indicando a quién, además de mostrarlo como QR. Best-effort — un
    // fallo de SMTP nunca tira abajo la creación del link (mismo
    // criterio que auth.service.ts con el mail de reset de contraseña).
    if (dto.recipientEmail) {
      const expiresLabel = new Date(result.expires_at as string).toLocaleDateString('es-AR');
      const greeting = travelerFirstName ?? 'Un viajero de MedTravelApp';
      try {
        await this.mailService.send(
          dto.recipientEmail,
          `${greeting} te compartió su ficha médica — MedTravelApp`,
          `<p>${greeting} te compartió el acceso a su ficha médica de MedTravelApp.</p>
           <p>Podés verla, sin necesitar cuenta, entrando a: <a href="${result.access_url}">${result.access_url}</a></p>
           <p>Este link vence el ${expiresLabel}.</p>
           <hr style="border:none; border-top:1px solid #e6e8e7; margin:20px 0;" />
           <p>${greeting} shared their MedTravelApp health record with you.</p>
           <p>You can view it, no account needed, at: <a href="${result.access_url}">${result.access_url}</a></p>
           <p>This link expires on ${expiresLabel}.</p>`,
        );
      } catch (error) {
        this.logger.warn(
          `No se pudo enviar el mail de ficha compartida a ${dto.recipientEmail}: ${(error as Error).message}`,
        );
      }
    }

    return result;
  }
}
