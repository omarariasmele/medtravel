import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
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
  Typography,
} from '@mui/material';

import { useAuth } from '../../auth/auth-context';
import { apiClient } from '../../lib/api-client';
import { labelFor, useCatalog } from '../../lib/catalog-hooks';
import { useTravelersOverview } from '../../lib/travelers-overview-hooks';

interface Tenant {
  id: string;
  name: string;
}

const LANG_LABEL: Record<string, string> = { es: 'Español', en: 'English', pt: 'Português' };

/**
 * Reworkeado a pedido del usuario: antes solo mostraba "Onboarding"
 * (siempre vacío — no existe la pantalla de Flutter todavía) y "Alta"
 * (fecha de creación del member, no la vigencia real del servicio).
 * Ahora usa /identity/travelers-overview (una sola consulta con joins,
 * reemplaza el fetch N+1 anterior) para mostrar lo que realmente
 * permite identificar y entender a un viajero: país, idioma, empresa,
 * plan, N° de póliza, estado, y vigencia real del servicio de
 * asistencia (fecha de alta/baja de la cobertura, no del registro).
 */
export function TravelersListPage() {
  const navigate = useNavigate();
  const { claims } = useAuth();
  const [tenantFilter, setTenantFilter] = useState('');
  const [countryFilter, setCountryFilter] = useState('');

  const overviewQuery = useTravelersOverview();

  const tenantsQuery = useQuery({
    queryKey: ['identity', 'tenants'],
    queryFn: async () => {
      const { data } = await apiClient.get<Tenant[]>('/identity/tenants');
      return data;
    },
  });

  const statusCatalog = useCatalog('MEMBER_STATUS');
  const countryCatalog = useCatalog('COUNTRY');

  const filteredRows = (overviewQuery.data ?? []).filter(
    (r) =>
      (!tenantFilter || r.tenantId === tenantFilter) &&
      (!countryFilter || r.countryResidenceId === countryFilter),
  );

  return (
    <>
      <Typography variant="h4" gutterBottom>
        Usuarios / viajeros
      </Typography>

      <Box sx={{ mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
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
          label="Filtrar por país"
          size="small"
          sx={{ minWidth: 220 }}
          value={countryFilter}
          onChange={(e) => setCountryFilter(e.target.value)}
        >
          <MenuItem value="">Todos los países</MenuItem>
          {(countryCatalog.data ?? []).map((c) => (
            <MenuItem key={c.id} value={c.id}>{c.labelEs}</MenuItem>
          ))}
        </TextField>
      </Box>

      {overviewQuery.isLoading && <CircularProgress />}
      {overviewQuery.isError && (
        <Alert severity="error">No se pudieron cargar los viajeros.</Alert>
      )}
      {overviewQuery.data && overviewQuery.data.length === 0 && (
        <Alert severity="info">No hay viajeros registrados en este tenant.</Alert>
      )}
      {overviewQuery.data && overviewQuery.data.length > 0 && filteredRows.length === 0 && (
        <Alert severity="info">Sin viajeros para este filtro.</Alert>
      )}

      {filteredRows.length > 0 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Nombre</TableCell>
                <TableCell>País</TableCell>
                <TableCell>Idioma</TableCell>
                <TableCell>Empresa</TableCell>
                <TableCell>Plan</TableCell>
                <TableCell>N° de póliza</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell>Fecha de alta</TableCell>
                <TableCell>Fecha de baja</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredRows.map((r) => (
                <TableRow
                  key={r.memberId}
                  hover
                  onClick={() => navigate(`/travelers/${r.memberId}`)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell>{r.firstName} {r.lastName}</TableCell>
                  <TableCell>{labelFor(countryCatalog.data, r.countryResidenceId ?? undefined)}</TableCell>
                  <TableCell>{LANG_LABEL[r.preferredLang] ?? r.preferredLang}</TableCell>
                  <TableCell>{r.tenantName ?? '—'}</TableCell>
                  <TableCell>{r.planName ?? '—'}</TableCell>
                  <TableCell>{r.policyNumber ?? '—'}</TableCell>
                  <TableCell>
                    <Chip size="small" label={labelFor(statusCatalog.data, r.statusId)} />
                  </TableCell>
                  <TableCell>{r.validFrom ? new Date(r.validFrom).toLocaleDateString('es-AR') : '—'}</TableCell>
                  <TableCell>{r.validUntil ? new Date(r.validUntil).toLocaleDateString('es-AR') : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </>
  );
}
