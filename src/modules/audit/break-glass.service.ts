import { Injectable } from '@nestjs/common';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';

export interface RequestBreakGlassInput {
  personId: string;
  purposeId: string;
  legalBasisId: string;
  justification: string;
  hours?: number;
  granteeId?: string;
}

/**
 * Wrappea las funciones SECURITY DEFINER de audit.* — app_runtime no tiene
 * (ni debe tener) INSERT/UPDATE directo en audit.break_glass_grants (C3 en
 * 000_extensions.sql / 001_audit.sql). Todo el flujo de break-glass pasa por
 * acá, nunca por un repositorio TypeORM genérico.
 */
@Injectable()
export class BreakGlassService {
  constructor(private readonly txManager: TenantTransactionManager) {}

  /** Requiere app.current_user_id seteado en el RequestContext (ver audit.request_break_glass). */
  async request(input: RequestBreakGlassInput): Promise<string> {
    return this.txManager.runInTransaction(async (queryRunner) => {
      const result = await queryRunner.query(
        `SELECT audit.request_break_glass($1, $2, $3, $4, $5, $6) AS id`,
        [
          input.personId,
          input.purposeId,
          input.legalBasisId,
          input.justification,
          input.hours ?? 2,
          input.granteeId ?? null,
        ],
      );
      return result[0].id as string;
    });
  }

  /** El segundo aprobador se toma de app.current_user_id — no puede ser granted_by (C4). */
  async approve(grantId: string, granteeId: string): Promise<void> {
    await this.txManager.runInTransaction(async (queryRunner) => {
      await queryRunner.query(`SELECT audit.approve_break_glass($1, $2)`, [
        grantId,
        granteeId,
      ]);
    });
  }

  async revoke(grantId: string, reason: string): Promise<void> {
    await this.txManager.runInTransaction(async (queryRunner) => {
      await queryRunner.query(`SELECT audit.revoke_break_glass($1, $2)`, [
        grantId,
        reason,
      ]);
    });
  }
}
