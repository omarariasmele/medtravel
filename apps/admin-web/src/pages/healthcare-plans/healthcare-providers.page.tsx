import { HealthcareProviderTypePage } from './healthcare-provider-type.page';

export function HealthcareProvidersPage() {
  return (
    <HealthcareProviderTypePage
      typeCode="PRIVATE_INSURANCE"
      title="Prestadores (prepagas)"
      newItemLabel="Nuevo prestador"
    />
  );
}
