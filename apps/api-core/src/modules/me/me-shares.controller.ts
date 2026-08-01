import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { randomBytes, createHash } from 'crypto';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';
import { getOperationalLimit } from '@common/database/operational-limits.helper';
import { CurrentContext } from '@common/request-context/current-context.decorator';
import { RequestContextData } from '@common/request-context/request-context.types';

import { resolveMemberId } from './me-member.helper';
import { CreateDoctorInviteDto } from './dto/create-doctor-invite.dto';
import { DEFAULT_SHARE_SCOPE } from '../shares/shared-profile.helper';

@ApiTags('me')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('me/shares')
export class MeSharesController {
  constructor(
    private readonly txManager: TenantTransactionManager,
    private readonly config: ConfigService,
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

    return this.txManager.runInTransaction(async (queryRunner) => {
      const memberId = await resolveMemberId(
        queryRunner,
        context.personId!,
        dto.memberId,
      );

      const rows = await queryRunner.query(
        `INSERT INTO emergency.tokens
           (member_id, token_type_id, token_value, token_hash, access_url,
            expires_at, status_id, scope, max_uses)
         VALUES (
           $1, params.catalog_id('TOKEN_TYPE', 'DOCTOR_INVITE'), $2, $3, $4,
           NOW() + ($5 || ' days')::INTERVAL,
           params.catalog_id('TOKEN_STATUS', 'ACTIVE'),
           $6, $7
         )
         RETURNING id, access_url, expires_at`,
        [
          memberId,
          tokenValue,
          tokenHash,
          accessUrl,
          ttlDays,
          [...DEFAULT_SHARE_SCOPE, 'submit_note'],
          dto.maxUses ?? null,
        ],
      );
      return rows[0];
    });
  }
}
