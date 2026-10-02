import { Injectable } from '@nestjs/common';
import { QueryRunner } from 'typeorm';

export interface FeatureFlagContext {
  tenantId?: string;
  memberId?: string;
}

/**
 * Pedido explícito del usuario: "todas las funcionalidades de la app
 * deben ser configurables si aparecen o no" — orden de resolución:
 * override MEMBER > override TENANT > feature_flags de ese tenant >
 * feature_flags global (tenant_id IS NULL). Si el flag ni siquiera está
 * seedeado, se asume habilitado (fail-open) — un flag inexistente no
 * puede ser motivo para esconder una función ya construida.
 *
 * El override MEMBER es, a propósito, la pieza que ya deja resuelto sin
 * trabajo adicional el pedido de "que un usuario pueda en el futuro
 * contratar IA por su cuenta aunque su empresa no la tenga habilitada"
 * (Fase 2, no construida todavía) — activarlo va a ser solo insertar
 * una fila acá, este servicio no necesita cambiar.
 */
@Injectable()
export class FeatureFlagEvaluationService {
  async isEnabled(
    queryRunner: QueryRunner,
    flagKey: string,
    context: FeatureFlagContext,
  ): Promise<boolean> {
    const values = await this.evaluateMany(queryRunner, [flagKey], context);
    return values[flagKey] ?? true;
  }

  /** Misma resolución que isEnabled, pero para varios flags en una sola pasada (usado por /me/tenant-config). */
  async evaluateMany(
    queryRunner: QueryRunner,
    flagKeys: string[],
    context: FeatureFlagContext,
  ): Promise<Record<string, boolean>> {
    if (flagKeys.length === 0) return {};

    const result: Record<string, boolean> = {};

    if (context.memberId) {
      const rows = await queryRunner.query(
        `SELECT ff.flag_key, fo.override_value
         FROM params.flag_overrides fo
         JOIN params.feature_flags ff ON ff.id = fo.flag_id
         WHERE ff.flag_key = ANY($1) AND fo.scope_type = 'MEMBER' AND fo.scope_id = $2
           AND fo.valid_from <= NOW() AND (fo.valid_until IS NULL OR fo.valid_until > NOW())
         ORDER BY fo.valid_from DESC`,
        [flagKeys, context.memberId],
      );
      for (const row of rows) {
        if (!(row.flag_key in result)) result[row.flag_key] = row.override_value === true;
      }
    }

    const stillMissing = flagKeys.filter((k) => !(k in result));
    if (stillMissing.length && context.tenantId) {
      const rows = await queryRunner.query(
        `SELECT ff.flag_key, fo.override_value
         FROM params.flag_overrides fo
         JOIN params.feature_flags ff ON ff.id = fo.flag_id
         WHERE ff.flag_key = ANY($1) AND fo.scope_type = 'TENANT' AND fo.scope_id = $2
           AND fo.valid_from <= NOW() AND (fo.valid_until IS NULL OR fo.valid_until > NOW())
         ORDER BY fo.valid_from DESC`,
        [stillMissing, context.tenantId],
      );
      for (const row of rows) {
        if (!(row.flag_key in result)) result[row.flag_key] = row.override_value === true;
      }
    }

    const stillMissing2 = flagKeys.filter((k) => !(k in result));
    if (stillMissing2.length && context.tenantId) {
      const rows = await queryRunner.query(
        `SELECT flag_key, default_value FROM params.feature_flags
         WHERE flag_key = ANY($1) AND tenant_id = $2 AND active = TRUE`,
        [stillMissing2, context.tenantId],
      );
      for (const row of rows) {
        result[row.flag_key] = row.default_value === true;
      }
    }

    const stillMissing3 = flagKeys.filter((k) => !(k in result));
    if (stillMissing3.length) {
      const rows = await queryRunner.query(
        `SELECT flag_key, default_value FROM params.feature_flags
         WHERE flag_key = ANY($1) AND tenant_id IS NULL AND active = TRUE`,
        [stillMissing3],
      );
      for (const row of rows) {
        result[row.flag_key] = row.default_value === true;
      }
    }

    for (const key of flagKeys) {
      if (!(key in result)) result[key] = true;
    }

    return result;
  }
}
