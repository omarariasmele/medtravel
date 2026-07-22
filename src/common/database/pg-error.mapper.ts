import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

/**
 * Traduce códigos de error de Postgres (no de TypeORM) a excepciones Nest.
 * Cualquier código no listado se re-lanza tal cual — sigue siendo un 500,
 * a propósito: no hay que ocultar un bug real detrás de un mapeo genérico.
 */
export function mapPgError(error: unknown): never {
  if (error instanceof QueryFailedError) {
    const code = (error as QueryFailedError & { code?: string }).code;
    switch (code) {
      case '42501': // insufficient_privilege — RLS denegó la fila/operación
        throw new ForbiddenException('No autorizado para esta operación');
      case '23502': // not_null_violation
      case '23514': // check_violation
      case '23503': // foreign_key_violation
        throw new BadRequestException(error.message);
      case '23505': // unique_violation
        throw new ConflictException(error.message);
    }
  }
  throw error;
}
