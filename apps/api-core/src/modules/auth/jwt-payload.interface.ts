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
  /**
   * Permisos del rol de operador (operations.operator_roles), solo
   * presentes si el usuario es un operador. No son GUCs de Postgres (RLS
   * no los lee) — son para que la app decida qué mostrar/permitir sin
   * otra consulta: guards de rutas admin y el menú de admin-web.
   */
  canManageConfig?: boolean;
  canManageOperators?: boolean;
  canCloseCases?: boolean;
  canAccessMedical?: boolean;
  /** Pedido explícito del usuario: solo operadores puntualmente autorizados pueden corregir/borrar antecedentes clínicos del viajero, no cualquiera con acceso al caso. */
  canEditClinicalData?: boolean;
  /** Email en texto plano, solo para mostrar "conectado como X" en la UI — no es un GUC. */
  email?: string;
  /**
   * Fase de acceso restringido del profesional — id de
   * clinical.healthcare_professionals si este user_id tiene una fila
   * ahí (se resuelve en login() sin importar clientApp). No es un GUC
   * (clinical.get_my_encounters() resuelve la identidad del profesional
   * server-side desde app.current_user_id, no confía en este claim para
   * autorizar nada) — solo lo usa professional-scope.middleware.ts para
   * restringir a qué rutas puede llegar esta sesión.
   */
  professionalId?: string;
}
