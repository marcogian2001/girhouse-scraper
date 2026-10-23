import { describe, expect, it } from 'vitest';
import {
  AutomationSettingsValidation,
  OutboundApprovalValidation,
  ReplyImportValidation,
} from './AutomationValidation';

const settings = {
  enabled: true,
  mode: 'draft',
  confidenceThreshold: 0.75,
  replyDelayMinMinutes: 4,
  replyDelayMaxMinutes: 15,
  businessHourStart: 9,
  businessHourEnd: 18,
  monthlyPrice: 97,
  newMonthlyPrice: 197,
  priceIncreaseDays: 15,
  onboardingSlotsPerMonth: 10,
  demoNotOpenedBusinessDays: 2,
  maxFollowUps: 3,
  whatsappAfterBusinessDays: 2,
  nurturingIntervalDays: 30,
  nurturingMaxCount: 3,
  classificationModel: 'claude-sonnet-5-5',
  writingModel: 'claude-opus-5-5',
  whatsappBusinessNumber: '+393331234567',
};

describe('Automation settings validation', () => {
  it('accepts the defaults', () => {
    expect(AutomationSettingsValidation.safeParse(settings).success).toBeTruthy();
  });

  it('rejects a minimum delay above the maximum', () => {
    expect(
      AutomationSettingsValidation.safeParse({ ...settings, replyDelayMinMinutes: 20 }).success,
    ).toBeFalsy();
  });

  it('rejects a model that is not Claude', () => {
    expect(
      AutomationSettingsValidation.safeParse({ ...settings, classificationModel: 'gpt-6-sol' })
        .success,
    ).toBeFalsy();
  });

  it('rejects a WhatsApp number not in E.164', () => {
    expect(
      AutomationSettingsValidation.safeParse({ ...settings, whatsappBusinessNumber: '333 123' })
        .success,
    ).toBeFalsy();
  });
});

describe('Outbound approval validation', () => {
  const approval = { subject: 'Re: ciao', body: 'Buongiorno' };

  it('accepts an approval without a send time', () => {
    expect(OutboundApprovalValidation.safeParse(approval).success).toBeTruthy();
  });

  it('accepts a send time from a date field', () => {
    expect(
      OutboundApprovalValidation.safeParse({ ...approval, scheduledFor: '2026-10-26T09:30' })
        .success,
    ).toBeTruthy();
  });

  it('rejects a send time with seconds or a time zone', () => {
    expect(
      OutboundApprovalValidation.safeParse({ ...approval, scheduledFor: '2026-10-26T09:30:00Z' })
        .success,
    ).toBeFalsy();
  });
});

describe('Reply import validation', () => {
  it('accepts a mailbox address', () => {
    const parse = ReplyImportValidation.safeParse({ eaccount: 'gianmarco@girhouse.com' });

    expect(parse.success).toBeTruthy();
  });

  it('rejects a value that is not an address', () => {
    expect(ReplyImportValidation.safeParse({ eaccount: 'gianmarco' }).success).toBeFalsy();
  });
});
