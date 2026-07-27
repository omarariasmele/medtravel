import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';
import { CurrentContext } from '@common/request-context/current-context.decorator';
import { RequestContextData } from '@common/request-context/request-context.types';

import { resolveMemberId } from './me-member.helper';
import { CreateTripDto } from './dto/create-trip.dto';

@ApiTags('me')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('me/trips')
export class MeTripsController {
  constructor(private readonly txManager: TenantTransactionManager) {}

  @Get()
  async list(@CurrentContext() context: RequestContextData) {
    return this.txManager.runInTransaction((queryRunner) =>
      queryRunner.query(
        `SELECT t.id, t.trip_name, t.trip_start, t.trip_end, t.status_id, t.notes
         FROM operations.trips t
         JOIN core.members m ON m.id = t.member_id
         WHERE m.person_id = $1
         ORDER BY t.trip_start DESC`,
        [context.personId],
      ),
    );
  }

  @Post()
  async create(
    @CurrentContext() context: RequestContextData,
    @Body() dto: CreateTripDto,
  ) {
    return this.txManager.runInTransaction(async (queryRunner) => {
      const memberId = await resolveMemberId(
        queryRunner,
        context.personId!,
        dto.memberId,
      );

      const rows = await queryRunner.query(
        `INSERT INTO operations.trips (member_id, trip_name, trip_start, trip_end, status_id, notes)
         VALUES ($1, $2, $3, $4, params.catalog_id('TRIP_STATUS', 'PLANNED'), $5)
         RETURNING id, trip_name, trip_start, trip_end, status_id, notes`,
        [
          memberId,
          dto.tripName ?? null,
          dto.tripStart,
          dto.tripEnd,
          dto.notes ?? null,
        ],
      );
      return rows[0];
    });
  }
}
