import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Link,
  Paper,
  TextField,
  Typography,
} from '@mui/material';

import { apiClient } from '../lib/api-client';
import logoPrincipal from '../assets/brand/logo-principal.png';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiClient.post('/auth/password-reset/request', { email });
    } finally {
      setSubmitting(false);
      setSent(true);
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
          Recuperar contraseña
        </Typography>

        {sent ? (
          <Alert severity="success">
            Si el email existe en el sistema, vas a recibir un link para restablecer
            tu contraseña.
          </Alert>
        ) : (
          <form onSubmit={onSubmit}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Ingresá tu email y te enviamos un link para restablecer tu contraseña.
            </Typography>
            <TextField
              label="Email"
              type="email"
              fullWidth
              margin="normal"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button
              type="submit"
              variant="contained"
              fullWidth
              sx={{ mt: 2 }}
              disabled={submitting}
            >
              Enviar link
            </Button>
          </form>
        )}

        <Box sx={{ textAlign: 'center', mt: 2 }}>
          <Link component={RouterLink} to="/login" variant="body2">
            Volver a iniciar sesión
          </Link>
        </Box>
      </Paper>
    </Box>
  );
}
