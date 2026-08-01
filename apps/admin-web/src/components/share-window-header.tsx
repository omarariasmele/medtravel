import { Box } from '@mui/material';

import logoHorizontal from '../assets/brand/logo-horizontal.png';

/**
 * Encabezado mínimo para las pantallas "ventana simple" — el portal
 * público del médico y su previsualización interna — que deliberadamente
 * NO llevan el menú/sidebar del panel administrativo: no son parte de
 * la navegación del operador, son una ficha clínica que se mira sola.
 */
export function ShareWindowHeader() {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        py: 2,
        borderBottom: '1px solid',
        borderColor: 'divider',
        mb: 3,
      }}
    >
      <Box component="img" src={logoHorizontal} alt="MedTravelApp" sx={{ height: 32 }} />
    </Box>
  );
}
