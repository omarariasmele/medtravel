import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

import { RequestContextData } from './request-context.types';

/**
 * Almacena el RequestContextData del request en curso usando
 * AsyncLocalStorage — así cualquier servicio, sin pasarse el request como
 * parámetro, puede leer quién está haciendo la query para propagarlo a
 * Postgres (ver TenantTransactionManager).
 */
@Injectable()
export class RequestContextStore {
  private readonly als = new AsyncLocalStorage<RequestContextData>();

  run<T>(context: RequestContextData, callback: () => T): T {
    return this.als.run(context, callback);
  }

  get(): RequestContextData {
    return this.als.getStore() ?? {};
  }
}
