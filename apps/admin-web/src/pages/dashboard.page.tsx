import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, Grid, Typography } from '@mui/material';

import { useAuth } from '../auth/auth-context';
import { apiClient } from '../lib/api-client';

interface Tenant {
  id: string;
  name: string;
}

interface Person {
  id: string;
  firstName: string;
  lastName: string;
}

export function DashboardPage() {
  const { claims } = useAuth();

  const tenantQuery = useQuery({
    queryKey: ['identity', 'tenants', claims?.tenantId],
    queryFn: async () => {
      const { data } = await apiClient.get<Tenant>(
        `/identity/tenants/${claims!.tenantId}`,
      );
      return data;
    },
    enabled: !!claims?.tenantId,
  });

  const personQuery = useQuery({
    queryKey: ['identity', 'persons', claims?.personId],
    queryFn: async () => {
      const { data } = await apiClient.get<Person>(
        `/identity/persons/${claims!.personId}`,
      );
      return data;
    },
    enabled: !!claims?.personId,
  });

  return (
    <>
      <Typography variant="h4" gutterBottom>
        Dashboard operativo
      </Typography>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <Card>
            <CardContent>
              <Typography variant="overline" color="text.secondary">
                Sesión
              </Typography>
              <Typography variant="body1">
                Tenant: {tenantQuery.data?.name ?? (claims?.tenantId ? '—' : 'sin asignar')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Operador: {personQuery.data
                  ? `${personQuery.data.firstName} ${personQuery.data.lastName}`
                  : '—'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </>
  );
}
