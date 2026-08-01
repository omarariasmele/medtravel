import { plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateIf,
  validateSync,
} from 'class-validator';

class EnvironmentVariables {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV: string;

  @IsNumber()
  PORT: number;

  @IsString()
  @IsNotEmpty()
  DB_HOST: string;

  @IsNumber()
  DB_PORT: number;

  @IsString()
  @IsNotEmpty()
  DB_USERNAME: string;

  @IsString()
  @IsNotEmpty()
  DB_PASSWORD: string;

  @IsString()
  @IsNotEmpty()
  DB_DATABASE: string;

  @IsBoolean()
  DB_SSL: boolean;

  @IsString()
  @IsNotEmpty()
  DB_ENCRYPTION_KEY: string;

  /** Clave HMAC para core.blind_index() — usada para email_blind_index en login. */
  @IsString()
  @IsNotEmpty()
  DB_BLIND_INDEX_KEY: string;

  @IsString()
  @IsNotEmpty()
  REDIS_HOST: string;

  @IsNumber()
  REDIS_PORT: number;

  @IsOptional()
  @IsString()
  REDIS_PASSWORD?: string;

  @IsString()
  @IsNotEmpty()
  JWT_SECRET: string;

  @IsString()
  @IsNotEmpty()
  JWT_ACCESS_TTL: string;

  @IsString()
  @IsNotEmpty()
  JWT_REFRESH_TTL: string;

  @IsString()
  @IsNotEmpty()
  CORS_ORIGIN: string;

  /**
   * Orígenes CORS adicionales, separados por coma — solo para permitir
   * requests (nunca se usan para construir una URL, a diferencia de
   * CORS_ORIGIN). Pensado para dev: probar apps/mobile en Flutter web
   * (un origen propio, ej. http://localhost:8765) sin que ese origen se
   * cuele en los links de /reset-password o /public/shares que arma
   * auth.service.ts/me-emergency.controller.ts/me-shares.controller.ts.
   */
  @IsOptional()
  @IsString()
  CORS_EXTRA_ORIGINS?: string;

  /** Opcional a propósito: sin ella, /me/assistant/ask responde con ayuda estática en vez de IA real. */
  @IsOptional()
  @IsString()
  ANTHROPIC_API_KEY?: string;

  // ── IA (OpenAI) — solo config en este paso, sin endpoints todavía ──
  // Preparación pedida explícitamente por el usuario para el agente de
  // IA completo que se construye en un paso posterior (Flutter +
  // documentos + voz + chat quedan fuera de acá a propósito). La clave
  // real SOLO se pega en apps/api-core/.env (gitignored) — nunca en
  // este archivo, en Flutter, en el portal web, ni en tests.
  @IsOptional()
  @IsIn(['openai'])
  AI_PROVIDER?: string;

  /** Default FALSE: sin esta variable, o en falso, el backend arranca sin necesitar ninguna clave de IA. */
  @IsBoolean()
  AI_ENABLED: boolean;

  /** Solo obligatoria si AI_ENABLED=true — falla rápido en el arranque, no en el primer request. */
  @ValidateIf((o: EnvironmentVariables) => o.AI_ENABLED === true)
  @IsString()
  @IsNotEmpty()
  OPENAI_API_KEY?: string;

  @IsOptional()
  @IsString()
  OPENAI_PRIMARY_MODEL?: string;

  /** Se reintenta con este modelo si la llamada al primario falla (timeout, 5xx, etc). */
  @IsOptional()
  @IsString()
  OPENAI_FALLBACK_MODEL?: string;

  @IsOptional()
  @IsNumber()
  AI_MAX_OUTPUT_TOKENS?: number;

  @IsOptional()
  @IsNumber()
  AI_TIMEOUT_SECONDS?: number;

  /** Tope de mensajes de usuario por día por viajero — protección contra abuso individual. */
  @IsOptional()
  @IsNumber()
  AI_MAX_REQUESTS_PER_USER_DAY?: number;

  /** Tope de gasto estimado (USD) por día, sumado en toda la plataforma — pedido explícito del usuario para alertar anomalías de consumo. */
  @IsOptional()
  @IsNumber()
  AI_DAILY_BUDGET_USD?: number;

  /** Igual al anterior pero mensual. */
  @IsOptional()
  @IsNumber()
  AI_MONTHLY_BUDGET_USD?: number;
}

/** Coerces the raw string env into typed booleans/numbers before validating. */
export function validateEnv(config: Record<string, unknown>) {
  const normalized = {
    ...config,
    PORT: Number(config.PORT ?? 3000),
    DB_PORT: Number(config.DB_PORT ?? 5432),
    DB_SSL: String(config.DB_SSL).toLowerCase() === 'true',
    REDIS_PORT: Number(config.REDIS_PORT ?? 6379),
    // Default FALSE — sin AI_ENABLED en el .env, el backend arranca
    // igual sin pedir ninguna clave de IA (requisito explícito).
    AI_ENABLED: String(config.AI_ENABLED ?? 'false').toLowerCase() === 'true',
    OPENAI_PRIMARY_MODEL: config.OPENAI_PRIMARY_MODEL ?? 'gpt-5.6-luna',
    OPENAI_FALLBACK_MODEL: config.OPENAI_FALLBACK_MODEL ?? 'gpt-5.6-terra',
    AI_MAX_OUTPUT_TOKENS: Number(config.AI_MAX_OUTPUT_TOKENS ?? 500),
    AI_TIMEOUT_SECONDS: Number(config.AI_TIMEOUT_SECONDS ?? 30),
    AI_MAX_REQUESTS_PER_USER_DAY: Number(
      config.AI_MAX_REQUESTS_PER_USER_DAY ?? 10,
    ),
    AI_DAILY_BUDGET_USD: Number(config.AI_DAILY_BUDGET_USD ?? 1),
    AI_MONTHLY_BUDGET_USD: Number(config.AI_MONTHLY_BUDGET_USD ?? 10),
  };

  const validated = plainToInstance(EnvironmentVariables, normalized, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    const details = errors
      .map(
        (e) =>
          `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`,
      )
      .join('\n');
    throw new Error(`Config inválida:\n${details}`);
  }

  return validated;
}
