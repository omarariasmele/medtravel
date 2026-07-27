import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';

import { RequestContextStore } from '../request-context/request-context.store';
import {
  REQUEST_CONTEXT_GUC_MAP,
  RequestContextData,
} from '../request-context/request-context.types';

/**
 * Corre `work` dentro de una transacción Postgres que primero setea, vía
 * `SELECT set_config(key, value, true)` (local a la transacción), todas las
 * GUCs de app.* que haya en el RequestContext actual. Sin esto, las políticas
 * RLS y el trigger audit.log_event() ven current_setting(...) = NULL y
 * deniegan por diseño (fail-secure, ver C7/C9 en 000_extensions.sql).
 *
 * Cualquier service que toque una tabla con RLS (prácticamente todo excepto
 * los catálogos públicos de params) debe pasar su lógica de acceso a datos
 * por acá en lugar de usar un Repository inyectado directamente.
 */
@Injectable()
export class TenantTransactionManager {
  private readonly logger = new Logger(TenantTransactionManager.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly contextStore: RequestContextStore,
  ) {}

  /**
   * `contextOverride` es para los pocos casos (ej. AuthService.login) donde
   * todavía no hay un RequestContext poblado por PgSessionContextInterceptor
   * (no hay JWT validado aún) pero igual hace falta setear alguna GUC
   * puntual — normalmente se deja vacío y se toma el contexto del request
   * actual desde RequestContextStore.
   */
  async runInTransaction<T>(
    work: (queryRunner: QueryRunner) => Promise<T>,
    contextOverride?: RequestContextData,
  ): Promise<T> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await this.applySessionContext(queryRunner, contextOverride);
      const result = await work(queryRunner);
      await queryRunner.commitTransaction();
      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async applySessionContext(
    queryRunner: QueryRunner,
    contextOverride?: RequestContextData,
  ): Promise<void> {
    const context = contextOverride ?? this.contextStore.get();

    for (const [field, guc] of Object.entries(REQUEST_CONTEXT_GUC_MAP)) {
      const value = context[field as keyof typeof context];
      if (value === undefined || value === null) {
        continue;
      }
      await queryRunner.query('SELECT set_config($1, $2, true)', [
        guc,
        String(value),
      ]);
    }

    this.logger.debug(
      `Session context aplicado: ${JSON.stringify({ ...context, sessionId: context.sessionId ? '[set]' : undefined })}`,
    );
  }
}
