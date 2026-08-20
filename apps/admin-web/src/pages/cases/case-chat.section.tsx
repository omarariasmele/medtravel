import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';

import { apiClient, getAccessToken } from '../../lib/api-client';

interface ChatMessage {
  id: string;
  senderName: string;
  content: string | null;
  sentAt: string;
  senderId?: string;
}

/**
 * El historial (REST, TypeORM) llega camelCase; el socket emite el
 * row crudo de `INSERT ... RETURNING *` (snake_case) — mismo problema
 * ya resuelto en case_chat_screen.dart, acá se normaliza igual.
 */
function normalizeMessage(raw: Record<string, unknown>): ChatMessage {
  return {
    id: (raw.id ?? raw.ID) as string,
    senderName: (raw.senderName ?? raw.sender_name ?? '') as string,
    content: (raw.content ?? null) as string | null,
    sentAt: (raw.sentAt ?? raw.sent_at) as string,
    senderId: (raw.senderId ?? raw.sender_id) as string | undefined,
  };
}

/**
 * Mismo protocolo que ya usa la app móvil (case_chat_screen.dart) —
 * events.gateway.ts, namespace 'cases', join_case/send_message por
 * Socket.io. No existía ningún cliente de chat en admin-web (pedido
 * explícito del usuario, "dentro del caso se debería poder manejar el
 * chat con el usuario") — un operador que todavía no es
 * case_participant del caso se suma automáticamente al hacer join
 * (gap #59, mismo criterio de acceso que ya usa cases_access).
 */
export function CaseChatSection({
  caseId,
  readOnly,
}: {
  caseId: string;
  readOnly?: boolean;
}) {
  const [status, setStatus] = useState<'connecting' | 'joined' | 'error'>('connecting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const channelIdRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      try {
        const { data: chatInfo } = await apiClient.get<{ channelId?: string }>(
          `/operations/emergency-cases/${caseId}/chat`,
        );
        if (!chatInfo.channelId) {
          if (!cancelled) {
            setStatus('error');
            setErrorMessage('Este caso todavía no tiene una sala de chat.');
          }
          return;
        }
        channelIdRef.current = chatInfo.channelId;

        const socket = io(`${apiClient.defaults.baseURL}/cases`, {
          auth: { token: getAccessToken() },
          transports: ['websocket'],
        });
        socketRef.current = socket;

        socket.on('connect', () => {
          socket.emit(
            'join_case',
            { caseId },
            async (ack: { ok: boolean; error?: string }) => {
              if (cancelled) return;
              if (!ack.ok) {
                setStatus('error');
                setErrorMessage(ack.error ?? 'No se pudo unir al chat de este caso.');
                return;
              }
              try {
                const { data } = await apiClient.get<ChatMessage[]>('/operations/chat-messages', {
                  params: { caseId },
                });
                if (cancelled) return;
                setMessages(
                  data.slice().sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()),
                );
                setStatus('joined');
              } catch {
                if (!cancelled) {
                  setStatus('error');
                  setErrorMessage('No se pudo cargar el historial del chat.');
                }
              }
            },
          );
        });

        socket.on('chat_message', (message: Record<string, unknown>) => {
          if (cancelled) return;
          setMessages((prev) => [...prev, normalizeMessage(message)]);
        });

        socket.on('connect_error', () => {
          if (!cancelled) {
            setStatus('error');
            setErrorMessage('No se pudo conectar al chat.');
          }
        });
      } catch {
        if (!cancelled) {
          setStatus('error');
          setErrorMessage('No se pudo cargar el chat de este caso.');
        }
      }
    }

    connect();

    return () => {
      cancelled = true;
      const socket = socketRef.current;
      if (socket) {
        socket.emit('leave_case', { caseId });
        socket.disconnect();
      }
    };
  }, [caseId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = () => {
    const content = draft.trim();
    const socket = socketRef.current;
    const channelId = channelIdRef.current;
    if (!content || !socket || !channelId) return;

    setSending(true);
    socket.emit(
      'send_message',
      { caseId, channelId, content },
      (ack: { ok: boolean; error?: string }) => {
        setSending(false);
        if (ack.ok) {
          setDraft('');
        } else {
          setErrorMessage(ack.error ?? 'No se pudo enviar el mensaje.');
        }
      },
    );
  };

  return (
    <Card sx={{ mt: 2 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Chat con el viajero
        </Typography>

        {status === 'connecting' && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 2 }}>
            <CircularProgress size={20} />
            <Typography variant="body2" color="text.secondary">Conectando…</Typography>
          </Box>
        )}

        {status === 'error' && (
          <Alert severity="warning">{errorMessage}</Alert>
        )}

        {status === 'joined' && (
          <>
            <Paper
              variant="outlined"
              sx={{ height: 320, overflowY: 'auto', p: 1.5, mb: 2, bgcolor: 'action.hover' }}
            >
              {messages.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  Todavía no hay mensajes en este caso.
                </Typography>
              )}
              {messages.map((m) => {
                // sender_name viene fijo como 'Asistente de IA' desde
                // insert_system_chat_message (ai.service.ts) — se
                // distingue así porque el JSON que llega acá no trae
                // el sender_type, mismo criterio que el chat del móvil.
                const isAi = m.senderName === 'Asistente de IA';
                return (
                  <Box
                    key={m.id}
                    sx={{
                      mb: 1.5,
                      ...(isAi && {
                        bgcolor: 'secondary.light',
                        borderRadius: 1,
                        p: 1,
                      }),
                    }}
                  >
                    <Typography
                      variant="caption"
                      color={isAi ? 'text.primary' : 'text.secondary'}
                      component="div"
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                    >
                      {isAi && <SmartToyOutlinedIcon sx={{ fontSize: 13 }} />}
                      {m.senderName} · {new Date(m.sentAt).toLocaleString('es-AR')}
                    </Typography>
                    <Typography variant="body2">{m.content}</Typography>
                  </Box>
                );
              })}
              <div ref={bottomRef} />
            </Paper>

            {readOnly ? (
              <Alert severity="info">Caso cerrado — no se pueden enviar más mensajes.</Alert>
            ) : (
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                fullWidth
                size="small"
                placeholder="Escribir un mensaje…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
              <Button variant="contained" disabled={!draft.trim() || sending} onClick={handleSend}>
                Enviar
              </Button>
            </Box>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
