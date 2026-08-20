import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Divider,
  FormControlLabel,
  Grid,
  IconButton,
  InputAdornment,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import axios from 'axios';

import { apiClient } from '../../lib/api-client';
import { usePageTitle } from '../../lib/page-title';

interface SmtpSettingsView {
  id: string;
  host: string;
  port: number;
  username: string;
  fromAddress: string;
  fromName: string;
  secure: boolean;
  updatedAt: string;
}

interface FormState {
  host: string;
  port: string;
  username: string;
  password: string;
  fromAddress: string;
  fromName: string;
  secure: boolean;
}

const EMPTY_FORM: FormState = {
  host: '',
  port: '587',
  username: '',
  password: '',
  fromAddress: '',
  fromName: 'MedTravelApp',
  secure: true,
};

function errorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const msg = err.response?.data?.message;
    if (typeof msg === 'string') return msg;
    if (Array.isArray(msg)) return msg.join(', ');
  }
  return fallback;
}

/**
 * Configuración del servidor SMTP propio de OYS GROUP, usado para el
 * mail de recupero de contraseña (y notificaciones futuras). Restringido
 * a canManageConfig — la RLS de params.smtp_settings ya lo exige del
 * lado del backend (core.has_platform_config_access()).
 *
 * El backend nunca devuelve la contraseña guardada (ni siquiera cifrada)
 * — cada guardado inserta una fila nueva y desactiva la anterior, así
 * que hay que reescribirla completa cada vez que se cambia algo acá. El
 * botón "mostrar" solo revela lo que hay tipeado en el campo ahora
 * mismo, nunca un valor ya guardado.
 */
export function SmtpSettingsPage() {
  usePageTitle('Configuración de correo (SMTP)');
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [testTo, setTestTo] = useState('');
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const queryClient = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: ['params', 'smtp-settings'],
    queryFn: async () => {
      try {
        const { data } = await apiClient.get<SmtpSettingsView>(
          '/params/admin/smtp-settings',
        );
        return data;
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 404) {
          return null;
        }
        throw err;
      }
    },
  });

  useEffect(() => {
    if (settingsQuery.data) {
      setForm((f) => ({
        ...f,
        host: settingsQuery.data!.host,
        port: String(settingsQuery.data!.port),
        username: settingsQuery.data!.username,
        fromAddress: settingsQuery.data!.fromAddress,
        fromName: settingsQuery.data!.fromName,
        secure: settingsQuery.data!.secure,
      }));
    }
  }, [settingsQuery.data]);

  const setField =
    (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.put('/params/admin/smtp-settings', {
        host: form.host,
        port: Number(form.port),
        username: form.username,
        password: form.password,
        fromAddress: form.fromAddress,
        fromName: form.fromName,
        secure: form.secure,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['params', 'smtp-settings'] });
      // No se limpia la contraseña: se acaba de guardar con éxito, así
      // que "Enviar prueba" puede seguir usándola sin pedir que se
      // reescriba de nuevo. Solo se pide reescribirla cuando se entra
      // a la pantalla de cero (ver useEffect de más abajo).
      setError(null);
      setSuccess(true);
    },
    onError: (err) => {
      setSuccess(false);
      setError(errorMessage(err, 'No se pudo guardar la configuración SMTP.'));
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post('/params/admin/smtp-settings/test', {
        host: form.host,
        port: Number(form.port),
        username: form.username,
        password: form.password,
        fromAddress: form.fromAddress,
        fromName: form.fromName,
        secure: form.secure,
        to: testTo,
      });
    },
    onSuccess: () => {
      setTestResult({ ok: true, message: `Email de prueba enviado a ${testTo}.` });
    },
    onError: (err) => {
      setTestResult({ ok: false, message: errorMessage(err, 'No se pudo enviar el email de prueba.') });
    },
  });

  const isValid =
    form.host && form.port && form.username && form.password && form.fromAddress && form.fromName;

  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Servidor usado para enviar el mail de recupero de contraseña y otras
        notificaciones. Por seguridad, la contraseña guardada nunca se muestra:
        hay que volver a escribirla cada vez que se guarda un cambio (podés
        usar el ícono del ojo para ver lo que estás tipeando ahora).
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Configuración guardada.
        </Alert>
      )}
      {!settingsQuery.data && !settingsQuery.isLoading && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Todavía no hay un servidor SMTP configurado — el recupero de
          contraseña no va a poder enviar emails hasta que se cargue esto.
        </Alert>
      )}
      {settingsQuery.data && !form.password && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Ya hay una configuración guardada, pero por seguridad la contraseña
          no viaja de vuelta desde el servidor — el campo "Contraseña" está
          vacío aunque el resto de los datos se vean cargados. Escribila de
          nuevo abajo para poder Guardar o Probar (ambos botones quedan
          apagados hasta que lo hagas).
        </Alert>
      )}

      <Paper sx={{ p: 3, maxWidth: 600 }}>
        <Grid container spacing={1}>
          <Grid size={{ xs: 12, sm: 8 }}>
            <TextField
              label="Host"
              fullWidth
              margin="normal"
              value={form.host}
              onChange={setField('host')}
              helperText="Ej. smtp.oysgroup.com"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              label="Puerto"
              type="number"
              fullWidth
              margin="normal"
              value={form.port}
              onChange={setField('port')}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Usuario"
              fullWidth
              margin="normal"
              value={form.username}
              onChange={setField('username')}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Contraseña"
              type={showPassword ? 'text' : 'password'}
              fullWidth
              margin="normal"
              value={form.password}
              onChange={setField('password')}
              autoComplete="new-password"
              helperText="Hay que reescribirla en cada guardado"
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        onClick={() => setShowPassword((v) => !v)}
                        edge="end"
                      >
                        {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Email remitente"
              type="email"
              fullWidth
              margin="normal"
              value={form.fromAddress}
              onChange={setField('fromAddress')}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Nombre remitente"
              fullWidth
              margin="normal"
              value={form.fromName}
              onChange={setField('fromName')}
            />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={form.secure}
                  onChange={(e) => setForm((f) => ({ ...f, secure: e.target.checked }))}
                />
              }
              label="Conexión segura (TLS directo)"
            />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              Marcar solo para puerto 465 (TLS directo desde el inicio). Para
              puerto 587 o 25, dejar sin marcar — esos puertos negocian TLS
              con STARTTLS después de conectar, y marcar esto da error de
              "wrong version number".
            </Typography>
          </Grid>
        </Grid>
        <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="contained"
            disabled={!isValid || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            Guardar
          </Button>
        </Box>

        <Divider sx={{ my: 3 }} />

        <Typography variant="subtitle1" gutterBottom>
          Probar esta configuración
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Envía un email de prueba usando los datos de arriba (no hace falta
          guardar antes) para confirmar que el servidor funciona.
        </Typography>

        {testResult && (
          <Alert severity={testResult.ok ? 'success' : 'error'} sx={{ mb: 2 }}>
            {testResult.message}
          </Alert>
        )}

        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
          <TextField
            label="Enviar prueba a"
            type="email"
            fullWidth
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
          />
          <Button
            variant="outlined"
            sx={{ mt: 1, whiteSpace: 'nowrap' }}
            disabled={!isValid || !testTo || testMutation.isPending}
            onClick={() => testMutation.mutate()}
          >
            Enviar prueba
          </Button>
        </Box>
      </Paper>
    </>
  );
}
