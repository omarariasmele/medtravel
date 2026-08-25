import {
  Controller,
  Get,
  NotFoundException,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';

interface PatientSummaryRow {
  first_name: string;
  last_name: string;
  birth_date: string | null;
  gender_id: string | null;
  country_residence_id: string | null;
  photo_path: string | null;
  health_record_last_updated_at: string | null;
  blood_type_id: string | null;
}

export interface PatientSummaryView {
  firstName: string;
  lastName: string;
  birthDate: string | null;
  genderId: string | null;
  countryResidenceId: string | null;
  photoPath: string | null;
  /** Pedido explícito del usuario: mostrar cuándo fue la última actualización del Historial de Salud. */
  healthRecordLastUpdatedAt: string | null;
  /** Pedido explícito del usuario: "Grupo Sanguíneo... siempre es el mismo" — valor fijo de la persona, no un signo vital repetible (ver core.persons.blood_type_id). */
  bloodTypeId: string | null;
}

/**
 * Datos demográficos básicos del viajero (nombre, fecha de nacimiento,
 * sexo, país de residencia) para la sección "Historia clínica" dentro
 * de un caso — core.persons es self-access-only (no se expone un
 * findById() genérico, ver 003_core_identity.sql), así que esto pasa
 * por clinical.get_patient_summary() (SECURITY DEFINER), que reutiliza
 * el mismo clinical.has_clinical_access() que ya protege alergias/
 * condiciones/medicamentos/vitals — mismo modelo de acceso, no uno
 * nuevo. Requiere el header x-active-case-id (o alguno de los otros
 * caminos de has_clinical_access) para devolver datos.
 */
@ApiTags('clinical/patient-summary')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('clinical/patient-summary')
export class PatientSummaryController {
  constructor(private readonly txManager: TenantTransactionManager) {}

  @Get(':personId')
  async get(@Param('personId') personId: string): Promise<PatientSummaryView> {
    const row = await this.txManager.runInTransaction(async (queryRunner) => {
      const rows: PatientSummaryRow[] = await queryRunner.query(
        `SELECT * FROM clinical.get_patient_summary($1)`,
        [personId],
      );
      return rows[0];
    });

    if (!row) {
      throw new NotFoundException(
        'No encontrado o sin acceso clínico habilitado',
      );
    }

    return {
      firstName: row.first_name,
      lastName: row.last_name,
      birthDate: row.birth_date,
      genderId: row.gender_id,
      countryResidenceId: row.country_residence_id,
      photoPath: row.photo_path,
      healthRecordLastUpdatedAt: row.health_record_last_updated_at,
      bloodTypeId: row.blood_type_id,
    };
  }
}
