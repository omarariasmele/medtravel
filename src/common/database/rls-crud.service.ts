import { NotFoundException } from '@nestjs/common';
import { EntityTarget, ObjectLiteral } from 'typeorm';

import { TenantTransactionManager } from './tenant-transaction.manager';
import { mapPgError } from './pg-error.mapper';

/**
 * CRUD genérico sobre una entidad TypeORM, corriendo siempre dentro de
 * TenantTransactionManager (mismas GUCs de sesión/RLS que el resto de la
 * app). No es un @Injectable() — se instancia una vez por recurso
 * resuelto en el controller genérico del módulo (ver <modulo>.registry.ts).
 *
 * Sin DTO de class-validator por entidad a propósito: las políticas RLS y
 * los CHECK/NOT NULL/UNIQUE de Postgres son la única fuente de verdad;
 * pg-error.mapper.ts traduce sus violaciones a HTTP en vez de tapar el
 * error con una validación de app duplicada.
 */
export class RlsCrudService<T extends ObjectLiteral> {
  constructor(
    private readonly txManager: TenantTransactionManager,
    private readonly entityClass: EntityTarget<T>,
  ) {}

  async findAll(query: Record<string, string>): Promise<T[]> {
    try {
      return await this.txManager.runInTransaction((queryRunner) =>
        queryRunner.manager.find(this.entityClass, {
          where: query as any,
          take: 100,
        }),
      );
    } catch (error) {
      mapPgError(error);
    }
  }

  async findOne(id: string): Promise<T> {
    const entity = await this.tryFindOne(id);
    if (!entity) {
      throw new NotFoundException(`No encontrado: ${id}`);
    }
    return entity;
  }

  async create(body: Record<string, unknown>): Promise<T> {
    const { id: _ignoredId, ...data } = body;
    try {
      return await this.txManager.runInTransaction(async (queryRunner) => {
        const entity = queryRunner.manager.create(
          this.entityClass,
          data as any,
        );
        return queryRunner.manager.save(this.entityClass, entity as any);
      });
    } catch (error) {
      mapPgError(error);
    }
  }

  async update(id: string, body: Record<string, unknown>): Promise<T> {
    const { id: _ignoredId, ...data } = body;
    try {
      await this.txManager.runInTransaction((queryRunner) =>
        queryRunner.manager.update(this.entityClass, id, data as any),
      );
    } catch (error) {
      mapPgError(error);
    }
    return this.findOne(id);
  }

  /**
   * `affected === 0` puede significar "no existe" o "RLS lo bloqueó
   * silenciosamente" (ej. *_no_delete USING (FALSE)) — se reporta 404 en
   * ambos casos porque no hay forma de distinguirlos desde acá.
   */
  async remove(id: string): Promise<void> {
    let affected = 0;
    try {
      const result = await this.txManager.runInTransaction((queryRunner) =>
        queryRunner.manager.delete(this.entityClass, id),
      );
      affected = result.affected ?? 0;
    } catch (error) {
      mapPgError(error);
    }
    if (!affected) {
      throw new NotFoundException(
        `No encontrado o eliminación no permitida: ${id}`,
      );
    }
  }

  private async tryFindOne(id: string): Promise<T | null> {
    try {
      return await this.txManager.runInTransaction((queryRunner) =>
        queryRunner.manager.findOne(this.entityClass, { where: { id } as any }),
      );
    } catch (error) {
      mapPgError(error);
    }
  }
}
