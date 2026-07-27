import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { EntityTarget, ObjectLiteral } from 'typeorm';

import { TenantTransactionManager } from './tenant-transaction.manager';
import { RlsCrudService } from './rls-crud.service';

/**
 * Forma extendida de una entrada de registro: además de la entidad
 * "pelada" (la mayoría de los recursos), permite declarar qué
 * propiedades están encriptadas en la base (ver
 * proposed-clinical-encryption.sql) para que RlsCrudService las
 * encripte/desencripte automáticamente en vez de pasarlas crudas.
 */
export interface EncryptedResourceEntry {
  entity: EntityTarget<ObjectLiteral>;
  encryptedFields: string[];
}

export type ResourceRegistryEntry =
  EntityTarget<ObjectLiteral> | EncryptedResourceEntry;

function isEncryptedEntry(
  entry: ResourceRegistryEntry,
): entry is EncryptedResourceEntry {
  return typeof entry === 'object' && entry !== null && 'entity' in entry;
}

/**
 * Fábrica de un controller CRUD genérico montado en `<prefix>/:resource`,
 * usada una vez por módulo con su propio registro de entidades (ver
 * <modulo>.registry.ts). Evita repetir ~80 líneas casi idénticas en cada
 * uno de los 7 módulos que la usan.
 */
export function createResourceController(
  prefix: string,
  registry: Record<string, ResourceRegistryEntry>,
) {
  @ApiTags(prefix)
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Controller(prefix)
  class ResourceController {
    constructor(private readonly txManager: TenantTransactionManager) {}

    private resolve(resource: string): RlsCrudService<ObjectLiteral> {
      const entry = registry[resource];
      if (!entry) {
        throw new NotFoundException(
          `Recurso desconocido en ${prefix}: ${resource}`,
        );
      }
      if (isEncryptedEntry(entry)) {
        return new RlsCrudService(
          this.txManager,
          entry.entity,
          entry.encryptedFields,
        );
      }
      return new RlsCrudService(this.txManager, entry);
    }

    @Get(':resource')
    findAll(
      @Param('resource') resource: string,
      @Query() query: Record<string, string>,
    ) {
      return this.resolve(resource).findAll(query);
    }

    @Get(':resource/:id')
    findOne(@Param('resource') resource: string, @Param('id') id: string) {
      return this.resolve(resource).findOne(id);
    }

    @Post(':resource')
    create(
      @Param('resource') resource: string,
      @Body() body: Record<string, unknown>,
    ) {
      return this.resolve(resource).create(body);
    }

    @Patch(':resource/:id')
    update(
      @Param('resource') resource: string,
      @Param('id') id: string,
      @Body() body: Record<string, unknown>,
    ) {
      return this.resolve(resource).update(id, body);
    }

    @Delete(':resource/:id')
    remove(@Param('resource') resource: string, @Param('id') id: string) {
      return this.resolve(resource).remove(id);
    }
  }

  return ResourceController;
}
