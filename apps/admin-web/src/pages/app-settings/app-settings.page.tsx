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
 * Voces de OpenAI — pedido explícito del usuario: un desplegable para
 * elegirlas en vez de un campo de texto libre, indicando cómo es cada
 * una.
 *
 * Bug real reportado en vivo: se eligió "Nova" para
 * assistant.realtime_voice (estaba en la lista, marcada como
 * "recomendada") y el Asistente de voz en tiempo real dejó de conectar
 * por completo para todos los viajeros — OpenAI la rechazó con 400
 * "Invalid value: 'nova'. Supported values are: alloy, ash, ballad,
 * coral, echo, sage, shimmer, verse, marin, cedar" en
 * session.audio.output.voice. La API de voz en tiempo real (Realtime)
 * NO acepta las mismas voces que la de texto a voz común
 * (gpt-4o-mini-tts) — nova, fable y onyx existen para esta última pero
 * no para Realtime.
 *
 * Pedido explícito del usuario, después de este bug: "en la app
 * debemos usar la misma voz, no debería haber voces que no puedan
 * usarse en ambas opciones" — para que la voz configurada suene igual
 * sin importar qué motor la esté usando, esta lista única (para
 * assistant.tts_voice Y assistant.realtime_voice) queda reducida a la
 * intersección real de las dos APIs — se sacaron nova/fable/onyx en
 * vez de mantener una lista más larga solo para uno de los dos campos.
 */
const VOICE_OPTIONS = [
  { code: 'alloy', label: 'Alloy — neutra, la más parecida a la voz clásica de ChatGPT' },
  { code: 'echo', label: 'Echo — masculina' },
  { code: 'shimmer', label: 'Shimmer — femenina, suave' },
  { code: 'ash', label: 'Ash — masculina, firme' },
  { code: 'ballad', label: 'Ballad — masculina, calma (acento levemente británico)' },
  { code: 'coral', label: 'Coral — femenina, cálida y amigable' },
  { code: 'sage', label: 'Sage — neutra, serena' },
  { code: 'verse', label: 'Verse — masculina, expresiva' },
  { code: 'marin', label: 'Marin — femenina, clara (recomendada para asistente)' },
  { code: 'cedar', label: 'Cedar — masculina, cálida' },
];

/**
 * Pedido explícito del usuario: "por qué no poner todos los parámetros
 * juntos en la web, está muy desprolijo" — antes era una sola tabla
 * plana con los 24 parámetros en orden alfabético, donde las 12
 * variantes de saludo del Modo Estructurado (3 saludos x 4 idiomas)
 * tapaban a los pocos que se editan seguido (voz, ajustes de
 * conversación). Se agrupan en secciones con título — cada regla
 * "match" es más específica que la de abajo, así que un parámetro cae
 * en la PRIMERA sección que le corresponda; lo que no matchea ninguna
 * (parámetros futuros que todavía no se categorizaron acá) cae en
 * "Otros" en vez de desaparecer.
 */
const SETTING_GROUPS: { title: string; match: (key: string) => boolean }[] = [
  {
    title: 'Voz del asistente',
    match: (k) => k === 'assistant.tts_voice' || k === 'assistant.realtime_voice' || k === 'assistant.voice_reply_default_enabled',
  },
  {
    title: 'Texto a voz (Modo Estructurado / Formulario)',
    match: (k) => k.startsWith('assistant.tts_'),
  },
  {
    title: 'Conversación en tiempo real (Modo Clásico)',
    match: (k) => k.startsWith('assistant.realtime_'),
  },
  {
    title: 'Saludos del Modo Estructurado',
    match: (k) => k.startsWith('assistant.structured_greeting_'),
  },
];

function groupSettings(settings: AppSetting[]): { title: string; items: AppSetting[] }[] {
  const used = new Set<string>();
  const groups = SETTING_GROUPS.map((g) => {
    const items = settings.filter((s) => !used.has(s.key) && g.match(s.key));
    items.forEach((s) => used.add(s.key));
    return { title: g.title, items };
  }).filter((g) => g.items.length > 0);
  const rest = settings.filter((s) => !used.has(s.key));
  if (rest.length > 0) groups.push({ title: 'Otros', items: rest });
  return groups;
}

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

  const renderRow = (s: AppSetting) => (
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
        {s.key === 'assistant.tts_voice' || s.key === 'assistant.realtime_voice' ? (
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
            {VOICE_OPTIONS.map((v) => (
              <MenuItem key={v.code} value={v.code}>
                {v.label}
              </MenuItem>
            ))}
          </TextField>
        ) : s.key.startsWith('assistant.structured_greeting_') ? (
          // Pedido explícito del usuario: poder editar el
          // saludo del chat Estructurado desde acá — es texto
          // largo con pausas (líneas en blanco), no entra en un
          // campo de una sola línea.
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
  );

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

      {settingsQuery.data &&
        groupSettings(settingsQuery.data).map((group) => (
          <Paper key={group.title} sx={{ p: 2, mb: 2 }}>
            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
              {group.title}
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Parámetro</TableCell>
                  <TableCell>Descripción</TableCell>
                  <TableCell width={420}>Valor</TableCell>
                  <TableCell width={100} align="right">Acción</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>{group.items.map(renderRow)}</TableBody>
            </Table>
          </Paper>
        ))}

      {settingsQuery.data && settingsQuery.data.length === 0 && (
        <Box sx={{ mt: 2 }}>
          <Alert severity="info">Todavía no hay parámetros cargados.</Alert>
        </Box>
      )}
    </>
  );
}
