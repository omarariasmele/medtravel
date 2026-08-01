import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  MenuItem,
  Paper,
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
import { labelFor, useCatalog } from '../../lib/catalog-hooks';
import { PaginationFooter, usePagination } from '../../lib/pagination';

interface Operator {
  id: string;
  tenantId?: string;
  firstName: string;
  lastName: string;
  roleId: string;
  operatorTypeId: string;
  statusId: string;
}

interface OperatorRole {
  id: string;
  code: string;
  nameEs: string;
}

interface Tenant {
  id: string;
  name: string;
}

interface CreateFormState {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  roleId: string;
  operatorTypeId: string;
}

interface EditFormState {
  firstName: string;
  lastName: string;
  email: string;
  roleId: string;
  operatorTypeId: string;
  statusId: string;
}

const EMPTY_CREATE_FORM: CreateFormState = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  roleId: '',
  operatorTypeId: '',
};

export function OperatorsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateFormState>(EMPTY_CREATE_FORM);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingOperator, setEditingOperator] = useState<Operator | null>(null);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const operatorsQuery = useQuery({
    queryKey: ['operations', 'operators'],
    queryFn: async () => {
      const { data } = await apiClient.get<Operator[]>('/operations/operators');
      return data;
    },
  });

  const rolesQuery = useQuery({
    queryKey: ['operations', 'operator-roles'],
    queryFn: async () => {
      const { data } = await apiClient.get<OperatorRole[]>(
        '/operations/operator-roles',
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

  const operatorTypeCatalog = useCatalog('OPERATOR_TYPE');
  const operatorStatusCatalog = useCatalog('OPERATOR_STATUS');

  const roleNameById = new Map(
    (rolesQuery.data ?? []).map((r) => [r.id, r.nameEs]),
  );
  const tenantNameById = new Map(
    (tenantsQuery.data ?? []).map((t) => [t.id, t.name]),
  );

  const setCreateField =
    (field: keyof CreateFormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setCreateForm((f) => ({ ...f, [field]: e.target.value }));

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post('/operations/operators-registration', {
        firstName: createForm.firstName,
        lastName: createForm.lastName,
        email: createForm.email,
        password: createForm.password,
        roleId: createForm.roleId,
        operatorTypeId: createForm.operatorTypeId,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['operations', 'operators'] });
      setCreateOpen(false);
      setCreateForm(EMPTY_CREATE_FORM);
      setCreateError(null);
    },
    onError: () => setCreateError('No se pudo crear el operador (¿email ya usado?).'),
  });

  const [editEmailLoading, setEditEmailLoading] = useState(false);

  const openEdit = async (operator: Operator) => {
    setEditingOperator(operator);
    setEditError(null);
    setEditForm({
      firstName: operator.firstName,
      lastName: operator.lastName,
      email: '',
      roleId: operator.roleId,
      operatorTypeId: operator.operatorTypeId,
      statusId: operator.statusId,
    });
    setEditEmailLoading(true);
    try {
      const { data } = await apiClient.get<{ email: string }>(
        `/operations/operators/${operator.id}/account`,
      );
      setEditForm((f) => (f ? { ...f, email: data.email } : f));
    } catch {
      setEditError('No se pudo cargar el email de la cuenta.');
    } finally {
      setEditEmailLoading(false);
    }
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingOperator || !editForm) return;
      await apiClient.patch(`/operations/operators/${editingOperator.id}`, {
        firstName: editForm.firstName,
        lastName: editForm.lastName,
        roleId: editForm.roleId,
        operatorTypeId: editForm.operatorTypeId,
        statusId: editForm.statusId,
      });
      await apiClient.patch(`/operations/operators/${editingOperator.id}/account`, {
        email: editForm.email,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['operations', 'operators'] });
      setEditingOperator(null);
      setEditForm(null);
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setEditError(message ?? 'No se pudo guardar el cambio.');
    },
  });

  const { pageRows: operatorPageRows, page: operatorPage, setPage: setOperatorPage, totalCount: operatorTotalCount } =
    usePagination(operatorsQuery.data ?? []);

  const isCreateFormValid =
    createForm.firstName &&
    createForm.lastName &&
    createForm.email &&
    createForm.password.length >= 8 &&
    createForm.roleId &&
    createForm.operatorTypeId;

  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4">Operadores</Typography>
        <Button variant="contained" onClick={() => setCreateOpen(true)}>
          Agregar operador
        </Button>
      </Box>

      {operatorsQuery.isLoading && <CircularProgress />}
      {operatorsQuery.isError && (
        <Alert severity="error">No se pudieron cargar los operadores.</Alert>
      )}
      {operatorsQuery.data && operatorsQuery.data.length === 0 && (
        <Alert severity="info">Todavía no hay operadores en este tenant.</Alert>
      )}

      {operatorsQuery.data && operatorsQuery.data.length > 0 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Nombre</TableCell>
                <TableCell>Empresa</TableCell>
                <TableCell>Rol</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Estado</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {operatorPageRows.map((o) => (
                <TableRow key={o.id} hover onClick={() => openEdit(o)} sx={{ cursor: 'pointer' }}>
                  <TableCell>{o.firstName} {o.lastName}</TableCell>
                  <TableCell>{o.tenantId ? tenantNameById.get(o.tenantId) ?? '—' : '—'}</TableCell>
                  <TableCell>{roleNameById.get(o.roleId) ?? '—'}</TableCell>
                  <TableCell>{labelFor(operatorTypeCatalog.data, o.operatorTypeId)}</TableCell>
                  <TableCell>
                    <Chip size="small" label={labelFor(operatorStatusCatalog.data, o.statusId)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <PaginationFooter page={operatorPage} totalCount={operatorTotalCount} onPageChange={setOperatorPage} />
        </TableContainer>
      )}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Agregar operador</DialogTitle>
        <DialogContent>
          {createError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {createError}
            </Alert>
          )}
          <TextField
            label="Nombre"
            fullWidth
            margin="normal"
            value={createForm.firstName}
            onChange={setCreateField('firstName')}
          />
          <TextField
            label="Apellido"
            fullWidth
            margin="normal"
            value={createForm.lastName}
            onChange={setCreateField('lastName')}
          />
          <TextField
            label="Email"
            type="email"
            fullWidth
            margin="normal"
            value={createForm.email}
            onChange={setCreateField('email')}
          />
          <TextField
            label="Contraseña temporal"
            type="password"
            fullWidth
            margin="normal"
            autoComplete="new-password"
            value={createForm.password}
            onChange={setCreateField('password')}
            helperText="Mínimo 8 caracteres"
          />
          <TextField
            select
            label="Rol"
            fullWidth
            margin="normal"
            value={createForm.roleId}
            onChange={setCreateField('roleId')}
          >
            {(rolesQuery.data ?? []).map((r) => (
              <MenuItem key={r.id} value={r.id}>{r.nameEs}</MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Tipo de operador"
            fullWidth
            margin="normal"
            value={createForm.operatorTypeId}
            onChange={setCreateField('operatorTypeId')}
          >
            {(operatorTypeCatalog.data ?? []).map((o) => (
              <MenuItem key={o.id} value={o.id}>{o.labelEs}</MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={!isCreateFormValid || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            Crear
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={!!editingOperator}
        onClose={() => setEditingOperator(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          Editar operador{editingOperator ? `: ${editingOperator.firstName} ${editingOperator.lastName}` : ''}
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
                label="Nombre"
                fullWidth
                margin="normal"
                value={editForm.firstName}
                onChange={(e) => setEditForm((f) => (f ? { ...f, firstName: e.target.value } : f))}
              />
              <TextField
                label="Apellido"
                fullWidth
                margin="normal"
                value={editForm.lastName}
                onChange={(e) => setEditForm((f) => (f ? { ...f, lastName: e.target.value } : f))}
              />
              <TextField
                label="Email de acceso"
                type="email"
                fullWidth
                margin="normal"
                value={editForm.email}
                onChange={(e) => setEditForm((f) => (f ? { ...f, email: e.target.value } : f))}
                disabled={editEmailLoading}
                helperText={editEmailLoading ? 'Cargando email actual…' : 'Se usa para iniciar sesión'}
              />
              <TextField
                select
                label="Rol"
                fullWidth
                margin="normal"
                value={editForm.roleId}
                onChange={(e) => setEditForm((f) => (f ? { ...f, roleId: e.target.value } : f))}
              >
                {(rolesQuery.data ?? []).map((r) => (
                  <MenuItem key={r.id} value={r.id}>{r.nameEs}</MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label="Tipo de operador"
                fullWidth
                margin="normal"
                value={editForm.operatorTypeId}
                onChange={(e) =>
                  setEditForm((f) => (f ? { ...f, operatorTypeId: e.target.value } : f))
                }
              >
                {(operatorTypeCatalog.data ?? []).map((o) => (
                  <MenuItem key={o.id} value={o.id}>{o.labelEs}</MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label="Estado"
                fullWidth
                margin="normal"
                value={editForm.statusId}
                onChange={(e) =>
                  setEditForm((f) => (f ? { ...f, statusId: e.target.value } : f))
                }
              >
                {(operatorStatusCatalog.data ?? []).map((o) => (
                  <MenuItem key={o.id} value={o.id}>{o.labelEs}</MenuItem>
                ))}
              </TextField>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditingOperator(null)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={updateMutation.isPending || editEmailLoading || !editForm?.email}
            onClick={() => updateMutation.mutate()}
          >
            Guardar
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
