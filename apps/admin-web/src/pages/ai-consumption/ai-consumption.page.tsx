import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Grid,
  LinearProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';

import { apiClient } from '../../lib/api-client';
import { PaginationFooter, usePagination } from '../../lib/pagination';

interface Summary {
  costToday: number;
  costThisMonth: number;
  messagesToday: number;
  messagesThisMonth: number;
  activeConversationsToday: number;
  proposalsPending: number;
  proposalsConfirmed: number;
  dailyBudgetUsd: number;
  monthlyBudgetUsd: number;
  aiEnabled: boolean;
}

interface TopUser {
  personId: string;
  fullName: string;
  messageCount: number;
  tokensInput: number;
  tokensOutput: number;
  costUsd: number;
}

interface DailyTrendPoint {
  day: string;
  costUsd: number;
  messageCount: number;
}

const usd = (n: number) => `USD ${n.toFixed(4)}`;

function SummaryCard({
  label,
  value,
  secondary,
}: {
  label: string;
  value: string;
  secondary?: string;
}) {
  return (
    <Card>
      <CardContent>
        <Typography variant="overline" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="h5">{value}</Typography>
        {secondary && (
          <Typography variant="body2" color="text.secondary">
            {secondary}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

function BudgetBar({ used, budget, label }: { used: number; budget: number; label: string }) {
  const pct = budget > 0 ? Math.min(100, (used / budget) * 100) : 0;
  return (
    <Box sx={{ mb: 1.5 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Typography variant="body2">{label}</Typography>
        <Typography variant="body2" color="text.secondary">
          {usd(used)} / {usd(budget)}
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={pct}
        color={pct >= 100 ? 'error' : pct >= 80 ? 'warning' : 'primary'}
        sx={{ height: 8, borderRadius: 1 }}
      />
    </Box>
  );
}

function DailyTrendChart({ points }: { points: DailyTrendPoint[] }) {
  const max = Math.max(0.0001, ...points.map((p) => p.costUsd));
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 140, mt: 2 }}>
      {points.map((p) => (
        <Tooltip
          key={p.day}
          title={`${new Date(p.day).toLocaleDateString('es-AR')}: ${usd(p.costUsd)} · ${p.messageCount} mensajes`}
        >
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Box
              sx={{
                width: '100%',
                maxWidth: 28,
                height: `${Math.max(2, (p.costUsd / max) * 100)}px`,
                bgcolor: 'primary.main',
                borderRadius: '2px 2px 0 0',
              }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
              {new Date(p.day).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}
            </Typography>
          </Box>
        </Tooltip>
      ))}
    </Box>
  );
}

/**
 * Monitoreo de consumo/costo de IA — pedido explícito del usuario:
 * "ir monitoreando el consumo de agentes de IA en costos o token...
 * poder tener consumo por usuario activo... veremos un promedio de
 * consumo quien consumió más que otro". Solo visible para
 * canManageConfig (ver app-layout.tsx) — son datos financieros de
 * plataforma, no por empresa.
 */
export function AiConsumptionPage() {
  const summaryQuery = useQuery({
    queryKey: ['operations', 'ai-consumption', 'summary'],
    queryFn: async () => {
      const { data } = await apiClient.get<Summary>('/operations/ai-consumption/summary');
      return data;
    },
    refetchInterval: 60_000,
  });

  const topUsersQuery = useQuery({
    queryKey: ['operations', 'ai-consumption', 'top-users'],
    queryFn: async () => {
      const { data } = await apiClient.get<TopUser[]>('/operations/ai-consumption/top-users?days=30');
      return data;
    },
  });

  const trendQuery = useQuery({
    queryKey: ['operations', 'ai-consumption', 'daily-trend'],
    queryFn: async () => {
      const { data } = await apiClient.get<DailyTrendPoint[]>('/operations/ai-consumption/daily-trend?days=14');
      return data;
    },
  });

  const s = summaryQuery.data;

  const { pageRows: topUsersPageRows, page: topUsersPage, setPage: setTopUsersPage, totalCount: topUsersTotalCount } =
    usePagination(topUsersQuery.data ?? []);

  return (
    <>
      <Typography variant="h4" gutterBottom>
        Consumo de IA
      </Typography>

      {summaryQuery.isLoading && <CircularProgress size={24} />}
      {summaryQuery.isError && <Alert severity="error">No se pudo cargar el resumen de consumo.</Alert>}

      {s && !s.aiEnabled && (
        <Alert severity="info" sx={{ mb: 2 }}>
          El asistente de IA (OpenAI) todavía no está activado en este ambiente (AI_ENABLED=false) —
          los números de abajo van a quedar en cero hasta que se active.
        </Alert>
      )}

      {s && (
        <>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <SummaryCard label="Costo hoy" value={usd(s.costToday)} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <SummaryCard label="Costo este mes" value={usd(s.costThisMonth)} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <SummaryCard
                label="Mensajes hoy"
                value={String(s.messagesToday)}
                secondary={`${s.activeConversationsToday} conversaciones activas`}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <SummaryCard
                label="Propuestas de IA"
                value={`${s.proposalsConfirmed} confirmadas`}
                secondary={`${s.proposalsPending} pendientes de revisión`}
              />
            </Grid>
          </Grid>

          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Card>
                <CardContent>
                  <Typography variant="subtitle1" gutterBottom>
                    Presupuesto
                  </Typography>
                  <BudgetBar used={s.costToday} budget={s.dailyBudgetUsd} label="Diario" />
                  <BudgetBar used={s.costThisMonth} budget={s.monthlyBudgetUsd} label="Mensual" />
                  <Typography variant="caption" color="text.secondary">
                    Al llegar al 100% el asistente deja de responder hasta el próximo período
                    (AI_DAILY_BUDGET_USD / AI_MONTHLY_BUDGET_USD).
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Card>
                <CardContent>
                  <Typography variant="subtitle1">Últimos 14 días</Typography>
                  {trendQuery.data && trendQuery.data.length > 0 ? (
                    <DailyTrendChart points={trendQuery.data} />
                  ) : (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                      Sin datos todavía.
                    </Typography>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </>
      )}

      <Typography variant="h6" gutterBottom>
        Consumo por viajero (últimos 30 días)
      </Typography>
      {topUsersQuery.isLoading && <CircularProgress size={24} />}
      {topUsersQuery.data && topUsersQuery.data.length === 0 && (
        <Alert severity="info">Todavía no hay uso del asistente para mostrar.</Alert>
      )}
      {topUsersQuery.data && topUsersQuery.data.length > 0 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Viajero</TableCell>
                <TableCell align="right">Mensajes</TableCell>
                <TableCell align="right">Tokens entrada</TableCell>
                <TableCell align="right">Tokens salida</TableCell>
                <TableCell align="right">Costo</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {topUsersPageRows.map((u) => (
                <TableRow key={u.personId}>
                  <TableCell>{u.fullName}</TableCell>
                  <TableCell align="right">{u.messageCount}</TableCell>
                  <TableCell align="right">{u.tokensInput.toLocaleString('es-AR')}</TableCell>
                  <TableCell align="right">{u.tokensOutput.toLocaleString('es-AR')}</TableCell>
                  <TableCell align="right">{usd(u.costUsd)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <PaginationFooter page={topUsersPage} totalCount={topUsersTotalCount} onPageChange={setTopUsersPage} />
        </TableContainer>
      )}
    </>
  );
}
