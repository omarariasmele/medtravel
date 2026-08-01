import { useQuery } from '@tanstack/react-query';
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
import { PaginationFooter, usePagination } from '../../lib/pagination';

interface TravelerWithoutTenant {
  person_id: string;
  first_name: string;
  last_name: string;
  email: string;
  email_verified: boolean;
  created_at: string;
  has_health_coverage: boolean;
}

/**
 * Registrarse (POST /auth/register) crea persons/users pero nunca un
 * core.members — pertenecer a una empresa de asistencia al viajero es
 * una relación aparte (gap #10 de SCHEMA_GAPS.md). Sin esta pantalla,
 * esos viajeros eran invisibles para cualquier operador: pedido
 * explícito del usuario después de registrarse en la app y no
 * encontrarse en ningún lado del panel.
 */
export function TravelersWithoutCoveragePage() {
  const query = useQuery({
    queryKey: ['identity', 'travelers-without-tenant'],
    queryFn: async () => {
      const { data } = await apiClient.get<TravelerWithoutTenant[]>(
        '/identity/travelers-without-tenant',
      );
      return data;
    },
  });

  const { pageRows, page, setPage, totalCount } = usePagination(query.data ?? []);

  return (
    <>
      <Typography variant="h4" gutterBottom>
        Usuarios sin cobertura de asistencia al viajero
      </Typography>
      <Alert severity="info" sx={{ mb: 2 }}>
        Se registraron en la app pero todavía no quedaron afiliados a ninguna empresa de
        asistencia al viajero (ni declararon ni les cargaron una póliza). Pueden igual
        tener su obra social/prepaga personal cargada — columna "Obra social".
      </Alert>

      {query.isLoading && <CircularProgress />}
      {query.isError && <Alert severity="error">No se pudo cargar la lista.</Alert>}
      {query.data && query.data.length === 0 && (
        <Alert severity="success">Todos los usuarios registrados ya tienen una cobertura de asistencia.</Alert>
      )}

      {query.data && query.data.length > 0 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Nombre</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Verificado</TableCell>
                <TableCell>Obra social</TableCell>
                <TableCell>Registrado</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pageRows.map((t) => (
                <TableRow key={t.person_id} hover>
                  <TableCell>{t.first_name} {t.last_name}</TableCell>
                  <TableCell>{t.email}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      color={t.email_verified ? 'success' : 'default'}
                      label={t.email_verified ? 'Sí' : 'No'}
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      color={t.has_health_coverage ? 'success' : 'default'}
                      label={t.has_health_coverage ? 'Cargada' : 'Sin cargar'}
                    />
                  </TableCell>
                  <TableCell>{new Date(t.created_at).toLocaleString('es-AR')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <PaginationFooter page={page} totalCount={totalCount} onPageChange={setPage} />
        </TableContainer>
      )}
    </>
  );
}
