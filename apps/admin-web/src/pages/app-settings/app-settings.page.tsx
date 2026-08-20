import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import axios from 'axios';

import { apiClient } from '../../lib/api-client';
import { usePageTitle } from '../../lib/page-title';

interface AppSetting {
  key: string;
  value: string;
  descriptionEs: string | null;
  updatedAt: string;
}

/**
 * Voces de OpenAI TTS (gpt-4o-mini-tts) — pedido explícito del usuario:
 * un desplegable para elegirlas en vez de un campo de texto libre,
 * indicando cómo es cada una. Descripciones según la guía oficial de
 * OpenAI (platform.openai.com/docs/guides/text-to-speech).
 */
const TTS_VOICE_OPTIONS = [
  { code: 'alloy', label: 'Alloy — neutra, la más parecida a la voz clásica de ChatGPT' },
  { code: 'echo', label: 'Echo — masculina' },
  { code: 'fable', label: 'Fable — masculina, tono narrador' },
  { code: 'onyx', label: 'Onyx — masculina, grave' },
  { code: 'nova', label: 'Nova — femenina, cálida (recomendada para asistente)' },
  { code: 'shimmer', label: 'Shimmer — femenina, suave' },
  { code: 'ash', label: 'Ash — masculina, firme' },
  { code: 'ballad', label: 'Ballad — masculina, calma (acento levemente británico)' },
  { code: 'coral', label: 'Coral — femenina, cálida y amigable' },
  { code: 'sage', label: 'Sage — neutra, serena' },
  { code: 'verse', label: 'Verse — masculina, expresiva' },
  { code: 'marin', label: 'Marin — femenina, clara' },
  { code: 'cedar', label: 'Cedar — masculina, cálida' },
];

function errorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const msg = err.response?.data?.message;
    if (typeof msg === 'string') return msg;
    if (Array.isArray(msg)) return msg.join(', ');
  }
  return fallback;
}

/**
 * Parámetros globales editables sin recompilar la app — pedido
 * explícito del usuario para no tener que redistribuir la app móvil
 * cada vez que hace falta ajustar algo (hoy, la voz del asistente de
 * salud: velocidad, tono, tolerancia de pausa). Tabla genérica
 * clave/valor (params.app_settings) para que sirva para cualquier otro
 * parámetro futuro del mismo tipo sin necesitar una pantalla nueva.
 */
export function AppSettingsPage() {
  usePageTitle('Parámetros de la app');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: ['params', 'app-settings'],
    queryFn: async () => {
      const { data } = await apiClient.get<AppSetting[]>('/params/app-settings');
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (key: string) => {
      const { data } = await apiClient.put(`/params/admin/app-settings/${key}`, {
        value: drafts[key],
      });
      return data as AppSetting;
    },
    onSuccess: (_data, key) => {
      queryClient.invalidateQueries({ queryKey: ['params', 'app-settings'] });
      setSavedKey(key);
      setError(null);
    },
    onError: (err) => setError(errorMessage(err, 'No se pudo guardar el parámetro.')),
  });

  const valueFor = (s: AppSetting) => drafts[s.key] ?? s.value;
  const isDirty = (s: AppSetting) => drafts[s.key] !== undefined && drafts[s.key] !== s.value;

  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Parámetros de comportamiento de la app, editables acá sin necesitar
        una nueva versión — hoy solo los del asistente de salud por voz. Los
        cambios se aplican la próxima vez que un viajero entra a esa
        pantalla, no hace falta reiniciar nada.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {settingsQuery.isError && (
        <Alert severity="error">No se pudieron cargar los parámetros.</Alert>
      )}

      {settingsQuery.data && (
        <Paper sx={{ p: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Parámetro</TableCell>
                <TableCell>Descripción</TableCell>
                <TableCell width={420}>Valor</TableCell>
                <TableCell width={100} align="right">Acción</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {settingsQuery.data.map((s) => (
                <TableRow key={s.key}>
                  <TableCell>
                    <Typography variant="body2" component="code" sx={{ fontFamily: 'monospace' }}>
                      {s.key}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {s.descriptionEs ?? '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {s.key === 'assistant.tts_voice' ? (
                      <TextField
                        select
                        size="small"
                        fullWidth
                        value={valueFor(s)}
                        onChange={(e) => {
                          setSavedKey(null);
                          setDrafts((d) => ({ ...d, [s.key]: e.target.value }));
                        }}
                      >
                        {TTS_VOICE_OPTIONS.map((v) => (
                          <MenuItem key={v.code} value={v.code}>
                            {v.label}
                          </MenuItem>
                        ))}
                      </TextField>
                    ) : s.key.startsWith('assistant.structured_greeting_') ? (
                      // Pedido explícito del usuario: poder editar el
                      // saludo del chat Estructurado (beta) desde acá —
                      // es texto largo con pausas (líneas en blanco), no
                      // entra en un campo de una sola línea.
                      <TextField
                        size="small"
                        fullWidth
                        multiline
                        minRows={4}
                        maxRows={12}
                        value={valueFor(s)}
                        onChange={(e) => {
                          setSavedKey(null);
                          setDrafts((d) => ({ ...d, [s.key]: e.target.value }));
                        }}
                      />
                    ) : (
                      <TextField
                        size="small"
                        fullWidth
                        value={valueFor(s)}
                        onChange={(e) => {
                          setSavedKey(null);
                          setDrafts((d) => ({ ...d, [s.key]: e.target.value }));
                        }}
                      />
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      variant={isDirty(s) ? 'contained' : 'outlined'}
                      disabled={!isDirty(s) || saveMutation.isPending}
                      onClick={() => saveMutation.mutate(s.key)}
                    >
                      {savedKey === s.key && !isDirty(s) ? 'Guardado ✓' : 'Guardar'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      {settingsQuery.data && settingsQuery.data.length === 0 && (
        <Box sx={{ mt: 2 }}>
          <Alert severity="info">Todavía no hay parámetros cargados.</Alert>
        </Box>
      )}
    </>
  );
}
