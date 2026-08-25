import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';

import { useAuth } from '../../auth/auth-context';
import { apiClient } from '../../lib/api-client';
import { labelFor, useCatalog } from '../../lib/catalog-hooks';
import { usePageTitle } from '../../lib/page-title';
import { ClinicalHistorySection } from '../cases/clinical-history.section';

interface Person {
  id: string;
  firstName: string;
  lastName: string;
  photoPath?: string | null;
}

interface EmergencyContact {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  relationshipTypeId: string;
}

interface HealthCoverage {
  id: string;
  coverageName: string;
  coverageTypeId: string;
  providerName: string;
  providerId?: string;
  memberNumber?: string;
  validFrom?: string;
  validUntil?: string;
  statusId: string;
  isPrimary: boolean;
}

function isCurrentlyValid(validUntil?: string | null): boolean {
  if (!validUntil) return true;
  return new Date(validUntil) >= new Date(new Date().toDateString());
}

function ValidityChip({ validUntil }: { validUntil?: string | null }) {
  const active = isCurrentlyValid(validUntil);
  return <Chip size="small" color={active ? 'success' : 'default'} label={active ? 'Activo' : 'Vencido'} />;
}

interface HealthCoverageFormState {
  coverageName: string;
  coverageTypeId: string;
  providerName: string;
  memberNumber: string;
  validFrom: string;
  validUntil: string;
  isPrimary: boolean;
}

const EMPTY_HC_FORM: HealthCoverageFormState = {
  coverageName: '',
  coverageTypeId: '',
  providerName: '',
  memberNumber: '',
  validFrom: '',
  validUntil: '',
  isPrimary: false,
};

/**
 * Ficha de un viajero SIN cobertura (sin core.members) — pedido
 * explícito del usuario: "poder editar el usuario para ver la
 * información que cargó en su celular, igual a la consulta de
 * Usuarios". Mismo contenido que traveler-detail.page.tsx pero sin las
 * secciones atadas a un member/tenant (no tiene ninguno todavía): sin
 * card de empresa/N° de member/estado/onboarding, sin "Plan de
 * asistencia al viajero". El resto (foto, teléfono, documento,
 * cobertura médica propia, contactos de emergencia, historia clínica)
 * ya es 100% person_id-based, así que es el mismo camino que usa el
 * propio viajero desde la app.
 */
