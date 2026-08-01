import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Papa from 'papaparse';
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
  IconButton,
  MenuItem,
  Paper,
  Popover,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import UploadFileIcon from '@mui/icons-material/UploadFile';

import { apiClient } from '../../lib/api-client';
import { useAuth } from '../../auth/auth-context';
import { useCatalog } from '../../lib/catalog-hooks';

interface PartnerRecord {
  id: string;
  tenant_id: string;
  tenant_name: string | null;
  partner_ref_id: string;
  raw_name: string | null;
  raw_doc_type: string | null;
  raw_doc_number: string | null;
  raw_gender: string | null;
  policy_number: string;
  plan_code: string | null;
  valid_from: string;
  valid_until: string;
  import_status: string;
  imported_at: string;
}

interface DeclaredPolicy {
  id: string;
  tenant_id: string;
  tenant_name: string | null;
  policy_number: string;
  declared_at: string;
  first_name: string;
  last_name: string;
}

interface Tenant {
  id: string;
  name: string;
}

interface AssistancePlan {
  id: string;
  name: string;
  tenantId: string;
}

interface FormState {
  partnerRefId: string;
  rawName: string;
  rawDocType: string;
  rawDocNumber: string;
  rawGender: string;
  policyNumber: string;
  planCode: string;
  validFrom: string;
  validUntil: string;
}

const EMPTY_FORM: FormState = {
  partnerRefId: '',
  rawName: '',
  rawDocType: '',
  rawDocNumber: '',
  rawGender: '',
  policyNumber: '',
  planCode: '',
  validFrom: '',
  validUntil: '',
};

const STATUS_COLOR: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  MATCHED: 'success',
  NO_MATCH: 'warning',
  ERROR: 'error',
  PENDING: 'default',
};

const STATUS_LABEL: Record<string, string> = {
  MATCHED: 'Emparejado',
  NO_MATCH: 'Esperando al viajero',
  ERROR: 'Error',
  PENDING: 'Pendiente',
};

/**
 * Carga de pólizas por parte de la empresa de seguros/asistencia al
 * viajero (core.partner_member_records) — apenas se carga una póliza,
 * el backend intenta emparejarla automáticamente contra un viajero ya
 * registrado (por documento exacto); si el viajero se registra después,
 * el emparejamiento se resuelve retroactivamente al cargar su
 * documento. "Esperando al viajero" no es un error: solo significa que
 * todavía no se registró en la app con ese documento.
 */
