import { useQuery } from '@tanstack/react-query';

import { apiClient } from './api-client';

export interface TravelerOverviewRow {
  memberId: string;
  tenantId: string;
  statusId: string;
  personId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  countryResidenceId: string | null;
  preferredLang: string;
  tenantName: string | null;
  policyNumber: string | null;
  validFrom: string | null;
  validUntil: string | null;
  statusAuthority: string | null;
  planName: string | null;
}

interface TravelerOverviewRowSnake {
  member_id: string;
  tenant_id: string;
  status_id: string;
  person_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  country_residence_id: string | null;
  preferred_lang: string;
  tenant_name: string | null;
  policy_number: string | null;
  valid_from: string | null;
  valid_until: string | null;
  status_authority: string | null;
  plan_name: string | null;
}

/**
 * Vista aplanada de viajeros (persona + membresía de asistencia) —
 * fuente única reusada por Usuarios/viajeros, Casos de asistencia (para
 * poder identificar de quién es un caso) y el detalle de caso. Antes
 * cada pantalla resolvía esto por separado (o directamente no lo
 * mostraba), ver identity/travelers-overview.controller.ts.
 */
export function useTravelersOverview() {
  return useQuery({
    queryKey: ['identity', 'travelers-overview'],
    queryFn: async () => {
      const { data } = await apiClient.get<TravelerOverviewRowSnake[]>(
        '/identity/travelers-overview',
      );
      return data.map(
        (r): TravelerOverviewRow => ({
          memberId: r.member_id,
          tenantId: r.tenant_id,
          statusId: r.status_id,
          personId: r.person_id,
          firstName: r.first_name,
          lastName: r.last_name,
          email: r.email,
          countryResidenceId: r.country_residence_id,
          preferredLang: r.preferred_lang,
          tenantName: r.tenant_name,
          policyNumber: r.policy_number,
          validFrom: r.valid_from,
          validUntil: r.valid_until,
          statusAuthority: r.status_authority,
          planName: r.plan_name,
        }),
      );
    },
  });
}
