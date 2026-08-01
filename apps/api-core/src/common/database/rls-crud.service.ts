import { NotFoundException } from '@nestjs/common';
import {
  EntityMetadata,
  EntityTarget,
  ObjectLiteral,
  QueryRunner,
} from 'typeorm';

import { TenantTransactionManager } from './tenant-transaction.manager';
import { mapPgError } from './pg-error.mapper';

const ALIAS = 'e';

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
 *
 * `encryptedFields` (opcional): propiedades que en la base están en
 * `bytea` vía `core.encrypt_pii()` (ver proposed-clinical-encryption.sql).
 * Cuando la lista no está vacía, los reads pasan por QueryBuilder
 * envolviendo esas columnas en `core.decrypt_pii()`, y los writes por SQL
 * parametrizado envolviendo en `core.encrypt_pii()` — `manager.find/
 * create/save` no saben hacer esto, por eso el branch. El resto de los
 * recursos (mayoría) no pasa este parámetro y sigue exactamente igual
 * que antes.
 */
export class RlsCrudService<T extends ObjectLiteral> {
  constructor(
    private readonly txManager: TenantTransactionManager,
    private readonly entityClass: EntityTarget<T>,
    private readonly encryptedFields: string[] = [],
  ) {}

  async findAll(query: Record<string, string>): Promise<T[]> {
    const { limit: rawLimit, ...filters } = query;
    const take = this.parseLimit(rawLimit);
    try {
      return await this.txManager.runInTransaction((queryRunner) => {
        if (this.encryptedFields.length === 0) {
          return queryRunner.manager.find(this.entityClass, {
            where: filters as any,
            take,
          });
        }
        return this.findAllEncrypted(queryRunner, filters, take);
      });
    } catch (error) {
      mapPgError(error);
    }
  }

  /**
   * Tope duro de 500 para no permitir un scrape completo de una tabla
   * grande vía un solo `?limit=`. El default sigue siendo 100 (mismo
   * comportamiento de antes) para no cambiar la respuesta de ningún
   * cliente existente que no pase `limit` — solo quien lo necesita
   * (ej. Catálogos/Parámetros con >100 dominios) lo pide explícitamente.
   */
  private parseLimit(raw: string | undefined): number {
    const n = raw ? parseInt(raw, 10) : 100;
    if (!Number.isFinite(n) || n < 1) return 100;
    return Math.min(n, 500);
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
        if (this.encryptedFields.length === 0) {
          const entity = queryRunner.manager.create(
            this.entityClass,
            data as any,
          );
          return queryRunner.manager.save(this.entityClass, entity as any);
        }
        return this.createEncrypted(queryRunner, data);
      });
    } catch (error) {
      mapPgError(error);
    }
  }

  async update(id: string, body: Record<string, unknown>): Promise<T> {
    const { id: _ignoredId, ...data } = body;
    try {
      await this.txManager.runInTransaction(async (queryRunner) => {
        if (this.encryptedFields.length === 0) {
          await queryRunner.manager.update(this.entityClass, id, data as any);
          return;
        }
        await this.updateEncrypted(queryRunner, id, data);
      });
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
      return await this.txManager.runInTransaction((queryRunner) => {
        if (this.encryptedFields.length === 0) {
          return queryRunner.manager.findOne(this.entityClass, {
            where: { id } as any,
          });
        }
        return this.findOneEncrypted(queryRunner, id);
      });
    } catch (error) {
      mapPgError(error);
    }
  }

  private metadata(queryRunner: QueryRunner): EntityMetadata {
    return queryRunner.manager.connection.getMetadata(this.entityClass);
  }

  private qualifiedTable(metadata: EntityMetadata): string {
    return metadata.schema
      ? `"${metadata.schema}"."${metadata.tableName}"`
      : `"${metadata.tableName}"`;
  }

  private selectExpr(propertyName: string, databaseName: string): string {
    const column = `"${ALIAS}"."${databaseName}"`;
    return this.encryptedFields.includes(propertyName)
      ? `core.decrypt_pii(${column})`
      : column;
  }

  private baseSelectQuery(queryRunner: QueryRunner, metadata: EntityMetadata) {
    const qb = queryRunner.manager
      .createQueryBuilder(this.entityClass, ALIAS)
      .select([]);
    for (const col of metadata.columns) {
      qb.addSelect(
        this.selectExpr(col.propertyName, col.databaseName),
        col.propertyName,
      );
    }
    return qb;
  }

  private async findAllEncrypted(
    queryRunner: QueryRunner,
    query: Record<string, string>,
    take: number,
  ): Promise<T[]> {
    const metadata = this.metadata(queryRunner);
    const qb = this.baseSelectQuery(queryRunner, metadata);
    const propToCol = new Map(
      metadata.columns.map((c) => [c.propertyName, c.databaseName]),
    );
    for (const [key, value] of Object.entries(query)) {
      const dbCol = propToCol.get(key);
      if (dbCol) {
        qb.andWhere(`"${ALIAS}"."${dbCol}" = :${key}`, { [key]: value });
      }
    }
    return qb.limit(take).getRawMany<T>();
  }

  private async findOneEncrypted(
    queryRunner: QueryRunner,
    id: string,
  ): Promise<T | null> {
    const metadata = this.metadata(queryRunner);
    const qb = this.baseSelectQuery(queryRunner, metadata).where(
      `"${ALIAS}"."id" = :id`,
      { id },
    );
    return (await qb.getRawOne<T>()) ?? null;
  }

  private async createEncrypted(
    queryRunner: QueryRunner,
    data: Record<string, unknown>,
  ): Promise<T> {
    const metadata = this.metadata(queryRunner);
    const propToCol = new Map(
      metadata.columns.map((c) => [c.propertyName, c.databaseName]),
    );
    const entries = Object.entries(data).filter(([k]) => propToCol.has(k));
    const columns = entries.map(([k]) => `"${propToCol.get(k)}"`);
    const placeholders = entries.map(([k], i) =>
      this.encryptedFields.includes(k)
        ? `core.encrypt_pii($${i + 1})`
        : `$${i + 1}`,
    );
    const values = entries.map(([, v]) => v);

    const [{ id }] = await queryRunner.query(
      `INSERT INTO ${this.qualifiedTable(metadata)} (${columns.join(', ')})
       VALUES (${placeholders.join(', ')}) RETURNING id`,
      values,
    );
    return (await this.findOneEncrypted(queryRunner, id))!;
  }

  private async updateEncrypted(
    queryRunner: QueryRunner,
    id: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const metadata = this.metadata(queryRunner);
    const propToCol = new Map(
      metadata.columns.map((c) => [c.propertyName, c.databaseName]),
    );
    const entries = Object.entries(data).filter(([k]) => propToCol.has(k));
    if (entries.length === 0) return;

    const setClauses = entries.map(([k], i) => {
      const col = propToCol.get(k);
      const placeholder = this.encryptedFields.includes(k)
        ? `core.encrypt_pii($${i + 1})`
        : `$${i + 1}`;
      return `"${col}" = ${placeholder}`;
    });
    const values = entries.map(([, v]) => v);

    await queryRunner.query(
      `UPDATE ${this.qualifiedTable(metadata)} SET ${setClauses.join(', ')}
       WHERE id = $${entries.length + 1}`,
      [...values, id],
    );
  }
}
