import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
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
  FormControlLabel,
  InputAdornment,
  MenuItem,
  Paper,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';

import { apiClient } from '../../lib/api-client';
import { labelFor, useCatalog } from '../../lib/catalog-hooks';
import { usePageTitle } from '../../lib/page-title';
import { PaginationFooter, usePagination } from '../../lib/pagination';

/** Los 4 campos de imagen de marca guardan una URL relativa (subida acá) o absoluta (pegada a mano). */
function resolveAssetUrl(url: string): string {
  if (!url) return url;
  if (/^https?:\/\//.test(url)) return url;
  return `${apiClient.defaults.baseURL ?? ''}${url}`;
}

/**
 * Fase 1 — pedido explícito del usuario: subir el logo como archivo
 * (no solo pegar una URL), con el formato validado por el sistema.
 * Sube a POST /params/admin/tenant-brand-assets/upload (multer, PNG/
 * JPG/WEBP, 2MB) y guarda la URL relativa devuelta en el form — el
 * campo de texto queda igual para quien prefiera pegar una URL externa
 * ya hosteada en otro lado.
 */
function BrandImageField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await apiClient.post<{ url: string }>(
        '/params/admin/tenant-brand-assets/upload',
        formData,
      );
      onChange(data.url);
    } catch (e) {
      const message = axios.isAxiosError(e) ? (e.response?.data as { message?: string })?.message : undefined;
      setUploadError(message ?? 'No se pudo subir la imagen.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
        <Box
          sx={{
            width: 56,
            height: 56,
            borderRadius: 1,
            border: '1px dashed',
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            flexShrink: 0,
            bgcolor: 'action.hover',
          }}
        >
          {value ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <img src={resolveAssetUrl(value)} style={{ maxWidth: '100%', maxHeight: '100%' }} />
          ) : (
            <ImageOutlinedIcon color="disabled" fontSize="small" />
          )}
        </Box>
        <Button size="small" variant="outlined" component="label" disabled={uploading}>
          {uploading ? 'Subiendo…' : value ? 'Cambiar' : 'Subir imagen'}
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = '';
            }}
          />
        </Button>
        {value && (
          <Button size="small" color="inherit" onClick={() => onChange('')}>
            Quitar
          </Button>
        )}
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
        {hint}
      </Typography>
      {uploadError && (
        <Typography variant="caption" color="error" sx={{ display: 'block' }}>
          {uploadError}
        </Typography>
      )}
    </Box>
  );
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * Pedido explícito del usuario: poder elegir el color desde una
 * paleta, no solo escribir el código a mano. El swatch usa el color
 * picker nativo del sistema operativo/navegador (siempre trae una
 * paleta + selector visual + entrada de código, sin sumar una
 * librería nueva) — el campo de texto queda al lado para quien ya
 * tiene el código exacto (ej. de la identidad visual de la empresa) y
 * lo quiere pegar directo.
 */
function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const swatchValue = HEX_RE.test(value) ? value : HEX_RE.test(`#${value}`) ? `#${value}` : '#000000';
  return (
    <TextField
      label={label}
      placeholder="#0F6E5B"
      fullWidth
      margin="dense"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <Box
                component="input"
                type="color"
                value={swatchValue}
                onChange={(e) => onChange(e.target.value)}
                sx={{
                  width: 26,
                  height: 26,
                  p: 0,
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  bgcolor: 'transparent',
                  '&::-webkit-color-swatch-wrapper': { p: '2px' },
                  '&::-webkit-color-swatch': { border: 'none', borderRadius: '2px' },
                }}
              />
            </InputAdornment>
          ),
        },
      }}
    />
  );
}

/**
 * Pedido explícito del usuario: "presentar un modelo de como iria
 * quedando la app... para que se verifique colores y logos" — vista
 * previa aproximada (no un render pixel-perfect del Flutter real) del
 * Home de la app con la marca en edición, se actualiza en vivo con
 * cada cambio del formulario, ANTES de guardar.
 */
