export class CatalogValueResponseDto {
  id: string;
  code: string;
  labelEs: string;
  labelEn?: string;
  displayOrder: number;
  isDefault: boolean;
  metadata: Record<string, unknown>;
}
