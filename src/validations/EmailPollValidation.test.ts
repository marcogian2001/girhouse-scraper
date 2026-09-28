import { describe, expect, it } from 'vitest';
import { EmailPollValidation, EmailPollVoteValidation } from './EmailPollValidation';

const itemId = '6f1c2a3b-4d5e-4f60-8a1b-2c3d4e5f6a7b';

describe('Email poll validation', () => {
  describe('Vote', () => {
    it('accepts a whole score from 1 to 10', () => {
      expect(EmailPollVoteValidation.safeParse({ itemId, score: 10 }).success).toBeTruthy();
    });

    it('rejects a score out of range', () => {
      expect(EmailPollVoteValidation.safeParse({ itemId, score: 11 }).success).toBeFalsy();
    });

    it('rejects a fractional score', () => {
      expect(EmailPollVoteValidation.safeParse({ itemId, score: 7.5 }).success).toBeFalsy();
    });
  });

  describe('Poll', () => {
    it('rejects a poll without campaigns', () => {
      const parsed = EmailPollValidation.safeParse({
        name: 'Model test',
        campaignIds: [],
        contactsPerCampaign: 2,
      });

      expect(parsed.success).toBeFalsy();
    });
  });
});
