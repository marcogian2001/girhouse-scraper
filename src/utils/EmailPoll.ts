import { createHash } from 'node:crypto';
import type { EmailPollEmail } from '@/models/Schema';
import { findCopywritingModel } from '@/utils/CopywritingModels';

/** What the poll stores about one sequence, as read back for display. */
type PollItem = {
  id: string;
  groupKey: string;
  groupLabel: string;
  model: string;
  costMicros: number;
  emails: EmailPollEmail[];
};

/** One sequence as a voter sees it. Model and cost are only present when the poll shows them. */
export type BallotVariant = {
  id: string;
  letter: string;
  emails: EmailPollEmail[];
  score: number | null;
  model?: string;
  costMicros?: number;
};

/** Every sequence written for one recipient. */
export type BallotGroup = {
  id: string;
  label: string;
  variants: BallotVariant[];
};

/**
 * Shuffles a list the same way every time for the same seed, by sorting on a
 * hash of the seed and each item id.
 * @param items The list to shuffle, left untouched.
 * @param seed Any string; equal seeds give equal orders.
 * @returns A shuffled copy.
 */
export const seededShuffle = <T extends { id: string }>(items: readonly T[], seed: string) => {
  const rank = new Map(
    items.map((item) => [item.id, createHash('sha256').update(`${seed}:${item.id}`).digest('hex')]),
  );

  return items.toSorted((a, b) => (rank.get(a.id) ?? '').localeCompare(rank.get(b.id) ?? ''));
};

/**
 * Names a model for display, falling back to its id when it is no longer offered.
 * @param id The copywriting model id.
 * @returns The model label.
 */
export const modelLabel = (id: string) => findCopywritingModel(id)?.label ?? id;

/**
 * Lays out a poll for one voter: sequences grouped by recipient, in an order
 * of their own, with model and cost left out unless the poll shows them.
 * @param options The ballot options.
 * @param options.poll The poll visibility settings.
 * @param options.poll.showModel Whether voters may see which model wrote each sequence.
 * @param options.poll.showCost Whether voters may see what each sequence cost.
 * @param options.items The poll sequences, in the order they were added.
 * @param options.scores The voter's scores by item id.
 * @param options.voterHash The voter's hash, which seeds their order.
 * @returns One group per recipient, in the order they first appear.
 */
export const buildBallot = (options: {
  poll: { showModel: boolean; showCost: boolean };
  items: PollItem[];
  scores: Map<string, number>;
  voterHash: string;
}) => {
  const groups = Map.groupBy(options.items, (item) => item.groupKey);

  return [...groups.entries()].map(([key, items]): BallotGroup => {
    const shuffled = seededShuffle(items, `${options.voterHash}:${key}`);

    return {
      // The first item id, so the recipient's email never reaches the browser
      id: items[0]?.id ?? key,
      label: items[0]?.groupLabel ?? key,
      variants: shuffled.map((item, index) => ({
        id: item.id,
        letter: String.fromCodePoint(65 + index),
        emails: item.emails,
        score: options.scores.get(item.id) ?? null,
        // Left out entirely rather than blanked, so nothing reaches the browser
        ...(options.poll.showModel ? { model: modelLabel(item.model) } : {}),
        ...(options.poll.showCost ? { costMicros: item.costMicros } : {}),
      })),
    };
  });
};

/**
 * Summarizes a set of scores.
 * @param scores The scores, from 1 to 10.
 * @returns The count, mean and sample standard deviation, null when undefined.
 */
export const scoreStats = (scores: number[]) => {
  const count = scores.length;

  if (count === 0) {
    return { count, average: null, stdDev: null };
  }

  const average = scores.reduce((sum, score) => sum + score, 0) / count;
  const variance =
    count > 1 ? scores.reduce((sum, score) => sum + (score - average) ** 2, 0) / (count - 1) : null;

  return { count, average, stdDev: variance === null ? null : Math.sqrt(variance) };
};

/**
 * Ranks the models of a poll by their average score.
 * @param options The summary options.
 * @param options.items The poll sequences.
 * @param options.votes Every vote cast in the poll.
 * @returns One row per model, best average first, unvoted models last.
 */
export const summarizeByModel = (options: {
  items: Pick<PollItem, 'id' | 'model' | 'costMicros'>[];
  votes: { itemId: string; score: number }[];
}) => {
  const byModel = Map.groupBy(options.items, (item) => item.model);

  return [...byModel.entries()]
    .map(([model, items]) => {
      const ids = new Set(items.map((item) => item.id));
      const scores = options.votes.filter((vote) => ids.has(vote.itemId)).map((vote) => vote.score);

      return {
        model,
        sequences: items.length,
        averageCostMicros: items.reduce((sum, item) => sum + item.costMicros, 0) / items.length,
        ...scoreStats(scores),
      };
    })
    .toSorted((a, b) => (b.average ?? -1) - (a.average ?? -1));
};
