import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

/**
 * Pedido explícito del usuario: una TERCERA forma de cargar la Ficha de
 * Salud, además del Clásico (charla libre) y el Estructurado (pregunta
 * por pregunta) — un formulario de texto de una sola pantalla, con
 * asistencia de IA para validar lo que se escribió antes de guardar.
 * A diferencia de los otros dos modelos, acá el viajero completa TODO
 * de una y recién al final se valida/guarda — nunca turno por turno.
 */
export class HealthFormBasicDto {
  @IsOptional()
  @IsString()
  birthDateRaw?: string;

  @IsOptional()
  @IsIn(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'])
  sexCode?: string;

  @IsOptional()
  @IsNumber()
  weightKg?: number;

  @IsOptional()
  @IsNumber()
  heightCm?: number;

  @IsOptional()
  @IsString()
  bloodTypeCode?: string;
}

export class HealthFormConditionDto {
  /**
   * Pedido explícito del usuario: "nada debería ser fijo" — este id
   * viene de ai.interview_questions (GET .../interview-questions), la
   * misma tabla que gobierna al modelo Estructurado. Queda en
   * source_question_id (igual que el resto de los modelos) para que el
   * dedup de "ya contestado" funcione igual acá.
   */
  @IsOptional()
  @IsString()
  questionId?: string;

  /** Texto de la pregunta tal como se le mostró al viajero — se usa para inferir si es crónica. */
  @IsString()
  label: string;

  @IsOptional()
  @IsString()
  dateRaw?: string;

  @IsOptional()
  @IsString()
  detail?: string;
}

export class HealthFormAllergyDto {
  @IsString()
  name: string;

  @IsIn(['MEDICATION', 'FOOD', 'ENVIRONMENTAL', 'OTHER'])
  allergenType: string;

  @IsIn(['MILD', 'MODERATE', 'SEVERE', 'CRITICAL'])
  severity: string;
}

export class HealthFormMedicationDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  dose?: string;

  @IsOptional()
  @IsString()
  sinceRaw?: string;
}

export class HealthFormSurgeryDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  dateRaw?: string;
}

export class HealthFormImplantDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  dateRaw?: string;
}

export class HealthFormSubmitDto {
  @ValidateNested()
  @Type(() => HealthFormBasicDto)
  basic: HealthFormBasicDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HealthFormConditionDto)
  conditions: HealthFormConditionDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HealthFormAllergyDto)
  allergies: HealthFormAllergyDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HealthFormMedicationDto)
  medications: HealthFormMedicationDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HealthFormSurgeryDto)
  surgeries: HealthFormSurgeryDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HealthFormImplantDto)
  implants: HealthFormImplantDto[];
}

/**
 * Pedido explícito del usuario: corregir el tipo/fecha de una condición
 * YA cargada (ej. cambiar de Diabetes Tipo 1 a Tipo 2) tiene que ser
 * simple — cambiar el desplegable y guardar, no destildar/re-tildar.
 * Ver AIService.updateConditionAnswer.
 */
export class UpdateConditionAnswerDto {
  @IsString()
  conditionName: string;

  @IsOptional()
  @IsString()
  dateRaw?: string;
}
