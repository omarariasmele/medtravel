import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
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
  MenuItem,
  Paper,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
} from '@mui/material';

import { apiClient } from '../../lib/api-client';
import { usePageTitle } from '../../lib/page-title';
import { PaginationFooter, usePagination } from '../../lib/pagination';

interface DomainCatalog {
  id: string;
  code: string;
  nameEs: string;
}

type LifecycleStatus = 'DRAFT' | 'APPROVED' | 'ACTIVE' | 'RETIRED';

interface CatalogValue {
  id: string;
  domainId: string;
  code: string;
  labelEs: string;
  labelEn?: string;
  displayOrder: number;
  active: boolean;
  metadata?: Record<string, unknown>;
  lifecycleStatus: LifecycleStatus;
}

type MetadataFieldDef =
  | { key: string; label: string; type: 'boolean' }
  | { key: string; label: string; type: 'text'; helperText?: string }
  | { key: string; label: string; type: 'select'; options: { value: string; label: string }[] };

type MetadataValues = Record<string, boolean | string>;

interface FormState {
  code: string;
  labelEs: string;
  labelEn: string;
  displayOrder: string;
  metadata: MetadataValues;
}

interface EditFormState {
  labelEs: string;
  labelEn: string;
  displayOrder: string;
  metadata: MetadataValues;
  lifecycleStatus: LifecycleStatus;
}

const LIFECYCLE_LABEL: Record<LifecycleStatus, string> = {
  DRAFT: 'Pendiente de revisión',
  APPROVED: 'Aprobado',
  ACTIVE: 'Activo',
  RETIRED: 'Retirado',
};

/**
 * Pedido explícito del usuario: "deja en todos lados solo activo, para
 * qué sirve utilizar también aprobado" — Aprobado quedó como un estado
 * intermedio sin ningún flujo real que lo use (el endpoint que arma
 * los pickers/autocompletar de toda la app exige ACTIVE exactamente,
 * nunca Aprobado — ver catalogs.service.ts), así que causaba que datos
 * "aprobados" quedaran invisibles por error. Se saca de las opciones
 * para elegir (nunca más se puede volver a asignar), pero queda en
 * LIFECYCLE_LABEL por si algún registro viejo de otro dominio todavía
 * lo tuviera, para no romper el renderizado de esa fila.
 */
const SELECTABLE_LIFECYCLE_STATUSES: LifecycleStatus[] = ['DRAFT', 'ACTIVE', 'RETIRED'];

const EMPTY_FORM: FormState = { code: '', labelEs: '', labelEn: '', displayOrder: '0', metadata: {} };

/**
 * Pedido explícito del usuario: al entrar desde "Tablas Sistema"
 * (Enfermedades, Medicamentos, etc. — ver NAV_ITEMS en app-layout.tsx)
 * el título y el resto de la pantalla tienen que reflejar ESA tabla
 * puntual, no el genérico "Catálogos / Parámetros" con un selector de
 * dominio de vuelta — ya se sabe en cuál se está, mostrar el selector
 * de nuevo ahí es ruido. Mismas etiquetas exactas que el menú lateral.
 */
const NAV_DOMAIN_LABELS: Record<string, string> = {
  CONDITION_CATALOG: 'Enfermedades',
  MEDICATION: 'Medicamentos',
  ALLERGEN: 'Alérgenos',
  LAB_INDICATOR: 'Indicadores de estudios',
  IMPLANT_TYPE: 'Tipos de implantes',
  SURGERY_CATALOG: 'Cirugías',
};

/**
 * Pedido explícito del usuario: nada de JSON a mano — los flags de
 * metadata (booleanos como "es crónica"/"indicador clave") tienen que
 * ser un checkbox, no texto libre. Un campo por dominio que hoy usa
 * metadata; agregar un dominio nuevo acá es la única forma de exponer
 * sus campos en el formulario (antes bastaba con escribir el JSON a
 * mano, ahora cada campo nuevo necesita esta entrada — a cambio, nadie
 * tiene que saber sintaxis JSON para cargar un dato).
 */
