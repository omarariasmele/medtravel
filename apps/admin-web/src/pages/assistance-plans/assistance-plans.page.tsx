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
  FormControlLabel,
  Grid,
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
} from '@mui/material';

import { apiClient } from '../../lib/api-client';
import { useAuth } from '../../auth/auth-context';
import { labelFor, useCatalog } from '../../lib/catalog-hooks';
import { usePageTitle } from '../../lib/page-title';
import { PaginationFooter, usePagination } from '../../lib/pagination';

interface AssistancePlan {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  planTypeId: string;
  coverageRegions?: string[];
  maxTripDays?: number;
  maxAge?: number;
  commercialInfoUrl?: string;
  active: boolean;
}

interface Tenant {
  id: string;
  name: string;
}

interface FormState {
  tenantId: string;
  code: string;
  name: string;
  planTypeId: string;
  coverageRegions: string;
  maxTripDays: string;
  maxAge: string;
  commercialInfoUrl: string;
  active: boolean;
}

const EMPTY_FORM: FormState = {
  tenantId: '',
  code: '',
  name: '',
  planTypeId: '',
  coverageRegions: '',
  maxTripDays: '',
  maxAge: '',
  commercialInfoUrl: '',
  active: true,
};

/**
 * CRUD de coverage.assistance_plans — gap real encontrado al construir
 * el flujo de aprobación de pólizas declaradas: el dropdown de "Plan"
 * ahí no tenía de dónde elegir, más allá de una fila sembrada a mano
 * por SQL para probar. El backend ya expone CRUD genérico en
 * /coverage/assistance-plans (coverage.registry.ts) — esta pantalla es
 * solo la UI que faltaba.
 */
