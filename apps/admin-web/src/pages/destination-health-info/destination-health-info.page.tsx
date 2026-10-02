import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AutorenewIcon from '@mui/icons-material/Autorenew';

import { apiClient } from '../../lib/api-client';
import { apiErrorMessage } from '../../lib/api-error';
import { usePageTitle } from '../../lib/page-title';
import { useCatalog, labelFor } from '../../lib/catalog-hooks';
import { PaginationFooter, usePagination } from '../../lib/pagination';

interface DestinationHealthInfo {
  id: string;
  countryId: string;
  vaccinations: string | null;
  healthRisks: string | null;
  securityAlerts: string | null;
  generalTips: string | null;
  source: 'manual' | 'ai_web_search';
  sourceNotes: string | null;
  updatedAt: string;
}

interface FormState {
  countryId: string;
  vaccinations: string;
  healthRisks: string;
  securityAlerts: string;
  generalTips: string;
}

const EMPTY_FORM: FormState = {
  countryId: '',
  vaccinations: '',
  healthRisks: '',
  securityAlerts: '',
  generalTips: '',
};

function toFormState(row: DestinationHealthInfo): FormState {
  return {
    countryId: row.countryId,
    vaccinations: row.vaccinations ?? '',
    healthRisks: row.healthRisks ?? '',
    securityAlerts: row.securityAlerts ?? '',
    generalTips: row.generalTips ?? '',
  };
}

function toPayload(f: FormState) {
  return {
    countryId: f.countryId,
    vaccinations: f.vaccinations.trim() || null,
    healthRisks: f.healthRisks.trim() || null,
    securityAlerts: f.securityAlerts.trim() || null,
    generalTips: f.generalTips.trim() || null,
  };
}

