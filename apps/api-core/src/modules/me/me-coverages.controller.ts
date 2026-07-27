import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';
import { CurrentContext } from '@common/request-context/current-context.decorator';
import { RequestContextData } from '@common/request-context/request-context.types';

/**
 * Junta coverage.health_coverages (obra social/prepaga) y
 * coverage.travel_assistance_certificates (asistencia al viajero) en
 * una sola respuesta — el brief las pide como "coberturas" sin
 * distinguir origen desde la perspectiva del viajero. Filtra
 * explícitamente por member_id del propio person_id (no solo confía en
 * hc_select, que también deja ver coberturas de members ajenos si el
 * tenant tiene consentimiento — eso es para el lado operador, acá es
 * estrictamente "lo mío").
 */
@ApiTags('me')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('me/coverages')
export class MeCoveragesController {
  constructor(private readonly txManager: TenantTransactionManager) {}

  @Get()
  async list(@CurrentContext() context: RequestContextData) {
    return this.txManager.runInTransaction(async (queryRunner) => {
      const healthCoverages = await queryRunner.query(
        `SELECT hc.id, hc.coverage_name, hc.coverage_type_id, hc.provider_name,
                hc.policy_number, hc.valid_from, hc.valid_until, hc.status_id,
                hc.is_primary
         FROM coverage.health_coverages hc
         JOIN core.members m ON m.id = hc.member_id
         WHERE m.person_id = $1`,
        [context.personId],
      );

      const certificates = await queryRunner.query(
        `SELECT cert.id, cert.certificate_number, cert.valid_from,
                cert.valid_until, cert.status_id
         FROM coverage.travel_assistance_certificates cert
         JOIN core.members m ON m.id = cert.member_id
         WHERE m.person_id = $1`,
        [context.personId],
      );

      return { healthCoverages, travelAssistanceCertificates: certificates };
    });
  }
}
