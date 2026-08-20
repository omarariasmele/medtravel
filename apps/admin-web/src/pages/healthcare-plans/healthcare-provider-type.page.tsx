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
  IconButton,
  MenuItem,
  Paper,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';

import { apiClient } from '../../lib/api-client';
import { useCatalog } from '../../lib/catalog-hooks';
import { usePageTitle } from '../../lib/page-title';
import { PaginationFooter, usePagination } from '../../lib/pagination';

interface HealthcareProvider {
  id: string;
  code?: string;
  name: string;
  countryId: string;
  countryLabel: string;
  providerTypeId: string;
  providerTypeLabel: string;
  lifecycleStatus: 'DRAFT' | 'APPROVED' | 'ACTIVE' | 'RETIRED';
  active: boolean;
  submittedByFirstName?: string;
  submittedByLastName?: string;
}

interface HealthcarePlan {
  id: string;
  name: string;
  lifecycleStatus: 'DRAFT' | 'APPROVED' | 'ACTIVE' | 'RETIRED';
  active: boolean;
  providerId: string;
  providerLabel: string;
  submittedByFirstName?: string;
  submittedByLastName?: string;
}

type ProviderTypeCode = 'PRIVATE_INSURANCE' | 'SOCIAL_SECURITY';

/**
 * Administra coverage.healthcare_providers para UN tipo (prepaga u obra
 * social) y coverage.healthcare_plans anidado bajo cada prestador de ese
 * tipo. Antes era una sola pantalla con las dos listas juntas — el
 * usuario pidió separarlas en pantallas distintas porque mezcladas
 * confunden y con volumen se vuelve difícil de visualizar. Este
 * componente es el mismo para ambos casos, parametrizado por
 * `typeCode`/`title` — cada pantalla (healthcare-providers.page.tsx,
 * healthcare-social-security.page.tsx) es solo un wrapper de una línea.
 */
