import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as nodemailer from 'nodemailer';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';
import { mapPgError } from '@common/database/pg-error.mapper';
import { logoAttachment, renderEmailHtml } from '@modules/mail/email-template';

import { TestSmtpSettingsDto } from './dto/test-smtp-settings.dto';

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
 * MailService la lee, vía una función SECURITY DEFINER aparte). El
 * username también se cifra en la base (proposed-smtp-username-
 * encryption.sql) — a diferencia de la contraseña, SÍ se devuelve acá
 * (decodificado) porque no es secreto: es el usuario visible con el
 * que se conecta al servidor, útil para confirmar qué cuenta está
 * configurada sin tener que volver a escribirla.
 */
@Injectable()
export class SmtpSettingsService {
  constructor(private readonly txManager: TenantTransactionManager) {}

  async get(): Promise<SmtpSettingsView> {
    const row = await this.txManager.runInTransaction(async (queryRunner) => {
      const rows = await queryRunner.query(
        `SELECT id, host, port, core.decrypt_pii(username) AS username,
                from_address, from_name, secure, updated_at
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
           VALUES ($1, $2, core.encrypt_pii($3), core.encrypt_pii($4), $5, $6, $7, TRUE, $8)
           RETURNING id, host, port, from_address, from_name, secure, updated_at`,
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
        username: dto.username,
        fromAddress: row.from_address,
        fromName: row.from_name,
        secure: row.secure,
        updatedAt: row.updated_at,
      };
    } catch (error) {
      mapPgError(error);
    }
  }

  /**
   * Prueba una configuración SIN guardarla — arma el transporter
   * nodemailer directo con lo que el usuario tiene tipeado en el
   * formulario ahora mismo, no con lo ya persistido en la tabla. Así se
   * puede validar antes de confirmar el guardado.
   */
  async sendTestEmail(dto: TestSmtpSettingsDto): Promise<{ ok: boolean }> {
    const transporter = nodemailer.createTransport({
      host: dto.host,
      port: dto.port,
      secure: dto.secure,
      auth: { user: dto.username, pass: dto.password },
    });

    try {
      await transporter.sendMail({
        from: `"${dto.fromName}" <${dto.fromAddress}>`,
        to: dto.to,
        subject:
          'Prueba de configuración SMTP — MedTravelApp / SMTP configuration test',
        html: renderEmailHtml(
          '<p>Si estás viendo este email, la configuración SMTP de MedTravelApp funciona correctamente.</p>' +
            '<hr style="border:none; border-top:1px solid #e6e8e7; margin:20px 0;" />' +
            '<p>If you are seeing this email, the MedTravelApp SMTP configuration is working correctly.</p>',
        ),
        attachments: [logoAttachment()],
      });
    } catch (error) {
      throw new BadRequestException(
        `No se pudo enviar el email de prueba: ${(error as Error).message}`,
      );
    }

    return { ok: true };
  }
}
