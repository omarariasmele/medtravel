import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';

import { ConfigAccessGuard } from '@common/auth/config-access.guard';
import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';

interface SummaryRow {
  cost_today: string;
  cost_this_month: string;
  messages_today: string;
  messages_this_month: string;
  active_conversations_today: string;
  proposals_pending: string;
  proposals_confirmed: string;
}

interface TopUserRow {
  person_id: string;
  first_name: string;
  last_name: string;
  message_count: string;
  tokens_input: string;
  tokens_output: string;
  cost_usd: string;
}

interface DailyTrendRow {
  day: string;
  cost_usd: string;
  message_count: string;
}

interface ModelComparisonRow {
  intake_model: string;
  conversations: string;
  messages: string;
  tokens_input: string;
  tokens_output: string;
  cost_usd: string;
  avg_cost_per_conversation: string;
}

/**
 * Dashboard de consumo/costo de IA (plataforma completa, no por
 * tenant — el gasto de OpenAI es un costo único de la operación, no
 * algo que se factura por empresa) — pedido explícito del usuario.
 * Gateado con ConfigAccessGuard: son datos financieros, mismo criterio
 * que el resto de la configuración de plataforma.
 */
@ApiTags('operations/ai-consumption')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), ConfigAccessGuard)
@Controller('operations/ai-consumption')
export class AiConsumptionController {
  constructor(
    private readonly txManager: TenantTransactionManager,
    private readonly config: ConfigService,
  ) {}

  @Get('summary')
  async summary() {
    const [row]: SummaryRow[] = await this.txManager.runInTransaction((queryRunner) =>
      queryRunner.query(`SELECT * FROM ai.get_platform_summary()`),
    );
    return {
      costToday: Number(row.cost_today),
      costThisMonth: Number(row.cost_this_month),
      messagesToday: Number(row.messages_today),
      messagesThisMonth: Number(row.messages_this_month),
      activeConversationsToday: Number(row.active_conversations_today),
      proposalsPending: Number(row.proposals_pending),
      proposalsConfirmed: Number(row.proposals_confirmed),
      dailyBudgetUsd: this.config.get<number>('AI_DAILY_BUDGET_USD') ?? 1,
      monthlyBudgetUsd: this.config.get<number>('AI_MONTHLY_BUDGET_USD') ?? 10,
      aiEnabled: this.config.get<boolean>('AI_ENABLED') ?? false,
    };
  }

  @Get('top-users')
  async topUsers(@Query('days') days?: string) {
    const rows: TopUserRow[] = await this.txManager.runInTransaction((queryRunner) =>
      queryRunner.query(`SELECT * FROM ai.get_top_users($1, $2)`, [Number(days) || 30, 20]),
    );
    return rows.map((r) => ({
      personId: r.person_id,
      fullName: `${r.first_name} ${r.last_name}`.trim(),
      messageCount: Number(r.message_count),
      tokensInput: Number(r.tokens_input),
      tokensOutput: Number(r.tokens_output),
      costUsd: Number(r.cost_usd),
    }));
  }

  @Get('daily-trend')
  async dailyTrend(@Query('days') days?: string) {
    const rows: DailyTrendRow[] = await this.txManager.runInTransaction((queryRunner) =>
      queryRunner.query(`SELECT * FROM ai.get_daily_trend($1)`, [Number(days) || 14]),
    );
    return rows.map((r) => ({
      day: r.day,
      costUsd: Number(r.cost_usd),
      messageCount: Number(r.message_count),
    }));
  }

  /**
   * Pedido explícito del usuario: comparar costo real entre el modelo
   * Clásico y el Estructurado (ver AIService.structuredIntakeChat) para
   * decidir cuál conviene después de probar ambos en una demo.
   */
  @Get('model-comparison')
  async modelComparison(@Query('days') days?: string) {
    const rows: ModelComparisonRow[] = await this.txManager.runInTransaction((queryRunner) =>
      queryRunner.query(`SELECT * FROM ai.get_intake_model_comparison($1)`, [Number(days) || 30]),
    );
    return rows.map((r) => ({
      intakeModel: r.intake_model,
      conversations: Number(r.conversations),
      messages: Number(r.messages),
      tokensInput: Number(r.tokens_input),
      tokensOutput: Number(r.tokens_output),
      costUsd: Number(r.cost_usd),
      avgCostPerConversation: Number(r.avg_cost_per_conversation),
    }));
  }
}