export function AssistancePlansPage() {
  usePageTitle('Planes de asistencia');
  const { claims } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AssistancePlan | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [tenantFilter, setTenantFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const isConfigAdmin = !!claims?.canManageConfig;

  const plansQuery = useQuery({
    queryKey: ['coverage', 'assistance-plans', 'admin'],
    queryFn: async () => {
      const { data } = await apiClient.get<AssistancePlan[]>('/coverage/assistance-plans');
      return data;
    },
  });

  const tenantsQuery = useQuery({
    queryKey: ['identity', 'tenants'],
    queryFn: async () => {
      const { data } = await apiClient.get<Tenant[]>('/identity/tenants');
      return data;
    },
    enabled: isConfigAdmin,
  });

  const tenantNameById = new Map((tenantsQuery.data ?? []).map((t) => [t.id, t.name]));
  const planTypeCatalog = useCatalog('ASSISTANCE_PLAN_TYPE');

  const filteredPlans = (plansQuery.data ?? []).filter(
    (p) => !tenantFilter || p.tenantId === tenantFilter,
  );
  const { pageRows: planPageRows, page: planPage, setPage: setPlanPage, totalCount: planTotalCount } =
    usePagination(filteredPlans);

  function openCreate() {
    setEditTarget(null);
    setForm({ ...EMPTY_FORM, tenantId: isConfigAdmin ? '' : (claims?.tenantId ?? '') });
    setError(null);
    setDialogOpen(true);
  }

  function openEdit(p: AssistancePlan) {
    setEditTarget(p);
    setForm({
      tenantId: p.tenantId,
      code: p.code,
      name: p.name,
      planTypeId: p.planTypeId,
      coverageRegions: (p.coverageRegions ?? []).join(', '),
      maxTripDays: p.maxTripDays?.toString() ?? '',
      maxAge: p.maxAge?.toString() ?? '',
      commercialInfoUrl: p.commercialInfoUrl ?? '',
      active: p.active,
    });
    setError(null);
    setDialogOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        tenantId: form.tenantId,
        code: form.code,
        name: form.name,
        planTypeId: form.planTypeId,
        coverageRegions: form.coverageRegions
          ? form.coverageRegions.split(',').map((r) => r.trim()).filter(Boolean)
          : undefined,
        maxTripDays: form.maxTripDays ? Number(form.maxTripDays) : undefined,
        maxAge: form.maxAge ? Number(form.maxAge) : undefined,
        commercialInfoUrl: form.commercialInfoUrl || undefined,
        active: form.active,
      };
      if (editTarget) {
        const { data } = await apiClient.patch(`/coverage/assistance-plans/${editTarget.id}`, payload);
        return data;
      }
      const { data } = await apiClient.post('/coverage/assistance-plans', payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coverage', 'assistance-plans'] });
      setDialogOpen(false);
    },
    onError: () =>
      setError('No se pudo guardar el plan — revisá que el código no esté repetido para esta empresa.'),
  });

  const canSubmit = !!form.tenantId && !!form.code && !!form.name && !!form.planTypeId;

  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Button variant="contained" onClick={openCreate}>
          Nuevo plan
        </Button>
      </Box>

      {isConfigAdmin && (tenantsQuery.data?.length ?? 0) > 1 && (
        <Box sx={{ mb: 2 }}>
          <TextField
            select
            label="Filtrar por empresa"
            size="small"
            sx={{ minWidth: 260 }}
            value={tenantFilter}
            onChange={(e) => setTenantFilter(e.target.value)}
          >
            <MenuItem value="">Todas las empresas</MenuItem>
            {(tenantsQuery.data ?? []).map((t) => (
              <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>
            ))}
          </TextField>
        </Box>
      )}

      <Alert severity="info" sx={{ mb: 2 }}>
        Estos son los planes que una empresa puede ofrecer — se eligen acá los que después aparecen en el
        selector al aprobar una póliza declarada por el viajero.
      </Alert>

      {plansQuery.isLoading && <CircularProgress />}
      {plansQuery.data && filteredPlans.length === 0 && (
        <Alert severity="info">Todavía no hay planes cargados.</Alert>
      )}

      {filteredPlans.length > 0 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                {isConfigAdmin && <TableCell>Empresa</TableCell>}
                <TableCell>Código</TableCell>
                <TableCell>Nombre</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Máx. días de viaje</TableCell>
                <TableCell>Edad máx.</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell align="right">Acción</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {planPageRows.map((p) => (
                <TableRow key={p.id} hover>
                  {isConfigAdmin && <TableCell>{tenantNameById.get(p.tenantId) ?? '—'}</TableCell>}
                  <TableCell>{p.code}</TableCell>
                  <TableCell>{p.name}</TableCell>
                  <TableCell>{labelFor(planTypeCatalog.data, p.planTypeId)}</TableCell>
                  <TableCell>{p.maxTripDays ?? '—'}</TableCell>
                  <TableCell>{p.maxAge ?? '—'}</TableCell>
                  <TableCell>
                    <Chip size="small" color={p.active ? 'success' : 'default'} label={p.active ? 'Activo' : 'Inactivo'} />
                  </TableCell>
                  <TableCell align="right">
                    <Button size="small" onClick={() => openEdit(p)}>Editar</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <PaginationFooter page={planPage} totalCount={planTotalCount} onPageChange={setPlanPage} />
        </TableContainer>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editTarget ? 'Editar plan' : 'Nuevo plan'}</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Grid container spacing={1}>
            {isConfigAdmin && (
              <Grid size={{ xs: 12 }}>
                <TextField
                  select
                  label="Empresa"
                  fullWidth
                  margin="normal"
                  value={form.tenantId}
                  onChange={(e) => setForm((f) => ({ ...f, tenantId: e.target.value }))}
                  disabled={!!editTarget}
                >
                  {(tenantsQuery.data ?? []).map((t) => (
                    <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>
                  ))}
                </TextField>
              </Grid>
            )}
            <Grid size={{ xs: 6 }}>
              <TextField
                label="Código"
                fullWidth
                margin="normal"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                helperText="Único por empresa, ej. AXA_BASIC"
                disabled={!!editTarget}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                select
                label="Tipo de plan"
                fullWidth
                margin="normal"
                value={form.planTypeId}
                onChange={(e) => setForm((f) => ({ ...f, planTypeId: e.target.value }))}
              >
                {(planTypeCatalog.data ?? []).map((o) => (
                  <MenuItem key={o.id} value={o.id}>{o.labelEs}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                label="Nombre"
                fullWidth
                margin="normal"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                helperText="Ej. AXA Asistencia Básica"
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                label="Máx. días de viaje"
                type="number"
                fullWidth
                margin="normal"
                value={form.maxTripDays}
                onChange={(e) => setForm((f) => ({ ...f, maxTripDays: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                label="Edad máxima"
                type="number"
                fullWidth
                margin="normal"
                value={form.maxAge}
                onChange={(e) => setForm((f) => ({ ...f, maxAge: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                label="Regiones cubiertas"
                fullWidth
                margin="normal"
                value={form.coverageRegions}
                onChange={(e) => setForm((f) => ({ ...f, coverageRegions: e.target.value }))}
                helperText="Separadas por coma, ej. AMERICA, EUROPA"
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                label="URL de info comercial"
                fullWidth
                margin="normal"
                value={form.commercialInfoUrl}
                onChange={(e) => setForm((f) => ({ ...f, commercialInfoUrl: e.target.value }))}
                helperText="Los montos se consultan en el portal del partner, no se guardan acá"
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={form.active}
                    onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                  />
                }
                label="Activo"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={!canSubmit || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            Guardar
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
