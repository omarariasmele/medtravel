import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
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

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';
import { JwtPayload } from '@modules/auth/jwt-payload.interface';
import { AIService } from '@modules/ai/ai.service';

interface SocketUser {
  userId: string;
  personId?: string;
}

interface JoinCasePayload {
  caseId: string;
}

interface SendMessagePayload {
  caseId: string;
  channelId: string;
  content: string;
}

interface ActiveParticipant {
  canSendMessages: boolean;
  senderName: string;
  senderTypeCode: 'MEMBER' | 'OPERATOR';
}

/**
 * Salas por `case_id` (operations.emergency_cases) — un caso ↔ una sala.
 * El handshake se autentica con el mismo JWT que el resto de la API
 * (`client.handshake.auth.token`); unirse a una sala y enviar mensajes
 * requiere ser un case_participant ACTIVO de ese caso
 * (operations.case_participants) — verificado en cada join Y en cada
 * envío (no solo al conectar: can_send_messages puede cambiar mientras
 * el socket sigue abierto). operations.case_participants no tiene RLS
 * propia en el schema (a diferencia de chat_messages), así que este
 * chequeo de membresía lo hace la app explícitamente, no Postgres.
 */
@WebSocketGateway({
  // process.env directo (no ConfigService): este decorador se evalúa al
  // importar la clase, antes de que Nest arranque el DI container — ver
  // el import 'dotenv/config' en main.ts que lo deja disponible a tiempo.
  cors: {
    origin: [
      process.env.CORS_ORIGIN!,
      ...(process.env.CORS_EXTRA_ORIGINS?.split(',').map((o) => o.trim()) ??
        []),
    ],
    credentials: true,
  },
  namespace: 'cases',
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly txManager: TenantTransactionManager,
    private readonly aiService: AIService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const token = this.extractToken(client);
    if (!token) {
      this.logger.warn(`Conexión sin token — desconectando ${client.id}`);
      client.disconnect(true);
      return;
    }
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      const user: SocketUser = {
        userId: payload.sub,
        personId: payload.personId,
      };
      client.data.user = user;
      this.logger.debug(
        `Cliente autenticado: ${client.id} (user ${user.userId})`,
      );
    } catch {
      this.logger.warn(`Token inválido — desconectando ${client.id}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Cliente desconectado: ${client.id}`);
  }

  @SubscribeMessage('join_case')
  async handleJoinCase(
    @MessageBody() payload: JoinCasePayload,
    @ConnectedSocket() client: Socket,
  ): Promise<{ ok: boolean; error?: string }> {
    let participant = await this.findActiveParticipant(
      client,
      payload.caseId,
    );
    if (!participant) {
      participant = await this.tryAutoJoinAsOperator(client, payload.caseId);
    }
    if (!participant) {
      return { ok: false, error: 'No sos participante activo de este caso' };
    }
    client.join(`case:${payload.caseId}`);
    return { ok: true };
  }

  @SubscribeMessage('leave_case')
  handleLeaveCase(
    @MessageBody() payload: JoinCasePayload,
    @ConnectedSocket() client: Socket,
  ): void {
    client.leave(`case:${payload.caseId}`);
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @MessageBody() payload: SendMessagePayload,
    @ConnectedSocket() client: Socket,
  ): Promise<{ ok: boolean; error?: string; message?: unknown }> {
    const user = client.data.user as SocketUser;
    const participant = await this.findActiveParticipant(
      client,
      payload.caseId,
    );
    if (!participant) {
      return { ok: false, error: 'No sos participante activo de este caso' };
    }
    if (!participant.canSendMessages) {
      return {
        ok: false,
        error: 'No autorizado para enviar mensajes en este caso',
      };
    }
    if (await this.isCaseClosed(payload.caseId, user)) {
      return {
        ok: false,
        error: 'Este caso ya está cerrado — no se pueden enviar más mensajes',
      };
    }

    try {
      const message = await this.txManager.runInTransaction(
        async (queryRunner) => {
          const rows = await queryRunner.query(
            `INSERT INTO operations.chat_messages
               (channel_id, case_id, sender_type_id, sender_id, sender_name,
                message_type_id, content, status_id)
             SELECT
               $1, $2,
               (SELECT cv.id FROM params.catalog_values cv
                  JOIN params.domain_catalogs dc ON cv.domain_id = dc.id
                  WHERE dc.code = 'CHAT_SENDER_TYPE' AND cv.code = $3),
               $4, $5,
               (SELECT cv.id FROM params.catalog_values cv
                  JOIN params.domain_catalogs dc ON cv.domain_id = dc.id
                  WHERE dc.code = 'CHAT_MESSAGE_TYPE' AND cv.code = 'TEXT'),
               $6,
               (SELECT cv.id FROM params.catalog_values cv
                  JOIN params.domain_catalogs dc ON cv.domain_id = dc.id
                  WHERE dc.code = 'CHAT_MESSAGE_STATUS' AND cv.code = 'SENT')
             RETURNING *`,
            [
              payload.channelId,
              payload.caseId,
              participant.senderTypeCode,
              user.userId,
              participant.senderName,
              payload.content,
            ],
          );

          await queryRunner.query(
            `UPDATE operations.chat_channels
             SET message_count = message_count + 1,
                 last_message_at = NOW(),
                 last_message_preview = $2
             WHERE id = $1`,
            [payload.channelId, payload.content.slice(0, 100)],
          );

          return rows[0];
        },
        { userId: user.userId, personId: user.personId },
      );

      this.emitChatMessage(payload.caseId, message);

      // Pedido explícito del usuario: la IA sigue contestando mientras
      // nadie humano tomó el caso — se dispara aparte (sin await en el
      // ack al viajero, para no sumarle la latencia de OpenAI a cada
      // mensaje) y respondInEmergencyChat ya se abstiene sola si hay
      // un operador activo o si la IA está deshabilitada.
      if (participant.senderTypeCode === 'MEMBER') {
        this.aiService
          .respondInEmergencyChat(payload.caseId)
          .then((aiMessage) => {
            if (aiMessage) this.emitChatMessage(payload.caseId, aiMessage);
          })
          .catch((error) => {
            this.logger.error(
              `Error generando respuesta de IA para el caso ${payload.caseId}: ${(error as Error).message}`,
            );
          });
      }

      return { ok: true, message };
    } catch (error) {
      this.logger.error(`Error enviando mensaje: ${(error as Error).message}`);
      return { ok: false, error: 'No se pudo enviar el mensaje' };
    }
  }

  /**
   * Un caso RESOLVED/CLOSED no debería seguir recibiendo mensajes —
   * cerrarlo no tocaba can_send_messages en ningún lado (ni RLS ni acá),
   * así que el chat quedaba abierto para siempre. Reportado por el
   * usuario probando en la app. Mismos códigos que
   * emergency-cases.controller.ts::CLOSING_STATUS_CODES.
   */
  private async isCaseClosed(
    caseId: string,
    user: SocketUser,
  ): Promise<boolean> {
    const rows = await this.txManager.runInTransaction(
      (queryRunner) =>
        queryRunner.query(
          `SELECT cv.code FROM operations.emergency_cases ec
           JOIN params.catalog_values cv ON cv.id = ec.status_id
           WHERE ec.id = $1`,
          [caseId],
        ),
      { userId: user.userId, personId: user.personId },
    );
    const code = rows[0]?.code as string | undefined;
    return code === 'RESOLVED' || code === 'CLOSED';
  }

  /**
   * Un operador con acceso al tenant del caso (o administrador de
   * plataforma, gap #59) puede sumarse a la sala de chat aunque
   * todavía no sea case_participant — se agrega automáticamente al
   * primer join, mismo criterio de autorización que ya usa
   * case_participants_insert (core.has_tenant_access). Un viajero
   * NUNCA se auto-agrega por acá: su alta como participante es
   * exclusiva de operations.create_member_emergency_case().
   */
  private async tryAutoJoinAsOperator(
    client: Socket,
    caseId: string,
  ): Promise<ActiveParticipant | null> {
    const user = client.data.user as SocketUser | undefined;
    if (!user) {
      return null;
    }

    return this.txManager.runInTransaction(
      async (queryRunner) => {
        const operatorRows = await queryRunner.query(
          `SELECT first_name, last_name FROM operations.operators WHERE user_id = $1`,
          [user.userId],
        );
        const operator = operatorRows[0];
        if (!operator) {
          return null;
        }

        const participantTypeRows = await queryRunner.query(
          `SELECT cv.id FROM params.catalog_values cv
           JOIN params.domain_catalogs dc ON cv.domain_id = dc.id
           WHERE dc.code = 'CASE_PARTICIPANT_TYPE' AND cv.code = 'OPERATOR'`,
        );
        const participantTypeId = participantTypeRows[0]?.id;
        if (!participantTypeId) {
          this.logger.warn(
            `Catálogo CASE_PARTICIPANT_TYPE/OPERATOR no encontrado — no se pudo auto-agregar al operador`,
          );
          return null;
        }

        const senderName = `${operator.first_name} ${operator.last_name}`;
        try {
          await queryRunner.query(
            `INSERT INTO operations.case_participants
               (case_id, participant_type_id, operator_id, display_name,
                can_send_messages, can_send_files, joined_at)
             VALUES ($1, $2, $3, $4, TRUE, TRUE, NOW())`,
            [caseId, participantTypeId, user.userId, senderName],
          );
        } catch (error) {
          // RLS lo rechaza si el operador no tiene acceso al tenant del
          // caso — no es un error real, solo "no puede sumarse".
          this.logger.debug(
            `No se pudo auto-agregar como participante: ${(error as Error).message}`,
          );
          return null;
        }

        return {
          canSendMessages: true,
          senderName,
          senderTypeCode: 'OPERATOR',
        };
      },
      { userId: user.userId, personId: user.personId },
    );
  }

  /**
   * Resuelve si el usuario conectado es un case_participant activo del
   * caso, y con qué identidad (titular vía core.persons, u operador vía
   * operations.operators) — necesario para sender_name/sender_type_id al
   * enviar un mensaje.
   */
  private async findActiveParticipant(
    client: Socket,
    caseId: string,
  ): Promise<ActiveParticipant | null> {
    const user = client.data.user as SocketUser | undefined;
    if (!user) {
      return null;
    }

    return this.txManager.runInTransaction(
      async (queryRunner) => {
        const participantRows = await queryRunner.query(
          `SELECT cp.id, cp.can_send_messages, cp.member_id, cp.operator_id
           FROM operations.case_participants cp
           WHERE cp.case_id = $1 AND cp.is_active = TRUE
             AND (
               cp.member_id IN (SELECT id FROM core.members WHERE person_id = $2)
               OR cp.operator_id = $3
             )
           LIMIT 1`,
          [caseId, user.personId ?? null, user.userId],
        );

        const row = participantRows[0];
        if (!row) {
          return null;
        }

        let senderName = 'Usuario';
        let senderTypeCode: ActiveParticipant['senderTypeCode'] = 'MEMBER';

        if (row.member_id && user.personId) {
          const personRows = await queryRunner.query(
            `SELECT core.decrypt_pii(first_name) AS first_name,
                    core.decrypt_pii(last_name) AS last_name
             FROM core.persons WHERE id = $1`,
            [user.personId],
          );
          if (personRows[0]) {
            senderName = `${personRows[0].first_name} ${personRows[0].last_name}`;
          }
          senderTypeCode = 'MEMBER';
        } else if (row.operator_id) {
          const operatorRows = await queryRunner.query(
            `SELECT first_name, last_name FROM operations.operators WHERE user_id = $1`,
            [user.userId],
          );
          if (operatorRows[0]) {
            senderName = `${operatorRows[0].first_name} ${operatorRows[0].last_name}`;
          }
          senderTypeCode = 'OPERATOR';
        }

        return {
          canSendMessages: row.can_send_messages,
          senderName,
          senderTypeCode,
        };
      },
      { userId: user.userId, personId: user.personId },
    );
  }

  private extractToken(client: Socket): string | undefined {
    const authToken = client.handshake.auth?.token as string | undefined;
    if (authToken) {
      return authToken;
    }
    const header = client.handshake.headers?.authorization;
    if (header?.startsWith('Bearer ')) {
      return header.slice(7);
    }
    return undefined;
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
