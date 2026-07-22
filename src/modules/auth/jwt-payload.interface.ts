/**
 * Claims del access token. Mapean 1:1 a los campos que
 * PgSessionContextInterceptor usa para poblar las GUCs de sesión de
 * Postgres (ver src/common/request-context/request-context.types.ts).
 */
export interface JwtPayload {
  /** user_id (core.users.id) — subject estándar de JWT. */
  sub: string;
  tenantId?: string;
  personId?: string;
  sessionId?: string;
  emergencyTokenActive?: boolean;
  emergencyTokenPersonId?: string;
}
