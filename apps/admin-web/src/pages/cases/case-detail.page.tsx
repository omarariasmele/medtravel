import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Grid,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';

import { apiClient } from '../../lib/api-client';
import { useCatalog } from '../../lib/catalog-hooks';
import { ClinicalHistorySection } from './clinical-history.section';

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
  resolutionNotes?: string;
  createdAt: string;
  updatedAt: string;
}

interface Member {
  id: string;
  personId: string;
}

export function CaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [saveError, setSaveError] = useState<string | null>(null);

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

      {saveError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {saveError}
        </Alert>
      )}

      <Card>
        <CardContent>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                select
                label="Estado"
                fullWidth
                value={c.statusId}
                onChange={(e) =>
                  updateMutation.mutate({ statusId: e.target.value })
                }
              >
                {(statusCatalog.data ?? []).map((opt) => (
                  <MenuItem key={opt.id} value={opt.id}>
                    {opt.labelEs}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                select
                label="Prioridad"
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
            <Grid size={{ xs: 12 }}>
              <TextField
                label="Descripción inicial"
                fullWidth
                multiline
                minRows={2}
                value={c.initialDescription ?? ''}
                slotProps={{ input: { readOnly: true } }}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                label="Síntomas"
                fullWidth
                multiline
                minRows={2}
                value={c.patientSymptoms ?? '—'}
                slotProps={{ input: { readOnly: true } }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Operador asignado"
                fullWidth
                value={c.assignedOperatorId ?? 'Sin asignar'}
                slotProps={{ input: { readOnly: true } }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="SLA (segundos)"
                fullWidth
                value={c.slaTargetSeconds ?? '—'}
                slotProps={{ input: { readOnly: true } }}
              />
            </Grid>
          </Grid>
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" color="text.secondary">
              Creado: {new Date(c.createdAt).toLocaleString('es-AR')} · Última
              actualización: {new Date(c.updatedAt).toLocaleString('es-AR')}
            </Typography>
          </Box>
        </CardContent>
      </Card>

      {memberQuery.data?.personId && (
        <ClinicalHistorySection
          personId={memberQuery.data.personId}
          caseId={c.id}
        />
      )}
    </>
  );
}
