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
import { PaginationFooter, usePagination } from '../../lib/pagination';

interface HealthcareProfessional {
  id: string;
  firstName: string;
  lastName: string;
  specialtyId?: string;
  licenseNumber?: string;
  institution?: string;
  trustLevelId: string;
  isActive: boolean;
}

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  docTypeId: string;
  docNumber: string;
  countryId: string;
  specialtyId: string;
  licenseNumber: string;
  institution: string;
}

const EMPTY_FORM: FormState = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  docTypeId: '',
  docNumber: '',
  countryId: '',
  specialtyId: '',
  licenseNumber: '',
  institution: '',
};

export function ProfessionalsPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ['clinical', 'healthcare-professionals'],
    queryFn: async () => {
      const { data } = await apiClient.get<HealthcareProfessional[]>(
        '/clinical/healthcare-professionals',
      );
      return data;
    },
  });

  const specialtyCatalog = useCatalog('MEDICAL_SPECIALTY');
  const trustLevelCatalog = useCatalog('PROFESSIONAL_TRUST_LEVEL');
  const docTypeCatalog = useCatalog('DOCUMENT_TYPE');
  const countryCatalog = useCatalog('COUNTRY');

  const setField = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post('/clinical/professionals-registration', {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        password: form.password,
        docTypeId: form.docTypeId,
        docNumber: form.docNumber,
        countryId: form.countryId,
        specialtyId: form.specialtyId || undefined,
        licenseNumber: form.licenseNumber || undefined,
        institution: form.institution || undefined,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['clinical', 'healthcare-professionals'],
      });
      setDialogOpen(false);
      setForm(EMPTY_FORM);
      setError(null);
    },
    onError: () => setError('No se pudo registrar el profesional (¿email o documento ya usado?).'),
  });

  const { pageRows: professionalPageRows, page: professionalPage, setPage: setProfessionalPage, totalCount: professionalTotalCount } =
    usePagination(listQuery.data ?? []);

  const isFormValid =
    form.firstName &&
    form.lastName &&
    form.email &&
    form.password.length >= 8 &&
    form.docTypeId &&
    form.docNumber &&
    form.countryId;

  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4">Profesionales</Typography>
        <Button variant="contained" onClick={() => setDialogOpen(true)}>
          Agregar profesional
        </Button>
      </Box>

      {listQuery.isLoading && <CircularProgress />}
      {listQuery.isError && (
        <Alert severity="error">No se pudieron cargar los profesionales.</Alert>
      )}
      {listQuery.data && listQuery.data.length === 0 && (
        <Alert severity="info">Todavía no hay profesionales registrados.</Alert>
      )}

      {listQuery.data && listQuery.data.length > 0 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Nombre</TableCell>
                <TableCell>Especialidad</TableCell>
                <TableCell>Matrícula</TableCell>
                <TableCell>Institución</TableCell>
                <TableCell>Nivel de confianza</TableCell>
                <TableCell>Estado</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {professionalPageRows.map((p) => (
                <TableRow key={p.id} hover>
                  <TableCell>{p.firstName} {p.lastName}</TableCell>
                  <TableCell>{labelFor(specialtyCatalog.data, p.specialtyId)}</TableCell>
                  <TableCell>{p.licenseNumber ?? '—'}</TableCell>
                  <TableCell>{p.institution ?? '—'}</TableCell>
                  <TableCell>
                    <Chip size="small" label={labelFor(trustLevelCatalog.data, p.trustLevelId)} />
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      color={p.isActive ? 'success' : 'default'}
                      label={p.isActive ? 'Activo' : 'Inactivo'}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <PaginationFooter page={professionalPage} totalCount={professionalTotalCount} onPageChange={setProfessionalPage} />
        </TableContainer>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Agregar profesional</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Alert severity="info" sx={{ mb: 2 }}>
            El profesional queda con nivel de confianza "Registrado" — la
            verificación de identidad/matrícula es un flujo aparte.
          </Alert>
          <Grid container spacing={1}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Nombre"
                fullWidth
                margin="normal"
                value={form.firstName}
                onChange={setField('firstName')}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Apellido"
                fullWidth
                margin="normal"
                value={form.lastName}
                onChange={setField('lastName')}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Email"
                type="email"
                fullWidth
                margin="normal"
                value={form.email}
                onChange={setField('email')}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Contraseña temporal"
                type="password"
                fullWidth
                margin="normal"
                value={form.password}
                onChange={setField('password')}
                helperText="Mínimo 8 caracteres"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                select
                label="Tipo de documento"
                fullWidth
                margin="normal"
                value={form.docTypeId}
                onChange={setField('docTypeId')}
              >
                {(docTypeCatalog.data ?? []).map((o) => (
                  <MenuItem key={o.id} value={o.id}>{o.labelEs}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Número de documento"
                fullWidth
                margin="normal"
                value={form.docNumber}
                onChange={setField('docNumber')}
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
                select
                label="Especialidad"
                fullWidth
                margin="normal"
                value={form.specialtyId}
                onChange={setField('specialtyId')}
              >
                {(specialtyCatalog.data ?? []).map((o) => (
                  <MenuItem key={o.id} value={o.id}>{o.labelEs}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="N° de matrícula"
                fullWidth
                margin="normal"
                value={form.licenseNumber}
                onChange={setField('licenseNumber')}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Institución"
                fullWidth
                margin="normal"
                value={form.institution}
                onChange={setField('institution')}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={!isFormValid || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            Crear
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
