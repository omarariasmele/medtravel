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
  city?: string;
  phone?: string;
}

export function MedicalCentersPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [orgTypeId, setOrgTypeId] = useState('');
  const [city, setCity] = useState('');
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

  const createMutation = useMutation({
    mutationFn: async () => {
      const unverified = verificationCatalog.data?.find(
        (v) => v.code === 'UNVERIFIED',
      );
      const { data } = await apiClient.post('/clinical/healthcare-organizations', {
        name,
        organizationTypeId: orgTypeId,
        city: city || undefined,
        verificationStatusId: unverified?.id,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['clinical', 'healthcare-organizations'],
      });
      setDialogOpen(false);
      setName('');
      setOrgTypeId('');
      setCity('');
      setError(null);
    },
    onError: () => setError('No se pudo crear el centro médico.'),
  });

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
                <TableCell>Ciudad</TableCell>
                <TableCell>Verificación</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {orgsQuery.data.map((o) => (
                <TableRow key={o.id} hover>
                  <TableCell>{o.name}</TableCell>
                  <TableCell>{labelFor(typeCatalog.data, o.organizationTypeId)}</TableCell>
                  <TableCell>{o.city ?? '—'}</TableCell>
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
          <TextField
            label="Nombre"
            fullWidth
            margin="normal"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <TextField
            select
            label="Tipo"
            fullWidth
            margin="normal"
            value={orgTypeId}
            onChange={(e) => setOrgTypeId(e.target.value)}
          >
            {(typeCatalog.data ?? []).map((opt) => (
              <MenuItem key={opt.id} value={opt.id}>
                {opt.labelEs}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Ciudad"
            fullWidth
            margin="normal"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={!name || !orgTypeId || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            Crear
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
