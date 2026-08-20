// Debe cargarse antes que cualquier otro import: algunos decoradores
// (ej. @WebSocketGateway en events.gateway.ts) leen process.env directo
// al evaluarse la clase, al importar AppModule más abajo — más tarde que
// esto, ConfigModule.forRoot() ya no llega a tiempo para esos casos.
import 'dotenv/config';

import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';

import { AppModule } from './app.module';

/**
 * Pedido explícito del usuario: el estado del viaje (Planificado/
 * Completado) tiene que reflejar la fecha real, no quedarse fijo en
 * Planificado para siempre. No hay infraestructura de cron en esta
 * app — se sincroniza también al abrir "Mis viajes" (ver
 * MeTripsController.list), pero admin-web (Dashboard, listado de
 * viajes) no pasa por ahí, así que sin esto podía mostrar datos viejos
 * si ningún viajero abrió la app ese día. Un `setInterval` liviano
 * alcanza para esta escala — evita sumar una dependencia nueva
 * (@nestjs/schedule) solo para un UPDATE barato que además solo toca
 * las filas que cambiaron.
 */
function scheduleTripStatusSync(app: Awaited<ReturnType<typeof NestFactory.create>>) {
  const txManager = app.get(TenantTransactionManager);
  const sync = () =>
    txManager
      .runInTransaction((queryRunner) => queryRunner.query('SELECT operations.sync_trip_statuses()'))
      .catch(() => {
        // No bloquea el arranque ni tumba el server por esto — se
        // reintenta en la próxima vuelta del interval.
      });
  sync();
  setInterval(sync, 60 * 60 * 1000);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.use(helmet());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const extraOrigins =
    config
      .get<string>('CORS_EXTRA_ORIGINS')
      ?.split(',')
      .map((o) => o.trim()) ?? [];
  app.enableCors({
    origin: [config.get<string>('CORS_ORIGIN')!, ...extraOrigins],
    credentials: true,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('MedTravelApp API')
    .setDescription('Schema SQL v1.2.3 — OYS GROUP S.A.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  scheduleTripStatusSync(app);

  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);
}

bootstrap();
