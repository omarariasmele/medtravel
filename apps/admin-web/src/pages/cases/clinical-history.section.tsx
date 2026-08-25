import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  MenuItem,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';

import { apiClient } from '../../lib/api-client';
import { labelFor, resolveCatalogValue, useCatalog } from '../../lib/catalog-hooks';
import { useAuth } from '../../auth/auth-context';

interface PatientSummary {
  firstName: string;
  lastName: string;
  birthDate: string | null;
  genderId: string | null;
  countryResidenceId: string | null;
  healthRecordLastUpdatedAt: string | null;
  bloodTypeId: string | null;
}

interface VitalsRecord {
  id: string;
  weightKg?: string;
  heightCm?: string;
  bmi?: string;
  bloodPressureSys?: number;
  bloodPressureDia?: number;
  heartRate?: number;
  respiratoryRate?: number;
  temperatureC?: string;
  oxygenSaturation?: string;
  bloodGlucose?: string;
  bloodTypeId?: string;
  measuredAt: string;
  notes?: string;
}

/**
 * Bug real reportado en vivo: diagnosedAt/resolvedAt/performedAt/
 * implantedAt/startedAt son columnas `date` (sin hora) — pero salen de
 * RlsCrudService.findAllEncrypted (query cruda vía QueryBuilder, no
 * TypeORM find()), así que el driver de pg las devuelve como `Date`
 * (medianoche UTC) y al serializar a JSON quedan como
 * "2024-01-15T00:00:00.000Z" — mostradas tal cual, con hora. Mismo
 * criterio que birthDate más abajo: forzar timeZone UTC evita además
 * un corrimiento de un día al convertir a la zona horaria local.
 */
function formatDateOnly(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-AR', { timeZone: 'UTC' });
}

function calculateAge(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const dob = new Date(birthDate);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

interface Allergy {
  id: string;
  allergenName: string;
  allergenTypeId: string;
  severityId: string;
  notes?: string;
  /** clinical.allergies no tiene una fecha clínica propia (a diferencia
   * de condiciones/cirugías/implantes) — se muestra la fecha de carga
   * como referencia, pedido explícito del usuario de no dejar ningún
   * registro sin fecha visible. */
  createdAt?: string;
}

interface ConditionRecord {
  id: string;
  conditionName: string;
  conditionCatalogId?: string;
  icd10Code?: string;
  statusId: string;
  travelRiskId?: string;
  diagnosedAt?: string;
  resolvedAt?: string;
  treatingDoctor?: string;
  treatingSpecialty?: string;
  treatmentNotes?: string;
  travelRestrictions?: string;
  notes?: string;
}

interface SurgeryRecord {
  id: string;
  procedureName: string;
  icd10Code?: string;
  performedAt: string;
  hospitalName?: string;
  surgeonName?: string;
  approachId?: string;
  outcomeId?: string;
  complications?: string;
  recoveryNotes?: string;
  hasImplant?: boolean;
  implantDetails?: string;
  notes?: string;
}

interface Medication {
  id: string;
  genericName: string;
  brandName?: string;
  doseAmount?: string;
  doseUnitId?: string;
  frequencyId?: string;
  routeId?: string;
  startedAt?: string;
  endedAt?: string;
  isChronic?: boolean;
  travelNotes?: string;
  notes?: string;
}

interface LabResultRecord {
  id: string;
  performedAt: string;
  labName?: string;
  studyTypeId?: string;
  hemoglobin?: string;
  hematocrit?: string;
  platelets?: string;
  glucoseFasting?: string;
  hba1c?: string;
  totalCholesterol?: string;
  hdlCholesterol?: string;
  ldlCholesterol?: string;
  triglycerides?: string;
  creatinine?: string;
  ptInr?: string;
  aptt?: string;
  customValues?: { name: string; value: string }[];
}

/** Mismos indicadores sembrados que ya tienen columna dedicada en este form — se excluyen de la lista dinámica de LAB_INDICATOR para sangre para no duplicar el campo. */
const DEDICATED_FIELD_INDICATOR_CODES = new Set(['HEMOGLOBIN', 'HEMATOCRIT', 'GLUCOSE_FASTING']);

/**
 * Pedido explícito del usuario: la versión con <Tabs> obligaba a hacer
 * clic pestaña por pestaña para ver algo — "no es práctico para la
 * consulta" y además hacía invisibles los cambios (Implantes, la
 * separación Crónicas/Enfermedades, Estudios agrupados) a menos que se
 * entrara a cada pestaña. Ahora todas las secciones se muestran apiladas,
 * en orden de prioridad clínica, cada una en su propia Card — no se
 * pierde ninguna función de alta ("Agregar X" sigue estando en cada
 * sección), solo deja de estar escondida detrás de un click.
 */
function HistorySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card sx={{ mb: 2 }} variant="outlined">
      <CardContent>
        <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>{title}</Typography>
        {children}
      </CardContent>
    </Card>
  );
}

/**
 * Historia clínica — reutiliza clinical.has_clinical_access
 * (000_extensions.sql), que tiene varios caminos válidos: #5 (caso de
 * emergencia ABIERTO, vía header x-active-case-id) y #4 (consentimiento
 * activo del titular para este tenant, sin necesidad de un caso). Este
 * componente sirve para ambos: si se le pasa `caseId` (dentro de un
 * caso), manda el header; si no (ej. desde la ficha del viajero), no lo
 * manda y el acceso depende de que exista consentimiento — si no hay
 * ninguno de los dos, el backend devuelve 403/404 y se muestra un
 * mensaje claro en vez de romper la pantalla.
 */
