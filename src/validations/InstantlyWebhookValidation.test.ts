import { describe, expect, it } from 'vitest';
import { InstantlyWebhookValidation } from './InstantlyWebhookValidation';

describe('Instantly webhook validation', () => {
  it('accepts a reply with extra lead fields', () => {
    const parse = InstantlyWebhookValidation.safeParse({
      event_type: 'reply_received',
      timestamp: '2026-10-17T09:00:00.000Z',
      workspace: 'workspace-1',
      campaign_id: 'campaign-1',
      lead_email: 'mario@example.com',
      email_account: 'luca@girhouse.com',
      reply_text: 'Mi interessa',
      companyName: 'Pizzeria Da Mario',
    });

    expect(parse.success).toBeTruthy();
    expect(parse.data?.companyName).toBe('Pizzeria Da Mario');
  });

  it('rejects a payload without an event type', () => {
    expect(InstantlyWebhookValidation.safeParse({ timestamp: 'now' }).success).toBeFalsy();
  });
});