const METADATA_SCHEMAS: Record<string, MetadataFieldDef[]> = {
  CONDITION_CATALOG: [
    { key: 'isChronic', label: 'Es una enfermedad crónica', type: 'boolean' },
    { key: 'isAlertWorthy', label: 'Mostrar siempre en Alertas médicas', type: 'boolean' },
  ],
  /**
   * Pedido explícito del usuario: tiene que haber UNA sola tabla de
   * medicamentos en el sistema (droga + marca comercial + dosis),
   * usada tanto por la IA como por la carga manual — no una tabla
   * nueva en paralelo al dominio MEDICATION ya existente. Se resuelve
   * agregando estos dos campos al metadata de cada valor de ese mismo
   * dominio (mismo patrón que CONDITION_CATALOG/LAB_INDICATOR arriba):
   * "Etiqueta en español" sigue siendo la droga (nombre genérico).
   */
  MEDICATION: [
    { key: 'brandName', label: 'Marca comercial', type: 'text', helperText: 'Ej. Tylenol, Panadol' },
    { key: 'typicalDose', label: 'Dosis habitual', type: 'text', helperText: 'Ej. 500 mg, 850 mg cada 8hs' },
  ],
  LAB_INDICATOR: [
    {
      key: 'studyTypeCode',
      label: 'Tipo de estudio',
      type: 'select',
      options: [
        { value: 'BLOOD', label: 'Análisis de sangre' },
        { value: 'URINE', label: 'Análisis de orina' },
        { value: 'IMAGING', label: 'Estudios radiológicos' },
        { value: 'OTHER', label: 'Otros estudios' },
      ],
    },
    { key: 'unit', label: 'Unidad', type: 'text', helperText: 'Ej. mg/dL, %, /mm3' },
    { key: 'isKeyIndicator', label: 'Indicador clave (se destaca en Estudios)', type: 'boolean' },
  ],
};

function defaultMetadataValue(field: MetadataFieldDef): boolean | string {
  return field.type === 'boolean' ? false : '';
}

/**
 * Unifica criterios (pedido explícito del usuario): cualquier dominio
 * con metadata (CONDITION_CATALOG, LAB_INDICATOR, MEDICATION, el que
 * se agregue después) se ve en la tabla con sus propios campos como
 * columnas reales — no un caso especial por dominio, mismo mecanismo
 * genérico que ya arma el formulario de alta/edición a partir de
 * METADATA_SCHEMAS.
 */
function formatMetadataCell(field: MetadataFieldDef, metadata: Record<string, unknown> | undefined): string {
  const raw = metadata?.[field.key];
  if (field.type === 'boolean') return raw ? 'Sí' : 'No';
  if (field.type === 'select') {
    return field.options.find((o) => o.value === raw)?.label ?? '—';
  }
  return typeof raw === 'string' && raw.trim() ? raw : '—';
}

function metadataToValues(schema: MetadataFieldDef[], metadata: Record<string, unknown> | undefined): MetadataValues {
  const values: MetadataValues = {};
  for (const field of schema) {
    const raw = metadata?.[field.key];
    values[field.key] = field.type === 'boolean' ? Boolean(raw) : raw != null ? String(raw) : '';
  }
  return values;
}

function valuesToMetadata(schema: MetadataFieldDef[], values: MetadataValues): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};
  for (const field of schema) {
    const value = values[field.key] ?? defaultMetadataValue(field);
    if (field.type === 'boolean') {
      metadata[field.key] = value;
    } else if (typeof value === 'string' && value.trim()) {
      metadata[field.key] = value.trim();
    }
  }
  return metadata;
}

/**
 * A diferencia de /params/catalogs (público, solo lectura, para poblar
 * selects en cualquier pantalla), esto administra los valores en sí —
 * agregar un país nuevo, un tipo de alergia nuevo, etc. Gateado por
 * ConfigAccessGuard en el backend (params/admin/*).
 *
 * Sin botón de eliminar a propósito: params.catalog_values no tiene
 * GRANT de DELETE para app_runtime — un valor de catálogo puede estar
 * referenciado por filas existentes, así que se desactiva (toggle
 * "active"), nunca se borra.
 */
