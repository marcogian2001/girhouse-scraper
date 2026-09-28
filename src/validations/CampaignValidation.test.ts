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
});
