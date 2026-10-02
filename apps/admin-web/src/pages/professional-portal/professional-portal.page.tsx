import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  List,
  ListItem,
  ListItemText,
  Paper,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';

import { publicApiClient } from '../../lib/public-api-client';

// Sesión aparte de la del panel (sessionStorage, no localStorage): un
// médico entra desde el link/QR de un paciente, no desde /login del
// panel, y no debería quedar logueado "para siempre" en un equipo que
// puede no ser suyo.
const TOKEN_KEY = 'medtravel_professional_token';

interface MyEncounter {
  encounterId: string;
  encounterDate: string;
  submissionId: string | null;
  clinicalData: { recommendations?: string; treatment?: string; notes?: string } | null;
  confirmationCode: string | null;
  certificationCode: string | null;
  professionalViewExpiresAt: string | null;
  personId: string;
  personFirstName: string;
  personLastName: string;
}

interface MedicalCenter {
  id: string;
  name: string;
  stateProvince: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
}

function confirmationLabel(code: string | null, certified: boolean): { label: string; color: 'success' | 'warning' | 'error' | 'default' } {
  if (certified) return { label: 'Certificada', color: 'success' };
  if (code === 'MEMBER_CONFIRMED') return { label: 'Confirmada por el viajero', color: 'success' };
  if (code === 'PLATFORM_CONFIRMED') return { label: 'Aceptada por la plataforma', color: 'success' };
  if (code === 'MEMBER_CHALLENGED') return { label: 'Objetada por el viajero', color: 'error' };
  return { label: 'Pendiente de confirmación', color: 'warning' };
}

/**
 * Pedido explícito del usuario: el médico que entra a la plataforma
 * "solamente debe poder visualizar centros médicos y las atenciones
 * que realiza... no debe poder ver otra cosa, y no debe modificar
 * nada, solamente ver". Página aparte, FUERA de <ProtectedRoute>/
 * <AppLayout> (sin sidebar, sin Dashboard, sin ningún otro link) — la
 * restricción real la hace professional-scope.middleware.ts en el
 * backend (bloquea cualquier otra ruta para una sesión de
 * profesional), esto es solo la interfaz de solo lectura.
 */
export function ProfessionalPortalPage() {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem(TOKEN_KEY));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tab, setTab] = useState(0);

  const loginMutation = useMutation({
    mutationFn: async () => {
      const { data } = await publicApiClient.post<{ accessToken: string }>('/auth/login', {
        email,
        password,
      });
      return data.accessToken;
    },
    onSuccess: (accessToken) => {
      sessionStorage.setItem(TOKEN_KEY, accessToken);
      setToken(accessToken);
    },
  });

  const authHeaders = { Authorization: `Bearer ${token}` };

  const encountersQuery = useQuery({
    queryKey: ['professional-portal', 'encounters'],
    queryFn: async () => {
      const { data } = await publicApiClient.get<MyEncounter[]>('/professional/me/encounters', {
        headers: authHeaders,
      });
      return data;
    },
    enabled: !!token,
  });

  const centersQuery = useQuery({
    queryKey: ['professional-portal', 'medical-centers'],
    queryFn: async () => {
      const { data } = await publicApiClient.get<MedicalCenter[]>('/professional/me/medical-centers', {
        headers: authHeaders,
      });
      return data;
    },
    enabled: !!token && tab === 1,
  });

  const logout = () => {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
  };

  if (!token) {
    return (
      <Container maxWidth="xs" sx={{ mt: 10 }}>
        <Paper sx={{ p: 4 }}>
          <Typography variant="h5" gutterBottom>
            Portal del profesional
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Ingresá con la cuenta que usaste al registrarte desde el link/QR de un paciente.
          </Typography>
          {loginMutation.isError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              Email o contraseña incorrectos.
            </Alert>
          )}
          <TextField
            label="Email"
            type="email"
            fullWidth
            margin="normal"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <TextField
            label="Contraseña"
            type="password"
            fullWidth
            margin="normal"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button
            variant="contained"
            fullWidth
            sx={{ mt: 2 }}
            disabled={!email || !password || loginMutation.isPending}
            onClick={() => loginMutation.mutate()}
          >
            {loginMutation.isPending ? 'Ingresando…' : 'Ingresar'}
          </Button>
        </Paper>
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ mt: 4, mb: 6 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">Portal del profesional</Typography>
        <Button size="small" onClick={logout}>
          Cerrar sesión
        </Button>
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Mis atenciones" />
        <Tab label="Centros médicos" />
      </Tabs>

      {tab === 0 && (
        <Paper>
          {encountersQuery.isLoading && (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <CircularProgress size={24} />
            </Box>
          )}
          {encountersQuery.data?.length === 0 && (
            <Typography sx={{ p: 3 }} color="text.secondary">
              Todavía no tenés atenciones registradas.
            </Typography>
          )}
          <List>
            {(encountersQuery.data ?? []).map((enc) => {
              const status = confirmationLabel(enc.confirmationCode, enc.certificationCode === 'PROFESSIONALLY_CERTIFIED');
              return (
                <ListItem key={enc.encounterId} divider alignItems="flex-start">
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Typography variant="body1" component="span" sx={{ fontWeight: 600 }}>
                          {enc.personFirstName} {enc.personLastName}
                        </Typography>
                        <Chip size="small" label={status.label} color={status.color} />
                      </Box>
                    }
                    secondary={
                      <>
                        <Typography variant="caption" color="text.secondary" component="div">
                          {new Date(enc.encounterDate).toLocaleDateString('es-AR', { timeZone: 'UTC' })}
                        </Typography>
                        {enc.clinicalData?.recommendations && (
                          <Typography variant="body2" component="div" sx={{ mt: 0.5 }}>
                            Recomendaciones: {enc.clinicalData.recommendations}
                          </Typography>
                        )}
                        {enc.clinicalData?.treatment && (
                          <Typography variant="body2" component="div">
                            Tratamiento: {enc.clinicalData.treatment}
                          </Typography>
                        )}
                        {enc.clinicalData?.notes && (
                          <Typography variant="body2" component="div">
                            Notas: {enc.clinicalData.notes}
                          </Typography>
                        )}
                        {enc.professionalViewExpiresAt && (
                          <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
                            Visible hasta el {new Date(enc.professionalViewExpiresAt).toLocaleDateString('es-AR')}
                          </Typography>
                        )}
                      </>
                    }
                  />
                </ListItem>
              );
            })}
          </List>
        </Paper>
      )}

      {tab === 1 && (
        <Paper>
          {centersQuery.isLoading && (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <CircularProgress size={24} />
            </Box>
          )}
          {centersQuery.data?.length === 0 && (
            <Typography sx={{ p: 3 }} color="text.secondary">
              No hay centros médicos cargados.
            </Typography>
          )}
          <List>
            {(centersQuery.data ?? []).map((c) => (
              <ListItem key={c.id} divider>
                <ListItemText
                  primary={c.name}
                  secondary={[c.address, c.city, c.stateProvince, c.phone].filter(Boolean).join(' · ')}
                />
              </ListItem>
            ))}
          </List>
        </Paper>
      )}
    </Container>
  );
}
