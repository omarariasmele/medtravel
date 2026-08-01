import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Alert, Box, CircularProgress, Container, Typography } from '@mui/material';

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
export function SharePreviewPage() {
  const { personId } = useParams<{ personId: string }>();

  const query = useQuery({
    queryKey: ['clinical', 'share-preview', personId],
    queryFn: async () => {
      const { data } = await apiClient.get<SharedProfileData>(`/clinical/share-preview/${personId}`);
      return data;
    },
    retry: false,
  });

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <ShareWindowHeader />
      <Container maxWidth="sm" sx={{ pb: 6 }}>
        {query.isLoading && (
          <Box sx={{ textAlign: 'center', mt: 6 }}>
            <CircularProgress />
          </Box>
        )}

        {!query.isLoading && (query.isError || !query.data) && (
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
            <SharedProfileView data={query.data} />
          </>
        )}
      </Container>
    </Box>
  );
}
