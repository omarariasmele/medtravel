import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { QueryRunner } from 'typeorm';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';
import { CurrentContext } from '@common/request-context/current-context.decorator';
import { RequestContextData } from '@common/request-context/request-context.types';
import { AIService } from '@modules/ai/ai.service';

import { resolveMemberId } from './me-member.helper';
import { CreateTripDto, TripDestinationDto } from './dto/create-trip.dto';
import { UpdateTripDto } from './dto/update-trip.dto';

const TRIP_LIST_SELECT = `
  SELECT t.id, t.trip_name, t.trip_start, t.trip_end, t.status_id, t.notes,
         COALESCE(
           json_agg(
             json_build_object(
               'id', td.id, 'countryId', td.country_id, 'countryLabel', cv.label_es, 'city', td.city,
               'arrivalDate', td.arrival_date, 'departureDate', td.departure_date
             ) ORDER BY td.sequence_order
           ) FILTER (WHERE td.id IS NOT NULL),
           '[]'
         ) AS destinations
  FROM operations.trips t
  LEFT JOIN operations.trip_destinations td ON td.trip_id = t.id
  LEFT JOIN params.catalog_values cv ON cv.id = td.country_id
`;

/**
 * Un viaje ahora puede tener VARIOS destinos (pedido explícito del
 * usuario: "el viaje es a varios países... como alerta la IA sobre
 * requerimientos y prevención") — ya insertaba una fila por destino
 * en operations.trip_destinations (sequence_order), pero el alta/
 * edición y la consulta de info solo usaban una. Se reemplazan los
 * dos campos sueltos destinationCountryId/destinationCity por un
 * array `destinations` — todos comparten las fechas del viaje por
 * ahora (itinerario con fecha propia por destino queda fuera de
 * alcance).
 */
async function replaceDestinations(
  queryRunner: QueryRunner,
  tripId: string,
  memberId: string,
  destinations: TripDestinationDto[],
  arrivalDate: string,
  departureDate: string,
) {
  await queryRunner.query(`DELETE FROM operations.trip_destinations WHERE trip_id = $1`, [tripId]);
  for (let i = 0; i < destinations.length; i++) {
    await queryRunner.query(
      `INSERT INTO operations.trip_destinations
         (trip_id, member_id, country_id, city, arrival_date, departure_date, sequence_order, status_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, params.catalog_id('DESTINATION_STATUS', 'ACTIVE'))`,
      [tripId, memberId, destinations[i].countryId, destinations[i].city, arrivalDate, departureDate, i + 1],
    );
  }
}

@ApiTags('me')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('me/trips')
export class MeTripsController {
  constructor(
    private readonly txManager: TenantTransactionManager,
    private readonly aiService: AIService,
  ) {}

