import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

/**
 * Salas por `case_id` (operations.emergency_cases) — un caso ↔ una sala,
 * usada para operations.chat_messages y actualizaciones de estado/ubicación
 * del caso en tiempo real. La autenticación del socket (JWT en el
 * handshake) y la verificación de membresía en case_participants quedan
 * como TODO — hoy cualquier cliente conectado puede unirse a `join_case`,
 * lo cual NO es seguro para producción.
 */
@WebSocketGateway({
  cors: { origin: true, credentials: true },
  namespace: 'cases',
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);

  handleConnection(client: Socket): void {
    this.logger.debug(`Cliente conectado: ${client.id}`);
    // TODO: validar JWT del handshake y poblar client.data con el RequestContext.
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Cliente desconectado: ${client.id}`);
  }

  @SubscribeMessage('join_case')
  handleJoinCase(
    @MessageBody() caseId: string,
    @ConnectedSocket() client: Socket,
  ): void {
    // TODO: verificar que el cliente es un case_participant activo antes de unirlo.
    client.join(`case:${caseId}`);
  }

  @SubscribeMessage('leave_case')
  handleLeaveCase(
    @MessageBody() caseId: string,
    @ConnectedSocket() client: Socket,
  ): void {
    client.leave(`case:${caseId}`);
  }

  /** Emite un mensaje de chat nuevo a todos los participantes conectados a la sala del caso. */
  emitChatMessage(caseId: string, message: unknown): void {
    this.server.to(`case:${caseId}`).emit('chat_message', message);
  }

  /** Emite un cambio de estado/ubicación del caso a los participantes conectados. */
  emitCaseUpdate(caseId: string, update: unknown): void {
    this.server.to(`case:${caseId}`).emit('case_update', update);
  }
}
