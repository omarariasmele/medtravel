import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';

import { apiClient } from '../../lib/api-client';
import { SharedProfileView, type SharedProfileData } from '../../components/shared-profile-view';
import { ShareWindowHeader } from '../../components/share-window-header';

/**
 * Funcionalidad accesoria pedida por el usuario: un operador con acceso
 * clínico legítimo (caso abierto o consentimiento) puede ver la ficha
 * EXACTAMENTE como la vería un médico que entra por el QR/link — mismo
 * componente SharedProfileView que /public/shares/:token, alimentado
 * por el endpoint autenticado clinical/share-preview en vez del token.
 *
 * Ventana simple a propósito (pedido explícito del usuario): sin el
 * menú/sidebar del panel — vive fuera de <AppLayout> en App.tsx.
 */
const LANGUAGE_OPTIONS: { code: string; label: string }[] = [
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'Inglés' },
  { code: 'pt', label: 'Portugués' },
  { code: 'fr', label: 'Francés' },
];

export function SharePreviewPage() {
  const { personId } = useParams<{ personId: string }>();
  // Pedido explícito del usuario: "antes de mostrar la ficha de salud
  // debe pedir en qué idioma la quiere visualizar, para mostrar como
  // la vería el médico según su idioma" — arranca sin idioma elegido
  // (la consulta no corre todavía, ver `enabled` más abajo) hasta que
  // el operador lo selecciona.
  const [language, setLanguage] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['clinical', 'share-preview', personId, language],
    queryFn: async () => {
      const { data } = await apiClient.get<SharedProfileData>(`/clinical/share-preview/${personId}`, {
        params: language && language !== 'es' ? { language } : undefined,
      });
      return data;
    },
    enabled: language !== null,
    retry: false,
  });

  /**
   * Pedido explícito del usuario ("Funcional de verdad — Recomendado"):
   * esta vista previa no debe ser solo visual — tiene que poder generar
   * por detrás un link real de compartir (mismo mecanismo que
   * me/shares/doctor-invite, ver clinical/share-preview/:personId/
   * generate-link) para poder probar el flujo completo, incluida
   * "Dejar nota de la atención", sin salir de admin-web (el link real
   * también es una ruta de esta misma app, solo que fuera de
   * AppLayout — se abre en una pestaña nueva del mismo origen).
   */
  const generateLink = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<{ accessUrl: string; expiresAt: string }>(
        `/clinical/share-preview/${personId}/generate-link`,
      );
      return data;
    },
    onSuccess: (data) => {
      window.open(data.accessUrl, '_blank', 'noopener');
    },
  });

  /** Mismo endpoint autenticado que ya usa clinical-history.section.tsx — acá no hace falta ningún token, el operador ya tiene su propia sesión. */
  const handleViewDocument = async (doc: SharedProfileData['documents'][number]) => {
    const { data } = await apiClient.get(`/clinical/documents/${doc.id}/file`, { responseType: 'blob' });
    const objectUrl = URL.createObjectURL(data);
    window.open(objectUrl, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  };

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!query.data?.person?.photoPath || !personId) {
      setPhotoUrl(null);
      return;
    }
    let objectUrl: string | null = null;
    apiClient
      .get(`/clinical/patient-photo/${personId}`, { responseType: 'blob' })
      .then(({ data }) => {
        objectUrl = URL.createObjectURL(data);
        setPhotoUrl(objectUrl);
      })
      .catch(() => setPhotoUrl(null));
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [personId, query.data?.person?.photoPath]);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <ShareWindowHeader />
      <Container maxWidth="md" sx={{ pb: 6, px: { xs: 2, sm: 3 } }}>
        {language === null && (
          <Box sx={{ maxWidth: 360, mx: 'auto', mt: 6, textAlign: 'center' }}>
            <Typography variant="h6" gutterBottom>
              Vista previa — como la vería el médico
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              ¿En qué idioma querés verla? Es el mismo idioma en el que la vería un médico real si el link
              se genera en ese idioma.
            </Typography>
            <TextField
              select
              fullWidth
              label="Idioma"
              defaultValue=""
              onChange={(e) => setLanguage(e.target.value)}
            >
              {LANGUAGE_OPTIONS.map((o) => (
                <MenuItem key={o.code} value={o.code}>
                  {o.label}
                </MenuItem>
              ))}
            </TextField>
          </Box>
        )}

        {language !== null && query.isLoading && (
          <Box sx={{ textAlign: 'center', mt: 6 }}>
            <CircularProgress />
          </Box>
        )}

        {language !== null && !query.isLoading && (query.isError || !query.data) && (
          <Alert severity="warning">
            Sin acceso a la historia clínica de este viajero: no hay un caso de asistencia abierto ni
            consentimiento activo para esta empresa.
          </Alert>
        )}

        {query.data && (
          <>
            <Typography variant="h5" gutterBottom>
              Vista previa — como la vería el médico
            </Typography>
            <Alert severity="info" sx={{ mb: 2 }}>
              Esta es exactamente la información que vería un médico que entra por el QR/link de compartir
              del viajero.
            </Alert>
            <Box sx={{ mb: 2 }}>
              <Button
                variant="contained"
                onClick={() => generateLink.mutate()}
                disabled={generateLink.isPending}
              >
                Probar flujo completo (incluida "Dejar nota de la atención")
              </Button>
              {generateLink.isError && (
                <Alert severity="error" sx={{ mt: 1 }}>
                  No se pudo generar el link de prueba.
                </Alert>
              )}
              {generateLink.isSuccess && (
                <Alert severity="success" sx={{ mt: 1 }}>
                  Se abrió una pestaña nueva con un link real y funcional (vence en pocas horas).
                </Alert>
              )}
            </Box>
            <SharedProfileView
              data={query.data}
              photoUrl={photoUrl}
              language={language ?? 'es'}
              onViewDocument={handleViewDocument}
            />
          </>
        )}
      </Container>
    </Box>
  );
}
