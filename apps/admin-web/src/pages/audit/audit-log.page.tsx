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
} from '@mui/material';

import { apiClient } from '../../lib/api-client';
import { usePageTitle } from '../../lib/page-title';
import { PaginationFooter, usePagination } from '../../lib/pagination';

interface AuditEvent {
  id: string;
  tableSchema: string;
  tableName: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  rowId?: string;
  changedFields?: Record<string, { from: unknown; to: unknown }>;
  performedBy?: string;
  performedAt: string;
}

interface Operator {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
}

const OPERATION_COLOR: Record<AuditEvent['operation'], 'success' | 'info' | 'error'> = {
  INSERT: 'success',
  UPDATE: 'info',
  DELETE: 'error',
};

export function AuditLogPage() {
  usePageTitle('Auditoría de accesos');
  const auditQuery = useQuery({
    queryKey: ['audit-events'],
    queryFn: async () => {
      const { data } = await apiClient.get<AuditEvent[]>('/audit/events');
      return data;
    },
  });

  const operatorsQuery = useQuery({
    queryKey: ['operations', 'operators'],
    queryFn: async () => {
      const { data } = await apiClient.get<Operator[]>('/operations/operators');
      return data;
    },
  });

  const operatorNameByUserId = new Map(
    (operatorsQuery.data ?? []).map((o) => [o.userId, `${o.firstName} ${o.lastName}`]),
  );

  const performedByLabel = (userId?: string) => {
    if (!userId) return '—';
    return operatorNameByUserId.get(userId) ?? userId;
  };

  const { pageRows: auditPageRows, page: auditPage, setPage: setAuditPage, totalCount: auditTotalCount } =
    usePagination(auditQuery.data ?? []);

  return (
    <>
      {auditQuery.isLoading && <CircularProgress />}
      {auditQuery.isError && (
        <Alert severity="error">No se pudo cargar el registro de auditoría.</Alert>
      )}
      {auditQuery.data && auditQuery.data.length === 0 && (
        <Alert severity="info">
          Todavía no hay eventos registrados para este tenant.
        </Alert>
      )}

      {auditQuery.data && auditQuery.data.length > 0 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Cuándo</TableCell>
                <TableCell>Operación</TableCell>
                <TableCell>Tabla</TableCell>
                <TableCell>Cambios</TableCell>
                <TableCell>Realizado por</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {auditPageRows.map((e) => (
                <TableRow key={e.id} hover>
                  <TableCell>
                    {new Date(e.performedAt).toLocaleString('es-AR')}
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      color={OPERATION_COLOR[e.operation]}
                      label={e.operation}
                    />
                  </TableCell>
                  <TableCell>
                    {e.tableSchema}.{e.tableName}
                  </TableCell>
                  <TableCell>
                    {e.changedFields
                      ? Object.keys(e.changedFields).join(', ')
                      : '—'}
                  </TableCell>
                  <TableCell>{performedByLabel(e.performedBy)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <PaginationFooter page={auditPage} totalCount={auditTotalCount} onPageChange={setAuditPage} />
        </TableContainer>
      )}
    </>
  );
}
