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
  Typography,
} from '@mui/material';

import { apiClient } from '../../lib/api-client';
import { labelFor, useCatalog } from '../../lib/catalog-hooks';

interface HealthcareOrganization {
  id: string;
  name: string;
  organizationTypeId: string;
  verificationStatusId: string;
  countryId?: string;
  stateProvince?: string;
  city?: string;
  address?: string;
  phone?: string;
}

interface FormState {
  name: string;
  organizationTypeId: string;
  countryId: string;
  stateProvince: string;
  city: string;
  address: string;
  phone: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  organizationTypeId: '',
  countryId: '',
  stateProvince: '',
  city: '',
  address: '',
  phone: '',
};

export function MedicalCentersPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const orgsQuery = useQuery({
    queryKey: ['clinical', 'healthcare-organizations'],
    queryFn: async () => {
      const { data } = await apiClient.get<HealthcareOrganization[]>(
        '/clinical/healthcare-organizations',
      );
      return data;
    },
  });

  const typeCatalog = useCatalog('ORGANIZATION_TYPE');
  const verificationCatalog = useCatalog('ORG_VERIFICATION_STATUS');
  const countryCatalog = useCatalog('COUNTRY');

  const setField = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const createMutation = useMutation({
    mutationFn: async () => {
      const unverified = verificationCatalog.data?.find(
        (v) => v.code === 'UNVERIFIED',
      );
      const { data } = await apiClient.post('/clinical/healthcare-organizations', {
        name: form.name,
        organizationTypeId: form.organizationTypeId,
        countryId: form.countryId || undefined,
        stateProvince: form.stateProvince || undefined,
        city: form.city || undefined,
        address: form.address || undefined,
        phone: form.phone || undefined,
        verificationStatusId: unverified?.id,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['clinical', 'healthcare-organizations'],
      });
      setDialogOpen(false);
      setForm(EMPTY_FORM);
      setError(null);
    },
    onError: () => setError('No se pudo crear el centro médico.'),
  });

  const locationLabel = (o: HealthcareOrganization) => {
    const parts = [o.city, o.stateProvince, labelFor(countryCatalog.data, o.countryId)].filter(
      (p) => p && p !== '—',
    );
    return parts.length > 0 ? parts.join(', ') : '—';
  };

  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4">Centros médicos</Typography>
        <Button variant="contained" onClick={() => setDialogOpen(true)}>
          Agregar centro
        </Button>
      </Box>

      {orgsQuery.isLoading && <CircularProgress />}
      {orgsQuery.isError && (
        <Alert severity="error">No se pudieron cargar los centros médicos.</Alert>
      )}
      {orgsQuery.data && orgsQuery.data.length === 0 && (
        <Alert severity="info">Todavía no hay centros médicos cargados.</Alert>
      )}

      {orgsQuery.data && orgsQuery.data.length > 0 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Nombre</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Ubicación</TableCell>
                <TableCell>Dirección</TableCell>
                <TableCell>Teléfono</TableCell>
                <TableCell>Verificación</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {orgsQuery.data.map((o) => (
                <TableRow key={o.id} hover>
                  <TableCell>{o.name}</TableCell>
                  <TableCell>{labelFor(typeCatalog.data, o.organizationTypeId)}</TableCell>
                  <TableCell>{locationLabel(o)}</TableCell>
                  <TableCell>{o.address ?? '—'}</TableCell>
                  <TableCell>{o.phone ?? '—'}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={labelFor(verificationCatalog.data, o.verificationStatusId)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Agregar centro médico</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Grid container spacing={1}>
            <Grid size={{ xs: 12 }}>
              <TextField
                label="Nombre"
                fullWidth
                margin="normal"
                value={form.name}
                onChange={setField('name')}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                select
                label="Tipo"
                fullWidth
                margin="normal"
                value={form.organizationTypeId}
                onChange={setField('organizationTypeId')}
              >
                {(typeCatalog.data ?? []).map((opt) => (
                  <MenuItem key={opt.id} value={opt.id}>
                    {opt.labelEs}
                  </MenuItem>
                ))}
              </TextField>
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
                {(countryCatalog.data ?? []).map((opt) => (
                  <MenuItem key={opt.id} value={opt.id}>
                    {opt.labelEs}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Provincia / Estado"
                fullWidth
                margin="normal"
                value={form.stateProvince}
                onChange={setField('stateProvince')}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Ciudad"
                fullWidth
                margin="normal"
                value={form.city}
                onChange={setField('city')}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                label="Dirección (calle y número)"
                fullWidth
                margin="normal"
                value={form.address}
                onChange={setField('address')}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Teléfono"
                fullWidth
                margin="normal"
                value={form.phone}
                onChange={setField('phone')}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={!form.name || !form.organizationTypeId || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            Crear
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
