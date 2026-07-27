import { Card, CardContent, Grid, Typography } from '@mui/material';

import { useAuth } from '../auth/auth-context';

export function DashboardPage() {
  const { claims } = useAuth();

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
              <Typography variant="body1">Tenant: {claims?.tenantId ?? 'sin asignar'}</Typography>
              <Typography variant="body2" color="text.secondary">
                Person ID: {claims?.personId ?? '—'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </>
  );
}
