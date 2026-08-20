import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    primary: { main: '#0F6E5B' },
    secondary: { main: '#1A73E8' },
  },
  shape: { borderRadius: 8 },
  // Pedido explícito del usuario: mejor legibilidad en las pantallas de
  // Historial de Salud, muy densas en texto chico (body2/caption son
  // las variantes que más se usan ahí para listas de datos).
  typography: {
    fontSize: 15,
    body2: { fontSize: '0.9375rem' },
    caption: { fontSize: '0.8125rem' },
  },
});
