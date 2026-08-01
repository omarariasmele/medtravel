import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueryRunner } from 'typeorm';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';

import { AIChatMessage, AIProposalCandidate } from './ai-provider.interface';
import { OpenAIProvider } from './providers/openai.provider';

export const FALLBACK_ANSWER_HEALTH_CHAT =
  'El asistente de carga de ficha médica todavía no está configurado en este ambiente. ' +
  'Mientras tanto, podés cargar tus alergias y medicamentos manualmente desde "Salud".';

interface HealthChatOutcome {
  conversationId: string;
  reply: string;
  configured: boolean;
  proposals: Array<{
    id: string;
    proposalType: string;
    confidence: number;
    data: Record<string, unknown>;
  }>;
  limitReached?:
    'USER_DAILY' | 'PLATFORM_DAILY_BUDGET' | 'PLATFORM_MONTHLY_BUDGET';
}

@Injectable()
export class AIService {
  constructor(
    private readonly config: ConfigService,
    private readonly provider: OpenAIProvider,
    private readonly txManager: TenantTransactionManager,
  ) {}

  async healthChat(
    personId: string,
    conversationId: string | undefined,
    question: string,
  ): Promise<HealthChatOutcome> {
    if (!this.config.get<boolean>('AI_ENABLED')) {
      return {
        conversationId: conversationId ?? '',
        reply: FALLBACK_ANSWER_HEALTH_CHAT,
        configured: false,
        proposals: [],
      };
    }

    return this.txManager.runInTransaction(async (queryRunner) => {
      const convId =
        conversationId ?? (await this.startConversation(queryRunner, personId));

      const limitReached = await this.checkLimits(queryRunner, personId);
      if (limitReached) {
        return {
          conversationId: convId,
          reply: '',
          configured: true,
          proposals: [],
          limitReached,
        };
      }

      await this.insertMessage(queryRunner, {
        conversationId: convId,
        personId,
        sender: 'USER',
        message: question,
        provider: 'n/a',
        model: null,
      });

      const history = await this.loadHistory(queryRunner, convId);
      const result = await this.provider.chat(history);

      const [assistantMessageRow] = await this.insertMessage(queryRunner, {
        conversationId: convId,
        personId,
        sender: 'ASSISTANT',
        message: result.reply,
        provider: result.provider,
        model: result.model,
        tokensInput: result.tokensInput,
        tokensOutput: result.tokensOutput,
        estimatedCostUsd: result.estimatedCostUsd,
        processingMs: result.processingMs,
      });

      const proposalRows = await this.insertProposals(
        queryRunner,
        convId,
        assistantMessageRow.id,
        personId,
        result.proposals,
        result.provider,
        result.model,
      );

      return {
        conversationId: convId,
        reply: result.reply,
        configured: true,
        proposals: proposalRows,
      };
    });
  }

  /** Confirma una propuesta pendiente e inserta el registro clínico real (nunca antes de este paso). */
  async confirmProposal(personId: string, proposalId: string) {
    return this.txManager.runInTransaction(async (queryRunner) => {
      const [proposal] = await queryRunner.query(
        `SELECT id, proposal_type, json_data, status
         FROM ai.proposals
         WHERE id = $1 AND person_id = $2`,
        [proposalId, personId],
      );
      if (!proposal) {
        throw new BadRequestException('Propuesta no encontrada');
      }
      if (proposal.status !== 'PENDING_CONFIRMATION') {
        throw new BadRequestException('Esta propuesta ya fue procesada');
      }

      const data = proposal.json_data;
      let resultingId: string;
      let resultingTable: string;

      if (proposal.proposal_type === 'MEDICATION') {
        const [row] = await queryRunner.query(
          `INSERT INTO clinical.medications
             (person_id, generic_name, brand_name, is_current,
              canonical_status_id, confirmation_status_id, certification_status_id,
              provenance_id, ai_assisted, ai_completed_fields,
              member_confirmed, member_confirmed_at, requires_member_confirmation, notes)
           VALUES (
             $1, core.encrypt_pii($2), core.encrypt_pii($3), $4,
             params.catalog_id('CANONICAL_STATUS', 'PROVISIONAL'),
             params.catalog_id('CONFIRMATION_STATUS', 'MEMBER_CONFIRMED'),
             params.catalog_id('CERTIFICATION_STATUS', 'UNCERTIFIED'),
             params.catalog_id('PROVENANCE_TYPE', 'AI_ASSISTED'),
             TRUE, $5::jsonb, TRUE, NOW(), FALSE, core.encrypt_pii($6)
           )
           RETURNING id`,
          [
            personId,
            data.genericName,
            data.brandName ?? null,
            data.isCurrent ?? true,
            JSON.stringify(data),
            data.notes ?? null,
          ],
        );
        resultingId = row.id;
        resultingTable = 'clinical.medications';
      } else {
        const [row] = await queryRunner.query(
          `INSERT INTO clinical.allergies
             (person_id, allergen_name, allergen_type_id, severity_id,
              canonical_status_id, confirmation_status_id, certification_status_id,
              provenance_id, ai_assisted, ai_completed_fields,
              member_confirmed, member_confirmed_at, requires_member_confirmation, notes)
           VALUES (
             $1, core.encrypt_pii($2),
             params.catalog_id('ALLERGEN_TYPE', $3),
             params.catalog_id('REACTION_SEVERITY', $4),
             params.catalog_id('CANONICAL_STATUS', 'PROVISIONAL'),
             params.catalog_id('CONFIRMATION_STATUS', 'MEMBER_CONFIRMED'),
             params.catalog_id('CERTIFICATION_STATUS', 'UNCERTIFIED'),
             params.catalog_id('PROVENANCE_TYPE', 'AI_ASSISTED'),
             TRUE, $5::jsonb, TRUE, NOW(), FALSE, core.encrypt_pii($6)
           )
           RETURNING id`,
          [
            personId,
            data.allergenName,
            data.allergenType,
            data.severity,
            JSON.stringify(data),
            data.notes ?? null,
          ],
        );
        resultingId = row.id;
        resultingTable = 'clinical.allergies';
      }

      await queryRunner.query(
        `UPDATE ai.proposals
         SET status = 'CONFIRMED', confirmed_at = NOW(),
             resulting_record_id = $2, resulting_record_table = $3
         WHERE id = $1`,
        [proposalId, resultingId, resultingTable],
      );

      return { resultingId, resultingTable };
    });
  }

