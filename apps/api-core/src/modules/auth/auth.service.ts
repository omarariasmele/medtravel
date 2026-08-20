import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, createHmac, randomUUID } from 'crypto';
import { generateSecret, generateURI, verify } from 'otplib';
import { QueryFailedError } from 'typeorm';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';
import { getOperationalLimit } from '@common/database/operational-limits.helper';
import { MailService } from '@modules/mail/mail.service';

import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { TokenPairDto } from './dto/token-pair.dto';
import { MfaRequiredResponseDto } from './dto/mfa-required-response.dto';
import { MfaEnrollResponseDto } from './dto/mfa-enroll-response.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ConfirmPasswordResetDto } from './dto/confirm-password-reset.dto';
import { JwtPayload } from './jwt-payload.interface';

interface LoginCredentialsRow {
  user_id: string;
  person_id: string;
  active: boolean;
  password_hash: string;
  must_change: boolean;
  failed_attempts: number;
  locked_until: string | null;
}

/**
 * Fallbacks si AUTH_MAX_FAILED_ATTEMPTS/AUTH_LOCKOUT_MINUTES no están en
 * params.operational_limits — 008_seeds.sql no las incluye todavía (se
 * agregaron como fixture de test, ver conversación/README).
 */
const DEFAULT_MAX_FAILED_ATTEMPTS = 5;
const DEFAULT_LOCKOUT_MINUTES = 15;

