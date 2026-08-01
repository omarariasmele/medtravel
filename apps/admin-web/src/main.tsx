import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CssBaseline, ThemeProvider } from '@mui/material';

import { AuthProvider } from './auth/auth-context';
import { theme } from './theme';
import App from './App.tsx';

/**
 * networkMode: 'always' — el default de React Query ('online') pausa
 * los reintentos indefinidamente si navigator.onLine (o su heurística
 * de conectividad) reporta que no hay red, dejando la query en
 * fetchStatus:'paused' para siempre en vez de resolver isError=true.
 * Encontrado real: en el entorno de este panel eso hacía que un 404
 * legítimo (ej. sin consentimiento clínico) nunca llegara a mostrarse,
 * la pantalla quedaba en un estado ambiguo (ni loading ni error). Con
 * 'always' la respuesta real del servidor manda siempre.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { networkMode: 'always' },
    mutations: { networkMode: 'always' },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
