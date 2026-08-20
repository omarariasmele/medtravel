import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
} from '@mui/material';

import { useAuth } from '../../auth/auth-context';
import { apiClient } from '../../lib/api-client';
import { labelFor, useCatalog } from '../../lib/catalog-hooks';
import { usePageTitle } from '../../lib/page-title';
import { useTravelersOverview } from '../../lib/travelers-overview-hooks';
import { PaginationFooter, usePagination } from '../../lib/pagination';

interface EmergencyCase {
  id: string;
  caseNumber: string;
  tenantId: string;
  memberId: string;
  statusId: string;
  priorityId: string;
  initialDescription?: string;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
}

interface Tenant {
  id: string;
  name: string;
}

export function CasesListPage() {
  usePageTitle('Casos de asistencia');
  const navigate = useNavigate();
  const { claims } = useAuth();
  const [tenantFilter, setTenantFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  const casesQuery = useQuery({
    queryKey: ['emergency-cases'],
    queryFn: async () => {
      const { data } = await apiClient.get<EmergencyCase[]>(
        '/operations/emergency-cases',
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

  const overviewQuery = useTravelersOverview();
  const overviewByMemberId = new Map((overviewQuery.data ?? []).map((r) => [r.memberId, r]));

  const statusCatalog = useCatalog('CASE_STATUS');
  const priorityCatalog = useCatalog('CASE_PRIORITY');
  const countryCatalog = useCatalog('COUNTRY');

  const normalizedSearch = search.trim().toLowerCase();
  const filteredCases = (casesQuery.data ?? []).filter((c) => {
    if (tenantFilter && c.tenantId !== tenantFilter) return false;
    if (statusFilter && c.statusId !== statusFilter) return false;
    if (!normalizedSearch) return true;
    const traveler = overviewByMemberId.get(c.memberId);
    const travelerName = traveler ? `${traveler.firstName} ${traveler.lastName}` : '';
    return (
      c.caseNumber.toLowerCase().includes(normalizedSearch) ||
      travelerName.toLowerCase().includes(normalizedSearch) ||
      (traveler?.policyNumber ?? '').toLowerCase().includes(normalizedSearch)
    );
  });
  const { pageRows: casePageRows, page: casePage, setPage: setCasePage, totalCount: caseTotalCount } =
    usePagination(filteredCases);

  return (
    <>
      <Box sx={{ mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <TextField
          label="Buscar por viajero, N° de póliza o N° de caso"
          size="small"
          sx={{ minWidth: 300 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {claims?.canManageConfig && (tenantsQuery.data?.length ?? 0) > 1 && (
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
        )}
        <TextField
          select
          label="Filtrar por estado"
          size="small"
          sx={{ minWidth: 200 }}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <MenuItem value="">Todos los estados</MenuItem>
          {(statusCatalog.data ?? []).map((s) => (
            <MenuItem key={s.id} value={s.id}>{s.labelEs}</MenuItem>
          ))}
        </TextField>
      </Box>

      {casesQuery.isLoading && <CircularProgress />}
      {casesQuery.isError && (
        <Alert severity="error">No se pudieron cargar los casos.</Alert>
      )}
      {casesQuery.data && casesQuery.data.length === 0 && (
        <Alert severity="info">No hay casos registrados todavía.</Alert>
      )}
      {casesQuery.data && casesQuery.data.length > 0 && filteredCases.length === 0 && (
        <Alert severity="info">Sin casos para esta empresa.</Alert>
      )}

      {filteredCases.length > 0 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>N° de caso</TableCell>
                <TableCell>Viajero</TableCell>
                <TableCell>País</TableCell>
                <TableCell>N° de póliza</TableCell>
                <TableCell>Empresa</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell>Prioridad</TableCell>
                <TableCell>Descripción inicial</TableCell>
                <TableCell>Creado</TableCell>
                <TableCell>Última atención</TableCell>
                <TableCell>Fecha de cierre</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {casePageRows.map((c) => {
                const traveler = overviewByMemberId.get(c.memberId);
                return (
                <TableRow
                  key={c.id}
                  hover
                  onClick={() => navigate(`/cases/${c.id}`)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell>{c.caseNumber}</TableCell>
                  <TableCell>
                    {traveler ? `${traveler.firstName} ${traveler.lastName}` : '—'}
                  </TableCell>
                  <TableCell>
                    {labelFor(countryCatalog.data, traveler?.countryResidenceId ?? undefined)}
                  </TableCell>
                  <TableCell>{traveler?.policyNumber ?? '—'}</TableCell>
                  <TableCell>{tenantNameById.get(c.tenantId) ?? '—'}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={labelFor(statusCatalog.data, c.statusId)}
                    />
                  </TableCell>
                  <TableCell>
                    {labelFor(priorityCatalog.data, c.priorityId)}
                  </TableCell>
                  <TableCell>{c.initialDescription ?? '—'}</TableCell>
                  <TableCell>
                    {new Date(c.createdAt).toLocaleString('es-AR')}
                  </TableCell>
                  <TableCell>
                    {new Date(c.updatedAt).toLocaleString('es-AR')}
                  </TableCell>
                  <TableCell>
                    {c.closedAt ? new Date(c.closedAt).toLocaleString('es-AR') : '—'}
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <PaginationFooter page={casePage} totalCount={caseTotalCount} onPageChange={setCasePage} />
        </TableContainer>
      )}
    </>
  );
}
