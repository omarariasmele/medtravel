import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';

import { apiClient } from '../../lib/api-client';
import { labelFor, useCatalog } from '../../lib/catalog-hooks';

interface CaseMedicalEvent {
  id: string;
  eventTypeId: string;
  description: string;
  performedBy?: string;
  registeredById?: string;
  eventAt: string;
}

interface Operator {
  id: string;
  firstName: string;
  lastName: string;
}

/**
 * Bitácora del caso — cada operador interviniente puede dejar una nota
 * con fecha/hora, sin importar el tipo de evento (por defecto "Nota /
 * observación general"). Se guarda en operations.case_medical_events,
 * que hasta ahora no tenía RLS propia (ver
 * proposed-case-medical-events-rls.sql) — ya con eso resuelto queda
 * scopeada al tenant del caso, igual que el resto de la información del
 * caso. Es append-only por diseño (sin GRANT de UPDATE/DELETE): un
 * historial real no se edita, se agrega una entrada nueva.
 */
export function CaseHistorySection({
  caseId,
  memberId,
  readOnly,
}: {
  caseId: string;
  memberId: string;
  readOnly?: boolean;
}) {
  const [description, setDescription] = useState('');
  const [eventTypeId, setEventTypeId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const eventTypeCatalog = useCatalog('MEDICAL_EVENT_TYPE');

  const operatorsQuery = useQuery({
    queryKey: ['operations', 'operators'],
    queryFn: async () => {
      const { data } = await apiClient.get<Operator[]>('/operations/operators');
      return data;
    },
  });

  const operatorLabel = (registeredById?: string) => {
    if (!registeredById) return null;
    const op = operatorsQuery.data?.find((o) => o.id === registeredById);
    return op ? `${op.firstName} ${op.lastName}` : null;
  };

  const listQuery = useQuery({
    queryKey: ['operations', 'case-medical-events', caseId],
    queryFn: async () => {
      const { data } = await apiClient.get<CaseMedicalEvent[]>(
        '/operations/case-medical-events',
        { params: { caseId } },
      );
      return data;
    },
  });

  const sorted = (listQuery.data ?? [])
    .slice()
    .sort((a, b) => new Date(b.eventAt).getTime() - new Date(a.eventAt).getTime());

  const createMutation = useMutation({
    mutationFn: async () => {
      const generalNote = eventTypeCatalog.data?.find((t) => t.code === 'GENERAL_NOTE');
      const { data } = await apiClient.post('/operations/case-medical-events', {
        caseId,
        memberId,
        eventTypeId: eventTypeId || generalNote?.id,
        description,
        eventAt: new Date().toISOString(),
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['operations', 'case-medical-events', caseId] });
      setDescription('');
      setEventTypeId('');
      setError(null);
    },
    onError: () => setError('No se pudo guardar la nota.'),
  });

  return (
    <Card sx={{ mt: 2 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Historial del caso
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Registro cronológico de todo lo actuado en el caso — cada operador
          interviniente deja su nota acá, con fecha, hora y qué pasó.
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {!readOnly && (
        <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'flex-start' }}>
          <TextField
            select
            label="Tipo"
            sx={{ width: 220 }}
            value={eventTypeId}
            onChange={(e) => setEventTypeId(e.target.value)}
          >
            {(eventTypeCatalog.data ?? []).map((o) => (
              <MenuItem key={o.id} value={o.id}>{o.labelEs}</MenuItem>
            ))}
          </TextField>
          <TextField
            label="Agregar nota / observación"
            fullWidth
            multiline
            minRows={1}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Button
            variant="contained"
            sx={{ whiteSpace: 'nowrap', mt: 1 }}
            disabled={!description || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            Agregar
          </Button>
        </Box>
        )}

        {listQuery.isLoading && <CircularProgress size={24} />}
        {sorted.length === 0 && (
          <Alert severity="info">Todavía no hay entradas en el historial de este caso.</Alert>
        )}
        {sorted.map((e) => (
          <Box
            key={e.id}
            sx={{ mb: 1, p: 1, borderLeft: '3px solid', borderColor: 'primary.main', bgcolor: 'action.hover', borderRadius: 1 }}
          >
            <Typography variant="caption" color="text.secondary" component="div">
              {new Date(e.eventAt).toLocaleString('es-AR')}{' '}
              <Chip size="small" label={labelFor(eventTypeCatalog.data, e.eventTypeId)} sx={{ ml: 1 }} />
              {' · '}
              {operatorLabel(e.registeredById) ?? 'Operador desconocido'}
              {e.performedBy && ` · ${e.performedBy}`}
            </Typography>
            <Typography variant="body2">{e.description}</Typography>
          </Box>
        ))}
      </CardContent>
    </Card>
  );
}
