import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Type,
} from '@nestjs/common';

/**
 * Fábrica de guards que chequean un flag de permiso del rol de operador
 * (ej. canManageConfig, canManageOperators — ver jwt-payload.interface.ts
 * / operations.get_operator_login_context()) puesto en request.user por
 * JwtStrategy. Corre después de AuthGuard('jwt').
 *
 * Hace falta para rutas de administración global (catálogos/parámetros
 * del sistema, alta de operadores): a diferencia del resto de la app,
 * params.domain_catalogs/catalog_values NO tienen RLS propia (son
 * compartidos entre tenants a propósito), así que sin este guard
 * cualquier operador autenticado podría editar catálogos globales o dar
 * de alta operadores nuevos.
 */
export function createPermissionGuard(
  permission: 'canManageConfig' | 'canManageOperators' | 'canEditClinicalData',
): Type<CanActivate> {
  @Injectable()
  class PermissionGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
      const request = context.switchToHttp().getRequest();
      if (!request.user?.[permission]) {
        throw new ForbiddenException(
          `Requiere el permiso de operador: ${permission}`,
        );
      }
      return true;
    }
  }
  return PermissionGuard;
}

export const ConfigAccessGuard = createPermissionGuard('canManageConfig');
export const ManageOperatorsGuard = createPermissionGuard('canManageOperators');
/**
 * Pedido explícito del usuario: corregir/borrar (baja lógica) un
 * antecedente clínico del viajero desde la web solo lo puede hacer un
 * operador puntualmente autorizado — no cualquiera con un caso
 * abierto (que hoy ya podría vía clinical.has_clinical_access, nunca
 * se había construido una pantalla que lo usara).
 */
export const ClinicalEditGuard = createPermissionGuard('canEditClinicalData');
