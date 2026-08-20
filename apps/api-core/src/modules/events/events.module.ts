import { Module } from '@nestjs/common';

import { AuthModule } from '@modules/auth/auth.module';
import { AIModule } from '@modules/ai/ai.module';

import { EventsGateway } from './events.gateway';

@Module({
  imports: [AuthModule, AIModule], // AuthModule reexporta JwtModule (handshake); AIModule para la IA del chat de emergencia
  providers: [EventsGateway],
  exports: [EventsGateway],
})
export class EventsModule {}
