import { useQuery } from '@tanstack/react-query';

import { apiClient } from './api-client';

export interface CatalogValue {
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

/**
 * `language` es opcional (default 'es') a propósito: el resto de
 * admin-web (pantallas internas del operador) sigue llamando esto sin
 * el parámetro y no cambia de comportamiento. label_pt/label_fr casi
 * no tienen datos cargados todavía (ver catalog_values) — por eso
 * siempre cae de vuelta a labelEs si falta la traducción puntual.
 */
export function labelFor(
  values: CatalogValue[] | undefined,
  id: string | undefined,
  language: string = 'es',
): string {
  if (!values || !id) return '—';
  const value = values.find((v) => v.id === id);
  if (!value) return id;
  if (language === 'en') return value.labelEn ?? value.labelEs;
  if (language === 'pt') return value.labelPt ?? value.labelEs;
  if (language === 'fr') return value.labelFr ?? value.labelEs;
  return value.labelEs;
}

/**
 * Pedido explícito del usuario: alergias/medicamentos/implantes/
 * enfermedades/cirugías se cargan eligiendo de una tabla; si el texto
 * no matchea ninguna opción existente, se crea una entrada nueva
 * (marcada "pendiente de revisión", ver catalogs-admin.page.tsx) en
 * vez de bloquear la carga — mismo backend (CatalogResolutionService)
 * que usa la IA para las mismas 5 tablas.
 */
export async function resolveCatalogValue(
  domainCode: string,
  text: string,
  catalog: CatalogValue[],
): Promise<string | undefined> {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const match = catalog.find((c) => c.labelEs.trim().toLowerCase() === trimmed.toLowerCase());
  if (match) return match.id;
  const { data } = await apiClient.post<{ id: string }>('/params/catalog-values/resolve', {
    domainCode,
    text: trimmed,
  });
  return data.id;
}
