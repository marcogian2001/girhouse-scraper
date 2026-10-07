import { describe, expect, it } from 'vitest';
import { CampaignSettingsValidation } from './CampaignValidation';

const settings = {
  name: 'Spring outreach',
  emailCount: 2,
  delaysDays: [3, 0],
};

describe('Campaign validation', () => {
  describe('Copywriting model', () => {
    it('defaults to Claude Opus 5 when none is chosen', () => {
      expect(CampaignSettingsValidation.parse(settings).copywritingModel).toBe('claude-opus-5');
    });

    it('accepts an OpenAI model', () => {
      const parsed = CampaignSettingsValidation.parse({
        ...settings,
        copywritingModel: 'gpt-6-luna',
      });

      expect(parsed.copywritingModel).toBe('gpt-6-luna');
    });

    it('rejects a model that is not offered', () => {
      const parsed = CampaignSettingsValidation.safeParse({
        ...settings,
        copywritingModel: 'gpt-4o',
      });

      expect(parsed.success).toBeFalsy();
    });
  });

  describe('Copywriting effort', () => {
    it('defaults to high reasoning when none is chosen', () => {
      expect(CampaignSettingsValidation.parse(settings).copywritingEffort).toBe('high');
    });

    it('rejects a level above high', () => {
      const parsed = CampaignSettingsValidation.safeParse({
        ...settings,
        copywritingEffort: 'max',
      });

      expect(parsed.success).toBeFalsy();
    });
  });

  describe('Batch mode', () => {
    it('defaults to writing through the batch API', () => {
      expect(CampaignSettingsValidation.parse(settings).copywritingBatch).toBeTruthy();
    });
  });
});

describe('Campaign budget input', () => {
  const budgetSettings = { name: 'Test', emailCount: 1, delaysDays: [0] };

  it.each([undefined, null, 0.01, 25, 2000])(
    'accepts an optional budget of %s USD',
    (budgetUsd) => {
      expect(
        CampaignSettingsValidation.safeParse({ ...budgetSettings, budgetUsd }).success,
      ).toBeTruthy();
    },
  );

  it.each([0, -1, 2001, 0.001, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid budget %s',
    (budgetUsd) => {
      expect(
        CampaignSettingsValidation.safeParse({ ...budgetSettings, budgetUsd }).success,
      ).toBeFalsy();
    },
  );
});
