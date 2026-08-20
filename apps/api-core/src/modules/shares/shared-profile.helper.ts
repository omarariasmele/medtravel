import { QueryRunner } from 'typeorm';

export const DEFAULT_SHARE_SCOPE = [
  'critical_allergies',
  'critical_conditions',
  'current_medications',
  'surgical_history',
  'implants_devices',
  'emergency_contacts',
];

interface PatientSummaryRow {
  first_name: string;
  last_name: string;
  birth_date: string | null;
  gender_id: string | null;
  country_residence_id: string | null;
  photo_path: string | null;
}

interface MembershipRow {
  tenant_name: string | null;
  plan_name: string | null;
  policy_number: string;
  valid_from: string;
  valid_until: string;
  status_authority: string;
}

interface VitalsRow {
  weight_kg: string | null;
  height_cm: string | null;
  bmi: string | null;
  blood_type_id: string | null;
}

export interface SharedProfileView {
  person: {
    firstName: string;
    lastName: string;
    birthDate: string | null;
    genderId: string | null;
    countryResidenceId: string | null;
    photoPath: string | null;
  } | null;
  membership: Array<{
    tenantName: string | null;
    planName: string | null;
    policyNumber: string;
    validFrom: string;
    validUntil: string;
    statusAuthority: string;
  }>;
  allergies: Array<{
    allergenName: string;
    severity: string | null;
    severityId: string | null;
    reactionType: string | null;
  }>;
  conditions: Array<{
    conditionName: string;
    icd10Code: string | null;
    travelRestrictions: string | null;
    diagnosedAt: string | null;
    statusCode: string | null;
  }>;
  medications: Array<{
    genericName: string;
    brandName: string | null;
    doseAmount: string | null;
    startedAt: string | null;
  }>;
  surgeries: Array<{
    procedureName: string;
    performedAt: string;
    indication: string | null;
  }>;
  implants: Array<{
    deviceName: string;
    implantedAt: string | null;
    notes: string | null;
  }>;
  vitals: {
    weightKg: string | null;
    heightCm: string | null;
    bmi: string | null;
    bloodTypeId: string | null;
  } | null;
  emergencyContacts: Array<{
    firstName: string;
    lastName: string;
    phone: string | null;
    relationship: string | null;
    relationshipId: string | null;
  }>;
}

/**
 * Arma la vista acotada de historia clínica que ve un médico — usada por
 * DOS entradas distintas (PublicSharesController, gateado por un token
 * de emergencia válido; SharePreviewController, gateado por acceso
 * clínico real vía has_clinical_access) para que sea "exactamente la
 * misma vista" en ambos casos, mismo código de presentación. Las tablas
 * clinical.allergies/conditions/medications ya tienen RLS basada en
 * clinical.has_clinical_access — este helper no la bypassea, confía en
 * que el caller ya dejó la sesión en un estado donde esa función
 * devuelve TRUE para personId (vía las GUCs de token de emergencia, o
 * vía un caso/consentimiento real).
 */
