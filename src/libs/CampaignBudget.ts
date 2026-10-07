import { eq } from 'drizzle-orm';
import { campaignSchema } from '@/models/Schema';
import type { WriteSequenceOptions } from '@/services/EmailPrompt';
import {
  buildCampaignBrief,
  buildContactPrompt,
  SYSTEM_INSTRUCTIONS,
} from '@/services/EmailPrompt';
import { findCopywritingModel } from '@/utils/CopywritingModels';
import { db } from './DB';

export class CampaignBudgetError extends Error {
  override name = 'CampaignBudgetError';
}

export type BudgetReservation = { operationId: string; amount: number };

/**
 * Reserves the whole group under one campaign lock before any request is sent.
 * @param options The campaign and planned operations.
 * @param options.campaignId The campaign to charge.
 * @param options.items The idempotent reservations, including every batch item.
 */
export const reserveCampaignBudget = async (options: {
  campaignId: string;
  items: BudgetReservation[];
}) => {
  await db.transaction(async (tx) => {
    const [campaign] = await tx
      .select()
      .from(campaignSchema)
      .where(eq(campaignSchema.id, options.campaignId))
      .for('update');
    if (!campaign) {
      throw new Error('Campaign no longer exists');
    }
    if (campaign.budgetMicros === null) {
      return;
    }
    if (campaign.budgetBlocked) {
      throw new CampaignBudgetError('Campaign budget is blocked; manual review required');
    }
    const operations = { ...campaign.budgetOperations };
    let committed = campaign.budgetCommittedMicros;
    for (const item of options.items) {
      if (!Number.isSafeInteger(item.amount) || item.amount < 0) {
        throw new CampaignBudgetError('Budget cannot price this operation');
      }
      if (operations[item.operationId]) {
        continue;
      }
      committed += item.amount;
      operations[item.operationId] = { amount: item.amount, settled: false };
    }
    if (committed > campaign.budgetMicros) {
      throw new CampaignBudgetError(
        'Campaign budget has insufficient available funds; processing stopped',
      );
    }
    await tx
      .update(campaignSchema)
      .set({ budgetOperations: operations, budgetCommittedMicros: committed })
      .where(eq(campaignSchema.id, campaign.id));
  });
};

/**
 * Replaces a reservation with recorded spend; unknown outcomes stay reserved.
 * @param options The completed operation and its recorded cost.
 * @param options.campaignId The owning campaign.
 * @param options.operationId The reservation to settle.
 * @param options.costMicros The recorded charge.
 */
export const settleCampaignBudget = async (options: {
  campaignId: string;
  operationId: string;
  costMicros: number;
}) => {
  await db.transaction(async (tx) => {
    const [campaign] = await tx
      .select()
      .from(campaignSchema)
      .where(eq(campaignSchema.id, options.campaignId))
      .for('update');
    const prior = campaign?.budgetOperations[options.operationId];
    if (!campaign || !prior || prior.settled) {
      return;
    }
    if (!Number.isSafeInteger(options.costMicros) || options.costMicros < 0) {
      throw new CampaignBudgetError('Invalid recorded cost; budget reservation retained');
    }
    await tx
      .update(campaignSchema)
      .set({
        budgetCommittedMicros: campaign.budgetCommittedMicros - prior.amount + options.costMicros,
        budgetOperations: {
          ...campaign.budgetOperations,
          [options.operationId]: { amount: options.costMicros, settled: true },
        },
      })
      .where(eq(campaignSchema.id, campaign.id));
  });
};

/**
 * Reserves text input conservatively and the full configured output allowance.
 * @param options The exact text sources for the generation.
 * @returns A conservative list-price estimate, not a provider billing guarantee.
 */
export const reserveSequenceMicros = (options: WriteSequenceOptions) => {
  if (options.campaign.budgetMicros === null) {
    return 0;
  }
  if (options.knowledgeAssets.some((asset) => asset.anthropicFileId ?? asset.openaiFileId)) {
    throw new CampaignBudgetError('Campaign budget cannot estimate PDF input; processing stopped');
  }
  const model = findCopywritingModel(options.campaign.copywritingModel);
  if (!model) {
    throw new CampaignBudgetError('Campaign budget cannot price this model');
  }
  const text = [SYSTEM_INSTRUCTIONS, buildCampaignBrief(options), buildContactPrompt(options)].join(
    '\n',
  );
  // One token per UTF-8 byte, plus formatting overhead; no cache/batch discount assumed.
  const inputAllowance = new TextEncoder().encode(text).length + 4096;
  return Math.ceil(inputAllowance * model.pricing.input * 2 + 16_000 * model.pricing.output);
};
