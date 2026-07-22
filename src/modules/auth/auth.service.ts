import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, createHmac, randomUUID } from 'crypto';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';

import { LoginDto } from './dto/login.dto';
import { TokenPairDto } from './dto/token-pair.dto';
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
 * TODO: MAX_FAILED_ATTEMPTS/LOCKOUT_MINUTES deberían leerse de
 * params.operational_limits (mismo patrón que TOKEN_xxx, CASE_SLA_xxx), no
 * hardcodeados — no hay todavía una clave sembrada para esto en 008_seeds.sql.
 */
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly txManager: TenantTransactionManager,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
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

  async login(dto: LoginDto): Promise<TokenPairDto> {
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

    await this.resetFailedAttempts(credentials.user_id);

    return this.issueTokenPair({
      userId: credentials.user_id,
      personId: credentials.person_id,
    });
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
      { userId: payload.sub, personId: payload.personId },
      session.id,
    );
  }

  private async registerFailedAttempt(
    userId: string,
    currentFailedAttempts: number,
  ): Promise<void> {
    const nextAttempts = currentFailedAttempts + 1;
    const shouldLock = nextAttempts >= MAX_FAILED_ATTEMPTS;

    await this.txManager.runInTransaction(async (queryRunner) => {
      await queryRunner.query(
        `UPDATE core.authentication_credentials
         SET failed_attempts = $2,
             locked_until = CASE WHEN $3 THEN NOW() + ($4 || ' minutes')::INTERVAL ELSE locked_until END
         WHERE user_id = $1`,
        [userId, nextAttempts, shouldLock, LOCKOUT_MINUTES],
      );
    });

    if (shouldLock) {
      this.logger.warn(
        `Cuenta ${userId} bloqueada por ${LOCKOUT_MINUTES} minutos tras ${nextAttempts} intentos fallidos`,
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
    claims: { userId: string; personId?: string },
    existingSessionId?: string,
  ): Promise<TokenPairDto> {
    const sessionId = existingSessionId ?? randomUUID();

    const payload: JwtPayload = {
      sub: claims.userId,
      personId: claims.personId,
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
          await queryRunner.query(
            `INSERT INTO core.security_sessions
               (id, user_id, session_token_hash, refresh_token_hash, expires_at)
             VALUES ($1, $2, $3, $4, NOW() + ($5 || ' seconds')::INTERVAL)`,
            [
              sessionId,
              claims.userId,
              sessionTokenHash,
              refreshTokenHash,
              refreshTtlSeconds,
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
