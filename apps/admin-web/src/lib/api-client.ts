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
export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000',
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
