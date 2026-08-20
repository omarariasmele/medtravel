import { Injectable, NotFoundException } from '@nestjs/common';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';
import { mapPgError } from '@common/database/pg-error.mapper';

export interface AppSettingView {
  key: string;
  value: string;
  descriptionEs: string | null;
  updatedAt: Date;
}

/**
 * Parámetros globales de plataforma editables desde la web sin
 * recompilar la app (ver proposed-app-settings.sql) — hoy usados por el
 * asistente de salud (velocidad/tono de voz, tolerancia de pausa),
 * pensado para cualquier otro parámetro futuro del mismo tipo.
 */
@Injectable()
export class AppSettingsService {
  constructor(private readonly txManager: TenantTransactionManager) {}

  async list(): Promise<AppSettingView[]> {
    const rows = await this.txManager.runInTransaction((queryRunner) =>
      queryRunner.query(
        `SELECT setting_key, setting_value, description_es, updated_at
         FROM params.app_settings
         ORDER BY setting_key`,
      ),
    );
    return rows.map(toView);
  }

  async update(
    key: string,
    value: string,
    updatedBy: string,
  ): Promise<AppSettingView> {
    try {
      const row = await this.txManager.runInTransaction(async (queryRunner) => {
        const rows = await queryRunner.query(
          `UPDATE params.app_settings
           SET setting_value = $2, updated_at = NOW(), updated_by = $3
           WHERE setting_key = $1
           RETURNING setting_key, setting_value, description_es, updated_at`,
          [key, value, updatedBy],
        );
        return rows[0];
      });
      if (!row) {
        throw new NotFoundException(`No existe el parámetro: ${key}`);
      }
      return toView(row);
    } catch (error) {
      mapPgError(error);
    }
  }
}

function toView(row: {
  setting_key: string;
  setting_value: string;
  description_es: string | null;
  updated_at: Date;
}): AppSettingView {
  return {
    key: row.setting_key,
    value: row.setting_value,
    descriptionEs: row.description_es,
    updatedAt: row.updated_at,
  };
}
