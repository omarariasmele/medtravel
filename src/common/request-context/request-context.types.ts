/**
 * Espejo de las GUCs de sesión que leen las políticas RLS y las funciones
 * SECURITY DEFINER del schema (ver 000_extensions.sql / 001_audit.sql):
 * app.current_user_id, app.current_tenant_id, app.current_person_id,
 * app.session_id, app.client_ip, app.access_purpose,
 * app.authorization_context, app.active_case_id,
 * app.emergency_token_active, app.emergency_token_person_id.
 *
 * Si un campo queda undefined, el GUC correspondiente no se setea y
 * current_setting(...) del lado de Postgres devuelve NULL — el mismo
 * comportamiento fail-secure que ya asume el schema (ver C7/C9 del changelog).
 */
export interface RequestContextData {
  userId?: string;
  tenantId?: string;
  personId?: string;
  sessionId?: string;
  clientIp?: string;
  accessPurpose?: string;
  authorizationContext?: string;
  activeCaseId?: string;
  emergencyTokenActive?: boolean;
  emergencyTokenPersonId?: string;
}

/** Mapeo campo → GUC de Postgres, usado por TenantTransactionManager. */
export const REQUEST_CONTEXT_GUC_MAP: Record<keyof RequestContextData, string> =
  {
    userId: 'app.current_user_id',
    tenantId: 'app.current_tenant_id',
    personId: 'app.current_person_id',
    sessionId: 'app.session_id',
    clientIp: 'app.client_ip',
    accessPurpose: 'app.access_purpose',
    authorizationContext: 'app.authorization_context',
    activeCaseId: 'app.active_case_id',
    emergencyTokenActive: 'app.emergency_token_active',
    emergencyTokenPersonId: 'app.emergency_token_person_id',
  };