function truncate(text: string | null, max = 80): string {
  if (!text) return '—';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * Botón "Info del destino" del viaje (mobile) — pedido explícito del
 * usuario: mix de tabla curada + IA con búsqueda web real para
 * completar/actualizar vacunas, riesgos de salud y alertas de
 * seguridad por país. Esta pantalla administra la tabla curada
 * (ai.destination_health_info) — mismo patrón que
 * interview-questions.page.tsx. "Actualizar con IA" dispara la
 * búsqueda web real (ver DestinationHealthInfoAdminController) aunque
 * ya haya una fila cargada, para refrescarla.
 */
export function DestinationHealthInfoPage() {
  usePageTitle('Info de salud y seguridad por destino');
  const queryClient = useQueryClient();
  const countryCatalog = useCatalog('COUNTRY');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  // Bug real reportado en vivo: "Actualizar con IA" se queda girando y
  // no resuelve diciendo que no hay información — en realidad SÍ
  // resolvía (el backend tiene timeout de 20s para la búsqueda web,
  // ver AIService.lookupDestinationHealthInfo), pero refreshMutation no
  // tenía onError: un fallo real (la IA no encontró nada confiable, o
  // un error de red/API key) terminaba en silencio total, el ícono
  // volvía a la normalidad sin decir nada — indistinguible de que
  // "seguía cargando" si no se miraba con atención.
  const [refreshNotice, setRefreshNotice] = useState<{ severity: 'error' | 'info'; message: string } | null>(null);

  const listQuery = useQuery({
    queryKey: ['ai', 'destination-health-info'],
    queryFn: async () => {
      const { data } = await apiClient.get<DestinationHealthInfo[]>(
        '/ai/admin/destination-health-info',
        { params: { limit: 500 } },
      );
      return data;
    },
  });

  const sortedRows = (listQuery.data ?? [])
    .slice()
    .sort((a, b) => labelFor(countryCatalog.data, a.countryId).localeCompare(labelFor(countryCatalog.data, b.countryId)));
  const { pageRows, page, setPage, totalCount } = usePagination(sortedRows);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setDialogOpen(true);
  };

  const openEdit = (row: DestinationHealthInfo) => {
    setEditingId(row.id);
    setForm(toFormState(row));
    setError(null);
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = toPayload(form);
      if (editingId) {
        const { data } = await apiClient.patch(`/ai/admin/destination-health-info/${editingId}`, payload);
        return data;
      }
      const { data } = await apiClient.post('/ai/admin/destination-health-info', payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai', 'destination-health-info'] });
      setDialogOpen(false);
    },
    onError: () => setError('No se pudo guardar (¿ya existe una fila para ese país?).'),
  });

  const refreshMutation = useMutation({
    mutationFn: async (countryId: string) => {
      setRefreshingId(countryId);
      const { data } = await apiClient.post<DestinationHealthInfo>(`/ai/admin/destination-health-info/${countryId}/refresh`);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ai', 'destination-health-info'] });
      const hasContent = data.vaccinations || data.healthRisks || data.securityAlerts || data.generalTips;
      setRefreshNotice(
        hasContent
          ? null
          : {
              severity: 'info',
              message: 'La IA no encontró información confiable y vigente para este país — probá de nuevo más tarde, o cargala a mano.',
            },
      );
    },
    onError: (err) => {
      setRefreshNotice({
        severity: 'error',
        message: apiErrorMessage(err, 'No se pudo actualizar la información de este país.'),
      });
    },
    onSettled: () => setRefreshingId(null),
  });

  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Contenido del botón "Info del destino" en el viaje de la app — vacunas, riesgos de
        salud, alertas de seguridad y tips por país. "Actualizar con IA" busca en la web
        información vigente y reemplaza la fila (queda registrada la fuente).
      </Typography>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Button variant="contained" onClick={openCreate}>
          Agregar país
        </Button>
      </Box>

      {refreshNotice && (
        <Alert severity={refreshNotice.severity} onClose={() => setRefreshNotice(null)} sx={{ mb: 2 }}>
          {refreshNotice.message}
        </Alert>
      )}

      {listQuery.isLoading && <CircularProgress />}
      {listQuery.isError && <Alert severity="error">No se pudo cargar la lista.</Alert>}
      {listQuery.data && listQuery.data.length === 0 && (
        <Alert severity="info">Todavía no hay países cargados.</Alert>
      )}

      {listQuery.data && listQuery.data.length > 0 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>País</TableCell>
                <TableCell>Vacunas</TableCell>
                <TableCell>Riesgos de salud</TableCell>
                <TableCell>Alertas de seguridad</TableCell>
                <TableCell>Fuente</TableCell>
                <TableCell>Actualizado</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {pageRows.map((row) => (
                <TableRow key={row.id} hover onClick={() => openEdit(row)} sx={{ cursor: 'pointer' }}>
                  <TableCell>{labelFor(countryCatalog.data, row.countryId)}</TableCell>
                  <TableCell>{truncate(row.vaccinations)}</TableCell>
                  <TableCell>{truncate(row.healthRisks)}</TableCell>
                  <TableCell>{truncate(row.securityAlerts)}</TableCell>
                  <TableCell>
                    <Tooltip title={row.sourceNotes ?? ''} disableHoverListener={!row.sourceNotes}>
                      <Chip
                        size="small"
                        label={row.source === 'ai_web_search' ? 'IA + web' : 'Manual'}
                        color={row.source === 'ai_web_search' ? 'info' : 'default'}
                      />
                    </Tooltip>
                  </TableCell>
                  <TableCell>{new Date(row.updatedAt).toLocaleDateString('es-AR')}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Tooltip title="Actualizar con IA (búsqueda web)">
                      <span>
                        <Button
                          size="small"
                          startIcon={
                            refreshingId === row.countryId ? (
                              <CircularProgress size={14} />
                            ) : (
                              <AutorenewIcon fontSize="small" />
                            )
                          }
                          disabled={refreshingId === row.countryId}
                          onClick={() => refreshMutation.mutate(row.countryId)}
                        >
                          Actualizar con IA
                        </Button>
                      </span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <PaginationFooter page={page} totalCount={totalCount} onPageChange={setPage} />
        </TableContainer>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editingId ? 'Editar destino' : 'Agregar destino'}</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Grid container spacing={1}>
            <Grid size={{ xs: 12 }}>
              <TextField
                select
                label="País"
                fullWidth
                margin="normal"
                value={form.countryId}
                disabled={!!editingId}
                onChange={(e) => setForm((f) => ({ ...f, countryId: e.target.value }))}
                helperText={editingId ? 'No se puede modificar' : undefined}
              >
                {(countryCatalog.data ?? []).map((c) => (
                  <MenuItem key={c.id} value={c.id}>{c.labelEs}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                label="Vacunas"
                fullWidth
                multiline
                minRows={2}
                margin="normal"
                value={form.vaccinations}
                onChange={(e) => setForm((f) => ({ ...f, vaccinations: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                label="Riesgos de salud"
                fullWidth
                multiline
                minRows={2}
                margin="normal"
                value={form.healthRisks}
                onChange={(e) => setForm((f) => ({ ...f, healthRisks: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                label="Alertas de seguridad"
                fullWidth
                multiline
                minRows={2}
                margin="normal"
                value={form.securityAlerts}
                onChange={(e) => setForm((f) => ({ ...f, securityAlerts: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                label="Tips generales"
                fullWidth
                multiline
                minRows={2}
                margin="normal"
                value={form.generalTips}
                onChange={(e) => setForm((f) => ({ ...f, generalTips: e.target.value }))}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={!form.countryId || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            Guardar
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
