import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
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

import { apiClient } from '../../lib/api-client';
import { labelFor, useCatalog } from '../../lib/catalog-hooks';
import { ClinicalHistorySection } from '../cases/clinical-history.section';

interface Member {
  id: string;
  personId: string;
  tenantId: string;
  tenantMemberNumber?: string;
  statusId: string;
  onboardingCompleted: boolean;
  enrollmentDate?: string;
}

interface Person {
  id: string;
  firstName: string;
  lastName: string;
}

interface Tenant {
  id: string;
  name: string;
}

interface Enrollment {
  id: string;
  planId: string;
  sponsorId?: string;
  policyNumber: string;
  validFrom: string;
  validUntil: string;
  statusId: string;
}

interface AssistancePlan {
  id: string;
  name: string;
}

interface CoverageSponsor {
  id: string;
  name: string;
}

interface HealthCoverage {
  id: string;
  coverageName: string;
  coverageTypeId: string;
  providerName: string;
  providerId?: string;
  policyNumber?: string;
  memberNumber?: string;
  validFrom?: string;
  validUntil?: string;
  statusId: string;
  isPrimary: boolean;
}

/** Activo si no hay fecha de baja, o si esa fecha todavía no llegó. */
function isCurrentlyValid(validUntil?: string | null): boolean {
  if (!validUntil) return true;
  return new Date(validUntil) >= new Date(new Date().toDateString());
}

function ValidityChip({ validUntil }: { validUntil?: string | null }) {
  const active = isCurrentlyValid(validUntil);
  return (
    <Chip
      size="small"
      color={active ? 'success' : 'default'}
      label={active ? 'Activo' : 'Vencido'}
    />
  );
}

interface EnrollmentFormState {
  planId: string;
  sponsorId: string;
  policyNumber: string;
  validFrom: string;
  validUntil: string;
}

const EMPTY_ENROLLMENT_FORM: EnrollmentFormState = {
  planId: '',
  sponsorId: '',
  policyNumber: '',
  validFrom: '',
  validUntil: '',
};

interface HealthCoverageFormState {
  coverageName: string;
  coverageTypeId: string;
  providerName: string;
  policyNumber: string;
  memberNumber: string;
  validFrom: string;
  validUntil: string;
  isPrimary: boolean;
}

const EMPTY_HC_FORM: HealthCoverageFormState = {
  coverageName: '',
  coverageTypeId: '',
  providerName: '',
  policyNumber: '',
  memberNumber: '',
  validFrom: '',
  validUntil: '',
  isPrimary: false,
};

/**
 * Ficha del viajero: quién es, con qué empresa administra su cuenta en
 * la plataforma (tenant), qué plan/póliza de asistencia al viajero
 * tiene contratado y con qué sponsor/marca (coverage.
 * travel_assistance_enrollments — "Empresa de asistencia" en el
 * sentido de marca comercial, ej. AXA, es el sponsor de ACÁ, no el
 * tenant), y qué seguro médico/obra social propio tiene declarado
 * (coverage.health_coverages — puede haber más de una fila: una
 * prepaga Y una obra social en paralelo, cada una con su propia
 * vigencia — HEALTH_COVERAGE_TYPE ya distingue PRIVATE_INSURANCE
 * ("Prepaga") de SOCIAL_SECURITY ("Obra social"). health_coverages
 * tiene RLS más estricta (hc_select, 004_coverage.sql): exige
 * consentimiento explícito del titular, así que puede aparecer vacía
 * aunque exista, si no hay consentimiento — no es un bug.
 *
 * El estado "Activo"/"Vencido" que se muestra es SIEMPRE calculado acá
 * (fecha de baja vs. hoy), no el status_id crudo guardado — así se
 * refleja la regla real ("activo si la fecha de baja no existe o es
 * posterior a hoy") incluso si el dato guardado quedó desactualizado.
 */
