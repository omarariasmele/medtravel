import { Injectable, NotFoundException } from '@nestjs/common';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';

import { CatalogValueEntity } from './entities/catalog-value.entity';
import { DomainCatalogEntity } from './entities/domain-catalog.entity';
import { CatalogValueResponseDto } from './dto/catalog-value-response.dto';

/**
 * Vertical slice de referencia: prueba de punta a punta que
 * TenantTransactionManager efectivamente abre una transacción, setea las
 * GUCs de sesión (app.current_tenant_id, etc.) y que los repos leen contra
 * esa misma conexión. params.catalog_values no tiene RLS habilitado en el
 * schema (a diferencia de audit/clinical/coverage), pero se lo hace pasar
 * igual por el mismo camino que el resto de los módulos para no tener dos
 * patrones de acceso a datos distintos en la app.
 */
@Injectable()
export class CatalogsService {
  constructor(private readonly txManager: TenantTransactionManager) {}

  async findActiveValuesByDomain(
    domainCode: string,
    tenantId?: string,
  ): Promise<CatalogValueResponseDto[]> {
    return this.txManager.runInTransaction(async (queryRunner) => {
      const domain = await queryRunner.manager.findOne(DomainCatalogEntity, {
        where: { code: domainCode },
      });
      if (!domain) {
        throw new NotFoundException(
          `No existe params.domain_catalogs con code='${domainCode}'`,
        );
      }

      const qb = queryRunner.manager
        .createQueryBuilder(CatalogValueEntity, 'cv')
        .where('cv.domain_id = :domainId', { domainId: domain.id })
        .andWhere('cv.active = TRUE')
        .andWhere("cv.lifecycle_status = 'ACTIVE'")
        .orderBy('cv.display_order', 'ASC');

      if (tenantId) {
        qb.andWhere('(cv.tenant_id = :tenantId OR cv.tenant_id IS NULL)', {
          tenantId,
        });
      } else {
        qb.andWhere('cv.tenant_id IS NULL');
      }

      const values = await qb.getMany();

      return values.map((value) => ({
        id: value.id,
        code: value.code,
        labelEs: value.labelEs,
        labelEn: value.labelEn,
        displayOrder: value.displayOrder,
        isDefault: value.isDefault,
        metadata: value.metadata,
      }));
    });
  }
}