export function ClinicalHistorySection({
  personId,
  caseId,
}: {
  personId: string;
  caseId?: string;
}) {
  const headers: Record<string, string> = caseId ? { 'x-active-case-id': caseId } : {};

  return (
    <Card sx={{ mt: 3 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Historial de Salud
        </Typography>
        <Alert severity="info" sx={{ mb: 2 }}>
          {caseId
            ? 'Acceso habilitado mientras este caso esté abierto — se audita automáticamente (audit.data_audit_events).'
            : 'Acceso habilitado por consentimiento del viajero para esta empresa — se audita automáticamente (audit.data_audit_events).'}
        </Alert>

        <Button
          size="small"
          variant="outlined"
          component="a"
          href={`/share-preview/${personId}`}
          target="_blank"
          rel="noopener"
          sx={{ mb: 2 }}
        >
          Ver como la vería el médico
        </Button>

        <PatientSummaryCard personId={personId} headers={headers} />
        <CriticalAlertsBanner personId={personId} headers={headers} />

        {/* Mismo orden y nombres que las solapas de la app móvil
            (HealthRecordsScreen: Alergias, Enfermedades, Implantes,
            Medicamentos, Cirugías, Peso y Mediciones, Estudios) — pedido
            explícito del usuario de que ambas vistas coincidan.
            Pedido explícito del usuario: "eliminar el título Comorbilidades
            de todos lados, es enfermedades o enfermedades crónicas" — este
            título general agrupa ambas subsecciones (Crónicas/No crónicas)
            de ConditionsTab, por eso "Enfermedades" (sin "Crónicas") es el
            que corresponde acá. */}
        <Box sx={{ mt: 2 }}>
          <HistorySection title="Alergias">
            <AllergiesTab personId={personId} headers={headers} />
          </HistorySection>
          <HistorySection title="Enfermedades">
            <ConditionsTab personId={personId} headers={headers} />
          </HistorySection>
          <HistorySection title="Implantes">
            <ImplantsTab personId={personId} headers={headers} />
          </HistorySection>
          <HistorySection title="Tratamientos">
            <TreatmentsTab personId={personId} headers={headers} />
          </HistorySection>
          <HistorySection title="Medicamentos">
            <MedicationsTab personId={personId} headers={headers} />
          </HistorySection>
          <HistorySection title="Cirugías">
            <SurgeriesTab personId={personId} headers={headers} />
          </HistorySection>
          <HistorySection title="Peso y Mediciones">
            <VitalsTab personId={personId} headers={headers} />
          </HistorySection>
          <HistorySection title="Estudios">
            <LabResultsTab personId={personId} headers={headers} />
          </HistorySection>
        </Box>
      </CardContent>
    </Card>
  );
}

function PatientSummaryCard({
  personId,
  headers,
}: {
  personId: string;
  headers: Record<string, string>;
}) {
  const genderCatalog = useCatalog('GENDER');
  const countryCatalog = useCatalog('COUNTRY');
  const bloodTypeCatalog = useCatalog('BLOOD_TYPE');

  const summaryQuery = useQuery({
    queryKey: ['clinical', 'patient-summary', personId],
    queryFn: async () => {
      const { data } = await apiClient.get<PatientSummary>(
        `/clinical/patient-summary/${personId}`,
        { headers },
      );
      return data;
    },
    retry: false,
  });

  const latestVitalsQuery = useQuery({
    queryKey: ['clinical', 'vitals-history', personId, 'latest'],
    queryFn: async () => {
      const { data } = await apiClient.get<VitalsRecord[]>(
        '/clinical/vitals-history',
        { params: { personId }, headers },
      );
      return data;
    },
  });

  /**
   * clinical.vitals_history es append-only (vitals_no_update USING FALSE)
   * — cada carga desde la app crea una fila nueva SOLO con los campos que
   * se completaron esa vez (ej. peso/altura en una carga, grupo sanguíneo
   * en otra posterior). Tomar la fila más reciente "tal cual" hacía que
   * un campo cargado antes desapareciera de la vista apenas se guardaba
   * un dato distinto después — hay que tomar el valor no-nulo más
   * reciente POR CAMPO, no la fila más reciente entera.
   */
  const sortedVitals = (latestVitalsQuery.data ?? [])
    .slice()
    .sort((a, b) => new Date(b.measuredAt).getTime() - new Date(a.measuredAt).getTime());
  const latestVitals = {
    weightKg: sortedVitals.find((v) => v.weightKg != null)?.weightKg,
    heightCm: sortedVitals.find((v) => v.heightCm != null)?.heightCm,
    bmi: sortedVitals.find((v) => v.bmi != null)?.bmi,
    // Pedido explícito del usuario: "Grupo Sanguíneo... siempre es el
    // mismo" — vive en core.persons.blood_type_id (patient-summary), no
    // en vitals_history; el escaneo queda solo de respaldo para datos
    // viejos cargados antes de este cambio.
    bloodTypeId: summaryQuery.data?.bloodTypeId ?? sortedVitals.find((v) => v.bloodTypeId != null)?.bloodTypeId,
  };

  if (summaryQuery.isLoading) return <CircularProgress size={24} />;
  if (summaryQuery.isError || !summaryQuery.data) {
    const status = (summaryQuery.error as { response?: { status?: number } } | null)
      ?.response?.status;
    return (
      <Alert severity="warning">
        {status === 404
          ? 'Sin acceso a la historia clínica de este viajero: no hay un caso de asistencia abierto ni consentimiento activo para esta empresa.'
          : 'No se pudieron cargar los datos generales del viajero.'}
      </Alert>
    );
  }

  const s = summaryQuery.data;
  const age = calculateAge(s.birthDate);

  return (
    <Box sx={{ mb: 1, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Typography variant="subtitle2" gutterBottom>
          {s.firstName} {s.lastName}
        </Typography>
        <Typography
          variant="caption"
          color={s.healthRecordLastUpdatedAt ? 'text.secondary' : 'error'}
        >
          {s.healthRecordLastUpdatedAt
            ? `Historial de Salud actualizado: ${new Date(s.healthRecordLastUpdatedAt).toLocaleDateString('es-AR')}`
            : 'No hay información de salud registrada todavía — es necesario ingresarla.'}
        </Typography>
      </Box>
      <Grid container spacing={2}>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Edad</Typography>
          <Typography variant="body2">{age !== null ? `${age} años` : '—'}</Typography>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Fecha de nacimiento</Typography>
          <Typography variant="body2">
            {s.birthDate ? new Date(s.birthDate).toLocaleDateString('es-AR', { timeZone: 'UTC' }) : '—'}
          </Typography>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Sexo</Typography>
          <Typography variant="body2">{labelFor(genderCatalog.data, s.genderId ?? undefined)}</Typography>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>País de residencia</Typography>
          <Typography variant="body2">{labelFor(countryCatalog.data, s.countryResidenceId ?? undefined)}</Typography>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Peso</Typography>
          <Typography variant="body2">{latestVitals?.weightKg ? `${latestVitals.weightKg} kg` : '—'}</Typography>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Altura</Typography>
          <Typography variant="body2">{latestVitals?.heightCm ? `${latestVitals.heightCm} cm` : '—'}</Typography>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>IMC</Typography>
          <Typography variant="body2">{latestVitals?.bmi ?? '—'}</Typography>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Grupo sanguíneo</Typography>
          <Typography variant="body2">{labelFor(bloodTypeCatalog.data, latestVitals?.bloodTypeId)}</Typography>
        </Grid>
      </Grid>
    </Box>
  );
}

/**
 * Pedido explícito del usuario: poder corregir/borrar un antecedente
 * mal cargado desde la web — pero solo un operador puntualmente
 * autorizado (claims.canEditClinicalData), no cualquiera con acceso
 * al caso. "Borrar" es una baja lógica (PATCH deletedAt vía
 * /clinical/admin-edit/, gateado con ClinicalEditGuard en el backend):
 * clinical.*_no_delete bloquea el DELETE real a propósito, nunca se
 * borra un dato clínico de verdad. Quién lo hizo y cuándo queda en
 * audit.data_audit_events automáticamente (mismo trigger que ya
 * corre en cada UPDATE de estas tablas).
 */
function ClinicalDeleteButton({
  resource,
  id,
  itemLabel,
  queryKey,
  headers,
}: {
  resource: string;
  id: string;
  itemLabel: string;
  queryKey: unknown[];
  headers: Record<string, string>;
}) {
  const { claims } = useAuth();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiClient.patch(
        `/clinical/admin-edit/${resource}/${id}`,
        { deletedAt: new Date().toISOString() },
        { headers },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setConfirmOpen(false);
    },
  });

  if (!claims?.canEditClinicalData) return null;

  return (
    <>
      <Tooltip title="Borrar (dato mal cargado)">
        <IconButton size="small" onClick={() => setConfirmOpen(true)}>
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>¿Borrar este dato?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Vas a borrar &quot;{itemLabel}&quot; de la ficha médica del viajero. Queda registrado en la
            auditoría quién lo borró y cuándo.
          </Typography>
          {deleteMutation.isError && (
            <Alert severity="error" sx={{ mt: 2 }}>No se pudo borrar. Probá de nuevo.</Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancelar</Button>
          <Button color="error" variant="contained" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}>
            Borrar
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

/** Mismo gate que ClinicalDeleteButton, reutilizado para el botón "Editar" de cada tab (el formulario de edición es propio de cada una, solo cambia qué campos precarga). */
function useCanEditClinical(): boolean {
  const { claims } = useAuth();
  return Boolean(claims?.canEditClinicalData);
}

function ClinicalEditButton({ onClick }: { onClick: () => void }) {
  if (!useCanEditClinical()) return null;
  return (
    <Tooltip title="Editar (corregir dato mal cargado)">
      <IconButton size="small" onClick={onClick}>
        <EditOutlinedIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
}

/**
 * "Es de importancia ante una atención": pedido explícito del usuario —
 * TODAS las alergias (no solo severas/críticas) y TODAS las
 * comorbilidades declaradas (no solo activas/crónicas) tienen que
 * aparecer acá; el filtro por severidad/estado escondía datos que un
 * médico podría necesitar. Las que además coinciden con una enfermedad
 * marcada `isAlertWorthy: true` en el catálogo CONDITION_CATALOG se
 * destacan en rojo (no se ocultan las demás). Reutiliza las mismas
 * query keys que AllergiesTab/ConditionsTab (React Query dedupea el
 * fetch, no pega dos veces al backend).
 */
function CriticalAlertsBanner({
  personId,
  headers,
}: {
  personId: string;
  headers: Record<string, string>;
}) {
  const severityCatalog = useCatalog('REACTION_SEVERITY');
  const conditionCatalog = useCatalog('CONDITION_CATALOG');

  const allergiesQuery = useQuery({
    queryKey: ['clinical', 'allergies', personId],
    queryFn: async () => {
      const { data } = await apiClient.get<Allergy[]>('/clinical/allergies', {
        params: { personId },
        headers,
      });
      return data;
    },
  });

  const conditionsQuery = useQuery({
    queryKey: ['clinical', 'conditions', personId],
    queryFn: async () => {
      const { data } = await apiClient.get<ConditionRecord[]>('/clinical/conditions', {
        params: { personId },
        headers,
      });
      return data;
    },
  });

  // Pedido explícito del usuario: diálisis/quimioterapia/etc. son
  // TREATMENT, no CONDITION (ver proposed-treatment-type.sql) — sin
  // esto, esta caja dejaba de mostrarlas apenas se cargaban con el
  // tipo nuevo. Siempre en rojo (a diferencia de condiciones, que
  // dependen del flag isAlertWorthy del catálogo): un tratamiento
  // activo/crónico como diálisis o quimio es, por definición, un dato
  // crítico para quien atiende una emergencia.
  const treatmentsQuery = useQuery({
    queryKey: ['clinical', 'treatments', personId],
    queryFn: async () => {
      const { data } = await apiClient.get<TreatmentRecord[]>('/clinical/treatments', {
        params: { personId },
        headers,
      });
      return data;
    },
  });

  const allergies = allergiesQuery.data ?? [];
  const conditions = conditionsQuery.data ?? [];
  const treatments = treatmentsQuery.data ?? [];

  const severeCodes = new Set(['SEVERE', 'CRITICAL']);
  const isSevereAllergy = (a: Allergy) => {
    const code = severityCatalog.data?.find((s) => s.id === a.severityId)?.code;
    return !!code && severeCodes.has(code);
  };
  const isAlertWorthyCondition = (c: ConditionRecord) => {
    const catalogValue = conditionCatalog.data?.find((cv) => cv.id === c.conditionCatalogId);
    return catalogValue?.metadata?.isAlertWorthy === true;
  };

  if (allergies.length === 0 && conditions.length === 0 && treatments.length === 0) return null;

  return (
    <Alert severity="warning" sx={{ mb: 1 }}>
      <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>
        Alertas médicas
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
        {allergies.map((a) => (
          <Chip
            key={a.id}
            size="small"
            color={isSevereAllergy(a) ? 'error' : 'default'}
            label={`Alergia: ${a.allergenName}`}
          />
        ))}
        {conditions.map((c) => (
          <Chip
            key={c.id}
            size="small"
            color={isAlertWorthyCondition(c) ? 'error' : 'default'}
            label={c.conditionName}
          />
        ))}
        {treatments.map((t) => (
          <Chip
            key={t.id}
            size="small"
            color="error"
            label={`Tratamiento: ${t.treatmentName}`}
          />
        ))}
      </Box>
    </Alert>
  );
}

function VitalsTab({
  personId,
  headers,
}: {
  personId: string;
  headers: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [weightKg, setWeightKg] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [bloodPressureSys, setBloodPressureSys] = useState('');
  const [bloodPressureDia, setBloodPressureDia] = useState('');
  const [heartRate, setHeartRate] = useState('');
  const [temperatureC, setTemperatureC] = useState('');
  const [oxygenSaturation, setOxygenSaturation] = useState('');
  const [bloodGlucose, setBloodGlucose] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const provenanceCatalog = useCatalog('PROVENANCE_TYPE');

  const listQuery = useQuery({
    queryKey: ['clinical', 'vitals-history', personId],
    queryFn: async () => {
      const { data } = await apiClient.get<VitalsRecord[]>(
        '/clinical/vitals-history',
        { params: { personId }, headers },
      );
      return data;
    },
  });

  const sorted = (listQuery.data ?? [])
    .slice()
    .sort((a, b) => new Date(b.measuredAt).getTime() - new Date(a.measuredAt).getTime());

  /**
   * Pedido explícito del usuario: peso/altura/IMC no son "signos
   * vitales" — tienen que verse juntos como un historial propio, y si
   * una carga solo trae el peso (sin repetir la altura), el IMC de esa
   * fecha se calcula igual arrastrando la última altura conocida. Es
   * un cálculo de presentación (no se reescribe nada en la base).
   */
  const heightAndBmiById = new Map<string, { height?: string; bmi?: string; heightIsCarried: boolean }>();
  let lastKnownHeight: string | undefined;
  for (const v of sorted.slice().reverse()) {
    if (v.heightCm) lastKnownHeight = v.heightCm;
    const height = v.heightCm ?? lastKnownHeight;
    let bmi = v.bmi;
    if (!bmi && v.weightKg && height) {
      const h = Number(height) / 100;
      const w = Number(v.weightKg);
      if (h > 0 && !Number.isNaN(w)) bmi = (w / (h * h)).toFixed(1);
    }
    heightAndBmiById.set(v.id, { height, bmi, heightIsCarried: !v.heightCm && !!height });
  }

  const resetForm = () => {
    setWeightKg('');
    setHeightCm('');
    setBloodPressureSys('');
    setBloodPressureDia('');
    setHeartRate('');
    setTemperatureC('');
    setOxygenSaturation('');
    setBloodGlucose('');
    setNotes('');
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const staffEntered = provenanceCatalog.data?.find(
        (p) => p.code === 'PROFESSIONAL_ENTERED',
      );
      const { data } = await apiClient.post(
        '/clinical/vitals-history',
        {
          personId,
          weightKg: weightKg || undefined,
          heightCm: heightCm || undefined,
          bloodPressureSys: bloodPressureSys ? Number(bloodPressureSys) : undefined,
          bloodPressureDia: bloodPressureDia ? Number(bloodPressureDia) : undefined,
          heartRate: heartRate ? Number(heartRate) : undefined,
          temperatureC: temperatureC || undefined,
          oxygenSaturation: oxygenSaturation || undefined,
          bloodGlucose: bloodGlucose || undefined,
          measuredAt: new Date().toISOString(),
          provenanceId: staffEntered?.id,
          notes: notes || undefined,
        },
        { headers },
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinical', 'vitals-history', personId] });
      setOpen(false);
      resetForm();
      setError(null);
    },
    onError: () => setError('No se pudo guardar el registro.'),
  });

  return (
    <Box>
      <Button size="small" variant="outlined" onClick={() => setOpen(true)} sx={{ mb: 2 }}>
        Agregar registro
      </Button>
      {listQuery.isLoading && <CircularProgress size={24} />}
      {sorted.length === 0 && (
        <Alert severity="info">Sin signos vitales / datos morfológicos registrados.</Alert>
      )}
      {sorted.map((v) => {
        const computed = heightAndBmiById.get(v.id);
        return (
          <Box key={v.id} sx={{ mb: 1, p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
            {/* Pedido explícito del usuario: fecha y mediciones en la
                misma línea, mismo criterio que el resto de las tablas. */}
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" color="text.secondary">
                {new Date(v.measuredAt).toLocaleString('es-AR')}
              </Typography>
              {v.weightKg && <Chip size="small" label={`Peso: ${v.weightKg} kg`} />}
              {computed?.height && (
                <Chip size="small" label={`Altura: ${computed.height} cm${computed.heightIsCarried ? ' (última cargada)' : ''}`} />
              )}
              {computed?.bmi && <Chip size="small" label={`IMC: ${computed.bmi}`} />}
              {(v.bloodPressureSys || v.bloodPressureDia) && (
                <Chip size="small" label={`PA: ${v.bloodPressureSys ?? '—'}/${v.bloodPressureDia ?? '—'}`} />
              )}
              {v.heartRate && <Chip size="small" label={`FC: ${v.heartRate} lpm`} />}
              {v.temperatureC && <Chip size="small" label={`Temp: ${v.temperatureC}°C`} />}
              {v.oxygenSaturation && <Chip size="small" label={`SpO2: ${v.oxygenSaturation}%`} />}
              {v.bloodGlucose && <Chip size="small" label={`Glucemia: ${v.bloodGlucose}`} />}
            </Box>
            {v.notes && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                {v.notes}
              </Typography>
            )}
          </Box>
        );
      })}

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Agregar signos vitales / datos morfológicos</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Grid container spacing={1}>
            <Grid size={{ xs: 6 }}>
              <TextField label="Peso (kg)" type="number" fullWidth margin="normal" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField label="Altura (cm)" type="number" fullWidth margin="normal" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField label="Presión sistólica" type="number" fullWidth margin="normal" value={bloodPressureSys} onChange={(e) => setBloodPressureSys(e.target.value)} />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField label="Presión diastólica" type="number" fullWidth margin="normal" value={bloodPressureDia} onChange={(e) => setBloodPressureDia(e.target.value)} />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField label="Frecuencia cardíaca (lpm)" type="number" fullWidth margin="normal" value={heartRate} onChange={(e) => setHeartRate(e.target.value)} />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField label="Temperatura (°C)" type="number" fullWidth margin="normal" value={temperatureC} onChange={(e) => setTemperatureC(e.target.value)} />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField label="Saturación O2 (%)" type="number" fullWidth margin="normal" value={oxygenSaturation} onChange={(e) => setOxygenSaturation(e.target.value)} />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField label="Glucemia" type="number" fullWidth margin="normal" value={bloodGlucose} onChange={(e) => setBloodGlucose(e.target.value)} />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField label="Notas" fullWidth multiline minRows={2} margin="normal" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={createMutation.isPending} onClick={() => createMutation.mutate()}>
            Guardar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function AllergiesTab({
  personId,
  headers,
}: {
  personId: string;
  headers: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [allergenName, setAllergenName] = useState('');
  const [allergenTypeId, setAllergenTypeId] = useState('');
  const [severityId, setSeverityId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const typeCatalog = useCatalog('ALLERGEN_TYPE');
  const severityCatalog = useCatalog('REACTION_SEVERITY');
  const statusCatalog = useCatalog('CANONICAL_STATUS');
  const provenanceCatalog = useCatalog('PROVENANCE_TYPE');
  const allergenCatalog = useCatalog('ALLERGEN');

  const listQuery = useQuery({
    queryKey: ['clinical', 'allergies', personId],
    queryFn: async () => {
      const { data } = await apiClient.get<Allergy[]>('/clinical/allergies', {
        params: { personId },
        headers,
      });
      return data;
    },
  });

  const resetForm = () => {
    setOpen(false);
    setEditingId(null);
    setAllergenName('');
    setAllergenTypeId('');
    setSeverityId('');
    setNotes('');
    setError(null);
  };

  const openCreate = () => {
    setEditingId(null);
    setAllergenName('');
    setAllergenTypeId('');
    setSeverityId('');
    setNotes('');
    setOpen(true);
  };

  const openEdit = (a: Allergy) => {
    setEditingId(a.id);
    setAllergenName(a.allergenName);
    setAllergenTypeId(a.allergenTypeId ?? '');
    setSeverityId(a.severityId ?? '');
    setNotes(a.notes ?? '');
    setOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const provisional = statusCatalog.data?.find((s) => s.code === 'PROVISIONAL');
      const staffEntered = provenanceCatalog.data?.find(
        (p) => p.code === 'PROFESSIONAL_ENTERED',
      );
      const allergenCatalogId = await resolveCatalogValue('ALLERGEN', allergenName, allergenCatalog.data ?? []);
      const { data } = await apiClient.post(
        '/clinical/allergies',
        {
          personId,
          allergenName,
          allergenCatalogId,
          allergenTypeId,
          severityId,
          canonicalStatusId: provisional?.id,
          provenanceId: staffEntered?.id,
          notes: notes || undefined,
        },
        { headers },
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinical', 'allergies', personId] });
      resetForm();
    },
    onError: () => setError('No se pudo guardar la alergia.'),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const allergenCatalogId = await resolveCatalogValue('ALLERGEN', allergenName, allergenCatalog.data ?? []);
      await apiClient.patch(
        `/clinical/admin-edit/allergies/${editingId}`,
        { allergenName, allergenCatalogId, allergenTypeId, severityId, notes: notes || null },
        { headers },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinical', 'allergies', personId] });
      resetForm();
    },
    onError: () => setError('No se pudo guardar la corrección.'),
  });

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <Box>
      <Button size="small" variant="outlined" onClick={openCreate} sx={{ mb: 2 }}>
        Agregar alergia
      </Button>
      {listQuery.isLoading && <CircularProgress size={24} />}
      {listQuery.data?.length === 0 && (
        <Alert severity="info">Sin alergias registradas.</Alert>
      )}
      {listQuery.data?.map((a) => (
        <Box key={a.id} sx={{ mb: 1, p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            {/* Pedido explícito del usuario: alergia + fecha en la misma
                línea, mismo criterio que el resto de las tablas. El chip
                de tipo "Otro" es el default sin información real — mismo
                criterio que "Activa" en Enfermedades, no se muestra. */}
            <Typography variant="body2" component="div">
              <strong>{a.allergenName}</strong>
              {a.createdAt && ` — Registrada: ${new Date(a.createdAt).toLocaleDateString('es-AR')}`}{' '}
              <Chip size="small" label={labelFor(severityCatalog.data, a.severityId)} />{' '}
              {typeCatalog.data?.find((c) => c.id === a.allergenTypeId)?.code !== 'OTHER' && (
                <Chip size="small" variant="outlined" label={labelFor(typeCatalog.data, a.allergenTypeId)} />
              )}
            </Typography>
            {a.notes && (
              <Typography variant="caption" color="text.secondary">
                {a.notes}
              </Typography>
            )}
          </Box>
          <Box sx={{ display: 'flex' }}>
            <ClinicalEditButton onClick={() => openEdit(a)} />
            <ClinicalDeleteButton
              resource="allergies"
              id={a.id}
              itemLabel={a.allergenName}
              queryKey={['clinical', 'allergies', personId]}
              headers={headers}
            />
          </Box>
        </Box>
      ))}

      <Dialog open={open} onClose={resetForm} fullWidth maxWidth="sm">
        <DialogTitle>{editingId ? 'Editar alergia' : 'Agregar alergia'}</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Autocomplete
            freeSolo
            options={(allergenCatalog.data ?? []).map((o) => o.labelEs)}
            inputValue={allergenName}
            onInputChange={(_, v) => setAllergenName(v)}
            renderInput={(params) => (
              <TextField {...params} label="Alérgeno" fullWidth margin="normal" helperText="Elegí uno existente o escribí uno nuevo" />
            )}
          />
          <TextField
            select
            label="Tipo"
            fullWidth
            margin="normal"
            value={allergenTypeId}
            onChange={(e) => setAllergenTypeId(e.target.value)}
          >
            {(typeCatalog.data ?? []).map((o) => (
              <MenuItem key={o.id} value={o.id}>{o.labelEs}</MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Severidad"
            fullWidth
            margin="normal"
            value={severityId}
            onChange={(e) => setSeverityId(e.target.value)}
          >
            {(severityCatalog.data ?? []).map((o) => (
              <MenuItem key={o.id} value={o.id}>{o.labelEs}</MenuItem>
            ))}
          </TextField>
          <TextField
            label="Notas"
            fullWidth
            multiline
            minRows={2}
            margin="normal"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={resetForm}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={!allergenName || !allergenTypeId || !severityId || saving}
            onClick={() => (editingId ? updateMutation.mutate() : createMutation.mutate())}
          >
            Guardar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

interface ConditionFormState {
  conditionName: string;
  icd10Code: string;
  statusId: string;
  travelRiskId: string;
  diagnosedAt: string;
  resolvedAt: string;
  treatingDoctor: string;
  treatingSpecialty: string;
  treatmentNotes: string;
  travelRestrictions: string;
  notes: string;
}

const EMPTY_CONDITION_FORM: ConditionFormState = {
  conditionName: '',
  icd10Code: '',
  statusId: '',
  travelRiskId: '',
  diagnosedAt: '',
  resolvedAt: '',
  treatingDoctor: '',
  treatingSpecialty: '',
  treatmentNotes: '',
  travelRestrictions: '',
  notes: '',
};

function ConditionsTab({
  personId,
  headers,
}: {
  personId: string;
  headers: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ConditionFormState>(EMPTY_CONDITION_FORM);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const statusCatalog = useCatalog('CONDITION_STATUS');
  const travelRiskCatalog = useCatalog('TRAVEL_RISK');
  const canonicalCatalog = useCatalog('CANONICAL_STATUS');
  const provenanceCatalog = useCatalog('PROVENANCE_TYPE');
  const conditionCatalog = useCatalog('CONDITION_CATALOG');

  const setField =
    (field: keyof ConditionFormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));

  const listQuery = useQuery({
    queryKey: ['clinical', 'conditions', personId],
    queryFn: async () => {
      const { data } = await apiClient.get<ConditionRecord[]>('/clinical/conditions', {
        params: { personId },
        headers,
      });
      return data;
    },
  });

  const resetForm = () => {
    setOpen(false);
    setEditingId(null);
    setForm(EMPTY_CONDITION_FORM);
    setError(null);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_CONDITION_FORM);
    setOpen(true);
  };

  const openEdit = (c: ConditionRecord) => {
    setEditingId(c.id);
    setForm({
      conditionName: c.conditionName,
      icd10Code: c.icd10Code ?? '',
      statusId: c.statusId,
      travelRiskId: c.travelRiskId ?? '',
      diagnosedAt: c.diagnosedAt?.slice(0, 10) ?? '',
      resolvedAt: c.resolvedAt?.slice(0, 10) ?? '',
      treatingDoctor: c.treatingDoctor ?? '',
      treatingSpecialty: c.treatingSpecialty ?? '',
      treatmentNotes: c.treatmentNotes ?? '',
      travelRestrictions: c.travelRestrictions ?? '',
      notes: c.notes ?? '',
    });
    setOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const provisional = canonicalCatalog.data?.find((s) => s.code === 'PROVISIONAL');
      const staffEntered = provenanceCatalog.data?.find(
        (p) => p.code === 'PROFESSIONAL_ENTERED',
      );
      const conditionCatalogId = await resolveCatalogValue('CONDITION_CATALOG', form.conditionName, conditionCatalog.data ?? []);
      const { data } = await apiClient.post(
        '/clinical/conditions',
        {
          personId,
          conditionName: form.conditionName,
          conditionCatalogId,
          icd10Code: form.icd10Code || undefined,
          statusId: form.statusId,
          travelRiskId: form.travelRiskId || undefined,
          diagnosedAt: form.diagnosedAt || undefined,
          resolvedAt: form.resolvedAt || undefined,
          treatingDoctor: form.treatingDoctor || undefined,
          treatingSpecialty: form.treatingSpecialty || undefined,
          treatmentNotes: form.treatmentNotes || undefined,
          travelRestrictions: form.travelRestrictions || undefined,
          canonicalStatusId: provisional?.id,
          provenanceId: staffEntered?.id,
          notes: form.notes || undefined,
        },
        { headers },
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinical', 'conditions', personId] });
      resetForm();
    },
    onError: () => setError('No se pudo guardar la condición.'),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const conditionCatalogId = await resolveCatalogValue('CONDITION_CATALOG', form.conditionName, conditionCatalog.data ?? []);
      await apiClient.patch(
        `/clinical/admin-edit/conditions/${editingId}`,
        {
          conditionName: form.conditionName,
          conditionCatalogId,
          icd10Code: form.icd10Code || null,
          statusId: form.statusId,
          travelRiskId: form.travelRiskId || null,
          diagnosedAt: form.diagnosedAt || null,
          resolvedAt: form.resolvedAt || null,
          treatingDoctor: form.treatingDoctor || null,
          treatingSpecialty: form.treatingSpecialty || null,
          treatmentNotes: form.treatmentNotes || null,
          travelRestrictions: form.travelRestrictions || null,
          notes: form.notes || null,
        },
        { headers },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinical', 'conditions', personId] });
      resetForm();
    },
    onError: () => setError('No se pudo guardar la corrección.'),
  });

  const saving = createMutation.isPending || updateMutation.isPending;

  const chronicStatusId = statusCatalog.data?.find((s) => s.code === 'CHRONIC')?.id;
  const chronicConditions = (listQuery.data ?? []).filter((c) => c.statusId === chronicStatusId);
  const otherConditions = (listQuery.data ?? []).filter((c) => c.statusId !== chronicStatusId);

  const renderCondition = (c: ConditionRecord) => (
    <Box key={c.id} sx={{ mb: 1, p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <Box>
        <Typography variant="body2" component="div">
          {/* Pedido explícito del usuario: la enfermedad y la fecha de
              diagnóstico tienen que quedar en la misma línea, no una
              abajo de la otra. */}
          <strong>{c.conditionName}</strong>
          {c.diagnosedAt && ` — Diagnosticada: ${formatDateOnly(c.diagnosedAt)}`}{' '}
          {c.icd10Code && <Chip size="small" variant="outlined" label={c.icd10Code} />}{' '}
          {/* Pedido explícito del usuario: "Activa" es el estado por defecto de toda condición —
              mostrarlo siempre es ruido. Solo aporta algo cuando el estado NO es el default. */}
          {!['ACTIVE', 'CHRONIC'].includes(statusCatalog.data?.find((s) => s.id === c.statusId)?.code ?? '') && (
            <Chip size="small" label={labelFor(statusCatalog.data, c.statusId)} />
          )}{' '}
          {c.travelRiskId && (
            <Chip size="small" color="warning" label={`Riesgo de viaje: ${labelFor(travelRiskCatalog.data, c.travelRiskId)}`} />
          )}
        </Typography>
        <Typography variant="caption" color="text.secondary" component="div">
          {c.resolvedAt && `Resuelta: ${formatDateOnly(c.resolvedAt)}`}
          {c.treatingDoctor && ` · Médico tratante: ${c.treatingDoctor}`}
          {c.treatingSpecialty && ` (${c.treatingSpecialty})`}
        </Typography>
        {c.treatmentNotes && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            Tratamiento: {c.treatmentNotes}
          </Typography>
        )}
        {c.travelRestrictions && (
          <Typography variant="caption" color="error" sx={{ display: 'block' }}>
            Restricciones de viaje: {c.travelRestrictions}
          </Typography>
        )}
        {c.notes && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {c.notes}
          </Typography>
        )}
      </Box>
      <Box sx={{ display: 'flex' }}>
        <ClinicalEditButton onClick={() => openEdit(c)} />
        <ClinicalDeleteButton
          resource="conditions"
          id={c.id}
          itemLabel={c.conditionName}
          queryKey={['clinical', 'conditions', personId]}
          headers={headers}
        />
      </Box>
    </Box>
  );

  return (
    <Box>
      <Button size="small" variant="outlined" onClick={openCreate} sx={{ mb: 2 }}>
        Agregar condición
      </Button>
      {listQuery.isLoading && <CircularProgress size={24} />}
      {listQuery.data?.length === 0 && (
        <Alert severity="info">Sin condiciones registradas.</Alert>
      )}
      {chronicConditions.length > 0 && (
        <>
          <Typography variant="subtitle2" sx={{ mt: 1, mb: 0.5, fontWeight: 'bold' }}>Enfermedades Crónicas</Typography>
          {chronicConditions.map(renderCondition)}
        </>
      )}
      {otherConditions.length > 0 && (
        <>
          <Typography variant="subtitle2" sx={{ mt: 2, mb: 0.5, fontWeight: 'bold' }}>Enfermedades</Typography>
          {otherConditions.map(renderCondition)}
        </>
      )}

      <Dialog open={open} onClose={resetForm} fullWidth maxWidth="sm">
        <DialogTitle>{editingId ? 'Editar condición' : 'Agregar condición'}</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Grid container spacing={1}>
            <Grid size={{ xs: 8 }}>
              <Autocomplete
                freeSolo
                options={(conditionCatalog.data ?? []).map((o) => o.labelEs)}
                inputValue={form.conditionName}
                onInputChange={(_, v) => setForm((f) => ({ ...f, conditionName: v }))}
                renderInput={(params) => (
                  <TextField {...params} label="Comorbilidad" fullWidth margin="normal" helperText="Ej. Diabetes mellitus tipo 2" />
                )}
              />
            </Grid>
            <Grid size={{ xs: 4 }}>
              <TextField
                label="Código ICD"
                fullWidth
                margin="normal"
                value={form.icd10Code}
                onChange={setField('icd10Code')}
                helperText="Ver Catálogos"
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                select
                label="Estado"
                fullWidth
                margin="normal"
                value={form.statusId}
                onChange={setField('statusId')}
              >
                {(statusCatalog.data ?? []).map((o) => (
                  <MenuItem key={o.id} value={o.id}>{o.labelEs}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                select
                label="Riesgo de viaje"
                fullWidth
                margin="normal"
                value={form.travelRiskId}
                onChange={setField('travelRiskId')}
              >
                {(travelRiskCatalog.data ?? []).map((o) => (
                  <MenuItem key={o.id} value={o.id}>{o.labelEs}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                label="Fecha de diagnóstico"
                type="date"
                fullWidth
                margin="normal"
                slotProps={{ inputLabel: { shrink: true } }}
                value={form.diagnosedAt}
                onChange={setField('diagnosedAt')}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                label="Fecha de resolución (si aplica)"
                type="date"
                fullWidth
                margin="normal"
                slotProps={{ inputLabel: { shrink: true } }}
                value={form.resolvedAt}
                onChange={setField('resolvedAt')}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                label="Médico tratante"
                fullWidth
                margin="normal"
                value={form.treatingDoctor}
                onChange={setField('treatingDoctor')}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                label="Especialidad"
                fullWidth
                margin="normal"
                value={form.treatingSpecialty}
                onChange={setField('treatingSpecialty')}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                label="Notas de tratamiento"
                fullWidth
                multiline
                minRows={2}
                margin="normal"
                value={form.treatmentNotes}
                onChange={setField('treatmentNotes')}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                label="Restricciones de viaje"
                fullWidth
                multiline
                minRows={2}
                margin="normal"
                value={form.travelRestrictions}
                onChange={setField('travelRestrictions')}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                label="Notas"
                fullWidth
                multiline
                minRows={2}
                margin="normal"
                value={form.notes}
                onChange={setField('notes')}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={resetForm}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={!form.conditionName || !form.statusId || saving}
            onClick={() => (editingId ? updateMutation.mutate() : createMutation.mutate())}
          >
            Guardar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function SurgeriesTab({
  personId,
  headers,
}: {
  personId: string;
  headers: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [procedureName, setProcedureName] = useState('');
  const [icd10Code, setIcd10Code] = useState('');
  const [performedAt, setPerformedAt] = useState('');
  const [hospitalName, setHospitalName] = useState('');
  const [surgeonName, setSurgeonName] = useState('');
  const [approachId, setApproachId] = useState('');
  const [outcomeId, setOutcomeId] = useState('');
  const [complications, setComplications] = useState('');
  const [recoveryNotes, setRecoveryNotes] = useState('');
  const [hasImplant, setHasImplant] = useState(false);
  const [implantDetails, setImplantDetails] = useState('');
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const approachCatalog = useCatalog('SURGICAL_APPROACH');
  const outcomeCatalog = useCatalog('SURGERY_OUTCOME');
  const canonicalCatalog = useCatalog('CANONICAL_STATUS');
  const provenanceCatalog = useCatalog('PROVENANCE_TYPE');
  const surgeryCatalog = useCatalog('SURGERY_CATALOG');

  const listQuery = useQuery({
    queryKey: ['clinical', 'surgeries', personId],
    queryFn: async () => {
      const { data } = await apiClient.get<SurgeryRecord[]>('/clinical/surgeries', {
        params: { personId },
        headers,
      });
      return data;
    },
  });

  const clearFields = () => {
    setProcedureName('');
    setIcd10Code('');
    setPerformedAt('');
    setHospitalName('');
    setSurgeonName('');
    setApproachId('');
    setOutcomeId('');
    setComplications('');
    setRecoveryNotes('');
    setHasImplant(false);
    setImplantDetails('');
  };

  const closeForm = () => {
    setOpen(false);
    setEditingId(null);
    clearFields();
    setError(null);
  };

  const openCreate = () => {
    setEditingId(null);
    clearFields();
    setOpen(true);
  };

  const openEdit = (s: SurgeryRecord) => {
    setEditingId(s.id);
    setProcedureName(s.procedureName);
    setIcd10Code(s.icd10Code ?? '');
    setPerformedAt(s.performedAt?.slice(0, 10) ?? '');
    setHospitalName(s.hospitalName ?? '');
    setSurgeonName(s.surgeonName ?? '');
    setApproachId(s.approachId ?? '');
    setOutcomeId(s.outcomeId ?? '');
    setComplications(s.complications ?? '');
    setRecoveryNotes(s.recoveryNotes ?? '');
    setHasImplant(s.hasImplant ?? false);
    setImplantDetails(s.implantDetails ?? '');
    setOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const provisional = canonicalCatalog.data?.find((s) => s.code === 'PROVISIONAL');
      const staffEntered = provenanceCatalog.data?.find(
        (p) => p.code === 'PROFESSIONAL_ENTERED',
      );
      const procedureCatalogId = await resolveCatalogValue('SURGERY_CATALOG', procedureName, surgeryCatalog.data ?? []);
      const { data } = await apiClient.post(
        '/clinical/surgeries',
        {
          personId,
          procedureName,
          procedureCatalogId,
          icd10Code: icd10Code || undefined,
          performedAt,
          hospitalName: hospitalName || undefined,
          surgeonName: surgeonName || undefined,
          approachId: approachId || undefined,
          outcomeId: outcomeId || undefined,
          complications: complications || undefined,
          recoveryNotes: recoveryNotes || undefined,
          hasImplant,
          implantDetails: hasImplant ? implantDetails || undefined : undefined,
          canonicalStatusId: provisional?.id,
          provenanceId: staffEntered?.id,
        },
        { headers },
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinical', 'surgeries', personId] });
      closeForm();
    },
    onError: () => setError('No se pudo guardar la cirugía.'),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const procedureCatalogId = await resolveCatalogValue('SURGERY_CATALOG', procedureName, surgeryCatalog.data ?? []);
      await apiClient.patch(
        `/clinical/admin-edit/surgeries/${editingId}`,
        {
          procedureName,
          procedureCatalogId,
          icd10Code: icd10Code || null,
          performedAt,
          hospitalName: hospitalName || null,
          surgeonName: surgeonName || null,
          approachId: approachId || null,
          outcomeId: outcomeId || null,
          complications: complications || null,
          recoveryNotes: recoveryNotes || null,
          hasImplant,
          implantDetails: hasImplant ? implantDetails || null : null,
        },
        { headers },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinical', 'surgeries', personId] });
      closeForm();
    },
    onError: () => setError('No se pudo guardar la corrección.'),
  });

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <Box>
      <Button size="small" variant="outlined" onClick={openCreate} sx={{ mb: 2 }}>
        Agregar cirugía
      </Button>
      {listQuery.isLoading && <CircularProgress size={24} />}
      {listQuery.data?.length === 0 && (
        <Alert severity="info">Sin cirugías / antecedentes quirúrgicos registrados.</Alert>
      )}
      {listQuery.data?.map((s) => (
        <Box key={s.id} sx={{ mb: 1, p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            {/* Pedido explícito del usuario: cirugía + fecha en la misma
                línea, mismo criterio que Enfermedades/Medicamentos. */}
            <Typography variant="body2" component="div">
              <strong>{s.procedureName}</strong>
              {s.performedAt && ` — ${formatDateOnly(s.performedAt)}`}{' '}
              {s.icd10Code && <Chip size="small" variant="outlined" label={s.icd10Code} />}{' '}
              {s.outcomeId && <Chip size="small" label={labelFor(outcomeCatalog.data, s.outcomeId)} />}{' '}
              {s.hasImplant && <Chip size="small" color="info" label="Con implante" />}
            </Typography>
            {(s.hospitalName || s.surgeonName || s.approachId) && (
              <Typography variant="caption" color="text.secondary" component="div">
                {s.hospitalName}
                {s.surgeonName && ` · Dr./Dra. ${s.surgeonName}`}
                {s.approachId && ` · ${labelFor(approachCatalog.data, s.approachId)}`}
              </Typography>
            )}
            {s.complications && (
              <Typography variant="caption" color="error" sx={{ display: 'block' }}>
                Complicaciones: {s.complications}
              </Typography>
            )}
            {s.recoveryNotes && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                Recuperación: {s.recoveryNotes}
              </Typography>
            )}
            {s.hasImplant && s.implantDetails && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                Implante: {s.implantDetails}
              </Typography>
            )}
          </Box>
          <Box sx={{ display: 'flex' }}>
            <ClinicalEditButton onClick={() => openEdit(s)} />
            <ClinicalDeleteButton
              resource="surgeries"
              id={s.id}
              itemLabel={s.procedureName}
              queryKey={['clinical', 'surgeries', personId]}
              headers={headers}
            />
          </Box>
        </Box>
      ))}

      <Dialog open={open} onClose={closeForm} fullWidth maxWidth="sm">
        <DialogTitle>{editingId ? 'Editar cirugía' : 'Agregar cirugía'}</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Grid container spacing={1}>
            <Grid size={{ xs: 8 }}>
              <Autocomplete
                freeSolo
                options={(surgeryCatalog.data ?? []).map((o) => o.labelEs)}
                inputValue={procedureName}
                onInputChange={(_, v) => setProcedureName(v)}
                renderInput={(params) => (
                  <TextField {...params} label="Procedimiento" fullWidth margin="normal" helperText="Ej. Colecistectomía" />
                )}
              />
            </Grid>
            <Grid size={{ xs: 4 }}>
              <TextField
                label="Código ICD"
                fullWidth
                margin="normal"
                value={icd10Code}
                onChange={(e) => setIcd10Code(e.target.value)}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                label="Fecha"
                type="date"
                fullWidth
                margin="normal"
                slotProps={{ inputLabel: { shrink: true } }}
                value={performedAt}
                onChange={(e) => setPerformedAt(e.target.value)}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                select
                label="Abordaje"
                fullWidth
                margin="normal"
                value={approachId}
                onChange={(e) => setApproachId(e.target.value)}
              >
                {(approachCatalog.data ?? []).map((o) => (
                  <MenuItem key={o.id} value={o.id}>{o.labelEs}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                label="Centro médico / hospital"
                fullWidth
                margin="normal"
                value={hospitalName}
                onChange={(e) => setHospitalName(e.target.value)}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                label="Cirujano/a"
                fullWidth
                margin="normal"
                value={surgeonName}
                onChange={(e) => setSurgeonName(e.target.value)}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                select
                label="Resultado"
                fullWidth
                margin="normal"
                value={outcomeId}
                onChange={(e) => setOutcomeId(e.target.value)}
              >
                {(outcomeCatalog.data ?? []).map((o) => (
                  <MenuItem key={o.id} value={o.id}>{o.labelEs}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                label="Complicaciones"
                fullWidth
                multiline
                minRows={2}
                margin="normal"
                value={complications}
                onChange={(e) => setComplications(e.target.value)}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                label="Notas de recuperación"
                fullWidth
                multiline
                minRows={2}
                margin="normal"
                value={recoveryNotes}
                onChange={(e) => setRecoveryNotes(e.target.value)}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <label>
                <input
                  type="checkbox"
                  checked={hasImplant}
                  onChange={(e) => setHasImplant(e.target.checked)}
                />{' '}
                Tiene implante (afecta estudios de imagen)
              </label>
            </Grid>
            {hasImplant && (
              <Grid size={{ xs: 12 }}>
                <TextField
                  label="Detalle del implante"
                  fullWidth
                  margin="normal"
                  value={implantDetails}
                  onChange={(e) => setImplantDetails(e.target.value)}
                />
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeForm}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={!procedureName || !performedAt || saving}
            onClick={() => (editingId ? updateMutation.mutate() : createMutation.mutate())}
          >
            Guardar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

interface ImplantDeviceRecord {
  id: string;
  deviceName: string;
  deviceTypeId?: string;
  implantedAt?: string;
  notes?: string;
}

function ImplantsTab({
  personId,
  headers,
}: {
  personId: string;
  headers: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState('');
  const [implantedAt, setImplantedAt] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const typeCatalog = useCatalog('IMPLANT_TYPE');
  const canonicalCatalog = useCatalog('CANONICAL_STATUS');
  const provenanceCatalog = useCatalog('PROVENANCE_TYPE');

  const listQuery = useQuery({
    queryKey: ['clinical', 'implants-devices', personId],
    queryFn: async () => {
      const { data } = await apiClient.get<ImplantDeviceRecord[]>('/clinical/implants-devices', {
        params: { personId },
        headers,
      });
      return data;
    },
  });

  const clearFields = () => {
    setDeviceName('');
    setImplantedAt('');
    setNotes('');
  };

  const closeForm = () => {
    setOpen(false);
    setEditingId(null);
    clearFields();
    setError(null);
  };

  const openCreate = () => {
    setEditingId(null);
    clearFields();
    setOpen(true);
  };

  const openEdit = (d: ImplantDeviceRecord) => {
    setEditingId(d.id);
    setDeviceName(d.deviceName);
    setImplantedAt(d.implantedAt?.slice(0, 10) ?? '');
    setNotes(d.notes ?? '');
    setOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const provisional = canonicalCatalog.data?.find((s) => s.code === 'PROVISIONAL');
      const staffEntered = provenanceCatalog.data?.find(
        (p) => p.code === 'PROFESSIONAL_ENTERED',
      );
      const deviceTypeId = await resolveCatalogValue('IMPLANT_TYPE', deviceName, typeCatalog.data ?? []);
      const { data } = await apiClient.post(
        '/clinical/implants-devices',
        {
          personId,
          deviceName,
          deviceTypeId,
          implantedAt: implantedAt || undefined,
          notes: notes || undefined,
          canonicalStatusId: provisional?.id,
          provenanceId: staffEntered?.id,
        },
        { headers },
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinical', 'implants-devices', personId] });
      closeForm();
    },
    onError: () => setError('No se pudo guardar el implante/dispositivo.'),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const deviceTypeId = await resolveCatalogValue('IMPLANT_TYPE', deviceName, typeCatalog.data ?? []);
      await apiClient.patch(
        `/clinical/admin-edit/implants-devices/${editingId}`,
        { deviceName, deviceTypeId, implantedAt: implantedAt || null, notes: notes || null },
        { headers },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinical', 'implants-devices', personId] });
      closeForm();
    },
    onError: () => setError('No se pudo guardar la corrección.'),
  });

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <Box>
      <Button size="small" variant="outlined" onClick={openCreate} sx={{ mb: 2 }}>
        Agregar implante o dispositivo
      </Button>
      {listQuery.isLoading && <CircularProgress size={24} />}
      {listQuery.data?.length === 0 && (
        <Alert severity="info">Sin implantes ni dispositivos registrados.</Alert>
      )}
      {listQuery.data?.map((d) => (
        <Box key={d.id} sx={{ mb: 1, p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            {/* Pedido explícito del usuario: implante + fecha en la
                misma línea, mismo criterio que Enfermedades/Medicamentos/Cirugías. */}
            <Typography variant="body2" component="div">
              <strong>{d.deviceName}</strong>
              {d.implantedAt && ` — ${formatDateOnly(d.implantedAt)}`}{' '}
              {/* Bug real reportado en vivo: "por qué repite Marcapasos"
                  — el tipo de catálogo suele coincidir exactamente con
                  el nombre escrito (mismo texto), mostrarlo dos veces es
                  ruido. Solo se muestra el chip si aporta algo distinto. */}
              {d.deviceTypeId && labelFor(typeCatalog.data, d.deviceTypeId).trim().toLowerCase() !== d.deviceName.trim().toLowerCase() && (
                <Chip size="small" variant="outlined" label={labelFor(typeCatalog.data, d.deviceTypeId)} />
              )}
            </Typography>
            {d.notes && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                {d.notes}
              </Typography>
            )}
          </Box>
          <Box sx={{ display: 'flex' }}>
            <ClinicalEditButton onClick={() => openEdit(d)} />
            <ClinicalDeleteButton
              resource="implants-devices"
              id={d.id}
              itemLabel={d.deviceName}
              queryKey={['clinical', 'implants-devices', personId]}
              headers={headers}
            />
          </Box>
        </Box>
      ))}

      <Dialog open={open} onClose={closeForm} fullWidth maxWidth="sm">
        <DialogTitle>{editingId ? 'Editar implante o dispositivo' : 'Agregar implante o dispositivo'}</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Autocomplete
            freeSolo
            options={(typeCatalog.data ?? []).map((o) => o.labelEs)}
            inputValue={deviceName}
            onInputChange={(_, v) => setDeviceName(v)}
            renderInput={(params) => (
              <TextField {...params} label="Implante / dispositivo" fullWidth margin="normal" helperText="Ej. marcapasos, prótesis de cadera, bomba de insulina" />
            )}
          />
          <TextField
            label="Fecha de implantación (opcional)"
            type="date"
            fullWidth
            margin="normal"
            slotProps={{ inputLabel: { shrink: true } }}
            value={implantedAt}
            onChange={(e) => setImplantedAt(e.target.value)}
          />
          <TextField
            label="Notas"
            fullWidth
            multiline
            minRows={2}
            margin="normal"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeForm}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={!deviceName || saving}
            onClick={() => (editingId ? updateMutation.mutate() : createMutation.mutate())}
          >
            Guardar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

interface TreatmentRecord {
  id: string;
  treatmentName: string;
  treatmentCatalogId?: string;
  statusId?: string;
  startedAt?: string;
  notes?: string;
}

/**
 * Pedido explícito del usuario: "para el caso de diálisis, como la
 * tenemos que tratar ya que es un tratamiento, lo mismo pasaría con
 * quimioterapia u otro tipo de tratamiento de importancia... deberíamos
 * tener también una tabla que pueda ser actualizada como enfermedades,
 * y que tenga el mismo tratamiento de altas o modificaciones" — mismo
 * patrón exacto que ImplantsTab (arriba), con el agregado de un estado
 * (statusId, dominio CONDITION_STATUS reutilizado) igual que
 * ConditionsTab, ya que un tratamiento puede seguir en curso o haber
 * terminado.
 */
function TreatmentsTab({
  personId,
  headers,
}: {
  personId: string;
  headers: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [treatmentName, setTreatmentName] = useState('');
  const [statusId, setStatusId] = useState('');
  const [startedAt, setStartedAt] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const typeCatalog = useCatalog('TREATMENT_TYPE');
  const statusCatalog = useCatalog('CONDITION_STATUS');
  const canonicalCatalog = useCatalog('CANONICAL_STATUS');
  const provenanceCatalog = useCatalog('PROVENANCE_TYPE');

  const listQuery = useQuery({
    queryKey: ['clinical', 'treatments', personId],
    queryFn: async () => {
      const { data } = await apiClient.get<TreatmentRecord[]>('/clinical/treatments', {
        params: { personId },
        headers,
      });
      return data;
    },
  });

  const clearFields = () => {
    setTreatmentName('');
    setStatusId('');
    setStartedAt('');
    setNotes('');
  };

  const closeForm = () => {
    setOpen(false);
    setEditingId(null);
    clearFields();
    setError(null);
  };

  const openCreate = () => {
    setEditingId(null);
    clearFields();
    setStatusId(statusCatalog.data?.find((s) => s.code === 'ACTIVE')?.id ?? '');
    setOpen(true);
  };

  const openEdit = (t: TreatmentRecord) => {
    setEditingId(t.id);
    setTreatmentName(t.treatmentName);
    setStatusId(t.statusId ?? '');
    setStartedAt(t.startedAt?.slice(0, 10) ?? '');
    setNotes(t.notes ?? '');
    setOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const provisional = canonicalCatalog.data?.find((s) => s.code === 'PROVISIONAL');
      const staffEntered = provenanceCatalog.data?.find(
        (p) => p.code === 'PROFESSIONAL_ENTERED',
      );
      const treatmentCatalogId = await resolveCatalogValue('TREATMENT_TYPE', treatmentName, typeCatalog.data ?? []);
      const { data } = await apiClient.post(
        '/clinical/treatments',
        {
          personId,
          treatmentName,
          treatmentCatalogId,
          statusId: statusId || undefined,
          startedAt: startedAt || undefined,
          notes: notes || undefined,
          canonicalStatusId: provisional?.id,
          provenanceId: staffEntered?.id,
        },
        { headers },
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinical', 'treatments', personId] });
      closeForm();
    },
    onError: () => setError('No se pudo guardar el tratamiento.'),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const treatmentCatalogId = await resolveCatalogValue('TREATMENT_TYPE', treatmentName, typeCatalog.data ?? []);
      await apiClient.patch(
        `/clinical/admin-edit/treatments/${editingId}`,
        { treatmentName, treatmentCatalogId, statusId: statusId || null, startedAt: startedAt || null, notes: notes || null },
        { headers },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinical', 'treatments', personId] });
      closeForm();
    },
    onError: () => setError('No se pudo guardar la corrección.'),
  });

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <Box>
      <Button size="small" variant="outlined" onClick={openCreate} sx={{ mb: 2 }}>
        Agregar tratamiento
      </Button>
      {listQuery.isLoading && <CircularProgress size={24} />}
      {listQuery.data?.length === 0 && (
        <Alert severity="info">Sin tratamientos registrados.</Alert>
      )}
      {listQuery.data?.map((t) => (
        <Box key={t.id} sx={{ mb: 1, p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            <Typography variant="body2" component="div">
              <strong>{t.treatmentName}</strong>
              {t.startedAt && ` — desde ${formatDateOnly(t.startedAt)}`}{' '}
              {t.statusId && !['ACTIVE'].includes(statusCatalog.data?.find((s) => s.id === t.statusId)?.code ?? '') && (
                <Chip size="small" label={labelFor(statusCatalog.data, t.statusId)} />
              )}
            </Typography>
            {t.notes && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                {t.notes}
              </Typography>
            )}
          </Box>
          <Box sx={{ display: 'flex' }}>
            <ClinicalEditButton onClick={() => openEdit(t)} />
            <ClinicalDeleteButton
              resource="treatments"
              id={t.id}
              itemLabel={t.treatmentName}
              queryKey={['clinical', 'treatments', personId]}
              headers={headers}
            />
          </Box>
        </Box>
      ))}

      <Dialog open={open} onClose={closeForm} fullWidth maxWidth="sm">
        <DialogTitle>{editingId ? 'Editar tratamiento' : 'Agregar tratamiento'}</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Autocomplete
            freeSolo
            options={(typeCatalog.data ?? []).map((o) => o.labelEs)}
            inputValue={treatmentName}
            onInputChange={(_, v) => setTreatmentName(v)}
            renderInput={(params) => (
              <TextField {...params} label="Tratamiento" fullWidth margin="normal" helperText="Ej. diálisis, quimioterapia, radioterapia" />
            )}
          />
          <TextField
            select
            label="Estado"
            fullWidth
            margin="normal"
            value={statusId}
            onChange={(e) => setStatusId(e.target.value)}
          >
            {(statusCatalog.data ?? []).map((o) => (
              <MenuItem key={o.id} value={o.id}>{o.labelEs}</MenuItem>
            ))}
          </TextField>
          <TextField
            label="Fecha de inicio (opcional)"
            type="date"
            fullWidth
            margin="normal"
            slotProps={{ inputLabel: { shrink: true } }}
            value={startedAt}
            onChange={(e) => setStartedAt(e.target.value)}
          />
          <TextField
            label="Notas"
            fullWidth
            multiline
            minRows={2}
            margin="normal"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeForm}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={!treatmentName || saving}
            onClick={() => (editingId ? updateMutation.mutate() : createMutation.mutate())}
          >
            Guardar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function MedicationsTab({
  personId,
  headers,
}: {
  personId: string;
  headers: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [genericName, setGenericName] = useState('');
  const [brandName, setBrandName] = useState('');
  const [doseAmount, setDoseAmount] = useState('');
  const [doseUnitId, setDoseUnitId] = useState('');
  const [frequencyId, setFrequencyId] = useState('');
  const [routeId, setRouteId] = useState('');
  const [startedAt, setStartedAt] = useState('');
  const [prescribedDate, setPrescribedDate] = useState('');
  const [isChronic, setIsChronic] = useState(false);
  const [travelNotes, setTravelNotes] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const canonicalCatalog = useCatalog('CANONICAL_STATUS');
  const provenanceCatalog = useCatalog('PROVENANCE_TYPE');
  const doseUnitCatalog = useCatalog('DOSE_UNIT');
  const frequencyCatalog = useCatalog('MEDICATION_FREQUENCY');
  const routeCatalog = useCatalog('MEDICATION_ROUTE');
  const medicationCatalog = useCatalog('MEDICATION');

  const listQuery = useQuery({
    queryKey: ['clinical', 'medications', personId],
    queryFn: async () => {
      const { data } = await apiClient.get<Medication[]>('/clinical/medications', {
        params: { personId },
        headers,
      });
      return data;
    },
  });

  const clearFields = () => {
    setGenericName('');
    setBrandName('');
    setDoseAmount('');
    setDoseUnitId('');
    setFrequencyId('');
    setRouteId('');
    setStartedAt('');
    setPrescribedDate('');
    setIsChronic(false);
    setTravelNotes('');
    setNotes('');
  };

  const closeForm = () => {
    setOpen(false);
    setEditingId(null);
    clearFields();
    setError(null);
  };

  const openCreate = () => {
    setEditingId(null);
    clearFields();
    setOpen(true);
  };

  const openEdit = (m: Medication) => {
    setEditingId(m.id);
    setGenericName(m.genericName);
    setBrandName(m.brandName ?? '');
    setDoseAmount(m.doseAmount ?? '');
    setDoseUnitId(m.doseUnitId ?? '');
    setFrequencyId(m.frequencyId ?? '');
    setRouteId(m.routeId ?? '');
    setStartedAt(m.startedAt?.slice(0, 10) ?? '');
    setPrescribedDate('');
    setIsChronic(m.isChronic ?? false);
    setTravelNotes(m.travelNotes ?? '');
    setNotes(m.notes ?? '');
    setOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const provisional = canonicalCatalog.data?.find((s) => s.code === 'PROVISIONAL');
      const staffEntered = provenanceCatalog.data?.find(
        (p) => p.code === 'PROFESSIONAL_ENTERED',
      );
      const medicationCatalogId = await resolveCatalogValue('MEDICATION', genericName, medicationCatalog.data ?? []);
      const { data } = await apiClient.post(
        '/clinical/medications',
        {
          personId,
          genericName,
          medicationCatalogId,
          brandName: brandName || undefined,
          doseAmount: doseAmount || undefined,
          doseUnitId: doseUnitId || undefined,
          frequencyId: frequencyId || undefined,
          routeId: routeId || undefined,
          startedAt: startedAt || undefined,
          prescribedDate: prescribedDate || undefined,
          isChronic,
          travelNotes: travelNotes || undefined,
          canonicalStatusId: provisional?.id,
          provenanceId: staffEntered?.id,
          notes: notes || undefined,
        },
        { headers },
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinical', 'medications', personId] });
      closeForm();
    },
    onError: () => setError('No se pudo guardar el medicamento.'),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const medicationCatalogId = await resolveCatalogValue('MEDICATION', genericName, medicationCatalog.data ?? []);
      await apiClient.patch(
        `/clinical/admin-edit/medications/${editingId}`,
        {
          genericName,
          medicationCatalogId,
          brandName: brandName || null,
          doseAmount: doseAmount || null,
          doseUnitId: doseUnitId || null,
          frequencyId: frequencyId || null,
          routeId: routeId || null,
          startedAt: startedAt || null,
          isChronic,
          travelNotes: travelNotes || null,
          notes: notes || null,
        },
        { headers },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinical', 'medications', personId] });
      closeForm();
    },
    onError: () => setError('No se pudo guardar la corrección.'),
  });

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <Box>
      <Button size="small" variant="outlined" onClick={openCreate} sx={{ mb: 2 }}>
        Agregar medicamento
      </Button>
      {listQuery.isLoading && <CircularProgress size={24} />}
      {listQuery.data?.length === 0 && (
        <Alert severity="info">Sin medicamentos registrados.</Alert>
      )}
      {listQuery.data?.map((m) => (
        <Box key={m.id} sx={{ mb: 1, p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            {/* Pedido explícito del usuario: Medicamento, Dosis y fecha
                (si tiene) todo en la misma línea — mismo criterio que
                Enfermedades. */}
            {/* Pedido explícito del usuario: todo en una sola línea que
                fluye normalmente (wrap del navegador) — si no entra en el
                ancho disponible, continúa debajo por wrap natural, no por
                un salto de línea forzado con un bloque aparte. Por eso
                "notes" (que a veces es la dosis sin poder parsear, ej.
                Reliveran "Dosis: 05") va DENTRO del mismo Typography, no
                en un <Typography> separado. */}
            <Typography variant="body2" component="div">
              <strong>{m.genericName}</strong>
              {m.brandName ? ` (${m.brandName})` : ''}
              {m.doseAmount && ` — Dosis: ${m.doseAmount} ${labelFor(doseUnitCatalog.data, m.doseUnitId)}`}
              {!m.doseAmount && m.notes && ` — ${m.notes}`}
              {m.startedAt && ` — Desde: ${formatDateOnly(m.startedAt)}`}{' '}
              {m.isChronic && <Chip size="small" color="warning" label="Crónico" />}
            </Typography>
            {(m.frequencyId || m.routeId) && (
              <Typography variant="caption" color="text.secondary" component="div">
                {m.frequencyId && labelFor(frequencyCatalog.data, m.frequencyId)}
                {m.routeId && ` · ${labelFor(routeCatalog.data, m.routeId)}`}
              </Typography>
            )}
            {m.travelNotes && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                Para viajar: {m.travelNotes}
              </Typography>
            )}
            {m.doseAmount && m.notes && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                {m.notes}
              </Typography>
            )}
          </Box>
          <Box sx={{ display: 'flex' }}>
            <ClinicalEditButton onClick={() => openEdit(m)} />
            <ClinicalDeleteButton
              resource="medications"
              id={m.id}
              itemLabel={m.genericName}
              queryKey={['clinical', 'medications', personId]}
              headers={headers}
            />
          </Box>
        </Box>
      ))}

      <Dialog open={open} onClose={closeForm} fullWidth maxWidth="sm">
        <DialogTitle>{editingId ? 'Editar medicamento' : 'Agregar medicamento'}</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Grid container spacing={1}>
            <Grid size={{ xs: 6 }}>
              <Autocomplete
                freeSolo
                options={(medicationCatalog.data ?? []).map((o) => o.labelEs)}
                inputValue={genericName}
                onInputChange={(_, v) => setGenericName(v)}
                renderInput={(params) => (
                  <TextField {...params} label="Nombre genérico" fullWidth margin="normal" />
                )}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                label="Nombre comercial"
                fullWidth
                margin="normal"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
              />
            </Grid>
            <Grid size={{ xs: 4 }}>
              <TextField
                label="Dosis"
                type="number"
                fullWidth
                margin="normal"
                value={doseAmount}
                onChange={(e) => setDoseAmount(e.target.value)}
              />
            </Grid>
            <Grid size={{ xs: 4 }}>
              <TextField
                select
                label="Unidad"
                fullWidth
                margin="normal"
                value={doseUnitId}
                onChange={(e) => setDoseUnitId(e.target.value)}
              >
                {(doseUnitCatalog.data ?? []).map((o) => (
                  <MenuItem key={o.id} value={o.id}>{o.labelEs}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 4 }}>
              <TextField
                select
                label="Vía"
                fullWidth
                margin="normal"
                value={routeId}
                onChange={(e) => setRouteId(e.target.value)}
              >
                {(routeCatalog.data ?? []).map((o) => (
                  <MenuItem key={o.id} value={o.id}>{o.labelEs}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                select
                label="Frecuencia"
                fullWidth
                margin="normal"
                value={frequencyId}
                onChange={(e) => setFrequencyId(e.target.value)}
              >
                {(frequencyCatalog.data ?? []).map((o) => (
                  <MenuItem key={o.id} value={o.id}>{o.labelEs}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                label="Desde"
                type="date"
                fullWidth
                margin="normal"
                slotProps={{ inputLabel: { shrink: true } }}
                value={startedAt}
                onChange={(e) => setStartedAt(e.target.value)}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                label="Fecha de prescripción"
                type="date"
                fullWidth
                margin="normal"
                slotProps={{ inputLabel: { shrink: true } }}
                value={prescribedDate}
                onChange={(e) => setPrescribedDate(e.target.value)}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <label>
                <input
                  type="checkbox"
                  checked={isChronic}
                  onChange={(e) => setIsChronic(e.target.checked)}
                />{' '}
                Medicación crónica (de uso permanente)
              </label>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                label="Notas para viaje (requiere cadena de frío, certificado, etc.)"
                fullWidth
                multiline
                minRows={2}
                margin="normal"
                value={travelNotes}
                onChange={(e) => setTravelNotes(e.target.value)}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                label="Notas"
                fullWidth
                multiline
                minRows={2}
                margin="normal"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeForm}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={!genericName || saving}
            onClick={() => (editingId ? updateMutation.mutate() : createMutation.mutate())}
          >
            Guardar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

/**
 * "Estudios" — pedido explícito del usuario: clinical.lab_results ya
 * existía en el schema (columnas con nombre propio para los valores más
 * comunes + custom_values jsonb para el resto) pero no había ninguna
 * pantalla para verlos ni cargarlos a mano — se veían en el chat de IA
 * pero no en la ficha. Mismo recurso genérico /clinical/lab-results que
 * ya usa la IA al confirmar un proposal LAB_RESULT (ver ai.service.ts).
 */
function LabResultsTab({
  personId,
  headers,
}: {
  personId: string;
  headers: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [labName, setLabName] = useState('');
  const [performedAt, setPerformedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [studyTypeId, setStudyTypeId] = useState('');
  const [hemoglobin, setHemoglobin] = useState('');
  const [hematocrit, setHematocrit] = useState('');
  const [platelets, setPlatelets] = useState('');
  const [glucoseFasting, setGlucoseFasting] = useState('');
  const [hba1c, setHba1c] = useState('');
  const [totalCholesterol, setTotalCholesterol] = useState('');
  const [creatinine, setCreatinine] = useState('');
  const [ptInr, setPtInr] = useState('');
  const [aptt, setAptt] = useState('');
  const [notes, setNotes] = useState('');
  const [indicatorValues, setIndicatorValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const provenanceCatalog = useCatalog('PROVENANCE_TYPE');
  const statusCatalog = useCatalog('CANONICAL_STATUS');
  const studyTypeCatalog = useCatalog('LAB_STUDY_TYPE');
  const indicatorCatalog = useCatalog('LAB_INDICATOR');

  useEffect(() => {
    if (studyTypeId || !studyTypeCatalog.data?.length) return;
    const blood = studyTypeCatalog.data.find((s) => s.code === 'BLOOD');
    setStudyTypeId((blood ?? studyTypeCatalog.data[0]).id);
  }, [studyTypeCatalog.data, studyTypeId]);

  const studyTypeCode = studyTypeCatalog.data?.find((s) => s.id === studyTypeId)?.code;
  const isBlood = studyTypeCode === 'BLOOD' || !studyTypeCode;
  const dynamicIndicators = (indicatorCatalog.data ?? []).filter((ind) => {
    if (ind.metadata?.studyTypeCode !== studyTypeCode) return false;
    if (studyTypeCode === 'BLOOD' && DEDICATED_FIELD_INDICATOR_CODES.has(ind.code)) return false;
    return true;
  });

  const indicatorLabel = (code: string) => {
    const ind = indicatorCatalog.data?.find((i) => i.code === code);
    if (!ind) return null;
    const unit = ind.metadata?.unit as string | undefined;
    return `${ind.labelEs}${unit ? ` (${unit})` : ''}`;
  };

  const listQuery = useQuery({
    queryKey: ['clinical', 'lab-results', personId],
    queryFn: async () => {
      const { data } = await apiClient.get<LabResultRecord[]>(
        '/clinical/lab-results',
        { params: { personId }, headers },
      );
      return data;
    },
  });

  const sorted = (listQuery.data ?? [])
    .slice()
    .sort((a, b) => new Date(b.performedAt).getTime() - new Date(a.performedAt).getTime());

  const groupedByType = (studyTypeCatalog.data ?? []).map((type) => ({
    type,
    items: sorted.filter((r) => r.studyTypeId === type.id),
  })).filter((g) => g.items.length > 0);
  /** Si todavía no cargó el catálogo, o hay resultados sin studyTypeId (no debería pasar), no se pierden — se listan aparte. */
  const ungrouped = sorted.filter((r) => !(studyTypeCatalog.data ?? []).some((t) => t.id === r.studyTypeId));

  const resetForm = () => {
    setLabName('');
    setPerformedAt(new Date().toISOString().slice(0, 10));
    setHemoglobin('');
    setHematocrit('');
    setPlatelets('');
    setGlucoseFasting('');
    setHba1c('');
    setTotalCholesterol('');
    setCreatinine('');
    setPtInr('');
    setAptt('');
    setNotes('');
    setIndicatorValues({});
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const staffEntered = provenanceCatalog.data?.find((p) => p.code === 'PROFESSIONAL_ENTERED');
      const provisional = statusCatalog.data?.find((s) => s.code === 'PROVISIONAL');
      const customValues = [
        ...dynamicIndicators
          .filter((ind) => (indicatorValues[ind.id] ?? '').trim())
          .map((ind) => ({ name: ind.code, value: indicatorValues[ind.id].trim() })),
        ...(notes ? [{ name: 'Notas', value: notes }] : []),
      ];
      const { data } = await apiClient.post(
        '/clinical/lab-results',
        {
          personId,
          labName: labName || undefined,
          performedAt,
          studyTypeId: studyTypeId || undefined,
          hemoglobin: isBlood ? hemoglobin || undefined : undefined,
          hematocrit: isBlood ? hematocrit || undefined : undefined,
          platelets: isBlood ? platelets || undefined : undefined,
          glucoseFasting: isBlood ? glucoseFasting || undefined : undefined,
          hba1c: isBlood ? hba1c || undefined : undefined,
          totalCholesterol: isBlood ? totalCholesterol || undefined : undefined,
          creatinine: isBlood ? creatinine || undefined : undefined,
          ptInr: isBlood ? ptInr || undefined : undefined,
          aptt: isBlood ? aptt || undefined : undefined,
          customValues,
          canonicalStatusId: provisional?.id,
          provenanceId: staffEntered?.id,
        },
        { headers },
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinical', 'lab-results', personId] });
      setOpen(false);
      resetForm();
      setError(null);
    },
    onError: () => setError('No se pudo guardar el estudio.'),
  });

  const renderResult = (r: LabResultRecord) => (
    <Box key={r.id} sx={{ mb: 1, p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        {r.labName ?? 'Estudio'} · {new Date(r.performedAt).toLocaleDateString('es-AR')}
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 0.5 }}>
        {r.hemoglobin && <Chip size="small" label={`Hemoglobina: ${r.hemoglobin}`} />}
        {r.hematocrit && <Chip size="small" label={`Hematocrito: ${r.hematocrit}`} />}
        {r.platelets && <Chip size="small" label={`Plaquetas: ${r.platelets}`} />}
        {r.glucoseFasting && <Chip size="small" label={`Glucemia: ${r.glucoseFasting}`} />}
        {r.hba1c && <Chip size="small" label={`HbA1c: ${r.hba1c}`} />}
        {r.totalCholesterol && <Chip size="small" label={`Colesterol total: ${r.totalCholesterol}`} />}
        {r.creatinine && <Chip size="small" label={`Creatinina: ${r.creatinine}`} />}
        {r.ptInr && <Chip size="small" label={`INR: ${r.ptInr}`} />}
        {r.aptt && <Chip size="small" label={`APTT: ${r.aptt}`} />}
        {(r.customValues ?? []).map((v, i) => (
          <Chip key={i} size="small" variant="outlined" label={indicatorLabel(v.name) ? `${indicatorLabel(v.name)}: ${v.value}` : `${v.name}: ${v.value}`} />
        ))}
      </Box>
    </Box>
  );

  return (
    <Box>
      <Button size="small" variant="outlined" onClick={() => setOpen(true)} sx={{ mb: 2 }}>
        Agregar estudio
      </Button>
      {listQuery.isLoading && <CircularProgress size={24} />}
      {sorted.length === 0 && (
        <Alert severity="info">Sin estudios / análisis registrados.</Alert>
      )}
      {groupedByType.map(({ type, items }) => (
        <Box key={type.id} sx={{ mb: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 'bold' }}>{type.labelEs}</Typography>
          {renderResult(items[0])}
          {items.length > 1 && (
            <Accordion disableGutters sx={{ boxShadow: 'none', '&:before': { display: 'none' } }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="caption">Ver estudios anteriores ({items.length - 1})</Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ p: 0 }}>
                {items.slice(1).map(renderResult)}
              </AccordionDetails>
            </Accordion>
          )}
        </Box>
      ))}
      {ungrouped.map(renderResult)}

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Agregar estudio / análisis</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Grid container spacing={1}>
            <Grid size={{ xs: 8 }}>
              <TextField label="Estudio" fullWidth margin="normal" value={labName} onChange={(e) => setLabName(e.target.value)} helperText="Ej. Análisis de sangre, coagulograma" />
            </Grid>
            <Grid size={{ xs: 4 }}>
              <TextField label="Fecha" type="date" fullWidth margin="normal" InputLabelProps={{ shrink: true }} value={performedAt} onChange={(e) => setPerformedAt(e.target.value)} />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                select
                label="Tipo de estudio"
                fullWidth
                margin="normal"
                value={studyTypeId}
                onChange={(e) => setStudyTypeId(e.target.value)}
              >
                {(studyTypeCatalog.data ?? []).map((o) => (
                  <MenuItem key={o.id} value={o.id}>{o.labelEs}</MenuItem>
                ))}
              </TextField>
            </Grid>
            {isBlood && (
              <>
                <Grid size={{ xs: 6 }}>
                  <TextField label="Hemoglobina" type="number" fullWidth margin="normal" value={hemoglobin} onChange={(e) => setHemoglobin(e.target.value)} />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <TextField label="Hematocrito" type="number" fullWidth margin="normal" value={hematocrit} onChange={(e) => setHematocrit(e.target.value)} />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <TextField label="Plaquetas" type="number" fullWidth margin="normal" value={platelets} onChange={(e) => setPlatelets(e.target.value)} />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <TextField label="Glucemia" type="number" fullWidth margin="normal" value={glucoseFasting} onChange={(e) => setGlucoseFasting(e.target.value)} />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <TextField label="HbA1c" type="number" fullWidth margin="normal" value={hba1c} onChange={(e) => setHba1c(e.target.value)} />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <TextField label="Colesterol total" type="number" fullWidth margin="normal" value={totalCholesterol} onChange={(e) => setTotalCholesterol(e.target.value)} />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <TextField label="Creatinina" type="number" fullWidth margin="normal" value={creatinine} onChange={(e) => setCreatinine(e.target.value)} />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <TextField label="INR" type="number" fullWidth margin="normal" value={ptInr} onChange={(e) => setPtInr(e.target.value)} />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <TextField label="APTT" type="number" fullWidth margin="normal" value={aptt} onChange={(e) => setAptt(e.target.value)} />
                </Grid>
              </>
            )}
            {dynamicIndicators.length > 0 && (
              <Grid size={{ xs: 12 }}>
                <Typography variant="subtitle2" sx={{ mt: 1 }}>Otros indicadores</Typography>
              </Grid>
            )}
            {dynamicIndicators.map((ind) => (
              <Grid size={{ xs: 6 }} key={ind.id}>
                <TextField
                  label={indicatorLabel(ind.code) ?? ind.labelEs}
                  type="number"
                  fullWidth
                  margin="normal"
                  value={indicatorValues[ind.id] ?? ''}
                  onChange={(e) => setIndicatorValues((v) => ({ ...v, [ind.id]: e.target.value }))}
                />
              </Grid>
            ))}
            <Grid size={{ xs: 12 }}>
              <TextField
                label="Otros valores / notas"
                fullWidth
                multiline
                minRows={2}
                margin="normal"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                helperText="Cualquier otro resultado sin campo propio (ej. protrombina 95%)"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={!performedAt || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            Guardar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
