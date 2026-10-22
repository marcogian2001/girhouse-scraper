import { describe, expect, it } from 'vitest';
import {
  addBusinessDays,
  fromItalianTime,
  isBusinessTime,
  scheduleRecontact,
  scheduleReplySend,
  scheduleSend,
  toBusinessTime,
} from './BusinessHours';

const hours = { startHour: 9, endHour: 18 };

const schedule = (now: string, random = 0) =>
  scheduleSend({
    now: new Date(now),
    hours,
    minDelayMinutes: 10,
    maxDelayMinutes: 20,
    random,
  }).toISOString();

describe('BusinessHours', () => {
  describe('Business time', () => {
    it('accepts a weekday morning in Rome', () => {
      // 10:00 in Rome, summer time
      expect(isBusinessTime(new Date('2026-10-14T08:00:00Z'), hours)).toBeTruthy();
    });

    it('rejects the evening', () => {
      expect(isBusinessTime(new Date('2026-10-14T17:00:00Z'), hours)).toBeFalsy();
    });

    it('rejects a Saturday', () => {
      expect(isBusinessTime(new Date('2026-10-17T08:00:00Z'), hours)).toBeFalsy();
    });

    it('rejects a national holiday', () => {
      expect(isBusinessTime(new Date('2026-12-08T09:00:00Z'), hours)).toBeFalsy();
    });

    it('rejects Easter Monday', () => {
      expect(isBusinessTime(new Date('2027-03-29T09:00:00Z'), hours)).toBeFalsy();
    });
  });

  describe('Send schedule', () => {
    it('adds the delay inside business hours', () => {
      expect(schedule('2026-10-14T08:00:00Z', 0.5)).toBe('2026-10-14T08:15:00.000Z');
    });

    it('moves a Friday evening reply to Monday morning', () => {
      // Friday 17:55 in Rome, so the reply would land after closing
      expect(schedule('2026-10-16T15:55:00Z')).toBe('2026-10-19T07:10:00.000Z');
    });

    it('moves a night reply to the morning across daylight saving', () => {
      // Saturday 24 October, then Monday 26 October once Rome is back on UTC+1
      expect(schedule('2026-10-24T20:00:00Z')).toBe('2026-10-26T08:10:00.000Z');
    });

    it('waits for the opening on an early weekday', () => {
      expect(schedule('2026-10-14T04:00:00Z')).toBe('2026-10-14T07:10:00.000Z');
    });
  });

  describe('Working days ahead', () => {
    it('keeps the time of day two working days later', () => {
      // Tuesday 10:30 in Rome
      expect(
        addBusinessDays({ from: new Date('2026-10-20T08:30:00Z'), days: 2, hours }).toISOString(),
      ).toBe('2026-10-22T08:30:00.000Z');
    });

    it('skips the weekend', () => {
      // Friday 10:00 in Rome, two working days on is Tuesday
      expect(
        addBusinessDays({ from: new Date('2026-10-23T08:00:00Z'), days: 2, hours }).toISOString(),
      ).toBe('2026-10-27T09:00:00.000Z');
    });

    it('skips a national holiday', () => {
      // Thursday 24 December 10:00: Christmas, Santo Stefano and Sunday come next
      expect(
        addBusinessDays({ from: new Date('2026-12-24T09:00:00Z'), days: 1, hours }).toISOString(),
      ).toBe('2026-12-28T09:00:00.000Z');
    });

    it('moves an evening start to the next opening', () => {
      // Tuesday 20:00 in Rome, two working days on is Thursday evening, so Friday 9:00
      expect(
        addBusinessDays({ from: new Date('2026-10-20T18:00:00Z'), days: 2, hours }).toISOString(),
      ).toBe('2026-10-23T07:00:00.000Z');
    });

    it('leaves an instant already in business hours alone', () => {
      const tuesday = new Date('2026-10-20T08:30:00Z');

      expect(toBusinessTime(tuesday, hours)).toBe(tuesday);
    });
  });

  describe('Reply send time', () => {
    const reply = (repliedAt: string, now: string) =>
      scheduleReplySend({
        repliedAt: new Date(repliedAt),
        now: new Date(now),
        hours,
        minDelayMinutes: 15,
        maxDelayMinutes: 20,
        random: 0,
      }).toISOString();

    it('waits 15 to 20 minutes after the reply', () => {
      // Reply on Tuesday at 11:00 in Rome, approved at once
      expect(reply('2026-10-20T09:00:00Z', '2026-10-20T09:01:00Z')).toBe(
        '2026-10-20T09:15:00.000Z',
      );
    });

    it('leaves at once when it was approved after the delay', () => {
      // Reply at 11:00, approved at 11:27
      expect(reply('2026-10-20T09:00:00Z', '2026-10-20T09:27:00Z')).toBe(
        '2026-10-20T09:27:00.000Z',
      );
    });

    it('waits for the next opening when approved after hours', () => {
      // Reply at 17:00, approved at 19:00: Wednesday at 9:00
      expect(reply('2026-10-20T15:00:00Z', '2026-10-20T17:00:00Z')).toBe(
        '2026-10-21T07:00:00.000Z',
      );
    });
  });

  describe('Italian time', () => {
    it('reads a date and time in Rome', () => {
      // 9:30 in Rome on Monday, winter time
      expect(fromItalianTime('2026-10-26T09:30')?.toISOString()).toBe('2026-10-26T08:30:00.000Z');
    });

    it('reads a bare date as midnight in Rome', () => {
      expect(fromItalianTime('2026-10-20')?.toISOString()).toBe('2026-10-19T22:00:00.000Z');
    });

    it('rejects a day that does not exist', () => {
      expect(fromItalianTime('2026-02-30')).toBeNull();
    });

    it('rejects free text', () => {
      expect(fromItalianTime('lunedì')).toBeNull();
    });
  });

  describe('Recontact send time', () => {
    // Thursday 22 October at 10:00 in Rome
    const now = new Date('2026-10-22T08:00:00Z');
    const recontact = (value: string | null, random = 0) =>
      scheduleRecontact({ value, now, hours, random })?.toISOString() ?? null;

    it('leaves at the opening of the day asked for', () => {
      expect(recontact('2026-10-26')).toBe('2026-10-26T08:00:00.000Z');
    });

    it('adds up to 45 minutes after the opening', () => {
      expect(recontact('2026-10-26', 1)).toBe('2026-10-26T08:45:00.000Z');
    });

    it('leaves at the time asked for', () => {
      expect(recontact('2026-10-26T15:00')).toBe('2026-10-26T14:00:00.000Z');
    });

    it('moves a weekend day to the next opening', () => {
      // Saturday 24 October: Monday at 9:00
      expect(recontact('2026-10-24')).toBe('2026-10-26T08:00:00.000Z');
    });

    it('ignores a time already past', () => {
      expect(recontact('2026-10-22')).toBeNull();
    });

    it('ignores a date too far ahead', () => {
      expect(recontact('2027-03-01')).toBeNull();
    });

    it('ignores a missing date', () => {
      expect(recontact(null)).toBeNull();
    });
  });
});
