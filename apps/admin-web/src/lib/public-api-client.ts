import axios from 'axios';

/**
 * Cliente aparte para /public/shares/* — un visitante anónimo (el
 * médico que entra por el QR/link) nunca tiene sesión, así que NO debe
 * llevar el interceptor de apiClient (ver api-client.ts): ese
 * redirige cualquier 401 a /login, que es exactamente lo que no debe
 * pasarle a alguien sin cuenta. Un 404 acá (token inválido/vencido) es
 * una respuesta legítima del endpoint, no un fallo de sesión.
 *
 * Mismo mecanismo de resolución dinámica que api-client.ts (ver el
 * comentario ahí) — un médico que escanea el QR siempre entra por el
 * dominio público, así que este cliente necesita el mismo chequeo de
 * hostname para usar el puerto 8443 de Caddy en vez de localhost:3000.
 */
function resolvePublicApiBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location.hostname === 'medtravelapp.oysgroup.com.ar') {
    return `https://${window.location.hostname}:8443`;
  }
  return import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
}

export const publicApiClient = axios.create({
  baseURL: resolvePublicApiBaseUrl(),
});
