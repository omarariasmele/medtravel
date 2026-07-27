import { plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
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
}

/** Coerces the raw string env into typed booleans/numbers before validating. */
export function validateEnv(config: Record<string, unknown>) {
  const normalized = {
    ...config,
    PORT: Number(config.PORT ?? 3000),
    DB_PORT: Number(config.DB_PORT ?? 5432),
    DB_SSL: String(config.DB_SSL).toLowerCase() === 'true',
    REDIS_PORT: Number(config.REDIS_PORT ?? 6379),
  };

  const validated = plainToInstance(EnvironmentVariables, normalized, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(`Config inválida:\n${errors.toString()}`);
  }

  return validated;
}
