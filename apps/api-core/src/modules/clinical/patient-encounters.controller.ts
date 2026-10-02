import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';

/**
 * Pedido explícito del usuario: "las notas [que deja un médico] se
 * deben poder visualizar... tanto en el resumen del caso como en el
 * historial de salud... en los dos lados" — esto es el lado admin-web
 * de MeClinicalController.listEncounters (misma consulta, mismo JOIN a
 * healthcare_professionals/encounter_submissions), pero para un
 * `personId` elegido por el operador en vez de "me". No hace falta
 * ningún chequeo de acceso a mano acá — mismo criterio que
 * PatientSummaryController/SharePreviewController: clinical.
 * has_clinical_access(person_id) ya gatea encounters_access/
 * submissions_access (RLS), y pg-session-context.interceptor.ts ya
 * setea app.active_case_id desde el header x-active-case-id en TODOS
 * los requests — si el operador no tiene acceso legítimo, el SELECT
 * simplemente no devuelve filas.
 */
@ApiTags('clinical/patient-encounters')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('clinical/patient-encounters')
export class PatientEncountersController {
  constructor(private readonly txManager: TenantTransactionManager) {}

  @Get(':personId')
  async list(@Param('personId') personId: string) {
    return this.txManager.runInTransaction((queryRunner) =>
      queryRunner.query(
        // Bug real reportado en vivo: "Profesional sin identificar" +
        // sin fecha — ver el mismo comentario en
        // MeClinicalController.listEncounters (alias sin comillas =
        // snake_case en la respuesta, admin-web esperaba camelCase).
        `SELECT e.id, e.encounter_date AS "encounterDate", e.encounter_type_id AS "encounterTypeId",
                e.chief_complaint AS "chiefComplaint", e.notes,
                es.id AS "submissionId", es.clinical_data AS "clinicalData",
                es.member_reviewed_at AS "memberReviewedAt", es.platform_reviewed_at AS "platformReviewedAt",
                cert_cv.code AS "certificationCode", conf_cv.code AS "confirmationCode",
                hp.first_name AS "professionalFirstName", hp.last_name AS "professionalLastName",
                hp.institution AS "professionalInstitution", hp.specialty_id AS "professionalSpecialtyId",
                hp.license_number AS "professionalLicenseNumber",
                core.decrypt_pii(hp.doc_number) AS "professionalDocNumber",
                hp.doc_type_id AS "professionalDocTypeId",
                hp.country_id AS "professionalCountryId",
                hp.is_active AS "professionalIsActive"
         FROM clinical.encounters e
         LEFT JOIN clinical.encounter_submissions es
           ON es.encounter_id = e.id AND es.deleted_at IS NULL
         LEFT JOIN clinical.healthcare_professionals hp ON hp.id = e.professional_id
         LEFT JOIN params.catalog_values cert_cv ON cert_cv.id = es.certification_status_id
         LEFT JOIN params.catalog_values conf_cv ON conf_cv.id = es.confirmation_status_id
         WHERE e.person_id = $1
         ORDER BY e.encounter_date DESC, e.created_at DESC`,
        [personId],
      ),
    );
  }
}
