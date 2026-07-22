import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { buildTypeOrmOptions } from '@config/typeorm.config';

import { TenantTransactionManager } from './tenant-transaction.manager';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: buildTypeOrmOptions,
    }),
  ],
  providers: [TenantTransactionManager],
  exports: [TypeOrmModule, TenantTransactionManager],
})
export class DatabaseModule {}
