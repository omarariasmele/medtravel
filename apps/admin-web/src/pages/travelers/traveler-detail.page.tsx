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

import { apiClient } from '../../lib/api-client';
import { labelFor, useCatalog } from '../../lib/catalog-hooks';
import { usePageTitle } from '../../lib/page-title';
import { ClinicalHistorySection } from '../cases/clinical-history.section';
import { useAuth } from '../../auth/auth-context';

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
  photoPath?: string | null;
}

interface EmergencyContact {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  relationshipTypeId: string;
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

interface EmergencyCaseRow {
  id: string;
  caseNumber: string;
  statusId: string;
  priorityId: string;
  initialDescription?: string;
  createdAt: string;
}

interface TripRow {
  id: string;
  tripName?: string;
  tripStart: string;
  tripEnd: string;
  statusId: string;
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
  const { claims } = useAuth();

  // Pedido explícito del usuario: para poder probar de cero repetidas
  // veces (chat Clásico/Estructurado, formularios manuales), necesita
  // poder borrar TODOS los antecedentes de salud de un viajero con un
  // botón — acción irreversible, por eso pide escribir "BORRAR" para
  // confirmar y solo se ve con permisos de configuración.
  const [resetOpen, setResetOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const resetMutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.delete(
        `/clinical/persons/${personQuery.data!.id}/health-record`,
      );
      return data;
    },
    onSuccess: () => {
      window.location.reload();
    },
  });

  const [enrollmentOpen, setEnrollmentOpen] = useState(false);
  const [enrollmentForm, setEnrollmentForm] = useState<EnrollmentFormState>(EMPTY_ENROLLMENT_FORM);
  const [enrollmentError, setEnrollmentError] = useState<string | null>(null);
  /**
   * Pedido explícito del usuario: si una póliza se cargó con datos
   * equivocados, tiene que poder corregirse — antes solo existía "Agregar",
   * sin ninguna forma de editar lo ya guardado. null = alta nueva, con id =
   * editando esa fila (mismo dialog/form, la mutation elige POST o PATCH).
   */
  const [editingEnrollmentId, setEditingEnrollmentId] = useState<string | null>(null);

  const [hcOpen, setHcOpen] = useState(false);
  const [hcForm, setHcForm] = useState<HealthCoverageFormState>(EMPTY_HC_FORM);
  const [hcError, setHcError] = useState<string | null>(null);
  const [editingHcId, setEditingHcId] = useState<string | null>(null);

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

  /**
   * Teléfono y contactos de emergencia son datos de contacto, no
   * historia clínica — no requieren has_clinical_access, solo el mismo
   * criterio de "operador de este tenant" que ya autoriza ver nombre/
   * apellido (gap #13/persons_tenant_member_select). Devuelven vacío en
   * vez de error si el operador no tiene ese acceso o si el viajero no
   * cargó nada — no se distingue el motivo (mismo criterio anti-
   * enumeración del resto de la app).
   */
  const emailQuery = useQuery({
    queryKey: ['identity', 'persons', personQuery.data?.id, 'email'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ email: string }>(
        `/identity/persons/${personQuery.data!.id}/email`,
      );
      return data;
    },
    enabled: !!personQuery.data?.id,
    retry: false,
  });

  const phoneQuery = useQuery({
    queryKey: ['identity', 'persons', personQuery.data?.id, 'phone'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ phone: string | null; phoneVerified: boolean }>(
        `/identity/persons/${personQuery.data!.id}/phone`,
      );
      return data;
    },
    enabled: !!personQuery.data?.id,
    retry: false,
  });

  const documentQuery = useQuery({
    queryKey: ['identity', 'persons', personQuery.data?.id, 'document'],
    queryFn: async () => {
      const { data } = await apiClient.get<{
        docTypeId: string;
        docNumber: string;
        docCountryId: string | null;
      }>(`/identity/persons/${personQuery.data!.id}/document`);
      return data;
    },
    enabled: !!personQuery.data?.id,
    retry: false,
  });

  const documentTypeCatalog = useCatalog('DOCUMENT_TYPE');
  const countryCatalog = useCatalog('COUNTRY');

  const contactsQuery = useQuery({
    queryKey: ['identity', 'member-contacts', personQuery.data?.id],
    queryFn: async () => {
      const { data } = await apiClient.get<EmergencyContact[]>('/identity/member-contacts', {
        params: { personId: personQuery.data!.id },
      });
      return data;
    },
    enabled: !!personQuery.data?.id,
  });

  const relationshipTypeCatalog = useCatalog('RELATIONSHIP_TYPE');

  /**
   * Pedido explícito del usuario al agregar sesión única por viajero en
   * la app móvil: "necesitamos una alternativa desde el entorno web
   * por si algo falla" — si el viajero perdió el teléfono o lo
   * desinstaló sin cerrar sesión, queda sin poder loguearse en otro
   * equipo hasta que expire sola. Este botón la cierra a mano.
   */
  const sessionQuery = useQuery({
    queryKey: ['identity', 'persons', personQuery.data?.id, 'session'],
    queryFn: async () => {
      const { data } = await apiClient.get<{
        hasActiveSession: boolean;
        sessionStartedAt: string | null;
        lastActivityAt: string | null;
      }>(`/identity/persons/${personQuery.data!.id}/session`);
      return data;
    },
    enabled: !!personQuery.data?.id,
    retry: false,
  });

  const revokeSessionMutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post(
        `/identity/persons/${personQuery.data!.id}/session/revoke`,
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['identity', 'persons', personQuery.data?.id, 'session'],
      });
    },
  });

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!personQuery.data?.photoPath) {
      setPhotoUrl(null);
      return;
    }
    let objectUrl: string | null = null;
    apiClient
      .get(`/identity/persons/${personQuery.data.id}/photo`, { responseType: 'blob' })
      .then(({ data }) => {
        objectUrl = URL.createObjectURL(data);
        setPhotoUrl(objectUrl);
      })
      .catch(() => setPhotoUrl(null));
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [personQuery.data?.id, personQuery.data?.photoPath]);

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

  /**
   * Pedido explícito del usuario: desde la ficha del viajero se debe
   * poder ver cuántos casos de asistencia tuvo y entrar a cada uno, y
   * qué viajes cargó — no solo la cobertura/plan.
   */
  const casesQuery = useQuery({
    queryKey: ['operations', 'emergency-cases', 'member', id],
    queryFn: async () => {
      const { data } = await apiClient.get<EmergencyCaseRow[]>('/operations/emergency-cases', {
        params: { memberId: id },
      });
      return data;
    },
    enabled: !!id,
  });

  const tripsQuery = useQuery({
    queryKey: ['operations', 'trips', 'member', id],
    queryFn: async () => {
      const { data } = await apiClient.get<TripRow[]>('/operations/trips', {
        params: { memberId: id },
      });
      return data;
    },
    enabled: !!id,
  });

  const caseStatusCatalog = useCatalog('CASE_STATUS');
  const casePriorityCatalog = useCatalog('CASE_PRIORITY');
  const tripStatusCatalog = useCatalog('TRIP_STATUS');

  const saveEnrollmentMutation = useMutation({
    mutationFn: async () => {
      const active = enrollmentStatusCatalog.data?.find((s) => s.code === 'ACTIVE');
      const payload = {
        memberId: id,
        tenantId: memberQuery.data!.tenantId,
        planId: enrollmentForm.planId,
        sponsorId: enrollmentForm.sponsorId || undefined,
        policyNumber: enrollmentForm.policyNumber,
        validFrom: enrollmentForm.validFrom,
        validUntil: enrollmentForm.validUntil,
        statusId: active?.id,
      };
      const { data } = editingEnrollmentId
        ? await apiClient.patch(`/coverage/travel-assistance-enrollments/${editingEnrollmentId}`, payload)
        : await apiClient.post('/coverage/travel-assistance-enrollments', payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coverage', 'travel-assistance-enrollments', id] });
      setEnrollmentOpen(false);
      setEnrollmentForm(EMPTY_ENROLLMENT_FORM);
      setEnrollmentError(null);
      setEditingEnrollmentId(null);
    },
    onError: () => setEnrollmentError('No se pudo guardar el plan de asistencia.'),
  });

  const saveHcMutation = useMutation({
    mutationFn: async () => {
      const active = healthCoverageStatusCatalog.data?.find((s) => s.code === 'ACTIVE');
      const payload = {
        personId: personQuery.data?.id,
        coverageName: hcForm.coverageName,
        coverageTypeId: hcForm.coverageTypeId,
        providerName: hcForm.providerName,
        memberNumber: hcForm.memberNumber || undefined,
        validFrom: hcForm.validFrom || undefined,
        validUntil: hcForm.validUntil || undefined,
        isPrimary: hcForm.isPrimary,
        statusId: active?.id,
      };
      const { data } = editingHcId
        ? await apiClient.patch(`/coverage/health-coverages/${editingHcId}`, payload)
        : await apiClient.post('/coverage/health-coverages', payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coverage', 'health-coverages'] });
      setHcOpen(false);
      setHcForm(EMPTY_HC_FORM);
      setHcError(null);
      setEditingHcId(null);
    },
    onError: () => setHcError('No se pudo guardar la cobertura.'),
  });

  const openEditEnrollment = (e: Enrollment) => {
    setEditingEnrollmentId(e.id);
    setEnrollmentForm({
      planId: e.planId,
      sponsorId: e.sponsorId ?? '',
      policyNumber: e.policyNumber,
      validFrom: e.validFrom,
      validUntil: e.validUntil,
    });
    setEnrollmentError(null);
    setEnrollmentOpen(true);
  };

  const openEditHc = (hc: HealthCoverage) => {
    setEditingHcId(hc.id);
    setHcForm({
      coverageName: hc.coverageName,
      coverageTypeId: hc.coverageTypeId,
      providerName: hc.providerName,
      memberNumber: hc.memberNumber ?? '',
      validFrom: hc.validFrom ?? '',
      validUntil: hc.validUntil ?? '',
      isPrimary: hc.isPrimary,
    });
    setHcError(null);
    setHcOpen(true);
  };

  usePageTitle(personQuery.data ? `${personQuery.data.firstName} ${personQuery.data.lastName}` : 'Viajero');

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

      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Avatar src={photoUrl ?? undefined} sx={{ width: 56, height: 56 }}>
            {person ? person.firstName.charAt(0) : '?'}
          </Avatar>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6">
              {person ? `${person.firstName} ${person.lastName}` : 'Viajero'}
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
          {sessionQuery.data?.hasActiveSession && (
            <Box sx={{ textAlign: 'right' }}>
              <Chip size="small" color="info" label="Sesión activa en la app" sx={{ mb: 0.5 }} />
              <br />
              <Button
                size="small"
                variant="outlined"
                color="warning"
                disabled={revokeSessionMutation.isPending}
                onClick={() => revokeSessionMutation.mutate()}
              >
                Cerrar sesión activa
              </Button>
              {revokeSessionMutation.isSuccess && (
                <Typography variant="caption" color="success.main" sx={{ display: 'block', mt: 0.5 }}>
                  Cerrada — ya puede loguearse de nuevo
                </Typography>
              )}
            </Box>
          )}
        </CardContent>
      </Card>

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
            <Button
              size="small"
              variant="outlined"
              onClick={() => {
                setEditingEnrollmentId(null);
                setEnrollmentForm(EMPTY_ENROLLMENT_FORM);
                setEnrollmentError(null);
                setEnrollmentOpen(true);
              }}
            >
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
                  <TableRow key={e.id} hover onClick={() => openEditEnrollment(e)} sx={{ cursor: 'pointer' }}>
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
          <Typography variant="h6" sx={{ mb: 1 }}>
            Casos de asistencia ({casesQuery.data?.length ?? 0})
          </Typography>
          {casesQuery.isLoading && <CircularProgress size={24} />}
          {(casesQuery.data?.length ?? 0) === 0 && !casesQuery.isLoading && (
            <Alert severity="info">Sin casos de asistencia registrados.</Alert>
          )}
          {casesQuery.data && casesQuery.data.length > 0 && (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>N° de caso</TableCell>
                  <TableCell>Estado</TableCell>
                  <TableCell>Prioridad</TableCell>
                  <TableCell>Descripción inicial</TableCell>
                  <TableCell>Creado</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {casesQuery.data
                  .slice()
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                  .map((c) => (
                    <TableRow
                      key={c.id}
                      hover
                      onClick={() => navigate(`/cases/${c.id}`)}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell>{c.caseNumber}</TableCell>
                      <TableCell>
                        <Chip size="small" label={labelFor(caseStatusCatalog.data, c.statusId)} />
                      </TableCell>
                      <TableCell>{labelFor(casePriorityCatalog.data, c.priorityId)}</TableCell>
                      <TableCell>{c.initialDescription ?? '—'}</TableCell>
                      <TableCell>{new Date(c.createdAt).toLocaleString('es-AR')}</TableCell>
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
            Viajes ({tripsQuery.data?.length ?? 0})
          </Typography>
          {tripsQuery.isLoading && <CircularProgress size={24} />}
          {(tripsQuery.data?.length ?? 0) === 0 && !tripsQuery.isLoading && (
            <Alert severity="info">Sin viajes cargados.</Alert>
          )}
          {tripsQuery.data && tripsQuery.data.length > 0 && (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Nombre del viaje</TableCell>
                  <TableCell>Inicio</TableCell>
                  <TableCell>Fin</TableCell>
                  <TableCell>Estado</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tripsQuery.data
                  .slice()
                  .sort((a, b) => new Date(b.tripStart).getTime() - new Date(a.tripStart).getTime())
                  .map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>{t.tripName ?? '—'}</TableCell>
                      <TableCell>{new Date(t.tripStart).toLocaleDateString('es-AR')}</TableCell>
                      <TableCell>{new Date(t.tripEnd).toLocaleDateString('es-AR')}</TableCell>
                      <TableCell>
                        <Chip size="small" label={labelFor(tripStatusCatalog.data, t.statusId)} />
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
            <Button
              size="small"
              variant="outlined"
              onClick={() => {
                setEditingHcId(null);
                setHcForm(EMPTY_HC_FORM);
                setHcError(null);
                setHcOpen(true);
              }}
            >
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
                  <TableCell>N° de afiliado</TableCell>
                  <TableCell>Alta</TableCell>
                  <TableCell>Baja</TableCell>
                  <TableCell>Estado</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {healthCoveragesQuery.data.map((hc) => (
                  <TableRow key={hc.id} hover onClick={() => openEditHc(hc)} sx={{ cursor: 'pointer' }}>
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

      {person && <ClinicalHistorySection personId={person.id} />}

      {claims?.canManageConfig && person && (
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
            color="error"
            variant="contained"
            disabled={resetConfirmText !== 'BORRAR' || resetMutation.isPending}
            onClick={() => resetMutation.mutate()}
          >
            Borrar definitivamente
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={enrollmentOpen}
        onClose={() => {
          setEnrollmentOpen(false);
          setEditingEnrollmentId(null);
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          {editingEnrollmentId ? 'Editar plan de asistencia al viajero' : 'Agregar plan de asistencia al viajero'}
        </DialogTitle>
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
          <Button
            onClick={() => {
              setEnrollmentOpen(false);
              setEditingEnrollmentId(null);
            }}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            disabled={
              !enrollmentForm.planId ||
              !enrollmentForm.policyNumber ||
              !enrollmentForm.validFrom ||
              !enrollmentForm.validUntil ||
              saveEnrollmentMutation.isPending
            }
            onClick={() => saveEnrollmentMutation.mutate()}
          >
            Guardar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={hcOpen}
        onClose={() => {
          setHcOpen(false);
          setEditingHcId(null);
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{editingHcId ? 'Editar seguro médico / obra social' : 'Agregar seguro médico / obra social'}</DialogTitle>
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
          <Button
            onClick={() => {
              setHcOpen(false);
              setEditingHcId(null);
            }}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            disabled={
              !hcForm.coverageTypeId ||
              !hcForm.coverageName ||
              !hcForm.providerName ||
              saveHcMutation.isPending
            }
            onClick={() => saveHcMutation.mutate()}
          >
            Guardar
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
