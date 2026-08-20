import { Injectable, NotFoundException } from '@nestjs/common';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';

import { CatalogValueEntity } from './entities/catalog-value.entity';
import { DomainCatalogEntity } from './entities/domain-catalog.entity';

export interface ResolvedCatalogValue {
  id: string;
  code: string;
  labelEs: string;
  created: boolean;
}

function slugify(text: string): string {
  const base = text
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // acentos
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return base || 'VALOR';
}

/**
 * Pedido explícito del usuario: alergias/medicamentos/implantes/
 * enfermedades/cirugías deben poder cargarse eligiendo de una tabla; si
 * el texto no matchea nada, se crea una entrada nueva (marcada `DRAFT`
 * en `lifecycle_status`, pero ya utilizable — un operador la revisa/
 * corrige/fusiona después desde Catálogos, ver `catalogs-admin.page.tsx`).
 *
 * Mismo criterio de normalización/match que ya usaba el trigger
 * `clinical.prevent_duplicate_condition()` (lower/trim + coincidencia
 * de subcadena en cualquier sentido) — así el mismo "diabetes" vs
 * "diabetes tipo 2" no genera dos entradas de catálogo distintas.
 */
@Injectable()
export class CatalogResolutionService {
  constructor(private readonly txManager: TenantTransactionManager) {}

  async resolveOrCreate(
    domainCode: string,
    rawText: string,
  ): Promise<ResolvedCatalogValue> {
    const trimmed = rawText.trim();
    const normalized = trimmed.toLowerCase();

    return this.txManager.runInTransaction(async (queryRunner) => {
      const domain = await queryRunner.manager.findOne(DomainCatalogEntity, {
        where: { code: domainCode },
      });
      if (!domain) {
        throw new NotFoundException(
          `No existe params.domain_catalogs con code='${domainCode}'`,
        );
      }

      const candidates = await queryRunner.manager.find(CatalogValueEntity, {
        where: { domainId: domain.id, active: true },
      });
      const match = candidates.find((c) => {
        const label = c.labelEs.trim().toLowerCase();
        return (
          label === normalized ||
          label.startsWith(normalized) ||
          normalized.startsWith(label)
        );
      });
      if (match) {
        return {
          id: match.id,
          code: match.code,
          labelEs: match.labelEs,
          created: false,
        };
      }

      let code = slugify(trimmed);
      const existingCodes = new Set(candidates.map((c) => c.code));
      if (existingCodes.has(code)) {
        code = `${code}_${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      }

      const created = await queryRunner.manager.save(
        CatalogValueEntity,
        queryRunner.manager.create(CatalogValueEntity, {
          domainId: domain.id,
          code,
          labelEs: trimmed,
          displayOrder: 999,
          lifecycleStatus: 'DRAFT',
          active: true,
          metadata: {},
        }),
      );

      return {
        id: created.id,
        code: created.code,
        labelEs: created.labelEs,
        created: true,
      };
    });
  }
}
