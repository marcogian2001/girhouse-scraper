import { describe, expect, it } from 'vitest';
import { GhlWebhookValidation } from './GhlWebhookValidation';

describe('GHL webhook delivery', () => {
  it('reads the event from the custom data of a workflow webhook', () => {
    const parse = GhlWebhookValidation.safeParse({
      contact_id: 'abc123',
      email: ' Mario@Example.com ',
      first_name: 'Mario',
      customData: { event: 'appointment_booked', start_time: '2026-10-22T09:00:00+02:00' },
    });

    expect(parse.success).toBeTruthy();
    expect(parse.data?.email).toBe('mario@example.com');
    expect(parse.data?.customData.event).toBe('appointment_booked');
  });

  it('reads the message of a WhatsApp reply', () => {
    const parse = GhlWebhookValidation.safeParse({
      contact_id: 'abc123',
      customData: { event: 'whatsapp_inbound', message: 'Sì, sentiamoci domani' },
    });

    expect(parse.data?.customData.message).toBe('Sì, sentiamoci domani');
  });

  it('rejects an unknown event', () => {
    expect(
      GhlWebhookValidation.safeParse({ contact_id: 'abc123', customData: { event: 'birthday' } })
        .success,
    ).toBeFalsy();
  });

  it('accepts a contact a setter created with only a phone number', () => {
    expect(
      GhlWebhookValidation.safeParse({
        phone: '+39 333 123 4567',
        customData: { event: 'appointment_booked' },
      }).success,
    ).toBeTruthy();
  });

  it('rejects a delivery with no contact id, email or phone', () => {
    expect(GhlWebhookValidation.safeParse({ customData: { event: 'dnd' } }).success).toBeFalsy();
  });
});
