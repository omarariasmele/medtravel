// Debe cargarse antes que cualquier otro import: algunos decoradores
// (ej. @WebSocketGateway en events.gateway.ts) leen process.env directo
// al evaluarse la clase, al importar AppModule más abajo — más tarde que
// esto, ConfigModule.forRoot() ya no llega a tiempo para esos casos.
import 'dotenv/config';

import { join } from 'path';

import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
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
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  app.use(helmet());
  // Fase 1 — logos de marca por empresa: a diferencia de uploads/avatars
  // (dato personal, servido solo autenticado vía patient-photo.controller),
  // esto NO es sensible — se sirve público a propósito, para que
  // Image.network (mobile, sin poder mandar headers de auth) y el
  // <img> del panel lo muestren sin volver a autenticar cada request.
  app.useStaticAssets(join(process.cwd(), 'uploads', 'tenant-brands'), {
    prefix: '/uploads/tenant-brands',
    // helmet() de arriba pone Cross-Origin-Resource-Policy: same-origin
    // por defecto — bloquearía el <img> de admin-web (puerto/origen
    // distinto al de la API) aunque el archivo sea público a propósito.
    setHeaders: (res) => res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'),
  });
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
