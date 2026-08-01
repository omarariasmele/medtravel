import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Request } from 'express';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';

export interface ShareContext {
  shareTokenId: string;
  memberId: string;
  personId: string;
  scope: string[];
  expiresAt: string;
  canSubmitNote: boolean;
}

export interface ShareRequest extends Request {
  shareContext: ShareContext;
}

interface RedeemRow {
  ok: boolean;
  share_token_id: string;
  member_id: string;
  person_id: string;
  scope: string[];
  expires_at: string;
  can_submit_note: boolean;
}

/**
 * Valida el token de share ANTES de que corra el controller, vía
 * emergency.redeem_share_token (valida vigencia/usos/estado, incrementa
 * use_count, deja rastro en access_log/token_usage_log). Nunca
 * distingue el motivo del rechazo (404 genérico) — mismo criterio
 * anti-enumeración que /auth/login. El resultado queda en
 * request.shareContext para que el controller arme la vista clínica sin
 * repetir la validación.
 */
@Injectable()
export class EmergencyShareTokenGuard implements CanActivate {
  constructor(private readonly txManager: TenantTransactionManager) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ShareRequest>();
    const token = request.params.token;

    const [result]: RedeemRow[] = await this.txManager.runInTransaction(
      (queryRunner) =>
        queryRunner.query(
          `SELECT * FROM emergency.redeem_share_token($1, $2, $3)`,
          [token, 'LINK_CLICK', request.ip],
        ),
    );

    if (!result?.ok) {
      throw new NotFoundException('Link no válido o vencido');
    }

    request.shareContext = {
      shareTokenId: result.share_token_id,
      memberId: result.member_id,
      personId: result.person_id,
      scope: result.scope,
      expiresAt: result.expires_at,
      canSubmitNote: result.can_submit_note,
    };

    return true;
  }
}
