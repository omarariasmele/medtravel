import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as nodemailer from 'nodemailer';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';

interface SmtpConfigRow {
  host: string;
  port: number;
  username: string;
  password: string;
  from_address: string;
  from_name: string;
  secure: boolean;
}

/**
 * El servidor SMTP es propio de OYS GROUP y su configuración vive en
 * params.smtp_settings (editable solo por el Superadmin, ver
 * proposed-password-reset-and-smtp.sql) — nunca en .env, para que se
 * pueda cambiar sin redeploy. No cachea el transporter: el volumen de
 * envíos (reset de password, notificaciones puntuales) no lo justifica,
 * y así un cambio de configuración se aplica en el próximo envío sin
 * reiniciar el proceso.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly txManager: TenantTransactionManager) {}

  async send(to: string, subject: string, html: string): Promise<void> {
    const config = await this.loadConfig();

    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.username, pass: config.password },
    });

    await transporter.sendMail({
      from: `"${config.from_name}" <${config.from_address}>`,
      to,
      subject,
      html,
    });
  }

  private async loadConfig(): Promise<SmtpConfigRow> {
    const row = await this.txManager.runInTransaction(async (queryRunner) => {
      const rows = await queryRunner.query(
        `SELECT * FROM params.get_active_smtp_config()`,
      );
      return rows[0];
    });

    if (!row) {
      this.logger.error(
        'No hay configuración SMTP activa en params.smtp_settings',
      );
      throw new ServiceUnavailableException(
        'El servidor de correo no está configurado todavía',
      );
    }

    return row;
  }
}
