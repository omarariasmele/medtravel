import { useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
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
  Typography,
} from '@mui/material';

import { useAuth } from '../../auth/auth-context';
import { apiClient } from '../../lib/api-client';
import { labelFor, useCatalog } from '../../lib/catalog-hooks';

interface Trip {
  id: string;
  memberId: string;
  tripName?: string;
  tripStart: string;
  tripEnd: string;
  statusId: string;
  notes?: string;
}

interface Member {
  id: string;
  personId: string;
  tenantId: string;
}

interface Tenant {
  id: string;
  name: string;
}

interface Person {
  id: string;
  firstName: string;
  lastName: string;
}

interface FormState {
  memberId: string;
  tripName: string;
  tripStart: string;
  tripEnd: string;
}

const EMPTY_FORM: FormState = { memberId: '', tripName: '', tripStart: '', tripEnd: '' };

export function TripsListPage() {
  const { claims } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [tenantFilter, setTenantFilter] = useState('');
  const queryClient = useQueryClient();

  const tripsQuery = useQuery({
    queryKey: ['operations', 'trips'],
    queryFn: async () => {
      const { data } = await apiClient.get<Trip[]>('/operations/trips');
      return data;
    },
  });

  const membersQuery = useQuery({
    queryKey: ['identity', 'members'],
    queryFn: async () => {
      const { data } = await apiClient.get<Member[]>('/identity/members');
      return data;
    },
  });

  const personQueries = useQueries({
    queries: (membersQuery.data ?? []).map((m) => ({
      queryKey: ['identity', 'persons', m.personId],
      queryFn: async () => {
        const { data } = await apiClient.get<Person>(`/identity/persons/${m.personId}`);
        return data;
      },
    })),
  });

  const personByMemberId = new Map(
    (membersQuery.data ?? []).map((m, i) => [m.id, personQueries[i]?.data]),
  );

  const tenantsQuery = useQuery({
    queryKey: ['identity', 'tenants'],
    queryFn: async () => {
      const { data } = await apiClient.get<Tenant[]>('/identity/tenants');
      return data;
    },
  });

  const tenantNameById = new Map((tenantsQuery.data ?? []).map((t) => [t.id, t.name]));
  const tenantIdByMemberId = new Map((membersQuery.data ?? []).map((m) => [m.id, m.tenantId]));

  const statusCatalog = useCatalog('TRIP_STATUS');

  const createMutation = useMutation({
    mutationFn: async () => {
      const planned = statusCatalog.data?.find((s) => s.code === 'PLANNED');
      const { data } = await apiClient.post('/operations/trips', {
        memberId: form.memberId,
        tripName: form.tripName || undefined,
        tripStart: form.tripStart,
        tripEnd: form.tripEnd,
        statusId: planned?.id,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['operations', 'trips'] });
      setDialogOpen(false);
      setForm(EMPTY_FORM);
      setError(null);
    },
    onError: () => setError('No se pudo crear el viaje.'),
  });

  const memberLabel = (memberId: string) => {
    const person = personByMemberId.get(memberId);
    return person ? `${person.firstName} ${person.lastName}` : '—';
  };

  const filteredTrips = (tripsQuery.data ?? []).filter(
    (t) => !tenantFilter || tenantIdByMemberId.get(t.memberId) === tenantFilter,
  );

  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4">Viajes</Typography>
        <Button variant="contained" onClick={() => setDialogOpen(true)}>
          Agregar viaje
        </Button>
      </Box>

      {claims?.canManageConfig && (tenantsQuery.data?.length ?? 0) > 1 && (
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

      {tripsQuery.isLoading && <CircularProgress />}
      {tripsQuery.isError && <Alert severity="error">No se pudieron cargar los viajes.</Alert>}
      {tripsQuery.data && tripsQuery.data.length === 0 && (
        <Alert severity="info">No hay viajes registrados en este tenant.</Alert>
      )}
      {tripsQuery.data && tripsQuery.data.length > 0 && filteredTrips.length === 0 && (
        <Alert severity="info">Sin viajes para esta empresa.</Alert>
      )}

      {filteredTrips.length > 0 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Viajero</TableCell>
                <TableCell>Empresa</TableCell>
                <TableCell>Nombre del viaje</TableCell>
                <TableCell>Inicio</TableCell>
                <TableCell>Fin</TableCell>
                <TableCell>Estado</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredTrips.map((t) => (
                <TableRow key={t.id} hover>
                  <TableCell>{memberLabel(t.memberId)}</TableCell>
                  <TableCell>{tenantNameById.get(tenantIdByMemberId.get(t.memberId) ?? '') ?? '—'}</TableCell>
                  <TableCell>{t.tripName ?? '—'}</TableCell>
                  <TableCell>{new Date(t.tripStart).toLocaleDateString('es-AR')}</TableCell>
                  <TableCell>{new Date(t.tripEnd).toLocaleDateString('es-AR')}</TableCell>
                  <TableCell>
                    <Chip size="small" label={labelFor(statusCatalog.data, t.statusId)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Agregar viaje</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Grid container spacing={1}>
            <Grid size={{ xs: 12 }}>
              <TextField
                select
                label="Viajero"
                fullWidth
                margin="normal"
                value={form.memberId}
                onChange={(e) => setForm((f) => ({ ...f, memberId: e.target.value }))}
              >
                {(membersQuery.data ?? []).map((m) => (
                  <MenuItem key={m.id} value={m.id}>
                    {memberLabel(m.id)}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                label="Nombre del viaje"
                fullWidth
                margin="normal"
                value={form.tripName}
                onChange={(e) => setForm((f) => ({ ...f, tripName: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Inicio"
                type="date"
                fullWidth
                margin="normal"
                slotProps={{ inputLabel: { shrink: true } }}
                value={form.tripStart}
                onChange={(e) => setForm((f) => ({ ...f, tripStart: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Fin"
                type="date"
                fullWidth
                margin="normal"
                slotProps={{ inputLabel: { shrink: true } }}
                value={form.tripEnd}
                onChange={(e) => setForm((f) => ({ ...f, tripEnd: e.target.value }))}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={
              !form.memberId || !form.tripStart || !form.tripEnd || createMutation.isPending
            }
            onClick={() => createMutation.mutate()}
          >
            Crear
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
