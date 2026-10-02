import { IsOptional, IsString, MinLength } from 'class-validator';

export class SubmitShareNoteDto {
  @IsString()
  @MinLength(2)
  accessorName: string;

  @IsOptional()
  @IsString()
  accessorEmail?: string;

  @IsOptional()
  @IsString()
  accessorSpecialty?: string;

  @IsOptional()
  @IsString()
  accessorInstitution?: string;

  @IsOptional()
  @IsString()
  recommendations?: string;

  @IsOptional()
  @IsString()
  treatment?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  /**
   * Pedido explícito del usuario: si el médico detecta una enfermedad
   * o prescribe una medicación, tiene que poder cargarla como tal —
   * queda como clinical.conditions/medications reales (no solo texto
   * suelto), pendiente de confirmación igual que el resto de la nota
   * (ver emergency.claim_share_note). Todo opcional: una nota puede
   * seguir siendo solo texto libre.
   */
  @IsOptional()
  @IsString()
  diagnosedConditionName?: string;

  @IsOptional()
  @IsString()
  diagnosedConditionIcd10?: string;

  @IsOptional()
  @IsString()
  prescribedMedicationName?: string;

  @IsOptional()
  @IsString()
  prescribedMedicationDose?: string;

  @IsOptional()
  @IsString()
  prescribedMedicationFrequency?: string;
}
