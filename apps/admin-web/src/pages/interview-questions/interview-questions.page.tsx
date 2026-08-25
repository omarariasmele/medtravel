import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Grid,
  MenuItem,
  Paper,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';

import { apiClient } from '../../lib/api-client';
import { usePageTitle } from '../../lib/page-title';
import { PaginationFooter, usePagination } from '../../lib/pagination';

type ProposalType = 'MEDICATION' | 'ALLERGY' | 'CONDITION' | 'SURGERY' | 'IMPLANT_DEVICE' | 'TREATMENT';

const PROPOSAL_TYPE_LABEL: Record<ProposalType, string> = {
  MEDICATION: 'Medicamento',
  ALLERGY: 'Alergia',
  CONDITION: 'Enfermedad / condición',
  SURGERY: 'Cirugía',
  IMPLANT_DEVICE: 'Implante / dispositivo',
  TREATMENT: 'Tratamiento',
};

interface InterviewQuestion {
  id: string;
  code: string;
  groupLabel: string;
  questionText: string;
  freeTextEnabled: boolean;
  options: string[] | null;
  asksDate: boolean;
  proposalType: ProposalType;
  catalogDomainCode: string | null;
  conditionLabel: string | null;
  displayOrder: number;
  active: boolean;
}

interface FormState {
  code: string;
  groupLabel: string;
  questionText: string;
  freeTextEnabled: boolean;
  optionsEnabled: boolean;
  options: string[];
  asksDate: boolean;
  proposalType: ProposalType;
  catalogDomainCode: string;
  conditionLabel: string;
  displayOrder: string;
  active: boolean;
}

const EMPTY_FORM: FormState = {
  code: '',
  groupLabel: 'Antecedentes',
  questionText: '',
  freeTextEnabled: true,
  optionsEnabled: false,
  options: ['', '', '', '', ''],
  asksDate: true,
  proposalType: 'CONDITION',
  catalogDomainCode: 'CONDITION_CATALOG',
  conditionLabel: '',
  displayOrder: '0',
  active: true,
};

function toFormState(q: InterviewQuestion): FormState {
  const opts = q.options ?? [];
  return {
    code: q.code,
    groupLabel: q.groupLabel,
    questionText: q.questionText,
    freeTextEnabled: q.freeTextEnabled,
    optionsEnabled: opts.length > 0,
    options: [...opts, '', '', '', '', ''].slice(0, 5),
    asksDate: q.asksDate,
    proposalType: q.proposalType,
    catalogDomainCode: q.catalogDomainCode ?? '',
    conditionLabel: q.conditionLabel ?? '',
    displayOrder: String(q.displayOrder),
    active: q.active,
  };
}

function toPayload(f: FormState) {
  return {
    code: f.code.trim().toUpperCase().replace(/\s+/g, '_'),
    groupLabel: f.groupLabel.trim(),
    questionText: f.questionText.trim(),
    freeTextEnabled: f.freeTextEnabled,
    options: f.optionsEnabled ? f.options.map((o) => o.trim()).filter(Boolean) : null,
    asksDate: f.asksDate,
    proposalType: f.proposalType,
    catalogDomainCode: f.catalogDomainCode.trim() || undefined,
    conditionLabel: f.conditionLabel.trim() || undefined,
    displayOrder: Number(f.displayOrder) || 0,
    active: f.active,
  };
}

/**
 * Guion del modelo Estructurado (segundo modelo de carga de Ficha de
 * Salud, ver AIService.structuredIntakeChat) — pedido explícito del
 * usuario: poder cambiar/agregar preguntas sin tocar código. Mismo
 * patrón que catalogs-admin.page.tsx (tabla + diálogo de alta/edición),
 * gateado por ConfigAccessGuard en /ai/admin/interview-questions.
 * Nunca se borra una pregunta — se desactiva (switch "Activa").
 */
