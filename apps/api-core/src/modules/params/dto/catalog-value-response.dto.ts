export class CatalogValueResponseDto {
  id: string;
  code: string;
  labelEs: string;
  labelEn?: string;
  labelPt?: string;
  labelFr?: string;
  displayOrder: number;
  isDefault: boolean;
  metadata: Record<string, unknown>;
}
