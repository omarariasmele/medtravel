import axios from 'axios';

declare module 'axios' {
  interface AxiosRequestConfig {
    /** Evita el auto-refresh/redirect a /login en respuestas 401 legítimas de un endpoint público (ej. reset de password con token inválido/vencido). */
    skipAuthRefresh?: boolean;
  }
}

/**
 * apps/api-core es la única fuente de verdad — nunca se accede a
 * Postgres directo desde el panel (API First, ver README raíz del
 * monorepo). El access/refresh token viven en localStorage; el
 * interceptor de abajo los agrega/renueva solo.
 */
/**
 * Bug real reportado en vivo: entrando desde afuera por
 * medtravelapp.oysgroup.com.ar:8444 (proxy de Caddy hacia este mismo
 * Vite), el panel seguía pegándole a localhost:3000 para la API — que
 * desde OTRO dispositivo es su propia máquina, no la de acá, así que
 * el login fallaba con "sin conexión". En vez de fijar una URL fija
 * (que rompería el acceso local), se resuelve en tiempo de ejecución
 * según desde dónde se está viendo la página — mismo host, puerto del
 * backend público (8443, ver Caddy) en vez de 3000.
 *
 * El chequeo de hostname va PRIMERO a propósito: .env tiene
 * VITE_API_URL=http://localhost:3000 fijo (para no romper nada que ya
 * dependiera de esa variable) — si se chequeaba primero, ganaba
 * siempre y esta detección nunca llegaba a ejecutarse pese a estar
 * bien escrita. Solo cuando NO se está viendo desde el dominio público
 * se respeta VITE_API_URL / el default de siempre.
 */
function resolveApiBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location.hostname === 'medtravelapp.oysgroup.com.ar') {
    return `https://${window.location.hostname}:8443`;
  }
  return import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
}

// Pedido explícito del usuario: un viajero (sin permisos de operador)
// podía loguearse en admin-web igual que un operador — el backend
// ahora rechaza /auth/login cuando X-Client-App es 'admin-web' y la
// cuenta no tiene fila en operations.operators (ver auth.service.ts).
// Mismo patrón que ya usa la app móvil con X-Client-App: 'mobile'.
export const apiClient = axios.create({
  baseURL: resolveApiBaseUrl(),
  headers: { 'X-Client-App': 'admin-web' },
});

const ACCESS_TOKEN_KEY = 'medtravel_access_token';
const REFRESH_TOKEN_KEY = 'medtravel_refresh_token';

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    throw new Error('No hay refresh token');
  }
  const { data } = await axios.post(
    `${apiClient.defaults.baseURL}/auth/refresh`,
    { refreshToken },
  );
  setTokens(data.accessToken, data.refreshToken);
  return data.accessToken;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (
      error.response?.status === 401 &&
      !original._retry &&
      !original.skipAuthRefresh
    ) {
      original._retry = true;
      try {
        refreshPromise ??= refreshAccessToken();
        const newToken = await refreshPromise;
        refreshPromise = null;
        original.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(original);
      } catch {
        refreshPromise = null;
        clearTokens();
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);
