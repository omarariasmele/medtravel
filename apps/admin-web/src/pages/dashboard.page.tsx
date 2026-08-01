import { useQuery } from '@tanstack/react-query';
import { Alert, Box, Card, CardContent, CircularProgress, Grid, Typography } from '@mui/material';
import FlightIcon from '@mui/icons-material/Flight';
import PeopleIcon from '@mui/icons-material/People';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';

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

interface DashboardStats {
  tenantId: string;
  tenantName: string;
  isPlatformTenant: boolean;
  travelerCount: number;
  tripCount: number;
  openCaseCount: number;
}

function StatsCard({ s }: { s: DashboardStats }) {
  return (
    <Card>
      <CardContent>
        <Typography variant="subtitle1" gutterBottom>
          {s.tenantName}
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <PeopleIcon fontSize="small" color="action" />
            <Typography variant="body2" color="text.secondary">Viajeros activos</Typography>
          </Box>
          <Typography variant="body1" sx={{ fontWeight: 'bold' }}>{s.travelerCount}</Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <FlightIcon fontSize="small" color="action" />
            <Typography variant="body2" color="text.secondary">Viajes</Typography>
          </Box>
          <Typography variant="body1" sx={{ fontWeight: 'bold' }}>{s.tripCount}</Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <LocalHospitalIcon fontSize="small" color={s.openCaseCount > 0 ? 'error' : 'action'} />
            <Typography variant="body2" color="text.secondary">Casos abiertos</Typography>
          </Box>
          <Typography
            variant="body1"
            color={s.openCaseCount > 0 ? 'error.main' : 'text.primary'}
            sx={{ fontWeight: 'bold' }}
          >
            {s.openCaseCount}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
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

  const statsQuery = useQuery({
    queryKey: ['operations', 'dashboard-stats'],
    queryFn: async () => {
      const { data } = await apiClient.get<DashboardStats[]>('/operations/dashboard-stats');
      return data;
    },
  });

  const platformStats = (statsQuery.data ?? []).filter((s) => s.isPlatformTenant);
  const companyStats = (statsQuery.data ?? []).filter((s) => !s.isPlatformTenant);

  return (
    <>
      <Typography variant="h4" gutterBottom>
        Dashboard operativo
      </Typography>
      <Grid container spacing={2} sx={{ mb: 3 }}>
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

      {statsQuery.isLoading && <CircularProgress size={24} />}
      {statsQuery.isError && (
        <Alert severity="error">No se pudieron cargar los indicadores.</Alert>
      )}
      {statsQuery.data && statsQuery.data.length === 0 && (
        <Alert severity="info">Sin empresas para mostrar.</Alert>
      )}

      {platformStats.length > 0 && (
        <>
          <Typography variant="h6" gutterBottom>
            Plataforma
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            OYSGROUP administra el sistema — no es una empresa de asistencia al
            viajero, por eso se muestra separada del resto.
          </Typography>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {platformStats.map((s) => (
              <Grid key={s.tenantId} size={{ xs: 12, sm: 6, md: 4 }}>
                <StatsCard s={s} />
              </Grid>
            ))}
          </Grid>
        </>
      )}

      {(companyStats.length > 0 || !claims?.canManageConfig) && (
        <>
          <Typography variant="h6" gutterBottom>
            {claims?.canManageConfig ? 'Empresas de asistencia al viajero' : 'Mi empresa'}
          </Typography>
          <Grid container spacing={2}>
            {companyStats.map((s) => (
              <Grid key={s.tenantId} size={{ xs: 12, sm: 6, md: 4 }}>
                <StatsCard s={s} />
              </Grid>
            ))}
          </Grid>
        </>
      )}
    </>
  );
}
