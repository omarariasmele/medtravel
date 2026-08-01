import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Container,
  TextField,
  Typography,
} from '@mui/material';

import { publicApiClient } from '../../lib/public-api-client';
import { SharedProfileView, type SharedProfileData } from '../../components/shared-profile-view';
import { ShareWindowHeader } from '../../components/share-window-header';

interface SharePayload extends SharedProfileData {
  expiresAt: string;
  canSubmitNote: boolean;
}

/**
 * Portal público — a esto llega el médico/institución escaneando el QR
 * o abriendo el link que le compartió el viajero desde la app. Sin
 * cuenta, sin login: usa publicApiClient (nunca apiClient, ver
 * public-api-client.ts) para que un 401/404 legítimo del backend no
 * dispare el interceptor de refresh/redirect a /login.
 */
export function PublicSharePage() {
  const navigate = useNavigate();
  const { token } = useParams<{ token: string }>();
  const [noteOpen, setNoteOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [claimedResult, setClaimedResult] = useState<{ certified: boolean } | null>(null);
  const [accessorName, setAccessorName] = useState('');
  const [accessorEmail, setAccessorEmail] = useState('');
  const [accessorSpecialty, setAccessorSpecialty] = useState('');
  const [accessorInstitution, setAccessorInstitution] = useState('');
  const [recommendations, setRecommendations] = useState('');
  const [treatment, setTreatment] = useState('');
  const [notes, setNotes] = useState('');
  const [claimToken, setClaimToken] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['public-share', token],
    queryFn: async () => {
      const { data } = await publicApiClient.get<SharePayload>(`/public/shares/${token}`);
      return data;
    },
    retry: false,
  });

  const submitNote = useMutation({
    mutationFn: async () => {
      const { data } = await publicApiClient.post(`/public/shares/${token}/notes`, {
        accessorName,
        accessorEmail: accessorEmail || undefined,
        accessorSpecialty: accessorSpecialty || undefined,
        accessorInstitution: accessorInstitution || undefined,
        recommendations: recommendations || undefined,
        treatment: treatment || undefined,
        notes: notes || undefined,
      });
      return data as { id: string; claimToken: string };
    },
    onSuccess: (data) => {
      setClaimToken(data.claimToken);
      setNoteOpen(false);
    },
  });

  const loginAndClaim = useMutation({
    mutationFn: async () => {
      const { data: loginData } = await publicApiClient.post('/auth/login', {
        email: loginEmail,
        password: loginPassword,
      });
      const { data: claimData } = await publicApiClient.post(
        '/clinical/professionals-registration/claim-note',
        { claimToken },
        { headers: { Authorization: `Bearer ${loginData.accessToken}` } },
      );
      return { certified: claimData.certified as boolean };
    },
    onSuccess: (data) => {
      setClaimedResult(data);
      setLoginOpen(false);
    },
  });

  if (query.isLoading) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
        <ShareWindowHeader />
        <Container maxWidth="sm" sx={{ textAlign: 'center' }}>
          <CircularProgress />
        </Container>
      </Box>
    );
  }

  if (query.isError || !query.data) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
        <ShareWindowHeader />
        <Container maxWidth="sm">
          <Alert severity="error">
            Este link no es válido o ya venció. Pedile al viajero que te comparta uno nuevo desde la app.
          </Alert>
        </Container>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <ShareWindowHeader />
      <Container maxWidth="sm" sx={{ pb: 6 }}>
      <Typography variant="h5" gutterBottom>
        Ficha médica compartida
      </Typography>
      <Alert severity="info" sx={{ mb: 2 }}>
        Este link vence el {new Date(query.data.expiresAt).toLocaleString('es-AR')}. Toda visualización queda
        registrada.
      </Alert>

      <SharedProfileView data={query.data} />

      {query.data.canSubmitNote && (
        <Card sx={{ mt: 2 }}>
          <CardContent>
            {claimedResult ? (
              <Alert severity="success">
                Nota reclamada correctamente.{' '}
                {claimedResult.certified
                  ? 'Como tu identidad ya está verificada, quedó certificada directamente en la historia clínica.'
                  : 'Quedó pendiente de confirmación del viajero (nivel de confianza todavía no verificado).'}
              </Alert>
            ) : claimToken ? (
              <Box>
                <Alert severity="success" sx={{ mb: 2 }}>
                  Nota guardada. Para que quede asociada a tu nombre en la historia clínica, iniciá sesión o
                  registrate.
                </Alert>
                {loginAndClaim.isError && (
                  <Alert severity="error" sx={{ mb: 2 }}>Email o contraseña incorrectos.</Alert>
                )}
                {!loginOpen ? (
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button variant="contained" onClick={() => setLoginOpen(true)}>
                      Ya tengo cuenta
                    </Button>
                    <Button
                      variant="outlined"
                      onClick={() => navigate(`/professional-registration?claimToken=${claimToken}`)}
                    >
                      Registrarme
                    </Button>
                  </Box>
                ) : (
                  <Box>
                    <TextField
                      label="Email"
                      type="email"
                      fullWidth
                      margin="normal"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                    />
                    <TextField
                      label="Contraseña"
                      type="password"
                      fullWidth
                      margin="normal"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                    />
                    <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                      <Button onClick={() => setLoginOpen(false)}>Cancelar</Button>
                      <Button
                        variant="contained"
                        disabled={!loginEmail || !loginPassword || loginAndClaim.isPending}
                        onClick={() => loginAndClaim.mutate()}
                      >
                        Ingresar y reclamar nota
                      </Button>
                    </Box>
                  </Box>
                )}
              </Box>
            ) : !noteOpen ? (
              <Button variant="contained" onClick={() => setNoteOpen(true)}>
                Dejar nota de la atención
              </Button>
            ) : (
              <Box>
                <Typography variant="subtitle1" gutterBottom>Dejar nota de la atención</Typography>
                {submitNote.isError && (
                  <Alert severity="error" sx={{ mb: 2 }}>No se pudo guardar la nota.</Alert>
                )}
                <TextField
                  label="Tu nombre"
                  fullWidth
                  margin="normal"
                  value={accessorName}
                  onChange={(e) => setAccessorName(e.target.value)}
                />
                <TextField
                  label="Email (opcional)"
                  fullWidth
                  margin="normal"
                  value={accessorEmail}
                  onChange={(e) => setAccessorEmail(e.target.value)}
                />
                <TextField
                  label="Especialidad (opcional)"
                  fullWidth
                  margin="normal"
                  value={accessorSpecialty}
                  onChange={(e) => setAccessorSpecialty(e.target.value)}
                />
                <TextField
                  label="Institución (opcional)"
                  fullWidth
                  margin="normal"
                  value={accessorInstitution}
                  onChange={(e) => setAccessorInstitution(e.target.value)}
                />
                <TextField
                  label="Recomendaciones"
                  fullWidth
                  multiline
                  minRows={2}
                  margin="normal"
                  value={recommendations}
                  onChange={(e) => setRecommendations(e.target.value)}
                />
                <TextField
                  label="Tratamiento"
                  fullWidth
                  multiline
                  minRows={2}
                  margin="normal"
                  value={treatment}
                  onChange={(e) => setTreatment(e.target.value)}
                />
                <TextField
                  label="Notas"
                  fullWidth
                  multiline
                  minRows={2}
                  margin="normal"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
                <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                  <Button onClick={() => setNoteOpen(false)}>Cancelar</Button>
                  <Button
                    variant="contained"
                    disabled={!accessorName || submitNote.isPending}
                    onClick={() => submitNote.mutate()}
                  >
                    Guardar nota
                  </Button>
                </Box>
              </Box>
            )}
          </CardContent>
        </Card>
      )}
      </Container>
    </Box>
  );
}
