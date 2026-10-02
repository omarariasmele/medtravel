import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';

/**
 * Pedido explícito del usuario: el portal del profesional — solo ve
 * centros médicos (lectura) y las atenciones que él mismo realizó,
 * mientras el link que usó para entrar siga vigente. Nada de esto
 * necesita un guard de permiso extra: clinical.get_my_encounters()
 * (SECURITY DEFINER) ya resuelve la identidad del profesional desde
 * app.current_user_id — un token de viajero/operador sin fila en
 * clinical.healthcare_professionals simplemente recibe una lista
 * vacía, nunca datos ajenos. professional-scope.middleware.ts (global)
 * es la restricción real: una sesión de profesional no puede llegar a
 * ningún otro endpoint del sistema, este incluido si quisiera escribir
 * algo (no hay ningún POST/PATCH acá, a propósito — de solo lectura).
 */
@ApiTags('professional')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('professional/me')
export class ProfessionalPortalController {
  constructor(private readonly txManager: TenantTransactionManager) {}

  @Get('encounters')
  async myEncounters() {
    // Alias entre comillas dobles: queryRunner.query() (SQL crudo) no
    // camelCasea nada solo — ver el mismo bug/comentario en
    // MeClinicalController.listEncounters.
    return this.txManager.runInTransaction((queryRunner) =>
      queryRunner.query(
        `SELECT encounter_id AS "encounterId", encounter_date AS "encounterDate",
                submission_id AS "submissionId", clinical_data AS "clinicalData",
                confirmation_code AS "confirmationCode", certification_code AS "certificationCode",
                professional_view_expires_at AS "professionalViewExpiresAt",
                person_id AS "personId", person_first_name AS "personFirstName", person_last_name AS "personLastName"
         FROM clinical.get_my_encounters()`,
      ),
    );
  }

  @Get('medical-centers')
  async medicalCenters() {
    return this.txManager.runInTransaction((queryRunner) =>
      queryRunner.query(
        `SELECT id, name, organization_type_id AS "organizationTypeId", country_id AS "countryId",
                state_province AS "stateProvince", city, address, phone, website
         FROM clinical.healthcare_organizations
         WHERE is_active = TRUE
         ORDER BY name`,
      ),
    );
  }
}
