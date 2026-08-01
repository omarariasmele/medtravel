export type AIChatRole = 'user' | 'assistant' | 'system';

export interface AIChatMessage {
  role: AIChatRole;
  content: string;
}

export type AIProposalType = 'MEDICATION' | 'ALLERGY';

/**
 * Datos de la propuesta en el MISMO shape que CreateMedicationDto/
 * CreateAllergyDto (modules/me/dto) — así el paso de confirmación
 * inserta en clinical.medications/allergies sin transformar nada.
 */
export interface AIMedicationProposalData {
  genericName: string;
  brandName?: string;
  isCurrent?: boolean;
  notes?: string;
}

export interface AIAllergyProposalData {
  allergenName: string;
  allergenType: 'MEDICATION' | 'FOOD' | 'ENVIRONMENTAL' | 'OTHER';
  severity: 'MILD' | 'MODERATE' | 'SEVERE' | 'CRITICAL';
  notes?: string;
}

export interface AIProposalCandidate {
  proposalType: AIProposalType;
  confidence: number;
  data: AIMedicationProposalData | AIAllergyProposalData;
}

export interface AIChatResult {
  /** Respuesta conversacional en español para mostrar al viajero. */
  reply: string;
  proposals: AIProposalCandidate[];
  provider: string;
  model: string;
  tokensInput: number;
  tokensOutput: number;
  processingMs: number;
  estimatedCostUsd: number;
}

/**
 * Contrato único que toca OpenAI (u otro proveedor a futuro) — el
 * resto del backend nunca importa el SDK del proveedor directamente
 * (MTA-103 §10: "AI Gateway como único módulo que toca el proveedor").
 */
export interface AIProvider {
  readonly name: string;
  chat(messages: AIChatMessage[]): Promise<AIChatResult>;
}
