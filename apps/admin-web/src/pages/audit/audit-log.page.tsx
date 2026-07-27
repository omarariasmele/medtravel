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

const OPERATION_COLOR: Record<AuditEvent['operation'], 'success' | 'info' | 'error'> = {
  INSERT: 'success',
  UPDATE: 'info',
  DELETE: 'error',
};

export function AuditLogPage() {
  const auditQuery = useQuery({
    queryKey: ['audit-events'],
    queryFn: async () => {
      const { data } = await apiClient.get<AuditEvent[]>('/audit/events');
      return data;
    },
  });

  return (
    <>
      <Typography variant="h4" gutterBottom>
        Auditoría de accesos
      </Typography>

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
              {auditQuery.data.map((e) => (
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
                  <TableCell>{e.performedBy ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </>
  );
}