export async function buildSharedProfile(
  queryRunner: QueryRunner,
  personId: string,
  scope: string[],
): Promise<SharedProfileView> {
  const [summary]: PatientSummaryRow[] = await queryRunner.query(
    `SELECT * FROM clinical.get_patient_summary($1)`,
    [personId],
  );

  /**
   * Membresía del servicio de asistencia al viajero (empresa, plan, N°
   * de póliza, vigencia) — pedido explícito del usuario: el médico
   * necesita saber esto ANTES de los antecedentes médicos, no solo ver
   * alergias/condiciones sueltas. Siempre se incluye (no depende del
   * scope del token, a diferencia de los datos clínicos).
   */
  const membershipRows: MembershipRow[] = await queryRunner.query(
    `SELECT * FROM emergency.get_shared_membership($1)`,
    [personId],
  );
  const membership = membershipRows.map((m) => ({
    tenantName: m.tenant_name,
    planName: m.plan_name,
    policyNumber: m.policy_number,
    validFrom: m.valid_from,
    validUntil: m.valid_until,
    statusAuthority: m.status_authority,
  }));

  const allergies = scope.includes('critical_allergies')
    ? await queryRunner.query(
        `SELECT core.decrypt_pii(a.allergen_name) AS "allergenName",
                sv.code AS severity, sv.id AS "severityId", rt.code AS "reactionType"
         FROM clinical.allergies a
         LEFT JOIN params.catalog_values sv ON sv.id = a.severity_id
         LEFT JOIN params.catalog_values rt ON rt.id = a.reaction_type_id
         WHERE a.person_id = $1 AND a.active = TRUE
           AND a.show_on_emergency = TRUE AND a.deleted_at IS NULL`,
        [personId],
      )
    : [];

  const conditions = scope.includes('critical_conditions')
    ? await queryRunner.query(
        `SELECT core.decrypt_pii(c.condition_name) AS "conditionName", c.icd10_code AS "icd10Code",
                core.decrypt_pii(c.travel_restrictions) AS "travelRestrictions",
                c.diagnosed_at AS "diagnosedAt",
                cs.code AS "statusCode"
         FROM clinical.conditions c
         LEFT JOIN params.catalog_values cs ON cs.id = c.status_id
         WHERE c.person_id = $1 AND c.active = TRUE
           AND c.show_on_emergency = TRUE AND c.deleted_at IS NULL
         ORDER BY c.diagnosed_at DESC NULLS LAST`,
        [personId],
      )
    : [];

  const medications = scope.includes('current_medications')
    ? await queryRunner.query(
        `SELECT core.decrypt_pii(generic_name) AS "genericName",
                core.decrypt_pii(brand_name) AS "brandName",
                dose_amount AS "doseAmount",
                started_at AS "startedAt"
         FROM clinical.medications
         WHERE person_id = $1 AND active = TRUE
           AND is_current = TRUE AND deleted_at IS NULL
         ORDER BY started_at DESC NULLS LAST`,
        [personId],
      )
    : [];

  /** gap #46/documento del usuario: faltaba en la ficha que ve el médico. */
  const surgeries = scope.includes('surgical_history')
    ? await queryRunner.query(
        `SELECT core.decrypt_pii(procedure_name) AS "procedureName",
                performed_at AS "performedAt",
                core.decrypt_pii(indication) AS "indication"
         FROM clinical.surgeries
         WHERE person_id = $1
           AND show_on_emergency = TRUE AND deleted_at IS NULL
         ORDER BY performed_at DESC`,
        [personId],
      )
    : [];

  /** Historial de Salud (pedido del usuario): implantes/dispositivos (marcapasos, prótesis, etc.), antes invisibles para el médico. */
  const implants = scope.includes('implants_devices')
    ? await queryRunner.query(
        `SELECT core.decrypt_pii(device_name) AS "deviceName",
                implanted_at AS "implantedAt",
                core.decrypt_pii(notes) AS "notes"
         FROM clinical.implants_devices
         WHERE person_id = $1 AND active = TRUE AND deleted_at IS NULL
         ORDER BY implanted_at DESC NULLS LAST`,
        [personId],
      )
    : [];

  /**
   * Pedido explícito del usuario: grupo sanguíneo (y peso/altura/IMC)
   * son de importancia en una atención de urgencia — tienen que
   * aparecer arriba en la vista del médico, cosa que hoy no pasaba en
   * absoluto (buildSharedProfile no traía nada de vitals_history).
   * Siempre se incluye, no depende del scope del token (mismo criterio
   * que membership) — es información de seguridad, no un antecedente
   * clínico sensible. clinical.vitals_history es append-only (una fila
   * nueva por carga, no siempre con todos los campos), así que se toma
   * el valor no-nulo más reciente POR CAMPO, no la fila más reciente
   * entera — mismo criterio que PatientSummaryCard en admin-web.
   */
  const vitalsRows: VitalsRow[] = await queryRunner.query(
    `SELECT weight_kg, height_cm, bmi, blood_type_id
     FROM clinical.vitals_history
     WHERE person_id = $1 AND deleted_at IS NULL
     ORDER BY measured_at DESC`,
    [personId],
  );
  const vitals = vitalsRows.length
    ? {
        weightKg: vitalsRows.find((v) => v.weight_kg != null)?.weight_kg ?? null,
        heightCm: vitalsRows.find((v) => v.height_cm != null)?.height_cm ?? null,
        bmi: vitalsRows.find((v) => v.bmi != null)?.bmi ?? null,
        bloodTypeId: vitalsRows.find((v) => v.blood_type_id != null)?.blood_type_id ?? null,
      }
    : null;

  const emergencyContacts = scope.includes('emergency_contacts')
    ? (
        await queryRunner.query(
          `SELECT * FROM emergency.get_shared_contacts($1)`,
          [personId],
        )
      ).map((row: Record<string, unknown>) => ({
        firstName: row.first_name,
        lastName: row.last_name,
        phone: row.phone,
        relationship: row.relationship_code,
        relationshipId: row.relationship_type_id,
      }))
    : [];

  return {
    person: summary
      ? {
          firstName: summary.first_name,
          lastName: summary.last_name,
          birthDate: summary.birth_date,
          genderId: summary.gender_id,
          countryResidenceId: summary.country_residence_id,
          photoPath: summary.photo_path,
        }
      : null,
    membership,
    allergies,
    conditions,
    medications,
    surgeries,
    implants,
    vitals,
    emergencyContacts,
  };
}
