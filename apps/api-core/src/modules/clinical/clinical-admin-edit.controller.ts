import { createResourceController } from '@common/database/create-resource-controller';
import { ClinicalEditGuard } from '@common/auth/config-access.guard';

import { CLINICAL_REGISTRY } from './clinical.registry';

/**
 * Pedido explícito del usuario: permitir corregir/borrar (baja lógica,
 * ver deletedAt) un antecedente clínico mal cargado por el viajero
 * desde la web — pero solo para un operador puntualmente autorizado
 * (ClinicalEditGuard/canEditClinicalData), no cualquiera con un caso
 * abierto. Montado en un prefijo SEPARADO de ClinicalResourceController
 * (que usa la app móvil para que el viajero edite lo suyo, sin este
 * guard — el viajero nunca tiene canEditClinicalData, es un claim de
 * operador) apuntando al MISMO registro/tablas: mismo dato, dos
 * caminos de acceso con gates distintos.
 *
 * Solo se exponen los 5 antecedentes editables desde la ficha médica
 * del panel (no todo CLINICAL_REGISTRY: documentos, profesionales,
 * encounters, etc. tienen sus propias pantallas y no son parte de
 * este pedido).
 */
const CLINICAL_ADMIN_EDIT_REGISTRY = {
  allergies: CLINICAL_REGISTRY.allergies,
  conditions: CLINICAL_REGISTRY.conditions,
  medications: CLINICAL_REGISTRY.medications,
  surgeries: CLINICAL_REGISTRY.surgeries,
  'implants-devices': CLINICAL_REGISTRY['implants-devices'],
};

export const ClinicalAdminEditController = createResourceController(
  'clinical/admin-edit',
  CLINICAL_ADMIN_EDIT_REGISTRY,
  [ClinicalEditGuard],
);
