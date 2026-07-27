import { useQuery } from '@tanstack/react-query';

import { apiClient } from './api-client';

export interface CatalogValue {
  id: string;
  code: string;
  labelEs: string;
  labelEn?: string;
  displayOrder: number;
  isDefault: boolean;
  metadata: Record<string, unknown>;
}

export function useCatalog(domainCode: string) {
  return useQuery({
    queryKey: ['catalog', domainCode],
    queryFn: async () => {
      const { data } = await apiClient.get<CatalogValue[]>(
        `/params/catalogs/${domainCode}`,
      );
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function labelFor(values: CatalogValue[] | undefined, id: string | undefined): string {
  if (!values || !id) return '—';
  return values.find((v) => v.id === id)?.labelEs ?? id;
}