/** issuer que ven las apps autenticadoras (Google Authenticator, etc.) */
const MFA_ISSUER = 'MedTravelApp';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly txManager: TenantTransactionManager,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly mailService: MailService,
  ) {}

  /** Replica exactamente core.blind_index(): hmac(lower(trim(value)), key, 'sha256') en hex. */
  private computeBlindIndex(value: string): string {
    const key = this.config.get<string>('DB_BLIND_INDEX_KEY')!;
    const normalized = value.trim().toLowerCase();
    return createHmac('sha256', key).update(normalized).digest('hex');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Alta propia (self-service) — core.persons/core.users no tienen
   * ninguna política RLS que permita este INSERT pre-auth (mismo motivo
   * que login() necesita core.get_login_credentials), así que pasa por
   * core.register_person_and_user (SECURITY DEFINER). No crea
   * core.members: pertenecer a un tenant es una relación aparte
   * (enrollment/importación), no parte del alta de la persona.
   */
  async register(dto: RegisterDto, deviceFingerprint?: string): Promise<TokenPairDto> {
    const emailBlindIndex = this.computeBlindIndex(dto.email);
    const docNumberIdx = this.computeBlindIndex(dto.docNumber);
    const phoneBlindIndex = dto.phone
      ? this.computeBlindIndex(dto.phone)
      : null;
    const passwordHash = await bcrypt.hash(dto.password, 10);

    let result: { person_id: string; user_id: string } | undefined;
    try {
      result = await this.txManager.runInTransaction(async (queryRunner) => {
        const rows = await queryRunner.query(
          `SELECT * FROM core.register_person_and_user($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            dto.firstName,
            dto.lastName,
            dto.email,
            emailBlindIndex,
            passwordHash,
            dto.docCountryId,
            dto.preferredLang ?? 'es',
            dto.phone ?? null,
            phoneBlindIndex,
          ],
        );
        const registered = rows[0];

        // Documento obligatorio al registrarse — pedido explícito del
        // usuario para poder detectar altas duplicadas de la misma
        // persona (mismo tipo+número+país; sistema internacional, la
        // unicidad de documento es por país, no global). Reusa
        // core.external_identifiers tal cual (mismo mecanismo que
        // MeDocumentController), solo que ahora es parte del alta en
        // vez de un paso posterior opcional.
        await queryRunner.query(
          `INSERT INTO core.external_identifiers
             (person_id, doc_type_id, doc_number, doc_number_idx, issuing_country_id, is_primary)
           VALUES ($1, $2, core.encrypt_pii($3), $4, $5, TRUE)`,
          [
            registered.person_id,
            dto.docTypeId,
            dto.docNumber,
            docNumberIdx,
            dto.docCountryId,
          ],
        );

        return registered;
      });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as QueryFailedError & { code?: string }).code === '23505'
      ) {
        const constraint = (error as QueryFailedError & { constraint?: string })
          .constraint;
        if (constraint?.includes('external_identifiers')) {
          throw new ConflictException(
            'Ya existe una cuenta registrada con ese tipo y número de documento para ese país',
          );
        }
        throw new ConflictException('Ya existe una cuenta con ese email');
      }
      throw error;
    }

    await this.sendVerificationCode(result!.user_id, dto.email);

    return this.issueTokenPair(
      {
        userId: result!.user_id,
        personId: result!.person_id,
        email: dto.email,
      },
      undefined,
      deviceFingerprint,
    );
  }

  /**
   * Código de 6 dígitos (no un link — la app del viajero es mobile-only,
   * sin página pública donde aterrizar un link de verificación). No
   * propaga el error si el envío falla (SMTP caído, etc.): el registro
   * ya se completó y el viajero puede seguir usando la app; solo pierde
   * la posibilidad de verificar hasta pedir "Reenviar código".
   */
  private async sendVerificationCode(
    userId: string,
    email: string,
  ): Promise<void> {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = this.hashToken(code);
    const ttlMinutes = await getOperationalLimit(
      this.txManager,
      'EMAIL_VERIFICATION_CODE_TTL_MINUTES',
      30,
    );

    await this.txManager.runInTransaction(
      (queryRunner) =>
        queryRunner.query(
          `INSERT INTO core.email_verification_codes (user_id, code_hash, expires_at)
           VALUES ($1, $2, NOW() + ($3 || ' minutes')::INTERVAL)`,
          [userId, codeHash, ttlMinutes],
        ),
      { userId },
    );

    try {
      await this.mailService.send(
        email,
        'Verificá tu email en MedTravelApp / Verify your MedTravelApp email',
        `<p>Tu código de verificación es: <strong style="font-size:20px; letter-spacing:2px;">${code}</strong></p>
         <p>Ingresalo en la app para confirmar tu email. Vence en ${ttlMinutes} minutos.</p>
         <hr style="border:none; border-top:1px solid #e6e8e7; margin:20px 0;" />
         <p>Your verification code is: <strong style="font-size:20px; letter-spacing:2px;">${code}</strong></p>
         <p>Enter it in the app to confirm your email. It expires in ${ttlMinutes} minutes.</p>`,
      );
    } catch (error) {
      this.logger.error(
        `No se pudo enviar el código de verificación de email: ${(error as Error).message}`,
      );
    }
  }

  async verifyEmail(userId: string, code: string): Promise<{ ok: boolean }> {
    const codeHash = this.hashToken(code);
    const verified = await this.txManager.runInTransaction(
      async (queryRunner) => {
        const rows = await queryRunner.query(
          `SELECT core.consume_email_verification_code($1, $2) AS ok`,
          [userId, codeHash],
        );
        return rows[0]?.ok as boolean;
      },
      { userId },
    );

    if (!verified) {
      throw new BadRequestException('Código inválido o vencido');
    }
    return { ok: true };
  }

  async resendVerificationCode(userId: string): Promise<{ ok: boolean }> {
    const email = await this.txManager.runInTransaction(async (queryRunner) => {
      const rows = await queryRunner.query(
        `SELECT core.get_user_email($1) AS email`,
        [userId],
      );
      return rows[0]?.email as string | undefined;
    });
    if (!email) {
      throw new BadRequestException('No se encontró el usuario');
    }
    await this.sendVerificationCode(userId, email);
    return { ok: true };
  }

  async login(
    dto: LoginDto,
    clientApp?: string,
    deviceFingerprint?: string,
  ): Promise<TokenPairDto | MfaRequiredResponseDto> {
    const emailBlindIndex = this.computeBlindIndex(dto.email);

    const credentials = await this.txManager.runInTransaction<
      LoginCredentialsRow | undefined
    >(async (queryRunner) => {
      const rows = await queryRunner.query(
        'SELECT * FROM core.get_login_credentials($1)',
        [emailBlindIndex],
      );
      return rows[0];
    });

    // Mismo mensaje genérico exista o no el usuario — evita enumeración de emails.
    const invalidCredentialsError = new UnauthorizedException(
      'Email o contraseña incorrectos',
    );

    if (!credentials || !credentials.active) {
      throw invalidCredentialsError;
    }

    if (
      credentials.locked_until &&
      new Date(credentials.locked_until).getTime() > Date.now()
    ) {
      throw new UnauthorizedException(
        `Cuenta bloqueada temporalmente hasta ${credentials.locked_until}`,
      );
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      credentials.password_hash,
    );

    if (!passwordMatches) {
      await this.registerFailedAttempt(
        credentials.user_id,
        credentials.failed_attempts,
      );
      throw invalidCredentialsError;
    }

    const mfaRow = await this.txManager.runInTransaction<
      { secret: string } | undefined
    >(
      async (queryRunner) => {
        const rows = await queryRunner.query(
          `SELECT core.decrypt_pii(method_value) AS secret
           FROM core.mfa_methods
           WHERE user_id = $1 AND is_active = TRUE AND verified_at IS NOT NULL
             AND method_type_id = params.catalog_id('MFA_METHOD', 'TOTP')
           LIMIT 1`,
          [credentials.user_id],
        );
        return rows[0];
      },
      { userId: credentials.user_id },
    );

    if (mfaRow) {
      if (!dto.mfaCode) {
        return { mfaRequired: true };
      }
      const { valid } = await verify({
        secret: mfaRow.secret,
        token: dto.mfaCode,
      });
      if (!valid) {
        await this.registerFailedAttempt(
          credentials.user_id,
          credentials.failed_attempts,
        );
        throw invalidCredentialsError;
      }
    }

    await this.resetFailedAttempts(credentials.user_id);

    // Si además es operador, el JWT lleva su tenantId — sin esto,
    // ninguna política *_tenant_access (gap #8) se activa nunca para su
    // sesión, vería 0 filas en todo /operations aunque tenga acceso real.
    const operatorContext = await this.txManager.runInTransaction<
      | {
          tenant_id: string | null;
          can_manage_config: boolean;
          can_manage_operators: boolean;
          can_close_cases: boolean;
          can_access_medical: boolean;
          can_edit_clinical_data: boolean;
        }
      | undefined
    >(async (queryRunner) => {
      const rows = await queryRunner.query(
        `SELECT tenant_id, can_manage_config, can_manage_operators, can_close_cases, can_access_medical, can_edit_clinical_data
         FROM operations.get_operator_login_context($1)`,
        [credentials.user_id],
      );
      return rows[0];
    });

    // Operadores/staff y viajeros son poblaciones separadas — la app
    // móvil es solo para viajeros. Sin esto, cualquier cuenta de
    // operador (incluido un super admin) podía loguearse en la app y
    // quedar navegando como si fuera un viajero, sin ningún dato de
    // paciente real detrás.
    if (clientApp === 'mobile' && operatorContext) {
      throw new UnauthorizedException(
        'Esta cuenta es de staff/operador — ingresá desde el panel de administración, no desde la app.',
      );
    }

    // Bug real reportado en vivo: un viajero (ej. Stefano, sin fila en
    // operations.operators) podía loguearse en admin-web igual que un
    // operador — el chequeo de arriba solo bloqueaba el sentido
    // contrario (operador entrando por mobile). admin-web ahora manda
    // X-Client-App: 'admin-web' en cada request (ver api-client.ts) —
    // salvo el auto-registro de profesionales/instituciones
    // (professional-registration.page.tsx), que usa publicApiClient
    // A PROPÓSITO sin este header, porque esa cuenta tampoco tiene
    // contexto de operador todavía y no debe bloquearse acá.
    if (clientApp === 'admin-web' && !operatorContext) {
      throw new UnauthorizedException(
        'Esta cuenta no tiene permisos de operador — no podés ingresar al panel de administración.',
      );
    }

    // Pedido explícito del usuario: "la app se puede utilizar en dos
    // telefonos en simultaneo con el mismo usuario, esto no deberia
    // pasar". Rechaza el login nuevo (no cierra el anterior en
    // silencio) — el viajero ve un mensaje claro y tiene que cerrar
    // sesión en el otro equipo primero. Un operador puede destrabarlo
    // desde admin-web si algo falla (sesión que quedó colgada sin
    // logout explícito) — ver OperatorsAccountController/
    // traveler-detail.page.tsx "Cerrar sesión activa".
    if (clientApp === 'mobile') {
      // Bug real reportado en vivo: "si el usuario se conectó del mismo
      // dispositivo, no debería decir que hay otra sesión abierta" — el
      // bloqueo comparaba SOLO por usuario, nunca por dispositivo (la
      // columna device_fingerprint existía pero nunca se llenaba). Ahora
      // el celular manda un id persistente (X-Device-Id, ver
      // device_id_service.dart) — si reconecta desde el MISMO
      // dispositivo, se revocan sus sesiones viejas (no deja basura
      // acumulada) y se lo deja pasar sin bloqueo. El bloqueo real queda
      // solo para cuando la sesión activa es de un device_fingerprint
      // DISTINTO (o cuando el cliente todavía no manda el header, para
      // no aflojar la protección con apps viejas).
      const hasOtherDeviceSession = await this.txManager.runInTransaction(
        async (queryRunner) => {
          if (deviceFingerprint) {
            // device_fingerprint IS NULL cubre las sesiones creadas
            // ANTES de este cambio (ningún login viejo lo guardaba) —
            // sin esto, una sesión legítima previa del mismo usuario
            // queda bloqueando para siempre porque nunca hay nada
            // contra qué compararla. Solo pasa una vez por sesión vieja
            // (las nuevas ya siempre traen fingerprint real).
            await queryRunner.query(
              `UPDATE core.security_sessions
               SET is_active = FALSE, revoked_at = NOW()
               WHERE user_id = $1 AND is_active = TRUE AND revoked_at IS NULL
                 AND (device_fingerprint = $2 OR device_fingerprint IS NULL)`,
              [credentials.user_id, deviceFingerprint],
            );
          }
          const rows = await queryRunner.query(
            `SELECT 1 FROM core.security_sessions
             WHERE user_id = $1 AND is_active = TRUE AND revoked_at IS NULL AND expires_at > NOW()
             LIMIT 1`,
            [credentials.user_id],
          );
          return rows.length > 0;
        },
        { userId: credentials.user_id },
      );
      if (hasOtherDeviceSession) {
        throw new UnauthorizedException(
          'Ya hay una sesión activa con este usuario en otro dispositivo. Cerrá sesión ahí primero — si no podés, pedile a un operador que la cierre desde el panel de administración.',
        );
      }
    }

    return this.issueTokenPair(
      {
        userId: credentials.user_id,
        personId: credentials.person_id,
        tenantId: operatorContext?.tenant_id ?? undefined,
        canManageConfig: operatorContext?.can_manage_config,
        canManageOperators: operatorContext?.can_manage_operators,
        canCloseCases: operatorContext?.can_close_cases,
        canAccessMedical: operatorContext?.can_access_medical,
        canEditClinicalData: operatorContext?.can_edit_clinical_data,
        email: dto.email,
      },
      undefined,
      deviceFingerprint,
    );
  }

  /**
   * Genera un secreto TOTP nuevo y lo guarda sin verificar (verified_at
   * NULL) — recién cuenta para el login después de verifyMfaEnrollment.
   * Desactiva cualquier método TOTP previo del usuario para no dejar más
   * de un secreto activo compitiendo en la consulta de login().
   */
  async enrollMfa(userId: string): Promise<MfaEnrollResponseDto> {
    const secret = generateSecret();
    const otpauthUrl = generateURI({
      issuer: MFA_ISSUER,
      label: userId,
      secret,
    });

    await this.txManager.runInTransaction(async (queryRunner) => {
      await queryRunner.query(
        `UPDATE core.mfa_methods SET is_active = FALSE
         WHERE user_id = $1 AND method_type_id = params.catalog_id('MFA_METHOD', 'TOTP')
           AND is_active = TRUE`,
        [userId],
      );
      await queryRunner.query(
        `INSERT INTO core.mfa_methods (user_id, method_type_id, method_value, is_active, is_primary)
         VALUES ($1, params.catalog_id('MFA_METHOD', 'TOTP'), core.encrypt_pii($2), TRUE, TRUE)`,
        [userId, secret],
      );
    });

    return { secret, otpauthUrl };
  }

  /** Confirma la inscripción pendiente más reciente con un código TOTP válido. */
  async verifyMfaEnrollment(
    userId: string,
    code: string,
  ): Promise<{ ok: boolean }> {
    const pending = await this.txManager.runInTransaction<
      { id: string; secret: string } | undefined
    >(async (queryRunner) => {
      const rows = await queryRunner.query(
        `SELECT id, core.decrypt_pii(method_value) AS secret
         FROM core.mfa_methods
         WHERE user_id = $1 AND is_active = TRUE AND verified_at IS NULL
           AND method_type_id = params.catalog_id('MFA_METHOD', 'TOTP')
         ORDER BY created_at DESC LIMIT 1`,
        [userId],
      );
      return rows[0];
    });

    if (!pending) {
      throw new BadRequestException(
        'No hay una inscripción MFA pendiente de verificación',
      );
    }

    const { valid } = await verify({ secret: pending.secret, token: code });
    if (!valid) {
      throw new UnauthorizedException('Código MFA inválido');
    }

    await this.txManager.runInTransaction((queryRunner) =>
      queryRunner.query(
        `UPDATE core.mfa_methods SET verified_at = NOW() WHERE id = $1`,
        [pending.id],
      ),
    );

    return { ok: true };
  }

  /** Desactiva todos los métodos MFA activos del usuario. */
  async disableMfa(userId: string): Promise<{ ok: boolean }> {
    await this.txManager.runInTransaction((queryRunner) =>
      queryRunner.query(
        `UPDATE core.mfa_methods SET is_active = FALSE
         WHERE user_id = $1 AND is_active = TRUE`,
        [userId],
      ),
    );
    return { ok: true };
  }

  async refresh(refreshToken: string): Promise<TokenPairDto> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken);
    } catch {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }

    const refreshTokenHash = this.hashToken(refreshToken);

    const session = await this.txManager.runInTransaction(
      async (queryRunner) => {
        const rows = await queryRunner.query(
          `SELECT id FROM core.security_sessions
           WHERE user_id = $1 AND refresh_token_hash = $2
             AND is_active = TRUE AND revoked_at IS NULL AND expires_at > NOW()`,
          [payload.sub, refreshTokenHash],
        );
        return rows[0];
      },
      { userId: payload.sub },
    );

    if (!session) {
      throw new UnauthorizedException('Sesión inválida, revocada o expirada');
    }

    return this.issueTokenPair(
      {
        userId: payload.sub,
        personId: payload.personId,
        tenantId: payload.tenantId,
        canManageConfig: payload.canManageConfig,
        canManageOperators: payload.canManageOperators,
        canCloseCases: payload.canCloseCases,
        canAccessMedical: payload.canAccessMedical,
        canEditClinicalData: payload.canEditClinicalData,
        email: payload.email,
      },
      session.id,
    );
  }

  /**
   * Revoca la sesión actual — no borra la fila (queda como historial de
   * auditoría de sesiones), solo la marca inactiva. Idempotente: llamar
   * logout dos veces con la misma sesión no falla, solo no vuelve a
   * afectar ninguna fila la segunda vez.
   */
  async logout(userId: string, sessionId: string): Promise<{ ok: boolean }> {
    await this.txManager.runInTransaction(
      (queryRunner) =>
        queryRunner.query(
          `UPDATE core.security_sessions
           SET is_active = FALSE, revoked_at = NOW()
           WHERE id = $1 AND user_id = $2 AND is_active = TRUE`,
          [sessionId, userId],
        ),
      { userId },
    );
    return { ok: true };
  }

  /**
   * Mismo mensaje/respuesta exista o no el email (evita enumeración,
   * igual que login()) — si existe y está activo, manda el link; si no,
   * simplemente no pasa nada, pero el caller nunca lo distingue.
   */
  async requestPasswordReset(
    dto: RequestPasswordResetDto,
  ): Promise<{ ok: boolean }> {
    const emailBlindIndex = this.computeBlindIndex(dto.email);

    const credentials = await this.txManager.runInTransaction<
      LoginCredentialsRow | undefined
    >(async (queryRunner) => {
      const rows = await queryRunner.query(
        'SELECT * FROM core.get_login_credentials($1)',
        [emailBlindIndex],
      );
      return rows[0];
    });

    if (credentials && credentials.active) {
      const token =
        randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
      const tokenHash = this.hashToken(token);
      const ttlMinutes = await getOperationalLimit(
        this.txManager,
        'PASSWORD_RESET_TOKEN_TTL_MINUTES',
        30,
      );

      await this.txManager.runInTransaction(
        (queryRunner) =>
          queryRunner.query(
            `INSERT INTO core.password_reset_tokens (user_id, token_hash, expires_at)
             VALUES ($1, $2, NOW() + ($3 || ' minutes')::INTERVAL)`,
            [credentials.user_id, tokenHash, ttlMinutes],
          ),
        { userId: credentials.user_id },
      );

      const resetUrl = `${this.config.get<string>('CORS_ORIGIN')}/reset-password?token=${token}`;
      try {
        await this.mailService.send(
          dto.email,
          'Restablecer tu contraseña de MedTravelApp / Reset your MedTravelApp password',
          `<p>Hacé clic <a href="${resetUrl}">acá</a> para restablecer la contraseña de la cuenta <strong>${dto.email}</strong>.</p>
           <p>Este link vence en ${ttlMinutes} minutos. Si no lo pediste vos, ignorá este correo.</p>
           <hr style="border:none; border-top:1px solid #e6e8e7; margin:20px 0;" />
           <p>Click <a href="${resetUrl}">here</a> to reset the password for account <strong>${dto.email}</strong>.</p>
           <p>This link expires in ${ttlMinutes} minutes. If you didn't request this, please ignore this email.</p>`,
        );
      } catch (error) {
        // No propagar: si el envío falla (SMTP no configurado, caído,
        // etc.) la respuesta tiene que ser idéntica a la de un email que
        // no existe — de lo contrario un 500 acá delataría cuáles
        // emails SÍ están registrados (mismo problema que evita el
        // mensaje genérico de login()). El token ya quedó insertado; si
        // el usuario reintenta, requestPasswordReset genera uno nuevo.
        this.logger.error(
          `No se pudo enviar el mail de reset de password: ${(error as Error).message}`,
        );
      }
    }

    return { ok: true };
  }

  async resetPassword(dto: ConfirmPasswordResetDto): Promise<{ ok: boolean }> {
    const tokenHash = this.hashToken(dto.token);

    const userId = await this.txManager.runInTransaction<string | null>(
      async (queryRunner) => {
        const rows = await queryRunner.query(
          `SELECT core.consume_password_reset_token($1) AS user_id`,
          [tokenHash],
        );
        return rows[0]?.user_id ?? null;
      },
    );

    if (!userId) {
      throw new UnauthorizedException(
        'Link de reset inválido, ya usado, o vencido',
      );
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);

    await this.txManager.runInTransaction(
      (queryRunner) =>
        queryRunner.query(
          `UPDATE core.authentication_credentials
           SET password_hash = $2, must_change = FALSE,
               failed_attempts = 0, locked_until = NULL
           WHERE user_id = $1`,
          [userId, passwordHash],
        ),
      { userId },
    );

    // Cambiar la password invalida cualquier sesión activa robada.
    await this.txManager.runInTransaction(
      (queryRunner) =>
        queryRunner.query(
          `UPDATE core.security_sessions
           SET is_active = FALSE, revoked_at = NOW()
           WHERE user_id = $1 AND is_active = TRUE`,
          [userId],
        ),
      { userId },
    );

    return { ok: true };
  }

  private async registerFailedAttempt(
    userId: string,
    currentFailedAttempts: number,
  ): Promise<void> {
    const [maxFailedAttempts, lockoutMinutes] = await Promise.all([
      getOperationalLimit(
        this.txManager,
        'AUTH_MAX_FAILED_ATTEMPTS',
        DEFAULT_MAX_FAILED_ATTEMPTS,
      ),
      getOperationalLimit(
        this.txManager,
        'AUTH_LOCKOUT_MINUTES',
        DEFAULT_LOCKOUT_MINUTES,
      ),
    ]);

    const nextAttempts = currentFailedAttempts + 1;
    const shouldLock = nextAttempts >= maxFailedAttempts;

    await this.txManager.runInTransaction(async (queryRunner) => {
      await queryRunner.query(
        `UPDATE core.authentication_credentials
         SET failed_attempts = $2,
             locked_until = CASE WHEN $3 THEN NOW() + ($4 || ' minutes')::INTERVAL ELSE locked_until END
         WHERE user_id = $1`,
        [userId, nextAttempts, shouldLock, lockoutMinutes],
      );
    });

    if (shouldLock) {
      this.logger.warn(
        `Cuenta ${userId} bloqueada por ${lockoutMinutes} minutos tras ${nextAttempts} intentos fallidos`,
      );
    }
  }

  private async resetFailedAttempts(userId: string): Promise<void> {
    await this.txManager.runInTransaction(async (queryRunner) => {
      await queryRunner.query(
        `UPDATE core.authentication_credentials
         SET failed_attempts = 0, locked_until = NULL
         WHERE user_id = $1`,
        [userId],
      );
    });
  }

  /**
   * Crea (o reutiliza, en refresh) una fila en core.security_sessions.
   * La RLS de esa tabla (sessions_self) exige
   * app.current_user_id = user_id de la fila — por eso el contextOverride.
   */
  private async issueTokenPair(
    claims: {
      userId: string;
      personId?: string;
      tenantId?: string;
      canManageConfig?: boolean;
      canManageOperators?: boolean;
      canCloseCases?: boolean;
      canAccessMedical?: boolean;
      canEditClinicalData?: boolean;
      email?: string;
    },
    existingSessionId?: string,
    deviceFingerprint?: string,
  ): Promise<TokenPairDto> {
    const sessionId = existingSessionId ?? randomUUID();

    const payload: JwtPayload = {
      sub: claims.userId,
      personId: claims.personId,
      tenantId: claims.tenantId,
      canManageConfig: claims.canManageConfig,
      canManageOperators: claims.canManageOperators,
      canCloseCases: claims.canCloseCases,
      canAccessMedical: claims.canAccessMedical,
      canEditClinicalData: claims.canEditClinicalData,
      email: claims.email,
      sessionId,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: this.config.get<string>('JWT_ACCESS_TTL'),
    });
    const refreshToken = await this.jwtService.signAsync(payload, {
      expiresIn: this.config.get<string>('JWT_REFRESH_TTL'),
    });

    const sessionTokenHash = this.hashToken(accessToken);
    const refreshTokenHash = this.hashToken(refreshToken);
    const refreshTtlSeconds = this.parseTtlSeconds(
      this.config.get<string>('JWT_REFRESH_TTL')!,
    );

    await this.txManager.runInTransaction(
      async (queryRunner) => {
        if (existingSessionId) {
          await queryRunner.query(
            `UPDATE core.security_sessions
             SET session_token_hash = $2, refresh_token_hash = $3,
                 last_activity_at = NOW(), expires_at = NOW() + ($4 || ' seconds')::INTERVAL
             WHERE id = $1`,
            [
              existingSessionId,
              sessionTokenHash,
              refreshTokenHash,
              refreshTtlSeconds,
            ],
          );
        } else {
          // device_fingerprint (X-Device-Id del celular, ver
          // device_id_service.dart) se guarda acá para poder distinguir
          // "mismo dispositivo reconectando" de "otro dispositivo en
          // paralelo" en el próximo login — ver el chequeo de arriba.
          await queryRunner.query(
            `INSERT INTO core.security_sessions
               (id, user_id, session_token_hash, refresh_token_hash, expires_at, device_fingerprint)
             VALUES ($1, $2, $3, $4, NOW() + ($5 || ' seconds')::INTERVAL, $6)`,
            [
              sessionId,
              claims.userId,
              sessionTokenHash,
              refreshTokenHash,
              refreshTtlSeconds,
              deviceFingerprint ?? null,
            ],
          );
        }
      },
      { userId: claims.userId },
    );

    return { accessToken, refreshToken };
  }

  /** Parseo simple de TTLs tipo "15m"/"7d" a segundos (mismo formato que espera @nestjs/jwt). */
  private parseTtlSeconds(ttl: string): number {
    const match = ttl.match(/^(\d+)([smhd])$/);
    if (!match) {
      return 3600;
    }
    const value = Number(match[1]);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400,
    };
    return value * multipliers[unit];
  }
}
