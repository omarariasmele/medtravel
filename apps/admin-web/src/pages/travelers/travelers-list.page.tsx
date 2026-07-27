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

interface Member {
  id: string;
  personId: string;
  tenantMemberNumber?: string;
  statusId: string;
  onboardingCompleted: boolean;
  enrollmentDate?: string;
}

interface Person {
  id: string;
  firstName: string;
  lastName: string;
}

export function TravelersListPage() {
  const membersQuery = useQuery({
    queryKey: ['identity', 'members'],
    queryFn: async () => {
      const { data } = await apiClient.get<Member[]>('/identity/members');
      return data;
    },
  });

  const statusCatalog = useCatalog('MEMBER_STATUS');

  const personQueries = useQueries({
    queries: (membersQuery.data ?? []).map((m) => ({
      queryKey: ['identity', 'persons', m.personId],
      queryFn: async () => {
        const { data } = await apiClient.get<Person>(
          `/identity/persons/${m.personId}`,
        );
        return data;
      },
    })),
  });

  const personById = new Map(
    personQueries
      .map((q) => q.data)
      .filter((p): p is Person => !!p)
      .map((p) => [p.id, p]),
  );

  const isLoading = membersQuery.isLoading || personQueries.some((q) => q.isLoading);

  return (
    <>
      <Typography variant="h4" gutterBottom>
        Usuarios / viajeros
      </Typography>

      {isLoading && <CircularProgress />}
      {membersQuery.isError && (
        <Alert severity="error">No se pudieron cargar los viajeros.</Alert>
      )}
      {membersQuery.data && membersQuery.data.length === 0 && (
        <Alert severity="info">No hay viajeros registrados en este tenant.</Alert>
      )}

      {membersQuery.data && membersQuery.data.length > 0 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Nombre</TableCell>
                <TableCell>N° de member</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell>Onboarding</TableCell>
                <TableCell>Alta</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {membersQuery.data.map((m) => {
                const person = personById.get(m.personId);
                return (
                  <TableRow key={m.id} hover>
                    <TableCell>
                      {person ? `${person.firstName} ${person.lastName}` : '—'}
                    </TableCell>
                    <TableCell>{m.tenantMemberNumber ?? '—'}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={labelFor(statusCatalog.data, m.statusId)}
                      />
                    </TableCell>
                    <TableCell>
                      {m.onboardingCompleted ? 'Completo' : 'Pendiente'}
                    </TableCell>
                    <TableCell>
                      {m.enrollmentDate
                        ? new Date(m.enrollmentDate).toLocaleDateString('es-AR')
                        : '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </>
  );
}