export function TravelerWithoutCoverageDetailPage() {
  const { personId } = useParams<{ personId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { claims } = useAuth();

  const [hcOpen, setHcOpen] = useState(false);
  const [hcForm, setHcForm] = useState<HealthCoverageFormState>(EMPTY_HC_FORM);
  const [hcError, setHcError] = useState<string | null>(null);

  // Pedido explícito del usuario: "en usuarios sin cobertura no
  // pusiste el botón de borrar al usuario" — traveler-detail.page.tsx
  // (viajeros CON cobertura) ya tiene esta "Zona de pruebas" desde
  // antes; esta ficha (viajeros SIN cobertura todavía) es una pantalla
  // aparte que nunca la tuvo. Mismo mecanismo: reset de ficha de salud
  // + baja de cuenta completa, para poder reprobar desde cero con el
  // mismo viajero de prueba.
  const [resetOpen, setResetOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const resetMutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.delete(`/clinical/persons/${personId}/health-record`);
      return data;
    },
    onSuccess: () => {
      window.location.reload();
    },
  });

  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deleteAccountConfirmText, setDeleteAccountConfirmText] = useState('');
  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.delete(`/identity/persons/${personId}/delete-test-traveler`);
      return data;
    },
    onSuccess: () => {
      navigate('/travelers-without-coverage');
    },
  });

  const personQuery = useQuery({
    queryKey: ['identity', 'persons', personId],
    queryFn: async () => {
      const { data } = await apiClient.get<Person>(`/identity/persons/${personId}`);
      return data;
    },
    enabled: !!personId,
  });

  const emailQuery = useQuery({
    queryKey: ['identity', 'persons', personId, 'email'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ email: string }>(`/identity/persons/${personId}/email`);
      return data;
    },
    enabled: !!personId,
    retry: false,
  });

  const phoneQuery = useQuery({
    queryKey: ['identity', 'persons', personId, 'phone'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ phone: string | null; phoneVerified: boolean }>(
        `/identity/persons/${personId}/phone`,
      );
      return data;
    },
    enabled: !!personId,
    retry: false,
  });

  const documentQuery = useQuery({
    queryKey: ['identity', 'persons', personId, 'document'],
    queryFn: async () => {
      const { data } = await apiClient.get<{
        docTypeId: string;
        docNumber: string;
        docCountryId: string | null;
      }>(`/identity/persons/${personId}/document`);
      return data;
    },
    enabled: !!personId,
    retry: false,
  });

  const documentTypeCatalog = useCatalog('DOCUMENT_TYPE');
  const countryCatalog = useCatalog('COUNTRY');
  const relationshipTypeCatalog = useCatalog('RELATIONSHIP_TYPE');
  const healthCoverageTypeCatalog = useCatalog('HEALTH_COVERAGE_TYPE');
  const healthCoverageStatusCatalog = useCatalog('HEALTH_COVERAGE_STATUS');

  const contactsQuery = useQuery({
    queryKey: ['identity', 'member-contacts', personId],
    queryFn: async () => {
      const { data } = await apiClient.get<EmergencyContact[]>('/identity/member-contacts', {
        params: { personId },
      });
      return data;
    },
    enabled: !!personId,
  });

  const healthCoveragesQuery = useQuery({
    queryKey: ['coverage', 'health-coverages', personId],
    queryFn: async () => {
      const { data } = await apiClient.get<HealthCoverage[]>('/coverage/health-coverages', {
        params: { personId },
      });
      return data;
    },
    enabled: !!personId,
  });

  const createHcMutation = useMutation({
    mutationFn: async () => {
      const active = healthCoverageStatusCatalog.data?.find((s) => s.code === 'ACTIVE');
      const { data } = await apiClient.post('/coverage/health-coverages', {
        personId,
        coverageName: hcForm.coverageName,
        coverageTypeId: hcForm.coverageTypeId,
        providerName: hcForm.providerName,
        memberNumber: hcForm.memberNumber || undefined,
        validFrom: hcForm.validFrom || undefined,
        validUntil: hcForm.validUntil || undefined,
        isPrimary: hcForm.isPrimary,
        statusId: active?.id,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coverage', 'health-coverages'] });
      setHcOpen(false);
      setHcForm(EMPTY_HC_FORM);
      setHcError(null);
    },
    onError: () => setHcError('No se pudo guardar la cobertura.'),
  });

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!personQuery.data?.photoPath || !personId) {
      setPhotoUrl(null);
      return;
    }
    let objectUrl: string | null = null;
    apiClient
      .get(`/identity/persons/${personId}/photo`, { responseType: 'blob' })
      .then(({ data }) => {
        objectUrl = URL.createObjectURL(data);
        setPhotoUrl(objectUrl);
      })
      .catch(() => setPhotoUrl(null));
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [personId, personQuery.data?.photoPath]);

  usePageTitle(personQuery.data ? `${personQuery.data.firstName} ${personQuery.data.lastName}` : 'Viajero');

  if (personQuery.isLoading) return <CircularProgress />;
  if (personQuery.isError || !personQuery.data) {
    return <Alert severity="error">No se encontró el viajero solicitado.</Alert>;
  }

  const person = personQuery.data;

  return (
    <>
      <Button onClick={() => navigate('/travelers-without-coverage')} sx={{ mb: 2 }}>
        ← Volver a usuarios sin cobertura
      </Button>

      <Alert severity="info" sx={{ mb: 2 }}>
        Este viajero todavía no está afiliado a ninguna empresa de asistencia al viajero — se
        muestra solo lo que cargó por su cuenta desde la app.
      </Alert>

      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Avatar src={photoUrl ?? undefined} sx={{ width: 56, height: 56 }}>
            {person.firstName.charAt(0)}
          </Avatar>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6">
              {person.firstName} {person.lastName}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {emailQuery.data?.email ?? '—'}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" color="text.secondary">
                {phoneQuery.data?.phone ?? 'Sin teléfono cargado'}
              </Typography>
              {phoneQuery.data?.phone && (
                <Chip
                  size="small"
                  color={phoneQuery.data.phoneVerified ? 'success' : 'default'}
                  label={phoneQuery.data.phoneVerified ? 'Verificado' : 'No verificado'}
                />
              )}
            </Box>
            <Typography variant="body2" color="text.secondary">
              {documentQuery.data
                ? `${labelFor(documentTypeCatalog.data, documentQuery.data.docTypeId)} ${documentQuery.data.docNumber}${
                    documentQuery.data.docCountryId
                      ? ` (${labelFor(countryCatalog.data, documentQuery.data.docCountryId)})`
                      : ''
                  }`
                : 'Sin documento cargado'}
            </Typography>
          </Box>
        </CardContent>
      </Card>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="h6">Seguro médico / obra social</Typography>
            <Button size="small" variant="outlined" onClick={() => setHcOpen(true)}>
              Agregar cobertura
            </Button>
          </Box>
          {healthCoveragesQuery.isLoading && <CircularProgress size={24} />}
          {(healthCoveragesQuery.data?.length ?? 0) === 0 && !healthCoveragesQuery.isLoading && (
            <Alert severity="info">
              Sin datos de seguro médico / obra social visibles — puede que no tenga cargado, o
              que no haya dado consentimiento.
            </Alert>
          )}
          {healthCoveragesQuery.data && healthCoveragesQuery.data.length > 0 && (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Tipo</TableCell>
                  <TableCell>Cobertura</TableCell>
                  <TableCell>Prestador</TableCell>
                  <TableCell>N° de afiliado</TableCell>
                  <TableCell>Alta</TableCell>
                  <TableCell>Baja</TableCell>
                  <TableCell>Estado</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {healthCoveragesQuery.data.map((hc) => (
                  <TableRow key={hc.id}>
                    <TableCell>{labelFor(healthCoverageTypeCatalog.data, hc.coverageTypeId)}</TableCell>
                    <TableCell>
                      {hc.coverageName} {hc.isPrimary && <Chip size="small" color="primary" label="Principal" />}
                      {hc.providerId && (
                        <Chip size="small" variant="outlined" label="Cargado desde la app" sx={{ ml: 0.5 }} />
                      )}
                    </TableCell>
                    <TableCell>{hc.providerName}</TableCell>
                    <TableCell>{hc.memberNumber ?? '—'}</TableCell>
                    <TableCell>{hc.validFrom ?? '—'}</TableCell>
                    <TableCell>{hc.validUntil ?? '—'}</TableCell>
                    <TableCell>
                      <ValidityChip validUntil={hc.validUntil} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 1 }}>
            Contactos de emergencia
          </Typography>
          {contactsQuery.isLoading && <CircularProgress size={24} />}
          {(contactsQuery.data?.length ?? 0) === 0 && !contactsQuery.isLoading && (
            <Alert severity="info">El viajero no cargó ningún contacto de emergencia.</Alert>
          )}
          {contactsQuery.data && contactsQuery.data.length > 0 && (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Nombre</TableCell>
                  <TableCell>Parentesco</TableCell>
                  <TableCell>Teléfono</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {contactsQuery.data.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.firstName} {c.lastName}</TableCell>
                    <TableCell>{labelFor(relationshipTypeCatalog.data, c.relationshipTypeId)}</TableCell>
                    <TableCell>{c.phone}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ClinicalHistorySection personId={person.id} />

      {claims?.canManageConfig && (
        <Card sx={{ mt: 2, borderColor: 'error.main', borderWidth: 1, borderStyle: 'solid' }}>
          <CardContent>
            <Typography variant="subtitle1" color="error" gutterBottom>
              Zona de pruebas
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Borra TODAS las condiciones, alergias, medicamentos, cirugías e implantes de este viajero, y el
              historial de charlas con el asistente de IA — para poder probar la carga desde cero. No se puede
              deshacer.
            </Typography>
            <Button variant="outlined" color="error" onClick={() => setResetOpen(true)}>
              Borrar antecedentes de salud
            </Button>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 3, mb: 2 }}>
              Da de baja la cuenta COMPLETA de este viajero (perfil, login, contactos, viajes, tokens
              para compartir) — para poder registrarlo de cero con el mismo nombre. No se puede deshacer.
            </Typography>
            <Button variant="outlined" color="error" onClick={() => setDeleteAccountOpen(true)}>
              Dar de baja cuenta completa
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={resetOpen}
        onClose={() => {
          setResetOpen(false);
          setResetConfirmText('');
        }}
      >
        <DialogTitle color="error">¿Borrar todos los antecedentes de salud?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Se van a borrar de forma permanente todas las condiciones, alergias, medicamentos, cirugías e
            implantes de {person?.firstName} {person?.lastName}, además del historial de charlas con el
            asistente de IA. Esta acción no se puede deshacer.
          </Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Escribí <strong>BORRAR</strong> para confirmar.
          </Typography>
          <TextField
            fullWidth
            size="small"
            value={resetConfirmText}
            onChange={(e) => setResetConfirmText(e.target.value)}
            autoFocus
          />
          {resetMutation.isError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              No se pudo borrar el historial de salud
              {resetMutation.error instanceof AxiosError
                ? ` (${resetMutation.error.response?.status ?? 'sin respuesta del servidor'}${
                    resetMutation.error.response?.data?.message
                      ? `: ${resetMutation.error.response.data.message}`
                      : ''
                  })`
                : ''}
              .
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setResetOpen(false);
              setResetConfirmText('');
            }}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            color="error"
            disabled={resetConfirmText !== 'BORRAR' || resetMutation.isPending}
            onClick={() => resetMutation.mutate()}
          >
            Borrar definitivamente
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={deleteAccountOpen}
        onClose={() => {
          setDeleteAccountOpen(false);
          setDeleteAccountConfirmText('');
        }}
      >
        <DialogTitle color="error">¿Dar de baja la cuenta completa?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Se va a borrar de forma permanente el perfil, login, ficha de salud, contactos de emergencia,
            documento, viajes, inscripciones de cobertura y tokens para compartir de{' '}
            <strong>{person?.firstName} {person?.lastName}</strong>. Esta acción no se puede deshacer, y
            la persona va a tener que registrarse de nuevo desde cero.
          </Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Escribí el nombre completo (<strong>{person?.firstName} {person?.lastName}</strong>) para confirmar.
          </Typography>
          <TextField
            fullWidth
            size="small"
            value={deleteAccountConfirmText}
            onChange={(e) => setDeleteAccountConfirmText(e.target.value)}
            autoFocus
          />
          {deleteAccountMutation.isError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              No se pudo dar de baja la cuenta
              {deleteAccountMutation.error instanceof AxiosError
                ? ` (${deleteAccountMutation.error.response?.status ?? 'sin respuesta del servidor'}${
                    deleteAccountMutation.error.response?.data?.message
                      ? `: ${deleteAccountMutation.error.response.data.message}`
                      : ''
                  })`
                : ''}
              .
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setDeleteAccountOpen(false);
              setDeleteAccountConfirmText('');
            }}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            color="error"
            disabled={
              deleteAccountConfirmText !== `${person?.firstName} ${person?.lastName}` ||
              deleteAccountMutation.isPending
            }
            onClick={() => deleteAccountMutation.mutate()}
          >
            Dar de baja definitivamente
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={hcOpen} onClose={() => setHcOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Agregar seguro médico / obra social</DialogTitle>
        <DialogContent>
          {hcError && <Alert severity="error" sx={{ mb: 2 }}>{hcError}</Alert>}
          <Grid container spacing={1}>
            <Grid size={{ xs: 6 }}>
              <TextField
                select
                label="Tipo"
                fullWidth
                margin="normal"
                value={hcForm.coverageTypeId}
                onChange={(e) => setHcForm((f) => ({ ...f, coverageTypeId: e.target.value }))}
                helperText="Prepaga y Obra social son independientes: puede tener ambas"
              >
                {(healthCoverageTypeCatalog.data ?? []).map((o) => (
                  <MenuItem key={o.id} value={o.id}>{o.labelEs}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                label="Nombre de la cobertura / plan"
                fullWidth
                margin="normal"
                value={hcForm.coverageName}
                onChange={(e) => setHcForm((f) => ({ ...f, coverageName: e.target.value }))}
                helperText="Ej. Plan Superior 3000"
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                label="Prestador de salud / obra social"
                fullWidth
                margin="normal"
                value={hcForm.providerName}
                onChange={(e) => setHcForm((f) => ({ ...f, providerName: e.target.value }))}
                helperText="Ej. OSDE, Swiss Medical, Galeno"
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                label="N° de afiliado"
                fullWidth
                margin="normal"
                value={hcForm.memberNumber}
                onChange={(e) => setHcForm((f) => ({ ...f, memberNumber: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                label="Fecha de ingreso"
                type="date"
                fullWidth
                margin="normal"
                slotProps={{ inputLabel: { shrink: true } }}
                value={hcForm.validFrom}
                onChange={(e) => setHcForm((f) => ({ ...f, validFrom: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                label="Fecha de baja (si dejó de tenerlo)"
                type="date"
                fullWidth
                margin="normal"
                slotProps={{ inputLabel: { shrink: true } }}
                value={hcForm.validUntil}
                onChange={(e) => setHcForm((f) => ({ ...f, validUntil: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={hcForm.isPrimary}
                    onChange={(e) => setHcForm((f) => ({ ...f, isPrimary: e.target.checked }))}
                  />
                }
                label="Es la cobertura principal"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHcOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={!hcForm.coverageTypeId || !hcForm.coverageName || !hcForm.providerName || createHcMutation.isPending}
            onClick={() => createHcMutation.mutate()}
          >
            Guardar
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