export function PartnerRecordsPage() {
  const { claims } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [pasteText, setPasteText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [tenantFilter, setTenantFilter] = useState('');
  const [approveTarget, setApproveTarget] = useState<DeclaredPolicy | null>(null);
  const [approveForm, setApproveForm] = useState({ planId: '', validFrom: '', validUntil: '' });
  const [approveError, setApproveError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [helpAnchor, setHelpAnchor] = useState<HTMLElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const recordsQuery = useQuery({
    queryKey: ['coverage', 'partner-member-records'],
    queryFn: async () => {
      const { data } = await apiClient.get<PartnerRecord[]>(
        '/coverage/partner-member-records',
      );
      return data;
    },
  });

  const declaredQuery = useQuery({
    queryKey: ['coverage', 'partner-member-records', 'declared'],
    queryFn: async () => {
      const { data } = await apiClient.get<DeclaredPolicy[]>(
        '/coverage/partner-member-records/declared',
      );
      return data;
    },
  });

  const tenantsQuery = useQuery({
    queryKey: ['identity', 'tenants'],
    queryFn: async () => {
      const { data } = await apiClient.get<Tenant[]>('/identity/tenants');
      return data;
    },
  });

  const tenantNameById = new Map((tenantsQuery.data ?? []).map((t) => [t.id, t.name]));

  const filteredRecords = (recordsQuery.data ?? []).filter(
    (r) => !tenantFilter || r.tenant_id === tenantFilter,
  );
  const filteredDeclared = (declaredQuery.data ?? []).filter(
    (d) => !tenantFilter || d.tenant_id === tenantFilter,
  );

  const plansQuery = useQuery({
    queryKey: ['coverage', 'assistance-plans', approveTarget?.tenant_id],
    queryFn: async () => {
      const { data } = await apiClient.get<AssistancePlan[]>(
        '/coverage/assistance-plans',
        { params: { tenantId: approveTarget!.tenant_id } },
      );
      return data;
    },
    enabled: !!approveTarget,
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!approveTarget) return;
      const { data } = await apiClient.post(
        `/coverage/partner-member-records/declared/${approveTarget.id}/approve`,
        approveForm,
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coverage', 'partner-member-records'] });
      setApproveTarget(null);
      setApproveForm({ planId: '', validFrom: '', validUntil: '' });
      setApproveError(null);
    },
    onError: () => setApproveError('No se pudo aprobar — revisá el plan elegido.'),
  });

  const docTypeCatalog = useCatalog('DOCUMENT_TYPE');
  const genderCatalog = useCatalog('GENDER');

  const setField = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  /**
   * Filas pegadas (una por línea, campos separados por tab o coma, en
   * el mismo orden que el formulario) — para carga masiva sin necesitar
   * subida de archivo. Formato:
   * partnerRefId, rawName, rawDocType, rawDocNumber, policyNumber, planCode, validFrom, validUntil, rawGender
   * (rawGender al final y opcional para no romper pegados con el formato anterior)
   */
  function parsePastedRows(): Record<string, string>[] {
    return pasteText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const cols = line.split(/\t|,/).map((c) => c.trim());
        return {
          partnerRefId: cols[0] ?? '',
          rawName: cols[1] ?? '',
          rawDocType: cols[2] ?? '',
          rawDocNumber: cols[3] ?? '',
          policyNumber: cols[4] ?? '',
          planCode: cols[5] ?? '',
          validFrom: cols[6] ?? '',
          validUntil: cols[7] ?? '',
          rawGender: cols[8] ?? '',
        };
      });
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const rows = pasteText.trim()
        ? parsePastedRows()
        : [
            {
              partnerRefId: form.partnerRefId,
              rawName: form.rawName || undefined,
              rawDocType: form.rawDocType || undefined,
              rawDocNumber: form.rawDocNumber || undefined,
              rawGender: form.rawGender || undefined,
              policyNumber: form.policyNumber,
              planCode: form.planCode || undefined,
              validFrom: form.validFrom,
              validUntil: form.validUntil,
            },
          ];
      const { data } = await apiClient.post('/coverage/partner-member-records', rows);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coverage', 'partner-member-records'] });
      setDialogOpen(false);
      setForm(EMPTY_FORM);
      setPasteText('');
      setError(null);
    },
    onError: () =>
      setError(
        'No se pudo cargar la póliza — revisá que el código de plan exista en Catálogos.',
      ),
  });

  /**
   * Import de CSV (no Excel/.xlsx a propósito — la librería xlsx tiene
   * vulnerabilidades HIGH sin parche disponible en npm, ver AskUserQuestion
   * pausada anteriormente; el usuario confirmó que solo hace falta import,
   * nunca export, así que CSV con papaparse alcanza sin ese riesgo).
   * Encabezados esperados (cualquier orden): partnerRefId, rawName,
   * rawDocType, rawDocNumber, rawGender, policyNumber, planCode, validFrom, validUntil.
   */
  const importMutation = useMutation({
    mutationFn: async (rows: Record<string, string>[]) => {
      const payload = rows.map((r) => ({
        partnerRefId: r.partnerRefId ?? '',
        rawName: r.rawName || undefined,
        rawDocType: r.rawDocType || undefined,
        rawDocNumber: r.rawDocNumber || undefined,
        rawGender: r.rawGender || undefined,
        policyNumber: r.policyNumber ?? '',
        planCode: r.planCode || undefined,
        validFrom: r.validFrom ?? '',
        validUntil: r.validUntil ?? '',
      }));
      const { data } = await apiClient.post('/coverage/partner-member-records', payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coverage', 'partner-member-records'] });
      setImportError(null);
    },
    onError: () =>
      setImportError(
        'No se pudo importar el archivo — revisá las columnas y que los códigos de plan existan en Catálogos.',
      ),
  });

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.data.length === 0) {
          setImportError('El archivo está vacío o no tiene las columnas esperadas.');
          return;
        }
        importMutation.mutate(results.data);
      },
      error: () => setImportError('No se pudo leer el archivo CSV.'),
    });
    e.target.value = '';
  }

  const canSubmit =
    pasteText.trim().length > 0 ||
    (!!form.partnerRefId && !!form.policyNumber && !!form.validFrom && !!form.validUntil);

  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4">Pólizas</Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Button variant="contained" onClick={() => setDialogOpen(true)}>
            Cargar póliza
          </Button>
          <Button
            variant="outlined"
            startIcon={<UploadFileIcon />}
            onClick={() => fileInputRef.current?.click()}
            disabled={importMutation.isPending}
          >
            {importMutation.isPending ? 'Importando…' : 'Importar CSV'}
          </Button>
          <IconButton
            size="small"
            onClick={(e) => setHelpAnchor(e.currentTarget)}
            aria-label="Formato esperado del CSV"
          >
            <InfoOutlinedIcon fontSize="small" />
          </IconButton>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={handleFileSelected}
          />
        </Box>
      </Box>

      <Popover
        open={!!helpAnchor}
        anchorEl={helpAnchor}
        onClose={() => setHelpAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Box sx={{ p: 2, maxWidth: 380 }}>
          <Typography variant="subtitle2" gutterBottom>Formato del CSV</Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Primera fila con encabezados (en cualquier orden):
          </Typography>
          <Typography variant="body2" component="code" sx={{ display: 'block', fontFamily: 'monospace', fontSize: '0.8rem', mb: 1 }}>
            partnerRefId,rawName,rawDocType,rawDocNumber,rawGender,policyNumber,planCode,validFrom,validUntil
          </Typography>
          <Typography variant="body2" color="text.secondary">
            <strong>rawDocType</strong>: código del catálogo Tipo de documento (ej. NATIONAL_ID, PASSPORT).{' '}
            <strong>rawGender</strong>: código del catálogo Sexo (ej. MALE, FEMALE) — ayuda a distinguir personas
            con el mismo número de documento.{' '}
            <strong>planCode</strong>: debe existir en Catálogos / Parámetros.{' '}
            <strong>validFrom</strong>/<strong>validUntil</strong>: formato AAAA-MM-DD. Solo <strong>partnerRefId</strong>,{' '}
            <strong>policyNumber</strong>, <strong>validFrom</strong> y <strong>validUntil</strong> son obligatorios.
          </Typography>
        </Box>
      </Popover>

      {importError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setImportError(null)}>
          {importError}
        </Alert>
      )}

      {claims?.canManageConfig && (tenantsQuery.data?.length ?? 0) > 1 && (
        <Box sx={{ mb: 2 }}>
          <TextField
            select
            label="Filtrar por empresa"
            size="small"
            sx={{ minWidth: 260 }}
            value={tenantFilter}
            onChange={(e) => setTenantFilter(e.target.value)}
          >
            <MenuItem value="">Todas las empresas</MenuItem>
            {(tenantsQuery.data ?? []).map((t) => (
              <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>
            ))}
          </TextField>
        </Box>
      )}

      <Alert severity="info" sx={{ mb: 2 }}>
        Al cargar una póliza, el sistema busca automáticamente si el viajero
        ya está registrado en la app (mismo documento) y le asocia la
        cobertura. Si todavía no se registró, queda "Esperando al viajero" y
        se resuelve solo apenas él cargue su documento.
      </Alert>

      {declaredQuery.data && filteredDeclared.length > 0 && (
        <>
          <Typography variant="h6" gutterBottom>
            Pólizas declaradas por el viajero — pendientes de aprobación
          </Typography>
          <Alert severity="warning" sx={{ mb: 2 }}>
            Estos viajeros se bajaron la app y cargaron ellos mismos un número
            de póliza que todavía no coincide con nada cargado por la empresa.
            Revisá y aprobá si corresponde.
          </Alert>
          <TableContainer component={Paper} sx={{ mb: 3 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Empresa</TableCell>
                  <TableCell>Viajero</TableCell>
                  <TableCell>N° de póliza</TableCell>
                  <TableCell>Declarada</TableCell>
                  <TableCell align="right">Acción</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredDeclared.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>{d.tenant_name ?? '—'}</TableCell>
                    <TableCell>{d.first_name} {d.last_name}</TableCell>
                    <TableCell>{d.policy_number}</TableCell>
                    <TableCell>{new Date(d.declared_at).toLocaleString('es-AR')}</TableCell>
                    <TableCell align="right">
                      <Button size="small" variant="outlined" onClick={() => setApproveTarget(d)}>
                        Aprobar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {recordsQuery.isLoading && <CircularProgress />}
      {recordsQuery.isError && (
        <Alert severity="error">No se pudieron cargar las pólizas.</Alert>
      )}
      {recordsQuery.data && recordsQuery.data.length === 0 && (
        <Alert severity="info">Todavía no cargaste ninguna póliza.</Alert>
      )}
      {recordsQuery.data && recordsQuery.data.length > 0 && filteredRecords.length === 0 && (
        <Alert severity="info">Sin pólizas para esta empresa.</Alert>
      )}

      {filteredRecords.length > 0 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Empresa</TableCell>
                <TableCell>Referencia</TableCell>
                <TableCell>Nombre</TableCell>
                <TableCell>Documento</TableCell>
                <TableCell>Sexo</TableCell>
                <TableCell>N° de póliza</TableCell>
                <TableCell>Plan</TableCell>
                <TableCell>Vigencia</TableCell>
                <TableCell>Estado</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredRecords.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.tenant_name ?? tenantNameById.get(r.tenant_id) ?? '—'}</TableCell>
                  <TableCell>{r.partner_ref_id}</TableCell>
                  <TableCell>{r.raw_name ?? '—'}</TableCell>
                  <TableCell>
                    {r.raw_doc_type ?? '—'}{r.raw_doc_number ? ` · ${r.raw_doc_number}` : ''}
                  </TableCell>
                  <TableCell>
                    {genderCatalog.data?.find((g) => g.code === r.raw_gender)?.labelEs ?? '—'}
                  </TableCell>
                  <TableCell>{r.policy_number}</TableCell>
                  <TableCell>{r.plan_code ?? '—'}</TableCell>
                  <TableCell>
                    {new Date(r.valid_from).toLocaleDateString('es-AR')} –{' '}
                    {new Date(r.valid_until).toLocaleDateString('es-AR')}
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      color={STATUS_COLOR[r.import_status] ?? 'default'}
                      label={STATUS_LABEL[r.import_status] ?? r.import_status}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Cargar póliza</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Grid container spacing={1}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Referencia interna"
                fullWidth
                margin="normal"
                value={form.partnerRefId}
                onChange={setField('partnerRefId')}
                helperText="Tu propio identificador de esta póliza"
                disabled={!!pasteText.trim()}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Nombre del asegurado"
                fullWidth
                margin="normal"
                value={form.rawName}
                onChange={setField('rawName')}
                disabled={!!pasteText.trim()}
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <TextField
                select
                label="Tipo de documento"
                fullWidth
                margin="normal"
                value={form.rawDocType}
                onChange={setField('rawDocType')}
                disabled={!!pasteText.trim()}
              >
                {(docTypeCatalog.data ?? []).map((o) => (
                  <MenuItem key={o.id} value={o.code}>{o.labelEs}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <TextField
                label="N° de documento"
                fullWidth
                margin="normal"
                value={form.rawDocNumber}
                onChange={setField('rawDocNumber')}
                disabled={!!pasteText.trim()}
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <TextField
                select
                label="Sexo"
                fullWidth
                margin="normal"
                value={form.rawGender}
                onChange={setField('rawGender')}
                helperText="Ayuda a distinguir mismo N° de documento"
                disabled={!!pasteText.trim()}
              >
                {(genderCatalog.data ?? []).map((o) => (
                  <MenuItem key={o.id} value={o.code}>{o.labelEs}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="N° de póliza"
                fullWidth
                margin="normal"
                value={form.policyNumber}
                onChange={setField('policyNumber')}
                disabled={!!pasteText.trim()}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Código de plan"
                fullWidth
                margin="normal"
                value={form.planCode}
                onChange={setField('planCode')}
                helperText="Debe existir en Catálogos / Parámetros"
                disabled={!!pasteText.trim()}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                label="Vigencia desde"
                type="date"
                fullWidth
                margin="normal"
                slotProps={{ inputLabel: { shrink: true } }}
                value={form.validFrom}
                onChange={setField('validFrom')}
                disabled={!!pasteText.trim()}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                label="Vigencia hasta"
                type="date"
                fullWidth
                margin="normal"
                slotProps={{ inputLabel: { shrink: true } }}
                value={form.validUntil}
                onChange={setField('validUntil')}
                disabled={!!pasteText.trim()}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                label="O pegá varias filas a la vez"
                fullWidth
                multiline
                minRows={3}
                margin="normal"
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                helperText="Una póliza por línea: referencia, nombre, tipo doc (código), n° documento, n° póliza, código de plan, desde (AAAA-MM-DD), hasta — separados por tab o coma"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={!canSubmit || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            Cargar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!approveTarget} onClose={() => setApproveTarget(null)} fullWidth maxWidth="sm">
        <DialogTitle>
          Aprobar póliza declarada{approveTarget ? ` — ${approveTarget.first_name} ${approveTarget.last_name}` : ''}
        </DialogTitle>
        <DialogContent>
          {approveError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {approveError}
            </Alert>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            N° de póliza declarada: <strong>{approveTarget?.policy_number}</strong>. Elegí a
            qué plan de tu catálogo corresponde y confirmá la vigencia real.
          </Typography>
          <Grid container spacing={1}>
            <Grid size={{ xs: 12 }}>
              <TextField
                select
                label="Plan"
                fullWidth
                margin="normal"
                value={approveForm.planId}
                onChange={(e) => setApproveForm((f) => ({ ...f, planId: e.target.value }))}
              >
                {(plansQuery.data ?? []).map((p) => (
                  <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
                ))}
              </TextField>
              {plansQuery.data && plansQuery.data.length === 0 && (
                <Alert severity="warning" sx={{ mt: 1 }}>
                  Esta empresa todavía no tiene planes cargados en Catálogos / Parámetros.
                </Alert>
              )}
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                label="Vigencia desde"
                type="date"
                fullWidth
                margin="normal"
                slotProps={{ inputLabel: { shrink: true } }}
                value={approveForm.validFrom}
                onChange={(e) => setApproveForm((f) => ({ ...f, validFrom: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                label="Vigencia hasta"
                type="date"
                fullWidth
                margin="normal"
                slotProps={{ inputLabel: { shrink: true } }}
                value={approveForm.validUntil}
                onChange={(e) => setApproveForm((f) => ({ ...f, validUntil: e.target.value }))}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setApproveTarget(null)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={
              !approveForm.planId ||
              !approveForm.validFrom ||
              !approveForm.validUntil ||
              approveMutation.isPending
            }
            onClick={() => approveMutation.mutate()}
          >
            Aprobar
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
