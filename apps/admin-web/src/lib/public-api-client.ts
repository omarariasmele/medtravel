import axios from 'axios';

/**
 * Cliente aparte para /public/shares/* — un visitante anónimo (el
 * médico que entra por el QR/link) nunca tiene sesión, así que NO debe
 * llevar el interceptor de apiClient (ver api-client.ts): ese
 * redirige cualquier 401 a /login, que es exactamente lo que no debe
 * pasarle a alguien sin cuenta. Un 404 acá (token inválido/vencido) es
 * una respuesta legítima del endpoint, no un fallo de sesión.
 */
export const publicApiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000',
});
