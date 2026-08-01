import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
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
  MenuItem,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';

import { apiClient } from '../../lib/api-client';
import { labelFor, useCatalog } from '../../lib/catalog-hooks';

interface PatientSummary {
  firstName: string;
  lastName: string;
  birthDate: string | null;
  genderId: string | null;
  countryResidenceId: string | null;
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
}

interface ConditionRecord {
  id: string;
  conditionName: string;
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
  const [tab, setTab] = useState<
    'vitals' | 'allergies' | 'conditions' | 'surgeries' | 'medications'
  >('vitals');

  const headers: Record<string, string> = caseId ? { 'x-active-case-id': caseId } : {};

  return (
    <Card sx={{ mt: 3 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Historia clínica
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

        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, mt: 2 }}>
          <Tab label="Signos vitales" value="vitals" />
          <Tab label="Alergias" value="allergies" />
          <Tab label="Condiciones" value="conditions" />
          <Tab label="Cirugías" value="surgeries" />
          <Tab label="Medicamentos" value="medications" />
        </Tabs>
        {tab === 'vitals' && (
          <VitalsTab personId={personId} headers={headers} />
        )}
        {tab === 'allergies' && (
          <AllergiesTab personId={personId} headers={headers} />
        )}
        {tab === 'conditions' && (
          <ConditionsTab personId={personId} headers={headers} />
        )}
        {tab === 'surgeries' && (
          <SurgeriesTab personId={personId} headers={headers} />
        )}
        {tab === 'medications' && (
          <MedicationsTab personId={personId} headers={headers} />
        )}
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

  const latestVitals = (latestVitalsQuery.data ?? [])
    .slice()
    .sort((a, b) => new Date(b.measuredAt).getTime() - new Date(a.measuredAt).getTime())[0];

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
      <Typography variant="subtitle2" gutterBottom>
        {s.firstName} {s.lastName}
      </Typography>
      <Grid container spacing={2}>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Edad</Typography>
          <Typography variant="body2">{age !== null ? `${age} años` : '—'}</Typography>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Fecha de nacimiento</Typography>
          <Typography variant="body2">{s.birthDate ?? '—'}</Typography>
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
 * "Es de importancia ante una atención": alergias severas/críticas y
 * condiciones activas/crónicas (diabetes, hipertensión, cardíaco,
 * renal, etc.) no deberían estar escondidas detrás de un click en una
 * pestaña — se resumen acá, arriba de todo, con el mismo nivel de
 * visibilidad que los datos básicos del viajero. Reutiliza las mismas
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
  const conditionStatusCatalog = useCatalog('CONDITION_STATUS');

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

  const severeCodes = new Set(['SEVERE', 'CRITICAL']);
  const severeAllergies = (allergiesQuery.data ?? []).filter((a) => {
    const code = severityCatalog.data?.find((s) => s.id === a.severityId)?.code;
    return code && severeCodes.has(code);
  });

  const relevantStatusCodes = new Set(['ACTIVE', 'CHRONIC']);
  const activeConditions = (conditionsQuery.data ?? []).filter((c) => {
    const code = conditionStatusCatalog.data?.find((s) => s.id === c.statusId)?.code;
    return code && relevantStatusCodes.has(code);
  });

  if (severeAllergies.length === 0 && activeConditions.length === 0) return null;

  return (
    <Alert severity="warning" sx={{ mb: 1 }}>
      <Typography variant="subtitle2" gutterBottom>
        Alertas médicas
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
        {severeAllergies.map((a) => (
          <Chip
            key={a.id}
            size="small"
            color="error"
            label={`Alergia: ${a.allergenName}`}
          />
        ))}
        {activeConditions.map((c) => (
          <Chip
            key={c.id}
            size="small"
            color="warning"
            label={c.conditionName}
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
  const [bloodTypeId, setBloodTypeId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const bloodTypeCatalog = useCatalog('BLOOD_TYPE');
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

  const resetForm = () => {
    setWeightKg('');
    setHeightCm('');
    setBloodPressureSys('');
    setBloodPressureDia('');
    setHeartRate('');
    setTemperatureC('');
    setOxygenSaturation('');
    setBloodGlucose('');
    setBloodTypeId('');
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
          bloodTypeId: bloodTypeId || undefined,
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
      {sorted.map((v) => (
        <Box key={v.id} sx={{ mb: 1, p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {new Date(v.measuredAt).toLocaleString('es-AR')}
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 0.5 }}>
            {v.weightKg && <Chip size="small" label={`Peso: ${v.weightKg} kg`} />}
            {v.heightCm && <Chip size="small" label={`Altura: ${v.heightCm} cm`} />}
            {v.bmi && <Chip size="small" label={`IMC: ${v.bmi}`} />}
            {(v.bloodPressureSys || v.bloodPressureDia) && (
              <Chip size="small" label={`PA: ${v.bloodPressureSys ?? '—'}/${v.bloodPressureDia ?? '—'}`} />
            )}
            {v.heartRate && <Chip size="small" label={`FC: ${v.heartRate} lpm`} />}
            {v.temperatureC && <Chip size="small" label={`Temp: ${v.temperatureC}°C`} />}
            {v.oxygenSaturation && <Chip size="small" label={`SpO2: ${v.oxygenSaturation}%`} />}
            {v.bloodGlucose && <Chip size="small" label={`Glucemia: ${v.bloodGlucose}`} />}
            {v.bloodTypeId && (
              <Chip size="small" variant="outlined" label={labelFor(bloodTypeCatalog.data, v.bloodTypeId)} />
            )}
          </Box>
          {v.notes && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              {v.notes}
            </Typography>
          )}
        </Box>
      ))}

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
              <TextField select label="Grupo sanguíneo" fullWidth margin="normal" value={bloodTypeId} onChange={(e) => setBloodTypeId(e.target.value)}>
                {(bloodTypeCatalog.data ?? []).map((o) => (
                  <MenuItem key={o.id} value={o.id}>{o.labelEs}</MenuItem>
                ))}
              </TextField>
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

  const createMutation = useMutation({
    mutationFn: async () => {
      const provisional = statusCatalog.data?.find((s) => s.code === 'PROVISIONAL');
      const staffEntered = provenanceCatalog.data?.find(
        (p) => p.code === 'PROFESSIONAL_ENTERED',
      );
      const { data } = await apiClient.post(
        '/clinical/allergies',
        {
          personId,
          allergenName,
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
      setOpen(false);
      setAllergenName('');
      setAllergenTypeId('');
      setSeverityId('');
      setNotes('');
      setError(null);
    },
    onError: () => setError('No se pudo guardar la alergia.'),
  });

  return (
    <Box>
      <Button size="small" variant="outlined" onClick={() => setOpen(true)} sx={{ mb: 2 }}>
        Agregar alergia
      </Button>
      {listQuery.isLoading && <CircularProgress size={24} />}
      {listQuery.data?.length === 0 && (
        <Alert severity="info">Sin alergias registradas.</Alert>
      )}
      {listQuery.data?.map((a) => (
        <Box key={a.id} sx={{ mb: 1, p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
          <Typography variant="body2" component="div">
            <strong>{a.allergenName}</strong>{' '}
            <Chip size="small" label={labelFor(severityCatalog.data, a.severityId)} />{' '}
            <Chip size="small" variant="outlined" label={labelFor(typeCatalog.data, a.allergenTypeId)} />
          </Typography>
          {a.notes && (
            <Typography variant="caption" color="text.secondary">
              {a.notes}
            </Typography>
          )}
        </Box>
      ))}

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Agregar alergia</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <TextField
            label="Alérgeno"
            fullWidth
            margin="normal"
            value={allergenName}
            onChange={(e) => setAllergenName(e.target.value)}
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
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={!allergenName || !allergenTypeId || !severityId || createMutation.isPending}
            onClick={() => createMutation.mutate()}
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
  const [form, setForm] = useState<ConditionFormState>(EMPTY_CONDITION_FORM);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const statusCatalog = useCatalog('CONDITION_STATUS');
  const travelRiskCatalog = useCatalog('TRAVEL_RISK');
  const canonicalCatalog = useCatalog('CANONICAL_STATUS');
  const provenanceCatalog = useCatalog('PROVENANCE_TYPE');

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

  const createMutation = useMutation({
    mutationFn: async () => {
      const provisional = canonicalCatalog.data?.find((s) => s.code === 'PROVISIONAL');
      const staffEntered = provenanceCatalog.data?.find(
        (p) => p.code === 'PROFESSIONAL_ENTERED',
      );
      const { data } = await apiClient.post(
        '/clinical/conditions',
        {
          personId,
          conditionName: form.conditionName,
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
      setOpen(false);
      setForm(EMPTY_CONDITION_FORM);
      setError(null);
    },
    onError: () => setError('No se pudo guardar la condición.'),
  });

  return (
    <Box>
      <Button size="small" variant="outlined" onClick={() => setOpen(true)} sx={{ mb: 2 }}>
        Agregar condición
      </Button>
      {listQuery.isLoading && <CircularProgress size={24} />}
      {listQuery.data?.length === 0 && (
        <Alert severity="info">Sin condiciones registradas.</Alert>
      )}
      {listQuery.data?.map((c) => (
        <Box key={c.id} sx={{ mb: 1, p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
          <Typography variant="body2" component="div">
            <strong>{c.conditionName}</strong>{' '}
            {c.icd10Code && <Chip size="small" variant="outlined" label={c.icd10Code} />}{' '}
            <Chip size="small" label={labelFor(statusCatalog.data, c.statusId)} />{' '}
            {c.travelRiskId && (
              <Chip size="small" color="warning" label={`Riesgo de viaje: ${labelFor(travelRiskCatalog.data, c.travelRiskId)}`} />
            )}
          </Typography>
          <Typography variant="caption" color="text.secondary" component="div">
            {c.diagnosedAt && `Diagnosticada: ${c.diagnosedAt}`}
            {c.resolvedAt && ` · Resuelta: ${c.resolvedAt}`}
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
      ))}

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Agregar condición</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Grid container spacing={1}>
            <Grid size={{ xs: 8 }}>
              <TextField
                label="Condición"
                fullWidth
                margin="normal"
                value={form.conditionName}
                onChange={setField('conditionName')}
                helperText="Ej. Diabetes mellitus tipo 2"
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
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={!form.conditionName || !form.statusId || createMutation.isPending}
            onClick={() => createMutation.mutate()}
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

  const resetForm = () => {
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

  const createMutation = useMutation({
    mutationFn: async () => {
      const provisional = canonicalCatalog.data?.find((s) => s.code === 'PROVISIONAL');
      const staffEntered = provenanceCatalog.data?.find(
        (p) => p.code === 'PROFESSIONAL_ENTERED',
      );
      const { data } = await apiClient.post(
        '/clinical/surgeries',
        {
          personId,
          procedureName,
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
      setOpen(false);
      resetForm();
      setError(null);
    },
    onError: () => setError('No se pudo guardar la cirugía.'),
  });

  return (
    <Box>
      <Button size="small" variant="outlined" onClick={() => setOpen(true)} sx={{ mb: 2 }}>
        Agregar cirugía
      </Button>
      {listQuery.isLoading && <CircularProgress size={24} />}
      {listQuery.data?.length === 0 && (
        <Alert severity="info">Sin cirugías / antecedentes quirúrgicos registrados.</Alert>
      )}
      {listQuery.data?.map((s) => (
        <Box key={s.id} sx={{ mb: 1, p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
          <Typography variant="body2" component="div">
            <strong>{s.procedureName}</strong>{' '}
            {s.icd10Code && <Chip size="small" variant="outlined" label={s.icd10Code} />}{' '}
            {s.outcomeId && <Chip size="small" label={labelFor(outcomeCatalog.data, s.outcomeId)} />}{' '}
            {s.hasImplant && <Chip size="small" color="info" label="Con implante" />}
          </Typography>
          <Typography variant="caption" color="text.secondary" component="div">
            {s.performedAt}
            {s.hospitalName && ` · ${s.hospitalName}`}
            {s.surgeonName && ` · Dr./Dra. ${s.surgeonName}`}
            {s.approachId && ` · ${labelFor(approachCatalog.data, s.approachId)}`}
          </Typography>
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
      ))}

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Agregar cirugía</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Grid container spacing={1}>
            <Grid size={{ xs: 8 }}>
              <TextField
                label="Procedimiento"
                fullWidth
                margin="normal"
                value={procedureName}
                onChange={(e) => setProcedureName(e.target.value)}
                helperText="Ej. Colecistectomía"
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
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={!procedureName || !performedAt || createMutation.isPending}
            onClick={() => createMutation.mutate()}
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
  const [genericName, setGenericName] = useState('');
  const [brandName, setBrandName] = useState('');
  const [doseAmount, setDoseAmount] = useState('');
  const [doseUnitId, setDoseUnitId] = useState('');
  const [frequencyId, setFrequencyId] = useState('');
  const [routeId, setRouteId] = useState('');
  const [startedAt, setStartedAt] = useState('');
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

  const resetForm = () => {
    setGenericName('');
    setBrandName('');
    setDoseAmount('');
    setDoseUnitId('');
    setFrequencyId('');
    setRouteId('');
    setStartedAt('');
    setIsChronic(false);
    setTravelNotes('');
    setNotes('');
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const provisional = canonicalCatalog.data?.find((s) => s.code === 'PROVISIONAL');
      const staffEntered = provenanceCatalog.data?.find(
        (p) => p.code === 'PROFESSIONAL_ENTERED',
      );
      const { data } = await apiClient.post(
        '/clinical/medications',
        {
          personId,
          genericName,
          brandName: brandName || undefined,
          doseAmount: doseAmount || undefined,
          doseUnitId: doseUnitId || undefined,
          frequencyId: frequencyId || undefined,
          routeId: routeId || undefined,
          startedAt: startedAt || undefined,
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
      setOpen(false);
      resetForm();
      setError(null);
    },
    onError: () => setError('No se pudo guardar el medicamento.'),
  });

  return (
    <Box>
      <Button size="small" variant="outlined" onClick={() => setOpen(true)} sx={{ mb: 2 }}>
        Agregar medicamento
      </Button>
      {listQuery.isLoading && <CircularProgress size={24} />}
      {listQuery.data?.length === 0 && (
        <Alert severity="info">Sin medicamentos registrados.</Alert>
      )}
      {listQuery.data?.map((m) => (
        <Box key={m.id} sx={{ mb: 1, p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
          <Typography variant="body2" component="div">
            <strong>{m.genericName}</strong>
            {m.brandName ? ` (${m.brandName})` : ''}{' '}
            {m.isChronic && <Chip size="small" color="warning" label="Crónico" />}
          </Typography>
          <Typography variant="caption" color="text.secondary" component="div">
            {m.doseAmount && `${m.doseAmount} ${labelFor(doseUnitCatalog.data, m.doseUnitId)}`}
            {m.frequencyId && ` · ${labelFor(frequencyCatalog.data, m.frequencyId)}`}
            {m.routeId && ` · ${labelFor(routeCatalog.data, m.routeId)}`}
            {m.startedAt && ` · Desde: ${m.startedAt}`}
          </Typography>
          {m.travelNotes && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              Para viajar: {m.travelNotes}
            </Typography>
          )}
          {m.notes && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {m.notes}
            </Typography>
          )}
        </Box>
      ))}

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Agregar medicamento</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Grid container spacing={1}>
            <Grid size={{ xs: 6 }}>
              <TextField
                label="Nombre genérico"
                fullWidth
                margin="normal"
                value={genericName}
                onChange={(e) => setGenericName(e.target.value)}
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
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={!genericName || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            Guardar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
