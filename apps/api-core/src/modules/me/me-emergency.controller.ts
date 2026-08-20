import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { randomBytes, createHash } from 'crypto';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';
import { getOperationalLimit } from '@common/database/operational-limits.helper';
import { CurrentContext } from '@common/request-context/current-context.decorator';
import { RequestContextData } from '@common/request-context/request-context.types';

import { resolveShareOwner } from './me-member.helper';
import { GenerateQrDto } from './dto/generate-qr.dto';

@ApiTags('me')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('me/emergency')
export class MeEmergencyController {
  constructor(
    private readonly txManager: TenantTransactionManager,
    private readonly config: ConfigService,
  ) {}

  /**
   * QR dinámico de emergencia — vencimiento corto a propósito
   * (TOKEN_DYNAMIC_QR_TTL_SECONDS, hoy 60s en params.operational_limits,
   * B9: nunca hardcodeado). access_url apunta a CORS_ORIGIN como
   * placeholder: todavía no existe apps/share-web (el portal que
   * resuelve estos tokens sin exponer la API interna, ver brief) —
   * hay que actualizar esta URL base cuando esa app exista.
   */
  @Post('qr')
  async generateQr(
    @CurrentContext() context: RequestContextData,
    @Body() dto: GenerateQrDto,
  ) {
    const ttlSeconds = await getOperationalLimit(
      this.txManager,
      'TOKEN_DYNAMIC_QR_TTL_SECONDS',
      60,
    );
    const tokenValue = randomBytes(24).toString('base64url');
    const tokenHash = createHash('sha256').update(tokenValue).digest('hex');
    const baseUrl = this.config.get<string>('CORS_ORIGIN');
    const accessUrl = `${baseUrl}/emergency/${tokenValue}`;

    return this.txManager.runInTransaction(async (queryRunner) => {
      const owner = await resolveShareOwner(
        queryRunner,
        context.personId!,
        dto.memberId,
      );

      const rows = await queryRunner.query(
        `INSERT INTO emergency.tokens
           (member_id, person_id, token_type_id, token_value, token_hash, access_url,
            expires_at, status_id)
         VALUES (
           $1, $2, params.catalog_id('TOKEN_TYPE', 'DYNAMIC_QR'), $3, $4, $5,
           NOW() + ($6 || ' seconds')::INTERVAL,
           params.catalog_id('TOKEN_STATUS', 'ACTIVE')
         )
         RETURNING id, access_url, expires_at`,
        [owner.memberId, owner.personId, tokenValue, tokenHash, accessUrl, ttlSeconds],
      );
      return rows[0];
    });
  }
}
