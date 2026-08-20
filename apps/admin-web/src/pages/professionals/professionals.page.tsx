import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Checkbox,
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

interface HealthcareProfessional {
  id: string;
  firstName: string;
  lastName: string;
  countryId?: string;
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

/**
 * Pedido explícito del usuario: "profesionales lo mismo que pólizas, se
 * tiene que poder editar no solo para confirmar al profesional sino
 * para visualizar su información" — antes la fila no tenía ningún click
 * ni forma de ver/corregir un dato mal cargado (nombre, país,
 * especialidad, matrícula, institución) ni de subir su nivel de
 * confianza a mano. Sin email/password/documento acá a propósito: esos
 * son de alta única (identidad del user, doc encriptado con manejo
 * especial) — no se re-editan desde este formulario genérico.
 */
interface EditFormState {
  firstName: string;
  lastName: string;
  countryId: string;
  specialtyId: string;
  licenseNumber: string;
  institution: string;
  trustLevelId: string;
  isActive: boolean;
}

export function ProfessionalsPage() {
  usePageTitle('Profesionales');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [specialtyFilter, setSpecialtyFilter] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [editingProfessional, setEditingProfessional] = useState<HealthcareProfessional | null>(null);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
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

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingProfessional || !editForm) return;
      const { data } = await apiClient.patch(
        `/clinical/healthcare-professionals/${editingProfessional.id}`,
        {
          firstName: editForm.firstName,
          lastName: editForm.lastName,
          countryId: editForm.countryId,
          specialtyId: editForm.specialtyId || undefined,
          licenseNumber: editForm.licenseNumber || undefined,
          institution: editForm.institution || undefined,
          trustLevelId: editForm.trustLevelId,
          isActive: editForm.isActive,
        },
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['clinical', 'healthcare-professionals'],
      });
      setEditingProfessional(null);
      setEditForm(null);
      setEditError(null);
    },
    onError: () => setEditError('No se pudo guardar el cambio.'),
  });

  const openEdit = (p: HealthcareProfessional) => {
    setEditingProfessional(p);
    setEditForm({
      firstName: p.firstName,
      lastName: p.lastName,
      countryId: p.countryId ?? '',
      specialtyId: p.specialtyId ?? '',
      licenseNumber: p.licenseNumber ?? '',
      institution: p.institution ?? '',
      trustLevelId: p.trustLevelId,
      isActive: p.isActive,
    });
    setEditError(null);
  };

  const normalizedSearch = search.trim().toLowerCase();
  const filteredProfessionals = (listQuery.data ?? []).filter(
    (p) =>
      (!normalizedSearch || `${p.firstName} ${p.lastName}`.toLowerCase().includes(normalizedSearch)) &&
      (!specialtyFilter || p.specialtyId === specialtyFilter) &&
      (!countryFilter || p.countryId === countryFilter),
  );
  const { pageRows: professionalPageRows, page: professionalPage, setPage: setProfessionalPage, totalCount: professionalTotalCount } =
    usePagination(filteredProfessionals);

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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2, flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <TextField
            label="Buscar por nombre"
            size="small"
            sx={{ minWidth: 240 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <TextField
            select
            label="Filtrar por especialidad"
            size="small"
            sx={{ minWidth: 220 }}
            value={specialtyFilter}
            onChange={(e) => setSpecialtyFilter(e.target.value)}
          >
            <MenuItem value="">Todas las especialidades</MenuItem>
            {(specialtyCatalog.data ?? []).map((s) => (
              <MenuItem key={s.id} value={s.id}>{s.labelEs}</MenuItem>
            ))}
          </TextField>
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
        </Box>
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
      {listQuery.data && listQuery.data.length > 0 && filteredProfessionals.length === 0 && (
        <Alert severity="info">Sin profesionales para este filtro.</Alert>
      )}

      {filteredProfessionals.length > 0 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Nombre</TableCell>
                <TableCell>País</TableCell>
                <TableCell>Especialidad</TableCell>
                <TableCell>Matrícula</TableCell>
                <TableCell>Institución</TableCell>
                <TableCell>Nivel de confianza</TableCell>
                <TableCell>Estado</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {professionalPageRows.map((p) => (
                <TableRow key={p.id} hover onClick={() => openEdit(p)} sx={{ cursor: 'pointer' }}>
                  <TableCell>{p.firstName} {p.lastName}</TableCell>
                  <TableCell>{labelFor(countryCatalog.data, p.countryId)}</TableCell>
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

      <Dialog open={!!editingProfessional} onClose={() => setEditingProfessional(null)} fullWidth maxWidth="sm">
        <DialogTitle>
          Profesional{editingProfessional ? `: ${editingProfessional.firstName} ${editingProfessional.lastName}` : ''}
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
                  label="Nombre"
                  fullWidth
                  margin="normal"
                  value={editForm.firstName}
                  onChange={(e) => setEditForm((f) => (f ? { ...f, firstName: e.target.value } : f))}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Apellido"
                  fullWidth
                  margin="normal"
                  value={editForm.lastName}
                  onChange={(e) => setEditForm((f) => (f ? { ...f, lastName: e.target.value } : f))}
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
                  select
                  label="Especialidad"
                  fullWidth
                  margin="normal"
                  value={editForm.specialtyId}
                  onChange={(e) => setEditForm((f) => (f ? { ...f, specialtyId: e.target.value } : f))}
                >
                  <MenuItem value="">Sin especificar</MenuItem>
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
                  value={editForm.licenseNumber}
                  onChange={(e) => setEditForm((f) => (f ? { ...f, licenseNumber: e.target.value } : f))}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Institución"
                  fullWidth
                  margin="normal"
                  value={editForm.institution}
                  onChange={(e) => setEditForm((f) => (f ? { ...f, institution: e.target.value } : f))}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  select
                  label="Nivel de confianza"
                  fullWidth
                  margin="normal"
                  value={editForm.trustLevelId}
                  onChange={(e) => setEditForm((f) => (f ? { ...f, trustLevelId: e.target.value } : f))}
                  helperText="Subir el nivel acá es la forma de confirmar/verificar al profesional"
                >
                  {(trustLevelCatalog.data ?? []).map((o) => (
                    <MenuItem key={o.id} value={o.id}>{o.labelEs}</MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }} sx={{ display: 'flex', alignItems: 'center' }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={editForm.isActive}
                      onChange={(e) => setEditForm((f) => (f ? { ...f, isActive: e.target.checked } : f))}
                    />
                  }
                  label="Activo"
                />
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditingProfessional(null)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={!editForm?.firstName || !editForm?.lastName || updateMutation.isPending}
            onClick={() => updateMutation.mutate()}
          >
            Guardar
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
