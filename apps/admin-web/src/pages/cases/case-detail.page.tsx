import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';

import { apiClient } from '../../lib/api-client';
import { useAuth } from '../../auth/auth-context';
import { useCatalog, labelFor } from '../../lib/catalog-hooks';
import { useTravelersOverview } from '../../lib/travelers-overview-hooks';
import { ClinicalHistorySection } from './clinical-history.section';
import { CaseHistorySection } from './case-history.section';

/** Códigos (CASE_STATUS) que requieren pasar por el diálogo de cierre. */
const CLOSING_STATUS_CODES = ['RESOLVED', 'CLOSED'];

interface EmergencyCase {
  id: string;
  caseNumber: string;
  memberId: string;
  statusId: string;
  priorityId: string;
  emergencyTypeId?: string;
  initialDescription?: string;
  patientSymptoms?: string;
  patientConscious?: boolean;
  assignedOperatorId?: string;
  slaTargetSeconds?: number;
  resolutionTypeId?: string;
  resolutionNotes?: string;
  resolvedAt?: string;
  closedAt?: string;
  closedBy?: string;
  createdAt: string;
  updatedAt: string;
}

interface Member {
  id: string;
  personId: string;
}

interface Operator {
  id: string;
  firstName: string;
  lastName: string;
}

export function CaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { claims } = useAuth();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [closeDialog, setCloseDialog] = useState<{
    statusId: string;
    resolutionTypeId: string;
    resolutionNotes: string;
  } | null>(null);

  const caseQuery = useQuery({
    queryKey: ['emergency-case', id],
    queryFn: async () => {
      const { data } = await apiClient.get<EmergencyCase>(
        `/operations/emergency-cases/${id}`,
      );
      return data;
    },
    enabled: !!id,
  });

  const statusCatalog = useCatalog('CASE_STATUS');
  const priorityCatalog = useCatalog('CASE_PRIORITY');
  const resolutionTypeCatalog = useCatalog('CASE_RESOLUTION_TYPE');
  const countryCatalog = useCatalog('COUNTRY');

  const overviewQuery = useTravelersOverview();
  const traveler = overviewQuery.data?.find((r) => r.memberId === caseQuery.data?.memberId);

  const memberQuery = useQuery({
    queryKey: ['identity', 'members', caseQuery.data?.memberId],
    queryFn: async () => {
      const { data } = await apiClient.get<Member>(
        `/identity/members/${caseQuery.data!.memberId}`,
      );
      return data;
    },
    enabled: !!caseQuery.data?.memberId,
  });

  const operatorsQuery = useQuery({
    queryKey: ['operations', 'operators'],
    queryFn: async () => {
      const { data } = await apiClient.get<Operator[]>('/operations/operators');
      return data;
    },
  });

  const assignedOperatorLabel = (() => {
    if (!caseQuery.data?.assignedOperatorId) return 'Sin asignar';
    const op = operatorsQuery.data?.find(
      (o) => o.id === caseQuery.data!.assignedOperatorId,
    );
    return op ? `${op.firstName} ${op.lastName}` : caseQuery.data.assignedOperatorId;
  })();

  const updateMutation = useMutation({
    mutationFn: async (body: Partial<EmergencyCase>) => {
      const { data } = await apiClient.patch(
        `/operations/emergency-cases/${id}`,
        body,
      );
      return data;
    },
    onSuccess: (data) => {
      setSaveError(null);
      queryClient.setQueryData(['emergency-case', id], data);
    },
    onError: () => setSaveError('No se pudo guardar el cambio.'),
  });

  if (caseQuery.isLoading) return <CircularProgress />;
  if (caseQuery.isError || !caseQuery.data) {
    return <Alert severity="error">No se encontró el caso solicitado.</Alert>;
  }

  const c = caseQuery.data;

  return (
    <>
      <Button onClick={() => navigate('/cases')} sx={{ mb: 2 }}>
        ← Volver a casos
      </Button>
      <Typography variant="h4" gutterBottom>
        Caso {c.caseNumber}
      </Typography>
      <Typography variant="h6" color="text.secondary" gutterBottom>
        {traveler
          ? `${traveler.firstName} ${traveler.lastName} — ${labelFor(countryCatalog.data, traveler.countryResidenceId ?? undefined)}${traveler.policyNumber ? ` — Póliza ${traveler.policyNumber}` : ''}${traveler.tenantName ? ` (${traveler.tenantName})` : ''}`
          : 'Cargando viajero…'}
      </Typography>

      {saveError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {saveError}
        </Alert>
      )}

      <Card>
        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Grid container spacing={1} sx={{ alignItems: 'center' }}>
            <Grid size={{ xs: 6, sm: 2 }}>
              <TextField
                select
                label="Estado"
                size="small"
                fullWidth
                value={c.statusId}
                onChange={(e) => {
                  const nextStatusId = e.target.value;
                  const code = statusCatalog.data?.find(
                    (opt) => opt.id === nextStatusId,
                  )?.code;
                  if (code && CLOSING_STATUS_CODES.includes(code)) {
                    if (!claims?.canCloseCases) {
                      setSaveError('Tu rol no tiene permiso para cerrar casos.');
                      return;
                    }
                    setSaveError(null);
                    setCloseDialog({
                      statusId: nextStatusId,
                      resolutionTypeId: c.resolutionTypeId ?? '',
                      resolutionNotes: c.resolutionNotes ?? '',
                    });
                    return;
                  }
                  updateMutation.mutate({ statusId: nextStatusId });
                }}
              >
                {(statusCatalog.data ?? []).map((opt) => (
                  <MenuItem key={opt.id} value={opt.id}>
                    {opt.labelEs}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 6, sm: 2 }}>
              <TextField
                select
                label="Prioridad"
                size="small"
                fullWidth
                value={c.priorityId}
                onChange={(e) =>
                  updateMutation.mutate({ priorityId: e.target.value })
                }
              >
                {(priorityCatalog.data ?? []).map((opt) => (
                  <MenuItem key={opt.id} value={opt.id}>
                    {opt.labelEs}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                Operador asignado
              </Typography>
              <Typography variant="body2">{assignedOperatorLabel}</Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                Creado · Última actualización
              </Typography>
              <Typography variant="body2">
                {new Date(c.createdAt).toLocaleString('es-AR')} · {new Date(c.updatedAt).toLocaleString('es-AR')}
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                Descripción inicial
              </Typography>
              <Typography variant="body2">{c.initialDescription || '—'}</Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                Síntomas
              </Typography>
              <Typography variant="body2">{c.patientSymptoms || '—'}</Typography>
            </Grid>
            {c.resolvedAt && (
              <>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    Resolución
                  </Typography>
                  <Typography variant="body2">
                    {labelFor(resolutionTypeCatalog.data, c.resolutionTypeId)}
                  </Typography>
                  <Typography variant="body2">{c.resolutionNotes}</Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    Resuelto · Cerrado
                  </Typography>
                  <Typography variant="body2">
                    {new Date(c.resolvedAt).toLocaleString('es-AR')}
                    {c.closedAt && ` · ${new Date(c.closedAt).toLocaleString('es-AR')}`}
                  </Typography>
                </Grid>
              </>
            )}
          </Grid>
        </CardContent>
      </Card>

      {memberQuery.data?.personId && (
        <ClinicalHistorySection
          personId={memberQuery.data.personId}
          caseId={c.id}
        />
      )}

      <CaseHistorySection caseId={c.id} memberId={c.memberId} />

      <Dialog open={!!closeDialog} onClose={() => setCloseDialog(null)} fullWidth maxWidth="sm">
        <DialogTitle>Cerrar caso</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField
            select
            label="Tipo de resolución"
            fullWidth
            value={closeDialog?.resolutionTypeId ?? ''}
            onChange={(e) =>
              setCloseDialog((d) => (d ? { ...d, resolutionTypeId: e.target.value } : d))
            }
          >
            {(resolutionTypeCatalog.data ?? []).map((opt) => (
              <MenuItem key={opt.id} value={opt.id}>
                {opt.labelEs}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Notas de resolución"
            fullWidth
            multiline
            minRows={3}
            required
            value={closeDialog?.resolutionNotes ?? ''}
            onChange={(e) =>
              setCloseDialog((d) => (d ? { ...d, resolutionNotes: e.target.value } : d))
            }
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCloseDialog(null)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={
              !closeDialog?.resolutionTypeId ||
              !closeDialog?.resolutionNotes.trim() ||
              updateMutation.isPending
            }
            onClick={() => {
              if (!closeDialog) return;
              updateMutation.mutate(closeDialog, {
                onSuccess: () => setCloseDialog(null),
              });
            }}
          >
            Confirmar cierre
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
