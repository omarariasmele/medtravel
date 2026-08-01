import { QueryRunner } from 'typeorm';

export const DEFAULT_SHARE_SCOPE = [
  'critical_allergies',
  'critical_conditions',
  'current_medications',
  'emergency_contacts',
];

interface PatientSummaryRow {
  first_name: string;
  last_name: string;
  birth_date: string | null;
  gender_id: string | null;
  country_residence_id: string | null;
}

interface MembershipRow {
  tenant_name: string | null;
  plan_name: string | null;
  policy_number: string;
  valid_from: string;
  valid_until: string;
  status_authority: string;
}

export interface SharedProfileView {
  person: {
    firstName: string;
    lastName: string;
    birthDate: string | null;
    genderId: string | null;
    countryResidenceId: string | null;
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
    reactionType: string | null;
  }>;
  conditions: Array<{
    conditionName: string;
    icd10Code: string | null;
    travelRestrictions: string | null;
  }>;
  medications: Array<{
    genericName: string;
    brandName: string | null;
    doseAmount: string | null;
  }>;
  emergencyContacts: Array<{
    firstName: string;
    lastName: string;
    phone: string | null;
    relationship: string | null;
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
                sv.code AS severity, rt.code AS "reactionType"
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
        `SELECT core.decrypt_pii(condition_name) AS "conditionName", icd10_code AS "icd10Code",
                core.decrypt_pii(travel_restrictions) AS "travelRestrictions"
         FROM clinical.conditions
         WHERE person_id = $1 AND active = TRUE
           AND show_on_emergency = TRUE AND deleted_at IS NULL`,
        [personId],
      )
    : [];

  const medications = scope.includes('current_medications')
    ? await queryRunner.query(
        `SELECT core.decrypt_pii(generic_name) AS "genericName",
                core.decrypt_pii(brand_name) AS "brandName",
                dose_amount AS "doseAmount"
         FROM clinical.medications
         WHERE person_id = $1 AND active = TRUE
           AND is_current = TRUE AND deleted_at IS NULL`,
        [personId],
      )
    : [];

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
        }
      : null,
    membership,
    allergies,
    conditions,
    medications,
    emergencyContacts,
  };
}