function BrandPreview({ brand }: { brand: BrandFormState }) {
  const primary = brand.colorPrimary || '#0F6E5B';
  const secondary = brand.colorSecondary || '#1A73E8';
  const bg = brand.colorBgPrimary || '#FFFFFF';
  const text = brand.colorTextPrimary || '#1A1A1A';

  return (
    <Box sx={{ position: 'sticky', top: 8 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        Vista previa (aproximada)
      </Typography>
      <Box
        sx={{
          width: 220,
          borderRadius: 4,
          border: '8px solid #1c1c1c',
          overflow: 'hidden',
          boxShadow: 3,
          bgcolor: bg,
        }}
      >
        <Box
          sx={{
            height: 48,
            bgcolor: primary,
            display: 'flex',
            alignItems: 'center',
            px: 1.5,
          }}
        >
          {brand.logoUrl ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <img src={resolveAssetUrl(brand.logoUrl)} style={{ height: 24, maxWidth: '70%', objectFit: 'contain' }} />
          ) : (
            <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>MedTravelApp</Typography>
          )}
        </Box>
        <Box sx={{ p: 1.5 }}>
          {[
            { icon: <QrCode2Icon fontSize="small" />, title: 'Compartir ficha', subtitle: 'Con un médico' },
            { icon: <SmartToyOutlinedIcon fontSize="small" />, title: 'Asistente', subtitle: 'Ayuda para completar tus datos' },
          ].map((row) => (
            <Box
              key={row.title}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                bgcolor: '#fff',
                border: '1px solid rgba(0,0,0,0.08)',
                borderRadius: 1.5,
                p: 1,
                mb: 1,
              }}
            >
              <Box sx={{ color: secondary, display: 'flex' }}>{row.icon}</Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ color: text, fontSize: 12, fontWeight: 600, lineHeight: 1.2 }}>
                  {row.title}
                </Typography>
                <Typography sx={{ color: text, opacity: 0.6, fontSize: 10, lineHeight: 1.2 }}>
                  {row.subtitle}
                </Typography>
              </Box>
              <ChevronRightIcon sx={{ color: text, opacity: 0.4 }} fontSize="small" />
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

/** Fase 1 — mismo catálogo fijo que APP_FEATURE_FLAG_KEYS en me-tenant-config.controller.ts. */
const TENANT_FEATURE_FLAGS: { key: string; label: string }[] = [
  { key: 'nav.coverage_enabled', label: 'Pestaña Cobertura' },
  { key: 'nav.trips_enabled', label: 'Pestaña Viajes' },
  { key: 'nav.emergency_enabled', label: 'Pestaña Emergencia/SOS' },
  { key: 'ai.assistant_enabled', label: 'Asistente de IA (voz/chat)' },
  { key: 'ai.destination_search_enabled', label: 'Búsqueda de destino con IA (en Viajes)' },
  { key: 'health.classic_mode_enabled', label: 'Ficha de Salud — modo Clásico (charla libre)' },
  { key: 'health.structured_mode_enabled', label: 'Ficha de Salud — modo Estructurado (pregunta por pregunta)' },
];

interface TenantBrandProfile {
  id: string;
  tenantId: string;
  themeId?: string;
  logoUrl?: string;
  logoDarkUrl?: string;
  logoIconUrl?: string;
  faviconUrl?: string;
}

interface TenantTheme {
  id: string;
  tenantId: string;
  themeName: string;
  platform: 'APP' | 'WEB' | 'BOTH';
  colorPrimary?: string;
  colorSecondary?: string;
  colorAccent?: string;
  colorBgPrimary?: string;
  colorTextPrimary?: string;
  isDefault: boolean;
  isActive: boolean;
}

interface FeatureFlagRow {
  id: string;
  tenantId?: string;
  flagKey: string;
  flagType: string;
  defaultValue: unknown;
  active: boolean;
}

interface BrandFormState {
  logoUrl: string;
  logoDarkUrl: string;
  logoIconUrl: string;
  faviconUrl: string;
  colorPrimary: string;
  colorSecondary: string;
  colorAccent: string;
  colorBgPrimary: string;
  colorTextPrimary: string;
}

const EMPTY_BRAND_FORM: BrandFormState = {
  logoUrl: '',
  logoDarkUrl: '',
  logoIconUrl: '',
  faviconUrl: '',
  colorPrimary: '',
  colorSecondary: '',
  colorAccent: '',
  colorBgPrimary: '',
  colorTextPrimary: '',
};

interface Tenant {
  id: string;
  code: string;
  name: string;
  legalName?: string;
  countryId?: string;
  contactEmail?: string;
  contactPhone?: string;
  active: boolean;
  isPlatformAdmin: boolean;
}

interface FormState {
  code: string;
  name: string;
  legalName: string;
  countryId: string;
  contactEmail: string;
  contactPhone: string;
}

interface EditFormState {
  name: string;
  legalName: string;
  countryId: string;
  contactEmail: string;
  contactPhone: string;
  active: boolean;
  isPlatformAdmin: boolean;
}

const EMPTY_FORM: FormState = {
  code: '',
  name: '',
  legalName: '',
  countryId: '',
  contactEmail: '',
  contactPhone: '',
};

/**
 * "Empresas" = core.tenants — las compañías de asistencia al viajero que
 * contratan la plataforma, cada una con sus propios viajeros y
 * operadores (ver "Usuarios/viajeros" y "Operadores": ambos ya
 * scopeados por tenant vía RLS, un operador de una empresa nunca ve los
 * de otra). Gateada por canManageConfig — solo un superadmin de
 * OYSGROUP administra la lista de empresas; el resto ni siquiera puede
 * ver que existen otras (ver proposed-tenants-rls.sql).
 */
export function TenantsPage() {
  usePageTitle('Empresas');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editTab, setEditTab] = useState(0);
  const [brandForm, setBrandForm] = useState<BrandFormState>(EMPTY_BRAND_FORM);

  const queryClient = useQueryClient();

  const brandProfileQuery = useQuery({
    queryKey: ['params', 'tenant-brand-profiles', editingTenant?.id],
    queryFn: async () => {
      const { data } = await apiClient.get<TenantBrandProfile[]>(
        '/params/admin/tenant-brand-profiles',
        { params: { tenantId: editingTenant!.id } },
      );
      return data[0] ?? null;
    },
    enabled: !!editingTenant,
  });

  const themeQuery = useQuery({
    queryKey: ['params', 'tenant-themes', editingTenant?.id],
    queryFn: async () => {
      const { data } = await apiClient.get<TenantTheme[]>('/params/admin/tenant-themes', {
        params: { tenantId: editingTenant!.id },
      });
      return data[0] ?? null;
    },
    enabled: !!editingTenant,
  });

  const flagsQuery = useQuery({
    queryKey: ['params', 'feature-flags', editingTenant?.id],
    queryFn: async () => {
      const { data } = await apiClient.get<FeatureFlagRow[]>('/params/admin/feature-flags', {
        params: { tenantId: editingTenant!.id },
      });
      return data;
    },
    enabled: !!editingTenant,
  });

  useEffect(() => {
    if (brandProfileQuery.data) {
      setBrandForm({
        logoUrl: brandProfileQuery.data.logoUrl ?? '',
        logoDarkUrl: brandProfileQuery.data.logoDarkUrl ?? '',
        logoIconUrl: brandProfileQuery.data.logoIconUrl ?? '',
        faviconUrl: brandProfileQuery.data.faviconUrl ?? '',
        colorPrimary: themeQuery.data?.colorPrimary ?? '',
        colorSecondary: themeQuery.data?.colorSecondary ?? '',
        colorAccent: themeQuery.data?.colorAccent ?? '',
        colorBgPrimary: themeQuery.data?.colorBgPrimary ?? '',
        colorTextPrimary: themeQuery.data?.colorTextPrimary ?? '',
      });
    } else if (brandProfileQuery.data === null) {
      setBrandForm(EMPTY_BRAND_FORM);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandProfileQuery.data, themeQuery.data]);

  const saveBrandMutation = useMutation({
    mutationFn: async () => {
      if (!editingTenant) return;
      let themeId = themeQuery.data?.id;
      const themePayload = {
        tenantId: editingTenant.id,
        themeName: `${editingTenant.name} — tema`,
        platform: 'BOTH',
        colorPrimary: brandForm.colorPrimary || undefined,
        colorSecondary: brandForm.colorSecondary || undefined,
        colorAccent: brandForm.colorAccent || undefined,
        colorBgPrimary: brandForm.colorBgPrimary || undefined,
        colorTextPrimary: brandForm.colorTextPrimary || undefined,
        isDefault: true,
        isActive: true,
      };
      if (themeId) {
        await apiClient.patch(`/params/admin/tenant-themes/${themeId}`, themePayload);
      } else {
        const { data } = await apiClient.post('/params/admin/tenant-themes', themePayload);
        themeId = data.id;
      }

      const brandPayload = {
        tenantId: editingTenant.id,
        logoUrl: brandForm.logoUrl || undefined,
        logoDarkUrl: brandForm.logoDarkUrl || undefined,
        logoIconUrl: brandForm.logoIconUrl || undefined,
        faviconUrl: brandForm.faviconUrl || undefined,
        themeId,
      };
      if (brandProfileQuery.data) {
        await apiClient.patch(`/params/admin/tenant-brand-profiles/${brandProfileQuery.data.id}`, brandPayload);
      } else {
        await apiClient.post('/params/admin/tenant-brand-profiles', brandPayload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['params', 'tenant-brand-profiles', editingTenant?.id] });
      queryClient.invalidateQueries({ queryKey: ['params', 'tenant-themes', editingTenant?.id] });
    },
  });

  const toggleFlagMutation = useMutation({
    mutationFn: async ({ flagKey, value }: { flagKey: string; value: boolean }) => {
      if (!editingTenant) return;
      const existing = flagsQuery.data?.find((f) => f.flagKey === flagKey);
      if (existing) {
        await apiClient.patch(`/params/admin/feature-flags/${existing.id}`, { defaultValue: value });
      } else {
        await apiClient.post('/params/admin/feature-flags', {
          tenantId: editingTenant.id,
          flagKey,
          flagType: 'BOOLEAN',
          defaultValue: value,
          active: true,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['params', 'feature-flags', editingTenant?.id] });
    },
  });

  const tenantsQuery = useQuery({
    queryKey: ['identity', 'tenants'],
    queryFn: async () => {
      const { data } = await apiClient.get<Tenant[]>('/identity/tenants');
      return data;
    },
  });

  const countryCatalog = useCatalog('COUNTRY');
  const { pageRows: tenantPageRows, page: tenantPage, setPage: setTenantPage, totalCount: tenantTotalCount } =
    usePagination(tenantsQuery.data ?? []);

  const setField = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post('/identity/tenants', {
        code: form.code,
        name: form.name,
        legalName: form.legalName || undefined,
        countryId: form.countryId || undefined,
        contactEmail: form.contactEmail || undefined,
        contactPhone: form.contactPhone || undefined,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['identity', 'tenants'] });
      setDialogOpen(false);
      setForm(EMPTY_FORM);
      setError(null);
    },
    onError: () => setError('No se pudo crear la empresa (¿código repetido?).'),
  });

  const openEdit = (tenant: Tenant) => {
    setEditingTenant(tenant);
    setEditForm({
      name: tenant.name,
      legalName: tenant.legalName ?? '',
      countryId: tenant.countryId ?? '',
      contactEmail: tenant.contactEmail ?? '',
      contactPhone: tenant.contactPhone ?? '',
      active: tenant.active,
      isPlatformAdmin: tenant.isPlatformAdmin,
    });
    setEditError(null);
    setEditTab(0);
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingTenant || !editForm) return;
      const { data } = await apiClient.patch(`/identity/tenants/${editingTenant.id}`, {
        name: editForm.name,
        legalName: editForm.legalName || undefined,
        countryId: editForm.countryId || undefined,
        contactEmail: editForm.contactEmail || undefined,
        contactPhone: editForm.contactPhone || undefined,
        active: editForm.active,
        isPlatformAdmin: editForm.isPlatformAdmin,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['identity', 'tenants'] });
      setEditingTenant(null);
      setEditForm(null);
    },
    onError: () => setEditError('No se pudo guardar el cambio.'),
  });

  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', mb: 2 }}>
        <Button variant="contained" onClick={() => setDialogOpen(true)}>
          Agregar empresa
        </Button>
      </Box>

      {tenantsQuery.isLoading && <CircularProgress />}
      {tenantsQuery.isError && (
        <Alert severity="error">No se pudieron cargar las empresas.</Alert>
      )}
      {tenantsQuery.data && tenantsQuery.data.length === 0 && (
        <Alert severity="info">Todavía no hay empresas cargadas.</Alert>
      )}

      {tenantsQuery.data && tenantsQuery.data.length > 0 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Código</TableCell>
                <TableCell>Nombre</TableCell>
                <TableCell>Razón social</TableCell>
                <TableCell>País</TableCell>
                <TableCell>Contacto</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Estado</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tenantPageRows.map((t) => (
                <TableRow key={t.id} hover onClick={() => openEdit(t)} sx={{ cursor: 'pointer' }}>
                  <TableCell>{t.code}</TableCell>
                  <TableCell>{t.name}</TableCell>
                  <TableCell>{t.legalName ?? '—'}</TableCell>
                  <TableCell>{labelFor(countryCatalog.data, t.countryId)}</TableCell>
                  <TableCell>{t.contactEmail ?? t.contactPhone ?? '—'}</TableCell>
                  <TableCell>
                    {t.isPlatformAdmin ? (
                      <Chip size="small" color="secondary" label="Administrador de plataforma" />
                    ) : (
                      <Chip size="small" variant="outlined" label="Empresa de asistencia" />
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      color={t.active ? 'success' : 'default'}
                      label={t.active ? 'Activa' : 'Inactiva'}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <PaginationFooter page={tenantPage} totalCount={tenantTotalCount} onPageChange={setTenantPage} />
        </TableContainer>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Agregar empresa</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Grid container spacing={1}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Código"
                fullWidth
                margin="normal"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                helperText="Único, ej. ACME01"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Nombre comercial"
                fullWidth
                margin="normal"
                value={form.name}
                onChange={setField('name')}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                label="Razón social"
                fullWidth
                margin="normal"
                value={form.legalName}
                onChange={setField('legalName')}
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
                label="Email de contacto"
                type="email"
                fullWidth
                margin="normal"
                value={form.contactEmail}
                onChange={setField('contactEmail')}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Teléfono de contacto"
                fullWidth
                margin="normal"
                value={form.contactPhone}
                onChange={setField('contactPhone')}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={!form.code || !form.name || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            Crear
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!editingTenant} onClose={() => setEditingTenant(null)} fullWidth maxWidth="md">
        <DialogTitle>
          Editar empresa{editingTenant ? `: ${editingTenant.name}` : ''}
        </DialogTitle>
        <Tabs value={editTab} onChange={(_, v) => setEditTab(v)} sx={{ px: 3, borderBottom: 1, borderColor: 'divider' }}>
          <Tab label="General" />
          <Tab label="Marca" />
          <Tab label="Funciones" />
        </Tabs>
        <DialogContent>
          {editError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {editError}
            </Alert>
          )}
          {editTab === 0 && editForm && (
            <Grid container spacing={1}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Nombre comercial"
                  fullWidth
                  margin="normal"
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => (f ? { ...f, name: e.target.value } : f))}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Razón social"
                  fullWidth
                  margin="normal"
                  value={editForm.legalName}
                  onChange={(e) => setEditForm((f) => (f ? { ...f, legalName: e.target.value } : f))}
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
                  label="Email de contacto"
                  type="email"
                  fullWidth
                  margin="normal"
                  value={editForm.contactEmail}
                  onChange={(e) => setEditForm((f) => (f ? { ...f, contactEmail: e.target.value } : f))}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Teléfono de contacto"
                  fullWidth
                  margin="normal"
                  value={editForm.contactPhone}
                  onChange={(e) => setEditForm((f) => (f ? { ...f, contactPhone: e.target.value } : f))}
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={editForm.active}
                      onChange={(e) => setEditForm((f) => (f ? { ...f, active: e.target.checked } : f))}
                    />
                  }
                  label={editForm.active ? 'Activa' : 'Inactiva'}
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={editForm.isPlatformAdmin}
                      onChange={(e) => setEditForm((f) => (f ? { ...f, isPlatformAdmin: e.target.checked } : f))}
                    />
                  }
                  label="Es el administrador general de la plataforma (no una empresa de asistencia al viajero)"
                />
              </Grid>
            </Grid>
          )}

          {editTab === 1 && (
            <Box sx={{ pt: 1 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Logo y colores que ve un viajero de esta empresa en la app. Dejar un color en
                blanco usa el valor por defecto de MedTravelApp.
              </Typography>
              <Grid container spacing={3}>
                <Grid size={{ xs: 12, sm: 7 }}>
                  <BrandImageField
                    label="Logo"
                    hint="PNG o WEBP con fondo transparente, horizontal (ej. 320×64px). También sirve JPG. Máx. 2MB."
                    value={brandForm.logoUrl}
                    onChange={(url) => setBrandForm((f) => ({ ...f, logoUrl: url }))}
                  />
                  <BrandImageField
                    label="Logo modo oscuro"
                    hint="Opcional — variante para fondo oscuro. Todavía no se usa en ninguna pantalla."
                    value={brandForm.logoDarkUrl}
                    onChange={(url) => setBrandForm((f) => ({ ...f, logoDarkUrl: url }))}
                  />
                  <BrandImageField
                    label="Ícono"
                    hint="Opcional — versión cuadrada del logo (ej. 128×128px)."
                    value={brandForm.logoIconUrl}
                    onChange={(url) => setBrandForm((f) => ({ ...f, logoIconUrl: url }))}
                  />
                  <BrandImageField
                    label="Favicon"
                    hint="Opcional — todavía no se usa en ninguna pantalla."
                    value={brandForm.faviconUrl}
                    onChange={(url) => setBrandForm((f) => ({ ...f, faviconUrl: url }))}
                  />
                  <Grid container spacing={1} sx={{ mt: 1 }}>
                    {(
                      [
                        ['colorPrimary', 'Color primario'],
                        ['colorSecondary', 'Color secundario'],
                        ['colorAccent', 'Color de acento'],
                        ['colorBgPrimary', 'Fondo'],
                        ['colorTextPrimary', 'Texto'],
                      ] as const
                    ).map(([field, label]) => (
                      <Grid size={{ xs: 6, sm: 4 }} key={field}>
                        <ColorField
                          label={label}
                          value={brandForm[field]}
                          onChange={(v) => setBrandForm((f) => ({ ...f, [field]: v }))}
                        />
                      </Grid>
                    ))}
                  </Grid>
                </Grid>
                <Grid size={{ xs: 12, sm: 5 }} sx={{ display: 'flex', justifyContent: 'center' }}>
                  <BrandPreview brand={brandForm} />
                </Grid>
              </Grid>
            </Box>
          )}

          {editTab === 2 && (
            <Box sx={{ pt: 1 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Qué funciones de la app están habilitadas para los viajeros de esta empresa. Sin
                una fila acá, la función queda habilitada por el valor global.
              </Typography>
              {flagsQuery.isLoading && <CircularProgress size={20} />}
              {TENANT_FEATURE_FLAGS.map(({ key, label }) => {
                const existing = flagsQuery.data?.find((f) => f.flagKey === key);
                const enabled = existing ? existing.defaultValue === true : true;
                return (
                  <FormControlLabel
                    key={key}
                    sx={{ display: 'flex', ml: 0 }}
                    control={
                      <Switch
                        checked={enabled}
                        onChange={(e) =>
                          toggleFlagMutation.mutate({ flagKey: key, value: e.target.checked })
                        }
                      />
                    }
                    label={label}
                  />
                );
              })}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditingTenant(null)}>Cerrar</Button>
          {editTab === 0 && (
            <Button
              variant="contained"
              disabled={updateMutation.isPending}
              onClick={() => updateMutation.mutate()}
            >
              Guardar
            </Button>
          )}
          {editTab === 1 && (
            <Button
              variant="contained"
              disabled={saveBrandMutation.isPending}
              onClick={() => saveBrandMutation.mutate()}
            >
              Guardar marca
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
}