export function TravelerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [enrollmentOpen, setEnrollmentOpen] = useState(false);
  const [enrollmentForm, setEnrollmentForm] = useState<EnrollmentFormState>(EMPTY_ENROLLMENT_FORM);
  const [enrollmentError, setEnrollmentError] = useState<string | null>(null);

  const [hcOpen, setHcOpen] = useState(false);
  const [hcForm, setHcForm] = useState<HealthCoverageFormState>(EMPTY_HC_FORM);
  const [hcError, setHcError] = useState<string | null>(null);

  const memberQuery = useQuery({
    queryKey: ['identity', 'members', id],
    queryFn: async () => {
      const { data } = await apiClient.get<Member>(`/identity/members/${id}`);
      return data;
    },
    enabled: !!id,
  });

  const personQuery = useQuery({
    queryKey: ['identity', 'persons', memberQuery.data?.personId],
    queryFn: async () => {
      const { data } = await apiClient.get<Person>(
        `/identity/persons/${memberQuery.data!.personId}`,
      );
      return data;
    },
    enabled: !!memberQuery.data?.personId,
  });

  const tenantQuery = useQuery({
    queryKey: ['identity', 'tenants', memberQuery.data?.tenantId],
    queryFn: async () => {
      const { data } = await apiClient.get<Tenant>(
        `/identity/tenants/${memberQuery.data!.tenantId}`,
      );
      return data;
    },
    enabled: !!memberQuery.data?.tenantId,
  });

  const statusCatalog = useCatalog('MEMBER_STATUS');
  const healthCoverageTypeCatalog = useCatalog('HEALTH_COVERAGE_TYPE');
  const enrollmentStatusCatalog = useCatalog('ENROLLMENT_STATUS');
  const healthCoverageStatusCatalog = useCatalog('HEALTH_COVERAGE_STATUS');

  const enrollmentsQuery = useQuery({
    queryKey: ['coverage', 'travel-assistance-enrollments', id],
    queryFn: async () => {
      const { data } = await apiClient.get<Enrollment[]>(
        '/coverage/travel-assistance-enrollments',
        { params: { memberId: id } },
      );
      return data;
    },
    enabled: !!id,
  });

  const plansQuery = useQuery({
    queryKey: ['coverage', 'assistance-plans'],
    queryFn: async () => {
      const { data } = await apiClient.get<AssistancePlan[]>('/coverage/assistance-plans');
      return data;
    },
  });

  const sponsorsQuery = useQuery({
    queryKey: ['coverage', 'coverage-sponsors'],
    queryFn: async () => {
      const { data } = await apiClient.get<CoverageSponsor[]>('/coverage/coverage-sponsors');
      return data;
    },
  });

  /**
   * Filtra por personId, no por memberId: la obra social/prepaga es un
   * hecho de la persona, independiente de si tiene o no una empresa de
   * asistencia al viajero asociada (ver proposed-healthcare-plans.sql)
   * — así también aparecen acá las que el propio viajero cargó desde
   * "Mi cobertura" en la app, sin necesitar ningún member.
   */
  const healthCoveragesQuery = useQuery({
    queryKey: ['coverage', 'health-coverages', personQuery.data?.id],
    queryFn: async () => {
      const { data } = await apiClient.get<HealthCoverage[]>('/coverage/health-coverages', {
        params: { personId: personQuery.data!.id },
      });
      return data;
    },
    enabled: !!personQuery.data?.id,
  });

  const planNameById = new Map((plansQuery.data ?? []).map((p) => [p.id, p.name]));
  const sponsorNameById = new Map((sponsorsQuery.data ?? []).map((s) => [s.id, s.name]));

  const createEnrollmentMutation = useMutation({
    mutationFn: async () => {
      const active = enrollmentStatusCatalog.data?.find((s) => s.code === 'ACTIVE');
      const { data } = await apiClient.post('/coverage/travel-assistance-enrollments', {
        memberId: id,
        tenantId: memberQuery.data!.tenantId,
        planId: enrollmentForm.planId,
        sponsorId: enrollmentForm.sponsorId || undefined,
        policyNumber: enrollmentForm.policyNumber,
        validFrom: enrollmentForm.validFrom,
        validUntil: enrollmentForm.validUntil,
        statusId: active?.id,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coverage', 'travel-assistance-enrollments', id] });
      setEnrollmentOpen(false);
      setEnrollmentForm(EMPTY_ENROLLMENT_FORM);
      setEnrollmentError(null);
    },
    onError: () => setEnrollmentError('No se pudo guardar el plan de asistencia.'),
  });

  const createHcMutation = useMutation({
    mutationFn: async () => {
      const active = healthCoverageStatusCatalog.data?.find((s) => s.code === 'ACTIVE');
      const { data } = await apiClient.post('/coverage/health-coverages', {
        personId: personQuery.data?.id,
        coverageName: hcForm.coverageName,
        coverageTypeId: hcForm.coverageTypeId,
        providerName: hcForm.providerName,
        policyNumber: hcForm.policyNumber || undefined,
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

  if (memberQuery.isLoading) return <CircularProgress />;
  if (memberQuery.isError || !memberQuery.data) {
    return <Alert severity="error">No se encontró el viajero solicitado.</Alert>;
  }

  const m = memberQuery.data;
  const person = personQuery.data;

  return (
    <>
      <Button onClick={() => navigate('/travelers')} sx={{ mb: 2 }}>
        ← Volver a viajeros
      </Button>
      <Typography variant="h4" gutterBottom>
        {person ? `${person.firstName} ${person.lastName}` : 'Viajero'}
      </Typography>

      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Empresa (plataforma)</Typography>
              <Typography variant="body2">{tenantQuery.data?.name ?? '—'}</Typography>
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>N° de member</Typography>
              <Typography variant="body2">{m.tenantMemberNumber ?? '—'}</Typography>
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Estado</Typography>
              <Chip size="small" label={labelFor(statusCatalog.data, m.statusId)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Onboarding</Typography>
              <Typography variant="body2">{m.onboardingCompleted ? 'Completo' : 'Pendiente'}</Typography>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="h6">
              Plan de asistencia al viajero
            </Typography>
            <Button size="small" variant="outlined" onClick={() => setEnrollmentOpen(true)}>
              Agregar plan
            </Button>
          </Box>
          {enrollmentsQuery.isLoading && <CircularProgress size={24} />}
          {enrollmentsQuery.data?.length === 0 && (
            <Alert severity="info">Sin plan de asistencia al viajero cargado con esta empresa.</Alert>
          )}
          {enrollmentsQuery.data && enrollmentsQuery.data.length > 0 && (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Empresa de asistencia (sponsor)</TableCell>
                  <TableCell>Plan</TableCell>
                  <TableCell>N° de póliza</TableCell>
                  <TableCell>Alta</TableCell>
                  <TableCell>Baja</TableCell>
                  <TableCell>Estado</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {enrollmentsQuery.data.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <strong>{e.sponsorId ? sponsorNameById.get(e.sponsorId) ?? '—' : '—'}</strong>
                    </TableCell>
                    <TableCell>{planNameById.get(e.planId) ?? '—'}</TableCell>
                    <TableCell>{e.policyNumber}</TableCell>
                    <TableCell>{e.validFrom}</TableCell>
                    <TableCell>{e.validUntil}</TableCell>
                    <TableCell>
                      <ValidityChip validUntil={e.validUntil} />
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
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="h6">
              Seguro médico / obra social
            </Typography>
            <Button size="small" variant="outlined" onClick={() => setHcOpen(true)}>
              Agregar cobertura
            </Button>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Independiente de la empresa de asistencia al viajero — puede tener más de una
            fila a la vez (ej. una prepaga y una obra social en paralelo), cada una con
            su propia vigencia. Las que dicen "Cargado desde la app" las declaró el
            propio viajero en "Mi cobertura" y pueden estar pendientes de confirmación
            (ver Catálogos/Planes de salud).
          </Typography>
          {healthCoveragesQuery.isLoading && <CircularProgress size={24} />}
          {(healthCoveragesQuery.data?.length ?? 0) === 0 && !healthCoveragesQuery.isLoading && (
            <Alert severity="info">
              Sin datos de seguro médico / obra social visibles — puede que no tenga
              cargado, o que no haya dado consentimiento para que esta empresa lo vea.
            </Alert>
          )}
          {healthCoveragesQuery.data && healthCoveragesQuery.data.length > 0 && (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Tipo</TableCell>
                  <TableCell>Cobertura</TableCell>
                  <TableCell>Prestador</TableCell>
                  <TableCell>N° de póliza / asociado</TableCell>
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
                    <TableCell>{hc.policyNumber ?? '—'}</TableCell>
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

      {person && <ClinicalHistorySection personId={person.id} />}

      <Dialog open={enrollmentOpen} onClose={() => setEnrollmentOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Agregar plan de asistencia al viajero</DialogTitle>
        <DialogContent>
          {enrollmentError && <Alert severity="error" sx={{ mb: 2 }}>{enrollmentError}</Alert>}
          <Grid container spacing={1}>
            <Grid size={{ xs: 6 }}>
              <TextField
                select
                label="Empresa de asistencia (sponsor)"
                fullWidth
                margin="normal"
                value={enrollmentForm.sponsorId}
                onChange={(e) => setEnrollmentForm((f) => ({ ...f, sponsorId: e.target.value }))}
              >
                {(sponsorsQuery.data ?? []).map((s) => (
                  <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                select
                label="Plan"
                fullWidth
                margin="normal"
                value={enrollmentForm.planId}
                onChange={(e) => setEnrollmentForm((f) => ({ ...f, planId: e.target.value }))}
              >
                {(plansQuery.data ?? []).map((p) => (
                  <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                label="N° de póliza"
                fullWidth
                margin="normal"
                value={enrollmentForm.policyNumber}
                onChange={(e) => setEnrollmentForm((f) => ({ ...f, policyNumber: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                label="Fecha de alta"
                type="date"
                fullWidth
                margin="normal"
                slotProps={{ inputLabel: { shrink: true } }}
                value={enrollmentForm.validFrom}
                onChange={(e) => setEnrollmentForm((f) => ({ ...f, validFrom: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                label="Fecha de baja (máx. 1 año desde el alta)"
                type="date"
                fullWidth
                margin="normal"
                slotProps={{ inputLabel: { shrink: true } }}
                value={enrollmentForm.validUntil}
                onChange={(e) => setEnrollmentForm((f) => ({ ...f, validUntil: e.target.value }))}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEnrollmentOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={
              !enrollmentForm.planId ||
              !enrollmentForm.policyNumber ||
              !enrollmentForm.validFrom ||
              !enrollmentForm.validUntil ||
              createEnrollmentMutation.isPending
            }
            onClick={() => createEnrollmentMutation.mutate()}
          >
            Guardar
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
                label="N° de póliza / asociado"
                fullWidth
                margin="normal"
                value={hcForm.policyNumber}
                onChange={(e) => setHcForm((f) => ({ ...f, policyNumber: e.target.value }))}
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
            disabled={
              !hcForm.coverageTypeId ||
              !hcForm.coverageName ||
              !hcForm.providerName ||
              createHcMutation.isPending
            }
            onClick={() => createHcMutation.mutate()}
          >
            Guardar
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
