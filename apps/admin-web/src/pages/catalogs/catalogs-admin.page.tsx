import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
  Typography,
} from '@mui/material';

import { apiClient } from '../../lib/api-client';
import { PaginationFooter, usePagination } from '../../lib/pagination';

interface DomainCatalog {
  id: string;
  code: string;
  nameEs: string;
}

interface CatalogValue {
  id: string;
  domainId: string;
  code: string;
  labelEs: string;
  labelEn?: string;
  displayOrder: number;
  active: boolean;
}

interface FormState {
  code: string;
  labelEs: string;
  labelEn: string;
  displayOrder: string;
}

interface EditFormState {
  labelEs: string;
  labelEn: string;
  displayOrder: string;
}

const EMPTY_FORM: FormState = { code: '', labelEs: '', labelEn: '', displayOrder: '0' };

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
  const [selectedDomainId, setSelectedDomainId] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const [editingValue, setEditingValue] = useState<CatalogValue | null>(null);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

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

  const valuesQuery = useQuery({
    queryKey: ['params', 'catalog-values', selectedDomainId],
    queryFn: async () => {
      const { data } = await apiClient.get<CatalogValue[]>(
        '/params/admin/catalog-values',
        { params: { domainId: selectedDomainId } },
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
    });
    setEditError(null);
  };

  const sortedValues = (valuesQuery.data ?? [])
    .slice()
    .sort((a, b) => a.displayOrder - b.displayOrder);
  const { pageRows: valuePageRows, page: valuePage, setPage: setValuePage, totalCount: valueTotalCount } =
    usePagination(sortedValues);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingValue || !editForm) return;
      const { data } = await apiClient.patch(`/params/admin/catalog-values/${editingValue.id}`, {
        labelEs: editForm.labelEs,
        labelEn: editForm.labelEn || undefined,
        displayOrder: Number(editForm.displayOrder) || 0,
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
    onError: () => setEditError('No se pudo guardar el cambio.'),
  });

  return (
    <>
      <Typography variant="h4" gutterBottom>
        Catálogos / Parámetros
      </Typography>

      {domainsQuery.isLoading && <CircularProgress />}
      {domainsQuery.isError && (
        <Alert severity="error">No se pudieron cargar los dominios de catálogo.</Alert>
      )}

      {domainsQuery.data && (
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
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
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
                    <TableCell>Orden</TableCell>
                    <TableCell>Activo</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {valuePageRows.map((v) => (
                    <TableRow key={v.id} hover onClick={() => openEdit(v)} sx={{ cursor: 'pointer' }}>
                      <TableCell>{v.code}</TableCell>
                      <TableCell>{v.labelEs}</TableCell>
                      <TableCell>{v.labelEn ?? '—'}</TableCell>
                      <TableCell>{v.displayOrder}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Switch
                          size="small"
                          checked={v.active}
                          onChange={() => toggleActiveMutation.mutate(v)}
                        />
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
    </>
  );
}
