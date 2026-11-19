import { describe, expect, it } from 'vitest';
import { ghlHookFor } from './GhlRelay';

const hooks = {
  replyHook: 'https://ghl.test/reply',
  interestedHook: 'https://ghl.test/interested',
};

describe('GhlRelay', () => {
  describe('Hook choice', () => {
    it('sends replies to the reply hook', () => {
      expect(ghlHookFor({ eventType: 'reply_received', ...hooks })).toBe(hooks.replyHook);
    });

    it('sends interested leads to the interested hook', () => {
      expect(ghlHookFor({ eventType: 'lead_interested', ...hooks })).toBe(hooks.interestedHook);
    });

    it('relays no other event', () => {
      expect(ghlHookFor({ eventType: 'email_sent', ...hooks })).toBeUndefined();
    });

    it('relays nothing when the hook is not set', () => {
      expect(
        ghlHookFor({
          eventType: 'reply_received',
          replyHook: undefined,
          interestedHook: undefined,
        }),
      ).toBeUndefined();
    });
  });
});
