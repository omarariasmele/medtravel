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
  MenuItem,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';

import { apiClient } from '../../lib/api-client';
import { labelFor, useCatalog } from '../../lib/catalog-hooks';

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
  statusId: string;
  notes?: string;
}

interface Medication {
  id: string;
  genericName: string;
  brandName?: string;
  notes?: string;
}

/**
 * Historia clínica dentro de un caso — el camino #5 de
 * clinical.has_clinical_access (000_extensions.sql) ya habilita esto:
 * un operador con un caso de emergencia ABIERTO sobre este paciente
 * puede leer/cargar sus antecedentes, sin ningún permiso nuevo del
 * lado de la app. La única pieza necesaria es mandar el header
 * x-active-case-id en cada request — eso puebla app.active_case_id,
 * que la política RLS ya verifica.
 */
export function ClinicalHistorySection({
  personId,
  caseId,
}: {
  personId: string;
  caseId: string;
}) {
  const [tab, setTab] = useState<'allergies' | 'conditions' | 'medications'>(
    'allergies',
  );

  const headers = { 'x-active-case-id': caseId };

  return (
    <Card sx={{ mt: 3 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Historia clínica
        </Typography>
        <Alert severity="info" sx={{ mb: 2 }}>
          Acceso habilitado mientras este caso esté abierto — se audita
          automáticamente (audit.data_audit_events).
        </Alert>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
          <Tab label="Alergias" value="allergies" />
          <Tab label="Condiciones" value="conditions" />
          <Tab label="Medicamentos" value="medications" />
        </Tabs>
        {tab === 'allergies' && (
          <AllergiesTab personId={personId} headers={headers} />
        )}
        {tab === 'conditions' && (
          <ConditionsTab personId={personId} headers={headers} />
        )}
        {tab === 'medications' && (
          <MedicationsTab personId={personId} headers={headers} />
        )}
      </CardContent>
    </Card>
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

function ConditionsTab({
  personId,
  headers,
}: {
  personId: string;
  headers: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [conditionName, setConditionName] = useState('');
  const [statusId, setStatusId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const statusCatalog = useCatalog('CONDITION_STATUS');
  const canonicalCatalog = useCatalog('CANONICAL_STATUS');
  const provenanceCatalog = useCatalog('PROVENANCE_TYPE');

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
          conditionName,
          statusId,
          canonicalStatusId: provisional?.id,
          provenanceId: staffEntered?.id,
          notes: notes || undefined,
        },
        { headers },
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinical', 'conditions', personId] });
      setOpen(false);
      setConditionName('');
      setStatusId('');
      setNotes('');
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
            <Chip size="small" label={labelFor(statusCatalog.data, c.statusId)} />
          </Typography>
          {c.notes && (
            <Typography variant="caption" color="text.secondary">
              {c.notes}
            </Typography>
          )}
        </Box>
      ))}

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Agregar condición</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <TextField
            label="Condición"
            fullWidth
            margin="normal"
            value={conditionName}
            onChange={(e) => setConditionName(e.target.value)}
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
            disabled={!conditionName || !statusId || createMutation.isPending}
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
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const canonicalCatalog = useCatalog('CANONICAL_STATUS');
  const provenanceCatalog = useCatalog('PROVENANCE_TYPE');

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
      setGenericName('');
      setBrandName('');
      setNotes('');
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
            {m.brandName ? ` (${m.brandName})` : ''}
          </Typography>
          {m.notes && (
            <Typography variant="caption" color="text.secondary">
              {m.notes}
            </Typography>
          )}
        </Box>
      ))}

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Agregar medicamento</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <TextField
            label="Nombre genérico"
            fullWidth
            margin="normal"
            value={genericName}
            onChange={(e) => setGenericName(e.target.value)}
          />
          <TextField
            label="Nombre comercial"
            fullWidth
            margin="normal"
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
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
