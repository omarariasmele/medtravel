import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EmergencyProfileEntity } from './entities/emergency-profile.entity';
import { EmergencyTokenEntity } from './entities/emergency-token.entity';
import { SignedOfflineAccessEntity } from './entities/signed-offline-access.entity';
import { EmergencyAccessLogEntity } from './entities/emergency-access-log.entity';
import { TokenUsageLogEntity } from './entities/token-usage-log.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EmergencyProfileEntity,
      EmergencyTokenEntity,
      SignedOfflineAccessEntity,
      EmergencyAccessLogEntity,
      TokenUsageLogEntity,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class EmergencyModule {}