export function HealthcareProviderTypePage({
  typeCode,
  title,
  newItemLabel,
}: {
  typeCode: ProviderTypeCode;
  title: string;
  newItemLabel: string;
}) {
  usePageTitle(title);
  const queryClient = useQueryClient();
  const countryCatalog = useCatalog('COUNTRY');
  const providerTypeCatalog = useCatalog('HEALTH_COVERAGE_TYPE');

  const providerTypeCodeById = (id: string) =>
    (providerTypeCatalog.data ?? []).find((c) => c.id === id)?.code;

  const [providerDialogOpen, setProviderDialogOpen] = useState(false);
  const [providerForm, setProviderForm] = useState({ name: '', countryId: '' });
  const [providerError, setProviderError] = useState<string | null>(null);
  const [providerApproveEditTarget, setProviderApproveEditTarget] = useState<HealthcareProvider | null>(null);
  const [providerApproveEditName, setProviderApproveEditName] = useState('');
  const [providerMergeTarget, setProviderMergeTarget] = useState<HealthcareProvider | null>(null);
  const [providerMergeIntoId, setProviderMergeIntoId] = useState('');
  const [countryFilter, setCountryFilter] = useState('');

  const providersQuery = useQuery({
    queryKey: ['coverage', 'admin', 'healthcare-providers'],
    queryFn: async () => {
      const { data } = await apiClient.get<HealthcareProvider[]>('/coverage/admin/healthcare-providers');
      return data;
    },
  });

  const invalidateProviders = () =>
    queryClient.invalidateQueries({ queryKey: ['coverage', 'admin', 'healthcare-providers'] });

  const forThisType = (providersQuery.data ?? []).filter(
    (p) => providerTypeCodeById(p.providerTypeId) === typeCode,
  );
  const pending = forThisType.filter((p) => p.lifecycleStatus === 'DRAFT');
  const active = forThisType
    .filter((p) => p.lifecycleStatus !== 'DRAFT')
    .filter((p) => !countryFilter || p.countryId === countryFilter);
  const { pageRows: activePageRows, page: activePage, setPage: setActivePage, totalCount: activeTotalCount } =
    usePagination(active);

  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const editingProvider = (providersQuery.data ?? []).find((p) => p.id === editingProviderId) ?? null;
  const [editForm, setEditForm] = useState({ name: '', code: '', countryId: '' });

  const openEditDialog = (p: HealthcareProvider) => {
    setEditingProviderId(p.id);
    setEditForm({ name: p.name, code: p.code ?? '', countryId: p.countryId });
  };

  const createProviderMutation = useMutation({
    mutationFn: async () =>
      apiClient.post('/coverage/healthcare-providers', {
        name: providerForm.name,
        countryId: providerForm.countryId || undefined,
        providerTypeId: (providerTypeCatalog.data ?? []).find((c) => c.code === typeCode)?.id,
      }),
    onSuccess: () => {
      invalidateProviders();
      setProviderDialogOpen(false);
      setProviderForm({ name: '', countryId: '' });
      setProviderError(null);
    },
    onError: () => setProviderError('No se pudo crear el prestador.'),
  });

  const toggleProviderActiveMutation = useMutation({
    mutationFn: async (p: HealthcareProvider) =>
      apiClient.patch(`/coverage/admin/healthcare-providers/${p.id}`, { active: !p.active }),
    onSuccess: invalidateProviders,
  });

  const saveProviderMutation = useMutation({
    mutationFn: async () => {
      if (!editingProviderId) return;
      return apiClient.patch(`/coverage/admin/healthcare-providers/${editingProviderId}`, {
        name: editForm.name,
        code: editForm.code || undefined,
        countryId: editForm.countryId,
      });
    },
    onSuccess: invalidateProviders,
  });

  const approveProviderMutation = useMutation({
    mutationFn: async (p: HealthcareProvider) =>
      apiClient.patch(`/coverage/admin/healthcare-providers/${p.id}`, { lifecycleStatus: 'ACTIVE' }),
    onSuccess: invalidateProviders,
  });

  const approveEditProviderMutation = useMutation({
    mutationFn: async () => {
      if (!providerApproveEditTarget) return;
      return apiClient.patch(`/coverage/admin/healthcare-providers/${providerApproveEditTarget.id}`, {
        name: providerApproveEditName,
        lifecycleStatus: 'ACTIVE',
      });
    },
    onSuccess: () => {
      invalidateProviders();
      setProviderApproveEditTarget(null);
    },
  });

  const mergeProviderMutation = useMutation({
    mutationFn: async () => {
      if (!providerMergeTarget || !providerMergeIntoId) return;
      return apiClient.post(
        `/coverage/admin/healthcare-providers/${providerMergeTarget.id}/merge/${providerMergeIntoId}`,
      );
    },
    onSuccess: () => {
      invalidateProviders();
      setProviderMergeTarget(null);
      setProviderMergeIntoId('');
    },
  });

  const providerMergeCandidates = forThisType.filter(
    (p) => p.lifecycleStatus !== 'DRAFT' && p.id !== providerMergeTarget?.id,
  );

  // ── Planes (del prestador que está abierto en el diálogo de edición) ──
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [planName, setPlanName] = useState('');
  const [planError, setPlanError] = useState<string | null>(null);
  const [planApproveEditTarget, setPlanApproveEditTarget] = useState<HealthcarePlan | null>(null);
  const [planApproveEditName, setPlanApproveEditName] = useState('');
  const [planMergeTarget, setPlanMergeTarget] = useState<HealthcarePlan | null>(null);
  const [planMergeIntoId, setPlanMergeIntoId] = useState('');

  const plansQuery = useQuery({
    queryKey: ['coverage', 'admin', 'healthcare-plans', editingProviderId],
    queryFn: async () => {
      const { data } = await apiClient.get<HealthcarePlan[]>('/coverage/admin/healthcare-plans', {
        params: { providerId: editingProviderId },
      });
      return data;
    },
    enabled: !!editingProviderId,
  });

  const invalidatePlans = () =>
    queryClient.invalidateQueries({ queryKey: ['coverage', 'admin', 'healthcare-plans'] });

  const pendingPlans = (plansQuery.data ?? []).filter((p) => p.lifecycleStatus === 'DRAFT');
  const activePlans = (plansQuery.data ?? []).filter((p) => p.lifecycleStatus !== 'DRAFT');

  const createPlanMutation = useMutation({
    mutationFn: async () =>
      apiClient.post('/coverage/healthcare-plans', { providerId: editingProviderId, name: planName }),
    onSuccess: () => {
      invalidatePlans();
      setPlanDialogOpen(false);
      setPlanName('');
      setPlanError(null);
    },
    onError: () => setPlanError('No se pudo crear el plan.'),
  });

  const togglePlanActiveMutation = useMutation({
    mutationFn: async (p: HealthcarePlan) =>
      apiClient.patch(`/coverage/admin/healthcare-plans/${p.id}`, { active: !p.active }),
    onSuccess: invalidatePlans,
  });

  const approvePlanMutation = useMutation({
    mutationFn: async (p: HealthcarePlan) =>
      apiClient.patch(`/coverage/admin/healthcare-plans/${p.id}`, { lifecycleStatus: 'ACTIVE' }),
    onSuccess: invalidatePlans,
  });

  const approveEditPlanMutation = useMutation({
    mutationFn: async () => {
      if (!planApproveEditTarget) return;
      return apiClient.patch(`/coverage/admin/healthcare-plans/${planApproveEditTarget.id}`, {
        name: planApproveEditName,
        lifecycleStatus: 'ACTIVE',
      });
    },
    onSuccess: () => {
      invalidatePlans();
      setPlanApproveEditTarget(null);
    },
  });

  const mergePlanMutation = useMutation({
    mutationFn: async () => {
      if (!planMergeTarget || !planMergeIntoId) return;
      return apiClient.post(`/coverage/admin/healthcare-plans/${planMergeTarget.id}/merge/${planMergeIntoId}`);
    },
    onSuccess: () => {
      invalidatePlans();
      setPlanMergeTarget(null);
      setPlanMergeIntoId('');
    },
  });

  const planMergeCandidates = activePlans.filter((p) => p.id !== planMergeTarget?.id);

  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', mb: 1, gap: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <TextField
            select
            label="Filtrar por país"
            size="small"
            sx={{ minWidth: 200 }}
            value={countryFilter}
            onChange={(e) => setCountryFilter(e.target.value)}
          >
            <MenuItem value="">Todos los países</MenuItem>
            {(countryCatalog.data ?? []).map((c) => (
              <MenuItem key={c.id} value={c.id}>{c.labelEs}</MenuItem>
            ))}
          </TextField>
          <Button variant="contained" onClick={() => setProviderDialogOpen(true)}>
            Nuevo
          </Button>
        </Box>
      </Box>

      {pending.length > 0 && (
        <Paper variant="outlined" sx={{ mb: 2, borderColor: 'warning.main' }}>
          <Box sx={{ bgcolor: 'warning.light', px: 2, py: 1 }}>
            <Typography variant="subtitle2">Pendientes de confirmación</Typography>
          </Box>
          <Table size="small">
            <TableBody>
              {pending.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    {p.name} <Chip size="small" color="warning" label="Nuevo" sx={{ ml: 1 }} />
                  </TableCell>
                  <TableCell>
                    {p.submittedByFirstName ? `${p.submittedByFirstName} ${p.submittedByLastName}` : '—'}
                  </TableCell>
                  <TableCell align="right">
                    <Button size="small" onClick={() => approveProviderMutation.mutate(p)}>Aprobar</Button>
                    <Button
                      size="small"
                      onClick={() => {
                        setProviderApproveEditTarget(p);
                        setProviderApproveEditName(p.name);
                      }}
                    >
                      Editar y aprobar
                    </Button>
                    <Button size="small" onClick={() => setProviderMergeTarget(p)}>Fusionar con existente</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      {providersQuery.isLoading && <CircularProgress />}
      {providersQuery.data && active.length === 0 && (
        <Alert severity="info">No hay {title.toLowerCase()} cargados{countryFilter ? ' para ese país' : ''}.</Alert>
      )}

      {active.length > 0 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Código</TableCell>
                <TableCell>Nombre</TableCell>
                <TableCell>País</TableCell>
                <TableCell>Activo</TableCell>
                <TableCell align="right">Editar</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {activePageRows.map((p) => (
                <TableRow key={p.id} hover>
                  <TableCell>{p.code ?? '—'}</TableCell>
                  <TableCell>{p.name}</TableCell>
                  <TableCell>{p.countryLabel}</TableCell>
                  <TableCell>
                    <Switch size="small" checked={p.active} onChange={() => toggleProviderActiveMutation.mutate(p)} />
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => openEditDialog(p)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <PaginationFooter page={activePage} totalCount={activeTotalCount} onPageChange={setActivePage} />
        </TableContainer>
      )}

      {/* ── Diálogo: nuevo prestador/obra social ── */}
      <Dialog open={providerDialogOpen} onClose={() => setProviderDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{newItemLabel}</DialogTitle>
        <DialogContent>
          {providerError && <Alert severity="error" sx={{ mb: 2 }}>{providerError}</Alert>}
          <TextField
            label="Nombre"
            fullWidth
            margin="normal"
            value={providerForm.name}
            onChange={(e) => setProviderForm((f) => ({ ...f, name: e.target.value }))}
          />
          <TextField
            select
            label="País"
            fullWidth
            margin="normal"
            value={providerForm.countryId}
            onChange={(e) => setProviderForm((f) => ({ ...f, countryId: e.target.value }))}
          >
            {(countryCatalog.data ?? []).map((c) => (
              <MenuItem key={c.id} value={c.id}>{c.labelEs}</MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProviderDialogOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={!providerForm.name || !providerForm.countryId || createProviderMutation.isPending}
            onClick={() => createProviderMutation.mutate()}
          >
            Crear
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!providerApproveEditTarget} onClose={() => setProviderApproveEditTarget(null)} fullWidth maxWidth="sm">
        <DialogTitle>Corregir nombre y aprobar</DialogTitle>
        <DialogContent>
          <TextField
            label="Nombre"
            fullWidth
            margin="normal"
            value={providerApproveEditName}
            onChange={(e) => setProviderApproveEditName(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProviderApproveEditTarget(null)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={!providerApproveEditName || approveEditProviderMutation.isPending}
            onClick={() => approveEditProviderMutation.mutate()}
          >
            Guardar y aprobar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!providerMergeTarget} onClose={() => setProviderMergeTarget(null)} fullWidth maxWidth="sm">
        <DialogTitle>Fusionar "{providerMergeTarget?.name}" con uno existente</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            La cobertura y los planes ya cargados con este prestador se reasignan
            automáticamente al que elijas — el prestador nuevo queda retirado.
          </Alert>
          <TextField
            select
            label="Fusionar con"
            fullWidth
            margin="normal"
            value={providerMergeIntoId}
            onChange={(e) => setProviderMergeIntoId(e.target.value)}
          >
            {providerMergeCandidates.map((p) => (
              <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProviderMergeTarget(null)}>Cancelar</Button>
          <Button
            variant="contained"
            color="warning"
            disabled={!providerMergeIntoId || mergeProviderMutation.isPending}
            onClick={() => mergeProviderMutation.mutate()}
          >
            Fusionar
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Diálogo: editar prestador + planes anidados ── */}
      <Dialog open={!!editingProvider} onClose={() => setEditingProviderId(null)} fullWidth maxWidth="md">
        <DialogTitle>Editar {editingProvider?.name}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="Nombre"
              fullWidth
              margin="normal"
              value={editForm.name}
              onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
            />
            <TextField
              label="Código"
              margin="normal"
              sx={{ minWidth: 160 }}
              value={editForm.code}
              onChange={(e) => setEditForm((f) => ({ ...f, code: e.target.value }))}
            />
          </Box>
          <TextField
            select
            label="País"
            fullWidth
            margin="normal"
            value={editForm.countryId}
            onChange={(e) => setEditForm((f) => ({ ...f, countryId: e.target.value }))}
          >
            {(countryCatalog.data ?? []).map((c) => (
              <MenuItem key={c.id} value={c.id}>{c.labelEs}</MenuItem>
            ))}
          </TextField>
          <Button
            variant="outlined"
            size="small"
            sx={{ mt: 1 }}
            disabled={!editForm.name || !editForm.countryId || saveProviderMutation.isPending}
            onClick={() => saveProviderMutation.mutate()}
          >
            Guardar cambios
          </Button>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 4, mb: 1 }}>
            <Typography variant="h6">Planes habilitados</Typography>
            <Button size="small" variant="outlined" onClick={() => setPlanDialogOpen(true)}>
              Nuevo plan
            </Button>
          </Box>

          {pendingPlans.length > 0 && (
            <Paper variant="outlined" sx={{ mb: 2, borderColor: 'warning.main' }}>
              <Box sx={{ bgcolor: 'warning.light', px: 2, py: 1 }}>
                <Typography variant="subtitle2">Planes pendientes de confirmación</Typography>
              </Box>
              <Table size="small">
                <TableBody>
                  {pendingPlans.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        {p.name} <Chip size="small" color="warning" label="Nuevo" sx={{ ml: 1 }} />
                      </TableCell>
                      <TableCell align="right">
                        <Button size="small" onClick={() => approvePlanMutation.mutate(p)}>Aprobar</Button>
                        <Button
                          size="small"
                          onClick={() => {
                            setPlanApproveEditTarget(p);
                            setPlanApproveEditName(p.name);
                          }}
                        >
                          Editar y aprobar
                        </Button>
                        <Button size="small" onClick={() => setPlanMergeTarget(p)}>Fusionar con existente</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          )}

          {plansQuery.data && activePlans.length === 0 && (
            <Alert severity="info">Este prestador todavía no tiene planes cargados.</Alert>
          )}

          {activePlans.length > 0 && (
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Plan</TableCell>
                    <TableCell>Activo</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {activePlans.map((p) => (
                    <TableRow key={p.id} hover>
                      <TableCell>{p.name}</TableCell>
                      <TableCell>
                        <Switch size="small" checked={p.active} onChange={() => togglePlanActiveMutation.mutate(p)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditingProviderId(null)}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      {/* ── Diálogos: planes ── */}
      <Dialog open={planDialogOpen} onClose={() => setPlanDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Nuevo plan</DialogTitle>
        <DialogContent>
          {planError && <Alert severity="error" sx={{ mb: 2 }}>{planError}</Alert>}
          <TextField label="Nombre" fullWidth margin="normal" value={planName} onChange={(e) => setPlanName(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPlanDialogOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={!planName || createPlanMutation.isPending} onClick={() => createPlanMutation.mutate()}>
            Crear
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!planApproveEditTarget} onClose={() => setPlanApproveEditTarget(null)} fullWidth maxWidth="sm">
        <DialogTitle>Corregir nombre y aprobar</DialogTitle>
        <DialogContent>
          <TextField
            label="Nombre"
            fullWidth
            margin="normal"
            value={planApproveEditName}
            onChange={(e) => setPlanApproveEditName(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPlanApproveEditTarget(null)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={!planApproveEditName || approveEditPlanMutation.isPending}
            onClick={() => approveEditPlanMutation.mutate()}
          >
            Guardar y aprobar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!planMergeTarget} onClose={() => setPlanMergeTarget(null)} fullWidth maxWidth="sm">
        <DialogTitle>Fusionar "{planMergeTarget?.name}" con un plan existente</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            La cobertura ya cargada por el viajero con este plan se reasigna
            automáticamente al que elijas — el plan nuevo queda retirado.
          </Alert>
          <TextField
            select
            label="Fusionar con"
            fullWidth
            margin="normal"
            value={planMergeIntoId}
            onChange={(e) => setPlanMergeIntoId(e.target.value)}
          >
            {planMergeCandidates.map((p) => (
              <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPlanMergeTarget(null)}>Cancelar</Button>
          <Button
            variant="contained"
            color="warning"
            disabled={!planMergeIntoId || mergePlanMutation.isPending}
            onClick={() => mergePlanMutation.mutate()}
          >
            Fusionar
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
