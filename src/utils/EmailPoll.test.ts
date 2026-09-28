import { describe, expect, it } from 'vitest';
import { buildBallot, scoreStats, seededShuffle, summarizeByModel } from './EmailPoll';

const emails = [{ stepIndex: 1, subject: 'Hello', body: 'Body' }];

const items = [
  { id: 'a', groupKey: 'x@example.com', groupLabel: 'Acme', model: 'gpt-6-sol', costMicros: 900 },
  {
    id: 'b',
    groupKey: 'x@example.com',
    groupLabel: 'Acme',
    model: 'claude-opus-5-5',
    costMicros: 3000,
  },
  { id: 'c', groupKey: 'y@example.com', groupLabel: 'Beta', model: 'gpt-6-sol', costMicros: 1100 },
].map((item) => ({ ...item, emails }));

describe('Email poll', () => {
  describe('Seeded shuffle', () => {
    const list = Array.from({ length: 10 }, (_, index) => ({ id: String(index) }));

    it('returns the same order for the same seed', () => {
      expect(seededShuffle(list, 'voter-1')).toStrictEqual(seededShuffle(list, 'voter-1'));
    });

    it('returns a different order for another seed', () => {
      expect(seededShuffle(list, 'voter-1')).not.toStrictEqual(seededShuffle(list, 'voter-2'));
    });

    it('keeps every item', () => {
      const ids = seededShuffle(list, 'voter-1').map((item) => item.id);

      expect(ids.toSorted()).toStrictEqual(list.map((item) => item.id));
    });
  });

  describe('Ballot', () => {
    it('groups sequences by recipient', () => {
      const ballot = buildBallot({
        poll: { showModel: false, showCost: false },
        items,
        scores: new Map(),
        voterHash: 'voter',
      });

      expect(ballot.map((group) => [group.label, group.variants.length])).toStrictEqual([
        ['Acme', 2],
        ['Beta', 1],
      ]);
    });

    it('leaves out model and cost when the poll hides them', () => {
      const ballot = buildBallot({
        poll: { showModel: false, showCost: false },
        items,
        scores: new Map(),
        voterHash: 'voter',
      });
      const variants = ballot.flatMap((group) => group.variants);

      expect(variants.some((variant) => 'model' in variant || 'costMicros' in variant)).toBeFalsy();
      expect(JSON.stringify(ballot)).not.toMatch(/gpt|claude/iu);
    });

    it('includes model label and cost when the poll shows them', () => {
      const ballot = buildBallot({
        poll: { showModel: true, showCost: true },
        items,
        scores: new Map(),
        voterHash: 'voter',
      });

      expect(ballot[1]?.variants[0]).toMatchObject({ model: 'GPT-6 Sol', costMicros: 1100 });
    });

    it('attaches the scores the voter already gave', () => {
      const ballot = buildBallot({
        poll: { showModel: false, showCost: false },
        items,
        scores: new Map([['c', 8]]),
        voterHash: 'voter',
      });

      expect(ballot[1]?.variants[0]?.score).toBe(8);
    });
  });

  describe('Score stats', () => {
    it('computes mean and sample deviation', () => {
      expect(scoreStats([6, 8, 10])).toStrictEqual({ count: 3, average: 8, stdDev: 2 });
    });

    it('returns nulls without scores', () => {
      expect(scoreStats([])).toStrictEqual({ count: 0, average: null, stdDev: null });
    });
  });

  describe('Model summary', () => {
    it('ranks models by average score', () => {
      const summary = summarizeByModel({
        items,
        votes: [
          { itemId: 'a', score: 4 },
          { itemId: 'c', score: 6 },
          { itemId: 'b', score: 9 },
        ],
      });

      expect(summary.map((row) => [row.model, row.average, row.averageCostMicros])).toStrictEqual([
        ['claude-opus-5-5', 9, 3000],
        ['gpt-6-sol', 5, 1000],
      ]);
    });
  });
});
