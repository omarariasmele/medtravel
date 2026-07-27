import { useQueries, useQuery } from '@tanstack/react-query';
import {
  Alert,
  Chip,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';

import { apiClient } from '../../lib/api-client';
import { labelFor, useCatalog } from '../../lib/catalog-hooks';

interface HealthCoverage {
  id: string;
  memberId: string;
  coverageName: string;
  coverageTypeId: string;
  providerName: string;
  policyNumber?: string;
  statusId: string;
  isPrimary: boolean;
}

interface Member {
  id: string;
  personId: string;
}

interface Person {
  id: string;
  firstName: string;
  lastName: string;
}

export function CoveragesListPage() {
  const coveragesQuery = useQuery({
    queryKey: ['coverage', 'health-coverages'],
    queryFn: async () => {
      const { data } = await apiClient.get<HealthCoverage[]>(
        '/coverage/health-coverages',
      );
      return data;
    },
  });

  const membersQuery = useQuery({
    queryKey: ['identity', 'members'],
    queryFn: async () => {
      const { data } = await apiClient.get<Member[]>('/identity/members');
      return data;
    },
  });

  const personQueries = useQueries({
    queries: (membersQuery.data ?? []).map((m) => ({
      queryKey: ['identity', 'persons', m.personId],
      queryFn: async () => {
        const { data } = await apiClient.get<Person>(`/identity/persons/${m.personId}`);
        return data;
      },
    })),
  });

  const personByMemberId = new Map(
    (membersQuery.data ?? []).map((m, i) => [m.id, personQueries[i]?.data]),
  );

  const typeCatalog = useCatalog('HEALTH_COVERAGE_TYPE');
  const statusCatalog = useCatalog('COVERAGE_STATUS');

  const memberLabel = (memberId: string) => {
    const person = personByMemberId.get(memberId);
    return person ? `${person.firstName} ${person.lastName}` : '—';
  };

  return (
    <>
      <Typography variant="h4" gutterBottom>
        Coberturas
      </Typography>

      {coveragesQuery.isLoading && <CircularProgress />}
      {coveragesQuery.isError && (
        <Alert severity="error">No se pudieron cargar las coberturas.</Alert>
      )}
      {coveragesQuery.data && coveragesQuery.data.length === 0 && (
        <Alert severity="info">
          No hay coberturas visibles para este tenant — el titular controla
          quién puede ver sus datos de cobertura mediante consentimiento
          explícito, así que solo aparecen acá las que fueron autorizadas.
        </Alert>
      )}

      {coveragesQuery.data && coveragesQuery.data.length > 0 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Viajero</TableCell>
                <TableCell>Cobertura</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Proveedor</TableCell>
                <TableCell>N° de póliza</TableCell>
                <TableCell>Estado</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {coveragesQuery.data.map((c) => (
                <TableRow key={c.id} hover>
                  <TableCell>{memberLabel(c.memberId)}</TableCell>
                  <TableCell>
                    {c.coverageName}
                    {c.isPrimary && (
                      <Chip size="small" label="Principal" sx={{ ml: 1 }} />
                    )}
                  </TableCell>
                  <TableCell>{labelFor(typeCatalog.data, c.coverageTypeId)}</TableCell>
                  <TableCell>{c.providerName}</TableCell>
                  <TableCell>{c.policyNumber ?? '—'}</TableCell>
                  <TableCell>
                    <Chip size="small" label={labelFor(statusCatalog.data, c.statusId)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </>
  );
}
