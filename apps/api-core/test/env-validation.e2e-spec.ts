// class-validator/class-transformer necesitan el polyfill de metadata de
// decoradores — en la app real lo carga la cadena de bootstrap de Nest
// (main.ts), pero este test importa validateEnv() aislado, sin bootstrap.
import 'reflect-metadata';

import { validateEnv } from '@config/env.validation';

/**
 * Prueba básica de la validación de config para OpenAI (AI_ENABLED/
 * OPENAI_API_KEY/etc, ver env.validation.ts) — validateEnv() es una
 * función pura (sin DB ni bootstrap de Nest), así que no necesita un
 * jest.config.js nuevo: reutiliza el mismo runner que el resto de los
 * *.e2e-spec.ts (test/jest-e2e.json).
 */
const REQUIRED_BASE_ENV = {
  NODE_ENV: 'test',
  PORT: '3000',
  DB_HOST: 'localhost',
  DB_PORT: '5432',
  DB_USERNAME: 'user',
  DB_PASSWORD: 'pass',
  DB_DATABASE: 'db',
  DB_SSL: 'false',
  DB_ENCRYPTION_KEY: 'key',
  DB_BLIND_INDEX_KEY: 'key',
  REDIS_HOST: 'localhost',
  REDIS_PORT: '6379',
  JWT_SECRET: 'secret',
  JWT_ACCESS_TTL: '15m',
  JWT_REFRESH_TTL: '7d',
  CORS_ORIGIN: 'http://localhost:5173',
};

describe('validateEnv — configuración de IA (OpenAI)', () => {
  it('arranca sin OPENAI_API_KEY cuando AI_ENABLED=false', () => {
    expect(() =>
      validateEnv({ ...REQUIRED_BASE_ENV, AI_ENABLED: 'false' }),
    ).not.toThrow();
  });

  it('arranca sin OPENAI_API_KEY cuando AI_ENABLED no está definida (default false)', () => {
    expect(() => validateEnv({ ...REQUIRED_BASE_ENV })).not.toThrow();
  });

  it('falla si AI_ENABLED=true y no hay OPENAI_API_KEY', () => {
    expect(() =>
      validateEnv({ ...REQUIRED_BASE_ENV, AI_ENABLED: 'true' }),
    ).toThrow(/OPENAI_API_KEY/);
  });

  it('arranca con AI_ENABLED=true si OPENAI_API_KEY está presente', () => {
    expect(() =>
      validateEnv({
        ...REQUIRED_BASE_ENV,
        AI_ENABLED: 'true',
        OPENAI_API_KEY: 'sk-test-key-not-real',
      }),
    ).not.toThrow();
  });

  it('aplica los defaults de modelo/tokens/timeout cuando no se especifican', () => {
    const result = validateEnv({ ...REQUIRED_BASE_ENV });
    expect(result.OPENAI_PRIMARY_MODEL).toBe('gpt-5.6-luna');
    expect(result.AI_MAX_OUTPUT_TOKENS).toBe(500);
    expect(result.AI_TIMEOUT_SECONDS).toBe(30);
    expect(result.AI_ENABLED).toBe(false);
  });
});
