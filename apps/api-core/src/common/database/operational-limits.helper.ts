import { TenantTransactionManager } from './tenant-transaction.manager';

/**
 * Lee un límite operativo global (tenant_id IS NULL) de
 * params.operational_limits — mismo patrón que
 * operations.fill_sla_target()/audit.enforce_break_glass_duration() del
 * lado de Postgres (B9: nada de TTLs/umbrales hardcodeados). Si la clave
 * no está configurada, usa `fallback` — a diferencia del break-glass
 * (C9, fail-secure a propósito porque ahí faltar el límite es un riesgo
 * de seguridad), acá faltar un límite operativo no debería tumbar el
 * login, así que degrada a un valor por defecto razonable.
 */
export async function getOperationalLimit(
  txManager: TenantTransactionManager,
  key: string,
  fallback: number,
): Promise<number> {
  const rows = await txManager.runInTransaction((queryRunner) =>
    queryRunner.query(
      `SELECT limit_value FROM params.operational_limits
       WHERE limit_key = $1 AND tenant_id IS NULL AND lifecycle_status = 'ACTIVE'
       LIMIT 1`,
      [key],
    ),
  );
  return rows[0]?.limit_value ?? fallback;
}
