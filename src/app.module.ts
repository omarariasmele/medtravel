import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { validateEnv } from '@config/env.validation';

import { RequestContextModule } from '@common/request-context/request-context.module';
import { PgSessionContextInterceptor } from '@common/request-context/pg-session-context.interceptor';
import { DatabaseModule } from '@common/database/database.module';

import { ParamsModule } from '@modules/params/params.module';
import { AuditModule } from '@modules/audit/audit.module';
import { IdentityModule } from '@modules/identity/identity.module';
import { CoverageModule } from '@modules/coverage/coverage.module';
import { ClinicalModule } from '@modules/clinical/clinical.module';
import { EmergencyModule } from '@modules/emergency/emergency.module';
import { OperationsModule } from '@modules/operations/operations.module';
import { AuthModule } from '@modules/auth/auth.module';
import { JobsModule } from '@modules/jobs/jobs.module';
import { EventsModule } from '@modules/events/events.module';

import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // Límite global; /auth/login usa un @Throttle() más estricto (ver
    // auth.controller.ts) para no depender solo del lockout por intentos
    // fallidos de AuthService.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    RequestContextModule,
    DatabaseModule,
    AuthModule,
    JobsModule,
    EventsModule,
    ParamsModule,
    AuditModule,
    IdentityModule,
    CoverageModule,
    ClinicalModule,
    EmergencyModule,
    OperationsModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: PgSessionContextInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
