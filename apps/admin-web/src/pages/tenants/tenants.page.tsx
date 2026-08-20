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
  FormControlLabel,
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
import { labelFor, useCatalog } from '../../lib/catalog-hooks';
import { usePageTitle } from '../../lib/page-title';
import { PaginationFooter, usePagination } from '../../lib/pagination';

interface Tenant {
  id: string;
  code: string;
  name: string;
  legalName?: string;
  countryId?: string;
  contactEmail?: string;
  contactPhone?: string;
  active: boolean;
  isPlatformAdmin: boolean;
}

interface FormState {
  code: string;
  name: string;
  legalName: string;
  countryId: string;
  contactEmail: string;
  contactPhone: string;
}

interface EditFormState {
  name: string;
  legalName: string;
  countryId: string;
  contactEmail: string;
  contactPhone: string;
  active: boolean;
  isPlatformAdmin: boolean;
}

const EMPTY_FORM: FormState = {
  code: '',
  name: '',
  legalName: '',
  countryId: '',
  contactEmail: '',
  contactPhone: '',
};

/**
 * "Empresas" = core.tenants — las compañías de asistencia al viajero que
 * contratan la plataforma, cada una con sus propios viajeros y
 * operadores (ver "Usuarios/viajeros" y "Operadores": ambos ya
 * scopeados por tenant vía RLS, un operador de una empresa nunca ve los
 * de otra). Gateada por canManageConfig — solo un superadmin de
 * OYSGROUP administra la lista de empresas; el resto ni siquiera puede
 * ver que existen otras (ver proposed-tenants-rls.sql).
 */
