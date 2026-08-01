import { useState } from 'react';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Link,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import axios from 'axios';

import { apiClient } from '../lib/api-client';
import logoPrincipal from '../assets/brand/logo-principal.png';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.post(
        '/auth/password-reset/confirm',
        { token, newPassword },
        { skipAuthRefresh: true },
      );
      setDone(true);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        setError('El link es inválido, ya fue usado, o venció. Pedí uno nuevo.');
      } else {
        setError('No se pudo restablecer la contraseña.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
      }}
    >
      <Paper sx={{ p: 4, width: 360 }} elevation={3}>
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
          <img src={logoPrincipal} alt="MedTravelApp" style={{ height: 120 }} />
        </Box>
        <Typography variant="h6" align="center" sx={{ mb: 2 }}>
          Restablecer contraseña
        </Typography>

        {!token && (
          <Alert severity="error" sx={{ mb: 2 }}>
            Falta el token del link de reset. Pedí uno nuevo desde "¿Olvidaste tu
            contraseña?".
          </Alert>
        )}

        {done ? (
          <Alert severity="success">
            Contraseña actualizada. Ya podés iniciar sesión con tu nueva contraseña.
          </Alert>
        ) : (
          <form onSubmit={onSubmit}>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            <TextField
              label="Nueva contraseña"
              type="password"
              fullWidth
              margin="normal"
              required
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              helperText="Mínimo 8 caracteres"
            />
            <TextField
              label="Confirmar contraseña"
              type="password"
              fullWidth
              margin="normal"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <Button
              type="submit"
              variant="contained"
              fullWidth
              sx={{ mt: 2 }}
              disabled={submitting || !token}
            >
              Restablecer contraseña
            </Button>
          </form>
        )}

        <Box sx={{ textAlign: 'center', mt: 2 }}>
          <Link component={RouterLink} to="/login" variant="body2">
            Volver a iniciar sesión
          </Link>
        </Box>

        {done && (
          <Box sx={{ textAlign: 'center', mt: 1 }}>
            <Button size="small" onClick={() => navigate('/login')}>
              Ir a iniciar sesión
            </Button>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