  async rejectProposal(personId: string, proposalId: string) {
    return this.txManager.runInTransaction(async (queryRunner) => {
      const result = await queryRunner.query(
        `UPDATE ai.proposals
         SET status = 'REJECTED', rejected_at = NOW()
         WHERE id = $1 AND person_id = $2 AND status = 'PENDING_CONFIRMATION'
         RETURNING id`,
        [proposalId, personId],
      );
      if (result.length === 0) {
        throw new BadRequestException('Propuesta no encontrada o ya procesada');
      }
      return { id: proposalId };
    });
  }

  private async startConversation(
    queryRunner: QueryRunner,
    personId: string,
  ): Promise<string> {
    const [row] = await queryRunner.query(
      `INSERT INTO ai.conversations (person_id, conversation_type)
       VALUES ($1, 'HEALTH_DATA_CAPTURE')
       RETURNING id`,
      [personId],
    );
    return row.id;
  }

  private async loadHistory(
    queryRunner: QueryRunner,
    conversationId: string,
  ): Promise<AIChatMessage[]> {
    const rows = await queryRunner.query(
      `SELECT sender, core.decrypt_pii(message) AS message
       FROM ai.messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC`,
      [conversationId],
    );
    return rows.map((r: { sender: string; message: string }) => ({
      role: r.sender === 'USER' ? 'user' : 'assistant',
      content: r.message,
    }));
  }

  private async insertMessage(
    queryRunner: QueryRunner,
    params: {
      conversationId: string;
      personId: string;
      sender: 'USER' | 'ASSISTANT';
      message: string;
      provider: string;
      model: string | null;
      tokensInput?: number;
      tokensOutput?: number;
      estimatedCostUsd?: number;
      processingMs?: number;
    },
  ) {
    return queryRunner.query(
      `INSERT INTO ai.messages
         (conversation_id, person_id, sender, message, provider, model,
          tokens_input, tokens_output, estimated_cost_usd, processing_ms)
       VALUES ($1, $2, $3, core.encrypt_pii($4), $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        params.conversationId,
        params.personId,
        params.sender,
        params.message,
        params.provider,
        params.model,
        params.tokensInput ?? null,
        params.tokensOutput ?? null,
        params.estimatedCostUsd ?? null,
        params.processingMs ?? null,
      ],
    );
  }

  private async insertProposals(
    queryRunner: QueryRunner,
    conversationId: string,
    messageId: string,
    personId: string,
    proposals: AIProposalCandidate[],
    provider: string,
    model: string,
  ) {
    const rows: Array<{
      id: string;
      proposalType: string;
      confidence: number;
      data: Record<string, unknown>;
    }> = [];
    for (const proposal of proposals) {
      const [row] = await queryRunner.query(
        `INSERT INTO ai.proposals
           (conversation_id, message_id, person_id, proposal_type, confidence, json_data, provider, model)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
         RETURNING id`,
        [
          conversationId,
          messageId,
          personId,
          proposal.proposalType,
          proposal.confidence,
          JSON.stringify(proposal.data),
          provider,
          model,
        ],
      );
      rows.push({
        id: row.id,
        proposalType: proposal.proposalType,
        confidence: proposal.confidence,
        data: proposal.data as unknown as Record<string, unknown>,
      });
    }
    return rows;
  }

  private async checkLimits(
    queryRunner: QueryRunner,
    personId: string,
  ): Promise<HealthChatOutcome['limitReached']> {
    const maxPerUserDay =
      this.config.get<number>('AI_MAX_REQUESTS_PER_USER_DAY') ?? 10;
    const [{ count }] = await queryRunner.query(
      `SELECT COUNT(*)::int AS count
       FROM ai.messages
       WHERE person_id = $1 AND sender = 'USER' AND created_at >= date_trunc('day', now())`,
      [personId],
    );
    if (count >= maxPerUserDay) {
      return 'USER_DAILY';
    }

    const [{ cost_today, cost_this_month }] = await queryRunner.query(
      `SELECT * FROM ai.get_consumption_totals()`,
    );
    const dailyBudget = this.config.get<number>('AI_DAILY_BUDGET_USD') ?? 1;
    const monthlyBudget =
      this.config.get<number>('AI_MONTHLY_BUDGET_USD') ?? 10;
    if (Number(cost_today) >= dailyBudget) {
      return 'PLATFORM_DAILY_BUDGET';
    }
    if (Number(cost_this_month) >= monthlyBudget) {
      return 'PLATFORM_MONTHLY_BUDGET';
    }
    return undefined;
  }
}