export function TenantsPage() {
  usePageTitle('Empresas');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const tenantsQuery = useQuery({
    queryKey: ['identity', 'tenants'],
    queryFn: async () => {
      const { data } = await apiClient.get<Tenant[]>('/identity/tenants');
      return data;
    },
  });

  const countryCatalog = useCatalog('COUNTRY');
  const { pageRows: tenantPageRows, page: tenantPage, setPage: setTenantPage, totalCount: tenantTotalCount } =
    usePagination(tenantsQuery.data ?? []);

  const setField = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post('/identity/tenants', {
        code: form.code,
        name: form.name,
        legalName: form.legalName || undefined,
        countryId: form.countryId || undefined,
        contactEmail: form.contactEmail || undefined,
        contactPhone: form.contactPhone || undefined,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['identity', 'tenants'] });
      setDialogOpen(false);
      setForm(EMPTY_FORM);
      setError(null);
    },
    onError: () => setError('No se pudo crear la empresa (¿código repetido?).'),
  });

  const openEdit = (tenant: Tenant) => {
    setEditingTenant(tenant);
    setEditForm({
      name: tenant.name,
      legalName: tenant.legalName ?? '',
      countryId: tenant.countryId ?? '',
      contactEmail: tenant.contactEmail ?? '',
      contactPhone: tenant.contactPhone ?? '',
      active: tenant.active,
      isPlatformAdmin: tenant.isPlatformAdmin,
    });
    setEditError(null);
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingTenant || !editForm) return;
      const { data } = await apiClient.patch(`/identity/tenants/${editingTenant.id}`, {
        name: editForm.name,
        legalName: editForm.legalName || undefined,
        countryId: editForm.countryId || undefined,
        contactEmail: editForm.contactEmail || undefined,
        contactPhone: editForm.contactPhone || undefined,
        active: editForm.active,
        isPlatformAdmin: editForm.isPlatformAdmin,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['identity', 'tenants'] });
      setEditingTenant(null);
      setEditForm(null);
    },
    onError: () => setEditError('No se pudo guardar el cambio.'),
  });

  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', mb: 2 }}>
        <Button variant="contained" onClick={() => setDialogOpen(true)}>
          Agregar empresa
        </Button>
      </Box>

      {tenantsQuery.isLoading && <CircularProgress />}
      {tenantsQuery.isError && (
        <Alert severity="error">No se pudieron cargar las empresas.</Alert>
      )}
      {tenantsQuery.data && tenantsQuery.data.length === 0 && (
        <Alert severity="info">Todavía no hay empresas cargadas.</Alert>
      )}

      {tenantsQuery.data && tenantsQuery.data.length > 0 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Código</TableCell>
                <TableCell>Nombre</TableCell>
                <TableCell>Razón social</TableCell>
                <TableCell>País</TableCell>
                <TableCell>Contacto</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Estado</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tenantPageRows.map((t) => (
                <TableRow key={t.id} hover onClick={() => openEdit(t)} sx={{ cursor: 'pointer' }}>
                  <TableCell>{t.code}</TableCell>
                  <TableCell>{t.name}</TableCell>
                  <TableCell>{t.legalName ?? '—'}</TableCell>
                  <TableCell>{labelFor(countryCatalog.data, t.countryId)}</TableCell>
                  <TableCell>{t.contactEmail ?? t.contactPhone ?? '—'}</TableCell>
                  <TableCell>
                    {t.isPlatformAdmin ? (
                      <Chip size="small" color="secondary" label="Administrador de plataforma" />
                    ) : (
                      <Chip size="small" variant="outlined" label="Empresa de asistencia" />
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      color={t.active ? 'success' : 'default'}
                      label={t.active ? 'Activa' : 'Inactiva'}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <PaginationFooter page={tenantPage} totalCount={tenantTotalCount} onPageChange={setTenantPage} />
        </TableContainer>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Agregar empresa</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Grid container spacing={1}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Código"
                fullWidth
                margin="normal"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                helperText="Único, ej. ACME01"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Nombre comercial"
                fullWidth
                margin="normal"
                value={form.name}
                onChange={setField('name')}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                label="Razón social"
                fullWidth
                margin="normal"
                value={form.legalName}
                onChange={setField('legalName')}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                select
                label="País"
                fullWidth
                margin="normal"
                value={form.countryId}
                onChange={setField('countryId')}
              >
                {(countryCatalog.data ?? []).map((o) => (
                  <MenuItem key={o.id} value={o.id}>{o.labelEs}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Email de contacto"
                type="email"
                fullWidth
                margin="normal"
                value={form.contactEmail}
                onChange={setField('contactEmail')}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Teléfono de contacto"
                fullWidth
                margin="normal"
                value={form.contactPhone}
                onChange={setField('contactPhone')}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={!form.code || !form.name || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            Crear
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!editingTenant} onClose={() => setEditingTenant(null)} fullWidth maxWidth="sm">
        <DialogTitle>
          Editar empresa{editingTenant ? `: ${editingTenant.name}` : ''}
        </DialogTitle>
        <DialogContent>
          {editError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {editError}
            </Alert>
          )}
          {editForm && (
            <Grid container spacing={1}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Nombre comercial"
                  fullWidth
                  margin="normal"
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => (f ? { ...f, name: e.target.value } : f))}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Razón social"
                  fullWidth
                  margin="normal"
                  value={editForm.legalName}
                  onChange={(e) => setEditForm((f) => (f ? { ...f, legalName: e.target.value } : f))}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  select
                  label="País"
                  fullWidth
                  margin="normal"
                  value={editForm.countryId}
                  onChange={(e) => setEditForm((f) => (f ? { ...f, countryId: e.target.value } : f))}
                >
                  {(countryCatalog.data ?? []).map((o) => (
                    <MenuItem key={o.id} value={o.id}>{o.labelEs}</MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Email de contacto"
                  type="email"
                  fullWidth
                  margin="normal"
                  value={editForm.contactEmail}
                  onChange={(e) => setEditForm((f) => (f ? { ...f, contactEmail: e.target.value } : f))}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Teléfono de contacto"
                  fullWidth
                  margin="normal"
                  value={editForm.contactPhone}
                  onChange={(e) => setEditForm((f) => (f ? { ...f, contactPhone: e.target.value } : f))}
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={editForm.active}
                      onChange={(e) => setEditForm((f) => (f ? { ...f, active: e.target.checked } : f))}
                    />
                  }
                  label={editForm.active ? 'Activa' : 'Inactiva'}
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={editForm.isPlatformAdmin}
                      onChange={(e) => setEditForm((f) => (f ? { ...f, isPlatformAdmin: e.target.checked } : f))}
                    />
                  }
                  label="Es el administrador general de la plataforma (no una empresa de asistencia al viajero)"
                />
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditingTenant(null)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={updateMutation.isPending}
            onClick={() => updateMutation.mutate()}
          >
            Guardar
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