export function CatalogsAdminPage() {
  const [searchParams] = useSearchParams();
  const domainCodeParam = searchParams.get('domain');
  usePageTitle(domainCodeParam ? NAV_DOMAIN_LABELS[domainCodeParam] ?? 'Catálogos / Parámetros' : 'Catálogos / Parámetros');
  const [selectedDomainId, setSelectedDomainId] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const [editingValue, setEditingValue] = useState<CatalogValue | null>(null);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [pendingOnly, setPendingOnly] = useState(false);

  const [mergingValue, setMergingValue] = useState<CatalogValue | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [mergeError, setMergeError] = useState<string | null>(null);
  // Pedido explícito del usuario: poder buscar por código o etiqueta en
  // español (además del filtro de estado que ya existía) — estas tablas
  // pueden tener decenas de valores y hay que poder ubicar uno rápido.
  const [search, setSearch] = useState('');

  const queryClient = useQueryClient();

  const domainsQuery = useQuery({
    queryKey: ['params', 'domain-catalogs'],
    queryFn: async () => {
      const { data } = await apiClient.get<DomainCatalog[]>(
        '/params/admin/domain-catalogs',
        { params: { limit: 500 } },
      );
      return data;
    },
  });

  /** Deep-link desde "Tablas Sistema" (?domain=CONDITION_CATALOG, etc.) — preselecciona el dominio sin obligar a buscarlo en el select. */
  useEffect(() => {
    const domainCode = searchParams.get('domain');
    if (!domainCode || !domainsQuery.data) return;
    const match = domainsQuery.data.find((d) => d.code === domainCode);
    if (match) setSelectedDomainId(match.id);
  }, [searchParams, domainsQuery.data]);

  const selectedDomain = domainsQuery.data?.find((d) => d.id === selectedDomainId);
  const metadataSchema = selectedDomain ? METADATA_SCHEMAS[selectedDomain.code] ?? [] : [];

  const valuesQuery = useQuery({
    queryKey: ['params', 'catalog-values', selectedDomainId],
    queryFn: async () => {
      // Bug real reportado en vivo: "no me encuentra hipertensión" — sin
      // límite explícito, el backend genérico devuelve como mucho 100
      // filas (ver RlsCrudService.parseLimit) — con dominios que ya
      // superan eso (ej. Enfermedades, 198 filas) quedaban valores
      // directamente sin traer, sin importar qué se buscara.
      const { data } = await apiClient.get<CatalogValue[]>(
        '/params/admin/catalog-values',
        { params: { domainId: selectedDomainId, limit: 500 } },
      );
      return data;
    },
    enabled: !!selectedDomainId,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post('/params/admin/catalog-values', {
        domainId: selectedDomainId,
        code: form.code,
        labelEs: form.labelEs,
        labelEn: form.labelEn || undefined,
        displayOrder: Number(form.displayOrder) || 0,
        metadata: valuesToMetadata(metadataSchema, form.metadata),
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['params', 'catalog-values', selectedDomainId],
      });
      setDialogOpen(false);
      setForm(EMPTY_FORM);
      setError(null);
    },
    onError: () => setError('No se pudo crear el valor (¿código repetido en este dominio?).'),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async (value: CatalogValue) => {
      const { data } = await apiClient.patch(
        `/params/admin/catalog-values/${value.id}`,
        { active: !value.active },
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['params', 'catalog-values', selectedDomainId],
      });
    },
  });

  const openEdit = (value: CatalogValue) => {
    setEditingValue(value);
    setEditForm({
      labelEs: value.labelEs,
      labelEn: value.labelEn ?? '',
      displayOrder: String(value.displayOrder),
      metadata: metadataToValues(metadataSchema, value.metadata),
      lifecycleStatus: value.lifecycleStatus,
    });
    setEditError(null);
  };

  // Pedido explícito del usuario: ordenar por código (no por displayOrder,
  // que la mayoría de los valores comparte en 0/999) para poder ubicar
  // uno rápido a simple vista y que la tabla quede prolija.
  //
  // Bug real reportado en vivo: "no veo hipertensión en la tabla" —
  // buscaba "hipertension" (sin tilde) y no matcheaba "Hipertensión"
  // (con tilde), porque la comparación era literal. Se le sacan los
  // acentos a ambos lados antes de comparar.
  const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const normalizedSearch = stripAccents(search.trim().toLowerCase());
  const sortedValues = (valuesQuery.data ?? [])
    .filter((v) => !pendingOnly || v.lifecycleStatus === 'DRAFT')
    .filter(
      (v) =>
        !normalizedSearch ||
        stripAccents(v.code.toLowerCase()).includes(normalizedSearch) ||
        stripAccents(v.labelEs.toLowerCase()).includes(normalizedSearch),
    )
    .slice()
    .sort((a, b) => a.code.localeCompare(b.code));
  const { pageRows: valuePageRows, page: valuePage, setPage: setValuePage, totalCount: valueTotalCount } =
    usePagination(sortedValues);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingValue || !editForm) return;
      const { data } = await apiClient.patch(`/params/admin/catalog-values/${editingValue.id}`, {
        labelEs: editForm.labelEs,
        labelEn: editForm.labelEn || undefined,
        displayOrder: Number(editForm.displayOrder) || 0,
        metadata: valuesToMetadata(metadataSchema, editForm.metadata),
        lifecycleStatus: editForm.lifecycleStatus,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['params', 'catalog-values', selectedDomainId],
      });
      setEditingValue(null);
      setEditForm(null);
    },
    onError: (e: Error) => setEditError(e.message || 'No se pudo guardar el cambio.'),
  });

  const mergeMutation = useMutation({
    mutationFn: async () => {
      if (!mergingValue || !mergeTargetId) return;
      const { data } = await apiClient.post(`/params/admin/catalog-values/${mergingValue.id}/merge`, {
        targetId: mergeTargetId,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['params', 'catalog-values', selectedDomainId],
      });
      setMergingValue(null);
      setMergeTargetId('');
      setMergeError(null);
    },
    onError: (e: unknown) => {
      const msg = axios.isAxiosError(e) ? e.response?.data?.message : undefined;
      setMergeError(typeof msg === 'string' ? msg : 'No se pudo fusionar (¿el dominio todavía no soporta fusión?).');
    },
  });

  return (
    <>
      {domainsQuery.isLoading && <CircularProgress />}
      {domainsQuery.isError && (
        <Alert severity="error">No se pudieron cargar los dominios de catálogo.</Alert>
      )}

      {domainsQuery.data && !domainCodeParam && (
        <TextField
          select
          label="Dominio de catálogo"
          value={selectedDomainId}
          onChange={(e) => setSelectedDomainId(e.target.value)}
          sx={{ mb: 3, minWidth: 320 }}
        >
          {domainsQuery.data
            .slice()
            .sort((a, b) => a.code.localeCompare(b.code))
            .map((d) => (
              <MenuItem key={d.id} value={d.id}>
                {d.code} — {d.nameEs}
              </MenuItem>
            ))}
        </TextField>
      )}

      {selectedDomainId && (
        <>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, gap: 2, flexWrap: 'wrap' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              <TextField
                size="small"
                label="Buscar por código o etiqueta"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setValuePage(0);
                }}
                sx={{ minWidth: 260 }}
              />
              <FormControlLabel
                control={<Switch checked={pendingOnly} onChange={(e) => setPendingOnly(e.target.checked)} />}
                label="Solo pendientes de revisión"
              />
            </Box>
            <Button variant="contained" onClick={() => setDialogOpen(true)}>
              Agregar valor
            </Button>
          </Box>

          {valuesQuery.isLoading && <CircularProgress />}
          {valuesQuery.data && valuesQuery.data.length === 0 && (
            <Alert severity="info">Este dominio todavía no tiene valores.</Alert>
          )}

          {valuesQuery.data && valuesQuery.data.length > 0 && (
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Código</TableCell>
                    <TableCell>Etiqueta (es)</TableCell>
                    <TableCell>Etiqueta (en)</TableCell>
                    {metadataSchema.map((f) => (
                      <TableCell key={f.key}>{f.label}</TableCell>
                    ))}
                    <TableCell>Orden</TableCell>
                    <TableCell>Estado</TableCell>
                    <TableCell>Activo</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {valuePageRows.map((v) => (
                    <TableRow key={v.id} hover onClick={() => openEdit(v)} sx={{ cursor: 'pointer' }}>
                      <TableCell>{v.code}</TableCell>
                      <TableCell>{v.labelEs}</TableCell>
                      <TableCell>{v.labelEn ?? '—'}</TableCell>
                      {metadataSchema.map((f) => (
                        <TableCell key={f.key}>{formatMetadataCell(f, v.metadata)}</TableCell>
                      ))}
                      <TableCell>{v.displayOrder}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={LIFECYCLE_LABEL[v.lifecycleStatus]}
                          color={v.lifecycleStatus === 'DRAFT' ? 'warning' : 'default'}
                          variant={v.lifecycleStatus === 'DRAFT' ? 'filled' : 'outlined'}
                        />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Switch
                          size="small"
                          checked={v.active}
                          onChange={() => toggleActiveMutation.mutate(v)}
                        />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="small"
                          onClick={() => {
                            setMergingValue(v);
                            setMergeTargetId('');
                            setMergeError(null);
                          }}
                        >
                          Fusionar con…
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <PaginationFooter page={valuePage} totalCount={valueTotalCount} onPageChange={setValuePage} />
            </TableContainer>
          )}
        </>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Agregar valor de catálogo</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <TextField
            label="Código"
            fullWidth
            margin="normal"
            value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
            helperText="Sin espacios, en mayúsculas (ej. CANADA)"
          />
          <TextField
            label="Etiqueta en español"
            fullWidth
            margin="normal"
            value={form.labelEs}
            onChange={(e) => setForm((f) => ({ ...f, labelEs: e.target.value }))}
          />
          <TextField
            label="Etiqueta en inglés"
            fullWidth
            margin="normal"
            value={form.labelEn}
            onChange={(e) => setForm((f) => ({ ...f, labelEn: e.target.value }))}
          />
          <TextField
            label="Orden"
            type="number"
            fullWidth
            margin="normal"
            value={form.displayOrder}
            onChange={(e) => setForm((f) => ({ ...f, displayOrder: e.target.value }))}
          />
          {metadataSchema.map((field) =>
            field.type === 'boolean' ? (
              <FormControlLabel
                key={field.key}
                sx={{ display: 'flex', mt: 1 }}
                control={
                  <Checkbox
                    checked={Boolean(form.metadata[field.key])}
                    onChange={(e) => setForm((f) => ({ ...f, metadata: { ...f.metadata, [field.key]: e.target.checked } }))}
                  />
                }
                label={field.label}
              />
            ) : field.type === 'select' ? (
              <TextField
                key={field.key}
                select
                label={field.label}
                fullWidth
                margin="normal"
                value={form.metadata[field.key] ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, metadata: { ...f.metadata, [field.key]: e.target.value } }))}
              >
                {field.options.map((o) => (
                  <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                ))}
              </TextField>
            ) : (
              <TextField
                key={field.key}
                label={field.label}
                fullWidth
                margin="normal"
                value={form.metadata[field.key] ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, metadata: { ...f.metadata, [field.key]: e.target.value } }))}
                helperText={field.helperText}
              />
            ),
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={!form.code || !form.labelEs || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            Crear
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!editingValue} onClose={() => setEditingValue(null)} fullWidth maxWidth="sm">
        <DialogTitle>
          Editar valor{editingValue ? `: ${editingValue.code}` : ''}
        </DialogTitle>
        <DialogContent>
          {editError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {editError}
            </Alert>
          )}
          {editForm && (
            <>
              <TextField
                label="Código"
                fullWidth
                margin="normal"
                value={editingValue?.code ?? ''}
                disabled
                helperText="El código no se puede modificar (lo usa la lógica del sistema)"
              />
              <TextField
                label="Etiqueta en español"
                fullWidth
                margin="normal"
                value={editForm.labelEs}
                onChange={(e) => setEditForm((f) => (f ? { ...f, labelEs: e.target.value } : f))}
              />
              <TextField
                label="Etiqueta en inglés"
                fullWidth
                margin="normal"
                value={editForm.labelEn}
                onChange={(e) => setEditForm((f) => (f ? { ...f, labelEn: e.target.value } : f))}
              />
              <TextField
                label="Orden"
                type="number"
                fullWidth
                margin="normal"
                value={editForm.displayOrder}
                onChange={(e) => setEditForm((f) => (f ? { ...f, displayOrder: e.target.value } : f))}
              />
              <TextField
                select
                label="Estado"
                fullWidth
                margin="normal"
                value={editForm.lifecycleStatus}
                onChange={(e) => setEditForm((f) => (f ? { ...f, lifecycleStatus: e.target.value as LifecycleStatus } : f))}
                helperText="Pendiente de revisión = creado por un usuario/IA al cargar un dato, todavía sin revisar"
              >
                {SELECTABLE_LIFECYCLE_STATUSES.map((s) => (
                  <MenuItem key={s} value={s}>{LIFECYCLE_LABEL[s]}</MenuItem>
                ))}
              </TextField>
              {metadataSchema.map((field) =>
                field.type === 'boolean' ? (
                  <FormControlLabel
                    key={field.key}
                    sx={{ display: 'flex', mt: 1 }}
                    control={
                      <Checkbox
                        checked={Boolean(editForm.metadata[field.key])}
                        onChange={(e) =>
                          setEditForm((f) => (f ? { ...f, metadata: { ...f.metadata, [field.key]: e.target.checked } } : f))
                        }
                      />
                    }
                    label={field.label}
                  />
                ) : field.type === 'select' ? (
                  <TextField
                    key={field.key}
                    select
                    label={field.label}
                    fullWidth
                    margin="normal"
                    value={editForm.metadata[field.key] ?? ''}
                    onChange={(e) =>
                      setEditForm((f) => (f ? { ...f, metadata: { ...f.metadata, [field.key]: e.target.value } } : f))
                    }
                  >
                    {field.options.map((o) => (
                      <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                    ))}
                  </TextField>
                ) : (
                  <TextField
                    key={field.key}
                    label={field.label}
                    fullWidth
                    margin="normal"
                    value={editForm.metadata[field.key] ?? ''}
                    onChange={(e) =>
                      setEditForm((f) => (f ? { ...f, metadata: { ...f.metadata, [field.key]: e.target.value } } : f))
                    }
                    helperText={field.helperText}
                  />
                ),
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditingValue(null)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={!editForm?.labelEs || updateMutation.isPending}
            onClick={() => updateMutation.mutate()}
          >
            Guardar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!mergingValue} onClose={() => setMergingValue(null)} fullWidth maxWidth="sm">
        <DialogTitle>
          Fusionar{mergingValue ? `: ${mergingValue.labelEs}` : ''}
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            Todos los registros clínicos que ya usan "{mergingValue?.labelEs}" van a
            pasar a usar el valor que elijas abajo. "{mergingValue?.labelEs}" se
            borra de esta tabla — esta acción no se puede deshacer.
          </Alert>
          {mergeError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {mergeError}
            </Alert>
          )}
          <TextField
            select
            label="Fusionar con"
            fullWidth
            margin="normal"
            value={mergeTargetId}
            onChange={(e) => setMergeTargetId(e.target.value)}
          >
            {sortedValues
              .filter((v) => v.id !== mergingValue?.id && v.active)
              .map((v) => (
                <MenuItem key={v.id} value={v.id}>{v.labelEs}</MenuItem>
              ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMergingValue(null)}>Cancelar</Button>
          <Button
            variant="contained"
            color="warning"
            disabled={!mergeTargetId || mergeMutation.isPending}
            onClick={() => mergeMutation.mutate()}
          >
            Fusionar
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
