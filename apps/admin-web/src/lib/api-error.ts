import axios from 'axios';

/**
 * El ValidationPipe global de NestJS manda `message` como lista de
 * errores por campo (ej. "password must be longer than or equal to 8
 * characters"), no como string — un catch genérico que solo mostraba un
 * mensaje fijo dejaba al usuario sin saber qué campo estaba mal (bug
 * real reportado: "pongo una contraseña que no va y no me dice nada").
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message) && message.length > 0) return message.join(' — ');
  }
  return fallback;
}
