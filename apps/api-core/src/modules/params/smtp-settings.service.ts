import { Injectable, NotFoundException } from '@nestjs/common';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';
import { mapPgError } from '@common/database/pg-error.mapper';

export interface SmtpSettingsDto {
  host: string;
  port: number;
  username: string;
  password: string;
  fromAddress: string;
  fromName: string;
  secure: boolean;
}

export interface SmtpSettingsView {
  id: string;
  host: string;
  port: number;
  username: string;
  fromAddress: string;
  fromName: string;
  secure: boolean;
  updatedAt: Date;
}

/**
 * Acceso restringido al Superadmin (core.has_platform_config_access(),
 * ver proposed-password-reset-and-smtp.sql) — la RLS de
 * params.smtp_settings ya lo exige para cualquier comando, esto solo
 * evita devolver la contraseña ni siquiera a quien tiene acceso (se
 * cifra con core.encrypt_pii y nunca se decodifica de vuelta acá; solo
 * MailService la lee, vía una función SECURITY DEFINER aparte).
 */
@Injectable()
export class SmtpSettingsService {
  constructor(private readonly txManager: TenantTransactionManager) {}

  async get(): Promise<SmtpSettingsView> {
    const row = await this.txManager.runInTransaction(async (queryRunner) => {
      const rows = await queryRunner.query(
        `SELECT id, host, port, username, from_address, from_name, secure, updated_at
         FROM params.smtp_settings
         WHERE active = TRUE
         ORDER BY updated_at DESC
         LIMIT 1`,
      );
      return rows[0];
    });

    if (!row) {
      throw new NotFoundException('No hay configuración SMTP cargada todavía');
    }

    return {
      id: row.id,
      host: row.host,
      port: row.port,
      username: row.username,
      fromAddress: row.from_address,
      fromName: row.from_name,
      secure: row.secure,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Siempre inserta una fila nueva y desactiva la anterior en vez de
   * hacer UPDATE in place — deja un historial de cambios de
   * configuración (quién, cuándo) igual que el resto de tablas
   * sensibles del schema, sin necesitar una tabla de auditoría aparte.
   */
  async upsert(
    dto: SmtpSettingsDto,
    updatedBy: string,
  ): Promise<SmtpSettingsView> {
    try {
      const row = await this.txManager.runInTransaction(async (queryRunner) => {
        await queryRunner.query(
          `UPDATE params.smtp_settings SET active = FALSE WHERE active = TRUE`,
        );
        const rows = await queryRunner.query(
          `INSERT INTO params.smtp_settings
             (host, port, username, password_encrypted, from_address, from_name, secure, active, updated_by)
           VALUES ($1, $2, $3, core.encrypt_pii($4), $5, $6, $7, TRUE, $8)
           RETURNING id, host, port, username, from_address, from_name, secure, updated_at`,
          [
            dto.host,
            dto.port,
            dto.username,
            dto.password,
            dto.fromAddress,
            dto.fromName,
            dto.secure,
            updatedBy,
          ],
        );
        return rows[0];
      });

      return {
        id: row.id,
        host: row.host,
        port: row.port,
        username: row.username,
        fromAddress: row.from_address,
        fromName: row.from_name,
        secure: row.secure,
        updatedAt: row.updated_at,
      };
    } catch (error) {
      mapPgError(error);
    }
  }
}
