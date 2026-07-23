import { Injectable } from '@nestjs/common';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';

export interface RequestTenantBreakGlassInput {
  tenantId: string;
  granteeId: string;
  purposeId: string;
  legalBasisId: string;
  justification: string;
  hours?: number;
}

/**
 * Mellizo tenant-scoped de BreakGlassService (gap #8, ver SCHEMA_GAPS.md
 * y proposed-tenant-access-model.sql) — el Superadmin de OYSGROUP pasa
 * por acá para acceder a los datos de un tenant que no es el suyo
 * (operadores, casos, chat). Wrappea las funciones SECURITY DEFINER de
 * audit.* — app_runtime no tiene INSERT/UPDATE directo en
 * audit.tenant_break_glass_grants, igual que con el break-glass clínico.
 *
 * Pendiente (no resuelto en esta pasada): no hay todavía un controller
 * ni un guard que restrinja quién puede llamar a request() — falta
 * definir con el equipo de producto qué usuarios pueden siquiera
 * solicitar acceso a un tenant ajeno antes de exponer esto por HTTP.
 */
@Injectable()
export class TenantBreakGlassService {
  constructor(private readonly txManager: TenantTransactionManager) {}

  async request(input: RequestTenantBreakGlassInput): Promise<string> {
    return this.txManager.runInTransaction(async (queryRunner) => {
      const result = await queryRunner.query(
        `SELECT audit.request_tenant_break_glass($1, $2, $3, $4, $5, $6) AS id`,
        [
          input.tenantId,
          input.granteeId,
          input.purposeId,
          input.legalBasisId,
          input.justification,
          input.hours ?? 4,
        ],
      );
      return result[0].id as string;
    });
  }

  /** El segundo aprobador se toma de app.current_user_id — no puede ser granted_by. */
  async approve(grantId: string): Promise<void> {
    await this.txManager.runInTransaction(async (queryRunner) => {
      await queryRunner.query(`SELECT audit.approve_tenant_break_glass($1)`, [
        grantId,
      ]);
    });
  }

  async revoke(grantId: string, reason: string): Promise<void> {
    await this.txManager.runInTransaction(async (queryRunner) => {
      await queryRunner.query(
        `SELECT audit.revoke_tenant_break_glass($1, $2)`,
        [grantId, reason],
      );
    });
  }
}