export function InterviewQuestionsPage() {
  usePageTitle('Preguntas del asistente (modelo Estructurado)');
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ['ai', 'interview-questions'],
    queryFn: async () => {
      const { data } = await apiClient.get<InterviewQuestion[]>(
        '/ai/admin/interview-questions',
        { params: { limit: 500 } },
      );
      return data;
    },
  });

  const sortedQuestions = (listQuery.data ?? [])
    .slice()
    .sort((a, b) => a.displayOrder - b.displayOrder);
  const { pageRows, page, setPage, totalCount } = usePagination(sortedQuestions);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      ...EMPTY_FORM,
      displayOrder: String((sortedQuestions.at(-1)?.displayOrder ?? 0) + 10),
    });
    setError(null);
    setDialogOpen(true);
  };

  const openEdit = (q: InterviewQuestion) => {
    setEditingId(q.id);
    setForm(toFormState(q));
    setError(null);
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = toPayload(form);
      if (editingId) {
        const { data } = await apiClient.patch(`/ai/admin/interview-questions/${editingId}`, payload);
        return data;
      }
      const { data } = await apiClient.post('/ai/admin/interview-questions', payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai', 'interview-questions'] });
      setDialogOpen(false);
    },
    onError: () => setError('No se pudo guardar (¿código repetido?).'),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async (q: InterviewQuestion) => {
      const { data } = await apiClient.patch(`/ai/admin/interview-questions/${q.id}`, {
        active: !q.active,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai', 'interview-questions'] });
    },
  });

  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Guion del modelo Estructurado de carga de Ficha de Salud — desactivá una
        pregunta para que el asistente deje de hacerla, o agregá una nueva. No afecta
        al modelo Clásico (conversacional).
      </Typography>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Button variant="contained" onClick={openCreate}>
          Agregar pregunta
        </Button>
      </Box>

      {listQuery.isLoading && <CircularProgress />}
      {listQuery.isError && <Alert severity="error">No se pudieron cargar las preguntas.</Alert>}
      {listQuery.data && listQuery.data.length === 0 && (
        <Alert severity="info">Todavía no hay preguntas configuradas.</Alert>
      )}

      {listQuery.data && listQuery.data.length > 0 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Orden</TableCell>
                <TableCell>Pregunta</TableCell>
                <TableCell>Grupo</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Texto libre</TableCell>
                <TableCell>Opciones</TableCell>
                <TableCell>Pide fecha</TableCell>
                <TableCell>Activa</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pageRows.map((q) => (
                <TableRow key={q.id} hover onClick={() => openEdit(q)} sx={{ cursor: 'pointer' }}>
                  <TableCell>{q.displayOrder}</TableCell>
                  <TableCell>{q.questionText}</TableCell>
                  <TableCell>{q.groupLabel}</TableCell>
                  <TableCell>
                    <Chip size="small" label={PROPOSAL_TYPE_LABEL[q.proposalType]} />
                  </TableCell>
                  <TableCell>{q.freeTextEnabled ? 'Sí' : 'No'}</TableCell>
                  <TableCell>{q.options?.length ? q.options.join(', ') : '—'}</TableCell>
                  <TableCell>{q.asksDate ? 'Sí' : 'No'}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Switch
                      size="small"
                      checked={q.active}
                      onChange={() => toggleActiveMutation.mutate(q)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <PaginationFooter page={page} totalCount={totalCount} onPageChange={setPage} />
        </TableContainer>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editingId ? 'Editar pregunta' : 'Agregar pregunta'}</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Grid container spacing={1}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Código"
                fullWidth
                margin="normal"
                value={form.code}
                disabled={!!editingId}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                helperText={editingId ? 'No se puede modificar' : 'Ej. CARDIOVASCULAR_DISEASE'}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Grupo"
                fullWidth
                margin="normal"
                value={form.groupLabel}
                onChange={(e) => setForm((f) => ({ ...f, groupLabel: e.target.value }))}
                helperText="Ej. Antecedentes, Medicamentos"
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                label="Pregunta"
                fullWidth
                multiline
                minRows={2}
                margin="normal"
                value={form.questionText}
                onChange={(e) => setForm((f) => ({ ...f, questionText: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                select
                label="Qué antecedente carga"
                fullWidth
                margin="normal"
                value={form.proposalType}
                onChange={(e) => setForm((f) => ({ ...f, proposalType: e.target.value as ProposalType }))}
              >
                {(Object.keys(PROPOSAL_TYPE_LABEL) as ProposalType[]).map((t) => (
                  <MenuItem key={t} value={t}>{PROPOSAL_TYPE_LABEL[t]}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Dominio de catálogo"
                fullWidth
                margin="normal"
                value={form.catalogDomainCode}
                onChange={(e) => setForm((f) => ({ ...f, catalogDomainCode: e.target.value }))}
                helperText="Ej. CONDITION_CATALOG, ALLERGEN, MEDICATION"
              />
            </Grid>
            {form.proposalType === 'CONDITION' && (
              <Grid size={{ xs: 12 }}>
                <TextField
                  label="Nombre de la enfermedad"
                  fullWidth
                  margin="normal"
                  value={form.conditionLabel}
                  onChange={(e) => setForm((f) => ({ ...f, conditionLabel: e.target.value }))}
                  helperText='Se usa como nombre del antecedente cuando el viajero confirma sin agregar ningún detalle propio (ej. "Gota" en vez de repetir la pregunta).'
                />
              </Grid>
            )}
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Orden"
                type="number"
                fullWidth
                margin="normal"
                value={form.displayOrder}
                onChange={(e) => setForm((f) => ({ ...f, displayOrder: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }} sx={{ display: 'flex', alignItems: 'center' }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={form.active}
                    onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                  />
                }
                label="Activa"
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={form.freeTextEnabled}
                    onChange={(e) => setForm((f) => ({ ...f, freeTextEnabled: e.target.checked }))}
                  />
                }
                label="Permite respuesta libre (texto o voz)"
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={form.asksDate}
                    onChange={(e) => setForm((f) => ({ ...f, asksDate: e.target.checked }))}
                  />
                }
                label="Pide fecha"
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={form.optionsEnabled}
                    onChange={(e) => setForm((f) => ({ ...f, optionsEnabled: e.target.checked }))}
                  />
                }
                label="Habilitar opciones (hasta 5)"
              />
            </Grid>
            {form.optionsEnabled &&
              form.options.map((opt, i) => (
                <Grid size={{ xs: 12, sm: 6 }} key={i}>
                  <TextField
                    label={`Opción ${i + 1}`}
                    fullWidth
                    margin="normal"
                    value={opt}
                    onChange={(e) =>
                      setForm((f) => {
                        const options = [...f.options];
                        options[i] = e.target.value;
                        return { ...f, options };
                      })
                    }
                  />
                </Grid>
              ))}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={!form.code.trim() || !form.questionText.trim() || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            Guardar
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
