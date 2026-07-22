import { Module } from '@nestjs/common';

import { AuthModule } from '@modules/auth/auth.module';

import { EventsGateway } from './events.gateway';

@Module({
  imports: [AuthModule], // reexporta JwtModule, que EventsGateway necesita para verificar el handshake
  providers: [EventsGateway],
  exports: [EventsGateway],
})
export class EventsModule {}
