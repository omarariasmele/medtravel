import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormGroup,
  IconButton,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import axios from 'axios';

import { apiClient } from '../../lib/api-client';
import { usePageTitle } from '../../lib/page-title';

type ScopeCode = 'EMERGENCY_CHAT' | 'HEALTH_ASSISTANT' | 'APP_HELP_ASSISTANT' | 'ONBOARDING';

interface KnowledgeBaseEntry {
  id: string;
  title: string;
  content: string;
  active: boolean;
  scopes: ScopeCode[];
  updatedAt: string;
}

interface FormState {
  title: string;
  content: string;
  scopes: ScopeCode[];
}

const EMPTY_FORM: FormState = { title: '', content: '', scopes: ['EMERGENCY_CHAT'] };

/** Mismos códigos que el dominio KB_ENTRY_SCOPE (params.catalog_values) — una entrada puede aplicar a varios a la vez. */
const SCOPE_OPTIONS: { code: ScopeCode; label: string }[] = [
  { code: 'EMERGENCY_CHAT', label: 'Chat de emergencia' },
  { code: 'HEALTH_ASSISTANT', label: 'Asistente de salud (Historial de Salud)' },
  { code: 'APP_HELP_ASSISTANT', label: 'Asistente de uso de la app' },
  { code: 'ONBOARDING', label: 'Bienvenida general (primer uso de la app)' },
];

const SCOPE_LABEL: Record<ScopeCode, string> = {
  EMERGENCY_CHAT: 'Chat de emergencia',
  HEALTH_ASSISTANT: 'Asistente de salud',
  APP_HELP_ASSISTANT: 'Ayuda de uso de la app',
  ONBOARDING: 'Bienvenida general',
};

function errorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const msg = err.response?.data?.message;
    if (typeof msg === 'string') return msg;
    if (Array.isArray(msg)) return msg.join(', ');
  }
  return fallback;
}

/**
 * Información propia de la operación que el asistente de IA del chat
 * de emergencia usa como contexto adicional (criterios de derivación,
 * cómo funciona la app, lo que sea útil que la IA sepa) — pedido
 * explícito del usuario: poder cargarla desde acá sin tocar código.
 * AIService.respondInEmergencyChat manda TODO lo activo al prompt en
 * cada charla (ver ai.service.ts) — sin búsqueda/relevancia todavía,
 * pensado para una base chica; si crece mucho hay que revisar el approach.
 */
export function KnowledgeBasePage() {
  usePageTitle('Base de conocimiento del asistente');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ['ai', 'knowledge-base'],
    queryFn: async () => {
      const { data } = await apiClient.get<KnowledgeBaseEntry[]>('/ai/knowledge-base');
      return data;
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['ai', 'knowledge-base'] });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editingId) {
        const { data } = await apiClient.put(`/ai/knowledge-base/${editingId}`, form);
        return data;
      }
      const { data } = await apiClient.post('/ai/knowledge-base', form);
      return data;
    },
    onSuccess: () => {
      invalidate();
      setDialogOpen(false);
      setForm(EMPTY_FORM);
      setEditingId(null);
      setError(null);
    },
    onError: (err) => setError(errorMessage(err, 'No se pudo guardar la entrada.')),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async (entry: KnowledgeBaseEntry) => {
      await apiClient.put(`/ai/knowledge-base/${entry.id}`, { active: !entry.active });
    },
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/ai/knowledge-base/${id}`);
    },
    onSuccess: invalidate,
  });

  const openNew = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setDialogOpen(true);
  };

  const openEdit = (entry: KnowledgeBaseEntry) => {
    setEditingId(entry.id);
    setForm({ title: entry.title, content: entry.content, scopes: entry.scopes });
    setError(null);
    setDialogOpen(true);
  };

  const toggleScope = (code: ScopeCode) => {
    setForm((f) => ({
      ...f,
      scopes: f.scopes.includes(code)
        ? f.scopes.filter((s) => s !== code)
        : [...f.scopes, code],
    }));
  };

  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Información propia de la operación que usan los asistentes de IA como
        contexto adicional — criterios de cuándo derivar a un operador, cómo
        se presenta, qué priorizar preguntar, cómo pedir actualizaciones, o
        cualquier otra cosa útil para que contesten mejor. Cada entrada puede
        aplicar a uno, dos o los tres asistentes (chat de emergencia,
        asistente de carga del Historial de Salud, asistente de ayuda de uso de la
        app) según lo que marques. Se aplica de inmediato, sin recompilar
        nada.
      </Typography>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Button variant="contained" onClick={openNew}>
          Agregar entrada
        </Button>
      </Box>

      {listQuery.isError && (
        <Alert severity="error">No se pudo cargar la base de conocimiento.</Alert>
      )}
      {listQuery.data?.length === 0 && (
        <Alert severity="info">Todavía no hay ninguna entrada cargada.</Alert>
      )}

      {listQuery.data?.map((entry) => (
        <Card key={entry.id} sx={{ mb: 1.5, opacity: entry.active ? 1 : 0.6 }}>
          <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
            <Box sx={{ flexGrow: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
                <Typography variant="subtitle1">{entry.title}</Typography>
                {entry.scopes.map((s) => (
                  <Chip key={s} size="small" variant="outlined" label={SCOPE_LABEL[s]} />
                ))}
                {!entry.active && <Chip size="small" label="Inactiva" />}
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
                {entry.content}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
              <FormControlLabel
                labelPlacement="bottom"
                sx={{ m: 0 }}
                control={
                  <Switch
                    size="small"
                    checked={entry.active}
                    onChange={() => toggleActiveMutation.mutate(entry)}
                  />
                }
                label="Activa"
              />
              <IconButton size="small" onClick={() => openEdit(entry)}>
                <EditOutlinedIcon fontSize="small" />
              </IconButton>
              <IconButton size="small" onClick={() => deleteMutation.mutate(entry.id)}>
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Box>
          </CardContent>
        </Card>
      ))}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editingId ? 'Editar entrada' : 'Agregar entrada'}</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <TextField
            label="Título"
            fullWidth
            margin="normal"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            helperText="Ej. Cuándo derivar a un operador"
          />
          <Typography variant="body2" sx={{ mt: 2, mb: 0.5 }}>
            Aplica a
          </Typography>
          <FormGroup row>
            {SCOPE_OPTIONS.map((o) => (
              <FormControlLabel
                key={o.code}
                control={
                  <Checkbox
                    checked={form.scopes.includes(o.code)}
                    onChange={() => toggleScope(o.code)}
                  />
                }
                label={o.label}
              />
            ))}
          </FormGroup>
          <TextField
            label="Contenido"
            fullWidth
            multiline
            minRows={4}
            margin="normal"
            value={form.content}
            onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            helperText="Se le agrega tal cual al asistente — escribilo como una instrucción u observación clara"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={
              !form.title.trim() ||
              !form.content.trim() ||
              form.scopes.length === 0 ||
              saveMutation.isPending
            }
            onClick={() => saveMutation.mutate()}
          >
            Guardar
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