  /**
   * Pedido explícito del usuario: el estado del viaje tiene que ser
   * real (Planificado/Completado), no algo que se queda fijo en
   * Planificado para siempre — sin un cron en esta app, se sincroniza
   * acá (barato: UPDATE con WHERE que solo toca lo que cambió) cada vez
   * que el viajero abre "Mis viajes", que es el punto de entrada más
   * frecuente. Ver también operations.sync_trip_statuses() llamado
   * periódicamente desde main.ts para que admin-web tampoco vea datos
   * viejos aunque el viajero no haya abierto la app.
   */
  @Get()
  async list(@CurrentContext() context: RequestContextData) {
    return this.txManager.runInTransaction(async (queryRunner) => {
      await queryRunner.query('SELECT operations.sync_trip_statuses()');
      return queryRunner.query(
        `${TRIP_LIST_SELECT}
         JOIN core.members m ON m.id = t.member_id
         WHERE m.person_id = $1
         GROUP BY t.id, t.trip_name, t.trip_start, t.trip_end, t.status_id, t.notes
         ORDER BY t.trip_start DESC`,
        [context.personId],
      );
    });
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

      // Ver comentario en PostgresQueryRunner.query(): para UPDATE
      // devuelve [filas, cantidad], pero para INSERT devuelve el
      // array de filas directo — este destructuring simple es correcto acá.
      const [trip] = await queryRunner.query(
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

      if (dto.destinations?.length) {
        await replaceDestinations(queryRunner, trip.id, memberId, dto.destinations, dto.tripStart, dto.tripEnd);
      }

      const [result] = await queryRunner.query(`${TRIP_LIST_SELECT} WHERE t.id = $1 GROUP BY t.id`, [trip.id]);
      return result;
    });
  }

  /**
   * Pedido explícito del usuario: "eso puede pasar que se equivoque
   * al ingresarlo" — poder corregir un viaje ya cargado (nombre,
   * fechas, notas, destinos). Todos los campos del DTO son
   * opcionales, se actualiza solo lo que venga; `destinations`, si
   * viene, reemplaza la lista completa.
   */
  @Patch(':tripId')
  async update(
    @CurrentContext() context: RequestContextData,
    @Param('tripId') tripId: string,
    @Body() dto: UpdateTripDto,
  ) {
    return this.txManager.runInTransaction(async (queryRunner) => {
      const [trip] = await queryRunner.query(
        `SELECT t.id, t.member_id FROM operations.trips t
         JOIN core.members m ON m.id = t.member_id
         WHERE t.id = $1 AND m.person_id = $2`,
        [tripId, context.personId],
      );
      if (!trip) throw new NotFoundException('Viaje no encontrado, o no pertenece a tu cuenta.');

      // Bug real reportado en vivo: para UPDATE (a diferencia de SELECT/
      // INSERT), TypeORM devuelve [filas, cantidadAfectada] — una tupla,
      // no el array de filas directo (ver PostgresQueryRunner.query()).
      // `const [updatedTrip] = ...` desestructuraba el ARRAY DE FILAS
      // entero como si fuera la fila — updatedTrip.trip_start daba
      // undefined, y eso llegaba como NULL al INSERT del destino más
      // abajo, violando la restricción NOT NULL de arrival_date.
      const [[updatedTrip]] = await queryRunner.query(
        `UPDATE operations.trips
         SET trip_name  = COALESCE($2, trip_name),
             trip_start = COALESCE($3, trip_start),
             trip_end   = COALESCE($4, trip_end),
             notes      = COALESCE($5, notes)
         WHERE id = $1
         RETURNING id, trip_name, trip_start, trip_end, status_id, notes`,
        [tripId, dto.tripName ?? null, dto.tripStart ?? null, dto.tripEnd ?? null, dto.notes ?? null],
      );

      if (dto.destinations) {
        await replaceDestinations(
          queryRunner, tripId, trip.member_id, dto.destinations, updatedTrip.trip_start, updatedTrip.trip_end,
        );
      }

      const [result] = await queryRunner.query(`${TRIP_LIST_SELECT} WHERE t.id = $1 GROUP BY t.id`, [tripId]);
      return result;
    });
  }

  /**
   * Pedido explícito del usuario: al cargar un viaje, poder consultar
   * vacunas/riesgos de salud/alertas de seguridad de CADA destino del
   * viaje con un botón — no solo del primero. Devuelve un array, uno
   * por país cargado en el viaje.
   */
  @Get(':tripId/destination-info')
  async destinationInfo(
    @CurrentContext() context: RequestContextData,
    @Param('tripId') tripId: string,
    @Query('refresh') refresh?: string,
  ) {
    const destinations: { country_id: string; country_label: string }[] = await this.txManager.runInTransaction(
      (queryRunner) =>
        queryRunner.query(
          `SELECT DISTINCT td.country_id, cv.label_es AS country_label
           FROM operations.trips t
           JOIN core.members m ON m.id = t.member_id
           JOIN operations.trip_destinations td ON td.trip_id = t.id
           JOIN params.catalog_values cv ON cv.id = td.country_id
           WHERE t.id = $1 AND m.person_id = $2
           ORDER BY cv.label_es`,
          [tripId, context.personId],
        ),
    );
    if (!destinations.length) {
      throw new NotFoundException('Viaje sin destino cargado, o no pertenece a tu cuenta.');
    }

    // Un llamado por país, cada uno con su propia transacción (ver
    // getDestinationHealthInfo) — secuencial y con await real, nunca
    // en paralelo: evita abrir N transacciones simultáneas contra el
    // mismo pool de conexiones para un solo request.
    const results = [];
    for (const d of destinations) {
      const info = await this.aiService.getDestinationHealthInfo(d.country_id, refresh === 'true');
      results.push({ ...info, countryLabel: d.country_label });
    }
    return results;
  }
}
