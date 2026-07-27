import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
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

interface EmergencyCase {
  id: string;
  caseNumber: string;
  statusId: string;
  priorityId: string;
  initialDescription?: string;
  createdAt: string;
}

export function CasesListPage() {
  const navigate = useNavigate();
  const casesQuery = useQuery({
    queryKey: ['emergency-cases'],
    queryFn: async () => {
      const { data } = await apiClient.get<EmergencyCase[]>(
        '/operations/emergency-cases',
      );
      return data;
    },
  });

  const statusCatalog = useCatalog('CASE_STATUS');
  const priorityCatalog = useCatalog('CASE_PRIORITY');

  return (
    <>
      <Typography variant="h4" gutterBottom>
        Casos de asistencia
      </Typography>

      {casesQuery.isLoading && <CircularProgress />}
      {casesQuery.isError && (
        <Alert severity="error">No se pudieron cargar los casos.</Alert>
      )}
      {casesQuery.data && casesQuery.data.length === 0 && (
        <Alert severity="info">No hay casos registrados todavía.</Alert>
      )}

      {casesQuery.data && casesQuery.data.length > 0 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>N° de caso</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell>Prioridad</TableCell>
                <TableCell>Descripción inicial</TableCell>
                <TableCell>Creado</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {casesQuery.data.map((c) => (
                <TableRow
                  key={c.id}
                  hover
                  onClick={() => navigate(`/cases/${c.id}`)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell>{c.caseNumber}</TableCell>
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </>
  );
}
