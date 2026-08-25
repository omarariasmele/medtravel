import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';

import { CatalogValueEntity } from './entities/catalog-value.entity';
import { DomainCatalogEntity } from './entities/domain-catalog.entity';

/**
 * Qué tabla/columna clínica referencia cada dominio de catálogo
 * gobernado — necesario para reasignar los registros existentes al
 * fusionar dos valores duplicados. Domain code → {table, column}.
 * Agregar un dominio nuevo acá es la única forma de habilitar su
 * fusión desde catalogs-admin.page.tsx.
 */
const MERGEABLE_DOMAINS: Record<string, { table: string; column: string }> = {
  ALLERGEN: { table: 'clinical.allergies', column: 'allergen_catalog_id' },
  MEDICATION: { table: 'clinical.medications', column: 'medication_catalog_id' },
  CONDITION_CATALOG: { table: 'clinical.conditions', column: 'condition_catalog_id' },
  SURGERY_CATALOG: { table: 'clinical.surgeries', column: 'procedure_catalog_id' },
  IMPLANT_TYPE: { table: 'clinical.implants_devices', column: 'device_type_id' },
  TREATMENT_TYPE: { table: 'clinical.treatments', column: 'treatment_catalog_id' },
};

/**
 * Pedido explícito del usuario: cuando dos valores de catálogo
 * terminan siendo el mismo concepto con distinta grafía (ej.
 * "Amoxicilina" vs "amoxicilina 500mg" creado por un usuario), un
 * operador tiene que poder fusionarlos — todos los registros clínicos
 * que ya apuntaban al duplicado pasan a apuntar al valor elegido como
 * canónico, y el duplicado se borra de la tabla (pedido explícito del
 * usuario: "debería eliminar dejando solo el registro principal... para
 * que no queden registros con cualquier cosa en las tablas" — a
 * diferencia del resto del sistema clínico, acá NO aplica el criterio
 * de retención histórica: es seguro borrarlo de verdad porque ya no
 * queda ninguna fila apuntándolo, se reasignó todo arriba).
 */
@Injectable()
export class CatalogMergeService {
  constructor(private readonly txManager: TenantTransactionManager) {}

  async merge(sourceId: string, targetId: string): Promise<{ ok: true }> {
    if (sourceId === targetId) {
      throw new BadRequestException('No se puede fusionar un valor consigo mismo.');
    }

    return this.txManager.runInTransaction(async (queryRunner) => {
      const [source, target] = await Promise.all([
        queryRunner.manager.findOne(CatalogValueEntity, { where: { id: sourceId } }),
        queryRunner.manager.findOne(CatalogValueEntity, { where: { id: targetId } }),
      ]);
      if (!source || !target) {
        throw new NotFoundException('Alguno de los dos valores de catálogo no existe.');
      }
      if (source.domainId !== target.domainId) {
        throw new BadRequestException('Los dos valores tienen que ser del mismo dominio.');
      }

      const domain = await queryRunner.manager.findOne(DomainCatalogEntity, {
        where: { id: source.domainId },
      });
      const mapping = domain ? MERGEABLE_DOMAINS[domain.code] : undefined;
      if (!mapping) {
        throw new BadRequestException(
          `La fusión todavía no está soportada para el dominio '${domain?.code ?? source.domainId}'.`,
        );
      }

      await queryRunner.query(
        `UPDATE ${mapping.table} SET ${mapping.column} = $1 WHERE ${mapping.column} = $2`,
        [targetId, sourceId],
      );
      // En este punto ya no queda ninguna fila clínica apuntando al
      // duplicado (se reasignó arriba) — se borra de verdad, no solo se
      // retira, para que la tabla de catálogo no acumule registros
      // fusionados dando vueltas.
      await queryRunner.manager.delete(CatalogValueEntity, sourceId);

      return { ok: true };
    });
  }
}
