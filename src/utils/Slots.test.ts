import { describe, expect, it } from 'vitest';
import { joinSlotLabels, matchSlot, pickTwoSlots, slotKey, slotLabel, upcomingDays } from './Slots';

const day = (date: string, times: string[]) => ({
  date,
  slots: times.map((time) => `${date}T${time}:00+02:00`),
});

const days = [
  day('2026-10-20', ['09:00', '09:30', '15:00']),
  day('2026-10-21', ['10:00', '16:30']),
  day('2026-10-22', ['11:00']),
];

describe('Slots', () => {
  describe('Two suggested times', () => {
    it('offers a morning and an afternoon on different days', () => {
      expect(pickTwoSlots({ days, notBefore: new Date('2026-10-19T12:00:00Z') })).toStrictEqual([
        '2026-10-20T09:00:00+02:00',
        '2026-10-21T16:30:00+02:00',
      ]);
    });

    it('skips slots that start too soon', () => {
      expect(pickTwoSlots({ days, notBefore: new Date('2026-10-20T08:00:00Z') }).at(0)).toBe(
        '2026-10-20T15:00:00+02:00',
      );
    });

    it('falls back to the same day when only one day is free', () => {
      expect(
        pickTwoSlots({
          days: [days[0] ?? day('x', [])],
          notBefore: new Date('2026-10-19T12:00:00Z'),
        }),
      ).toStrictEqual(['2026-10-20T09:00:00+02:00', '2026-10-20T15:00:00+02:00']);
    });

    it('returns nothing when the calendar is full', () => {
      expect(pickTwoSlots({ days: [], notBefore: new Date() })).toStrictEqual([]);
    });
  });

  describe('Other times', () => {
    it('keeps the first days with bookable slots', () => {
      expect(
        upcomingDays({ days, notBefore: new Date('2026-10-19T12:00:00Z'), maxDays: 2 }).map(
          (item) => item.date,
        ),
      ).toStrictEqual(['2026-10-20', '2026-10-21']);
    });
  });

  describe('Labels', () => {
    it('writes the Italian date and time the classifier uses', () => {
      expect(slotKey('2026-10-20T09:00:00+02:00')).toBe('2026-10-20T09:00');
      expect(slotKey('2026-10-26T08:30:00Z')).toBe('2026-10-26T09:30');
    });

    it('writes a slot the way an email says it', () => {
      expect(slotLabel('2026-10-20T09:00:00+02:00')).toBe('martedì 20 ottobre alle 9:00');
    });

    it('joins two slots with oppure', () => {
      expect(joinSlotLabels(['2026-10-20T09:00:00+02:00', '2026-10-21T16:30:00+02:00'])).toBe(
        'martedì 20 ottobre alle 9:00 oppure mercoledì 21 ottobre alle 16:30',
      );
    });
  });

  describe('Chosen time', () => {
    const notBefore = new Date('2026-10-19T12:00:00Z');

    it('finds the free slot the lead asked for', () => {
      expect(matchSlot({ days, wanted: '2026-10-21T16:30', notBefore })).toBe(
        '2026-10-21T16:30:00+02:00',
      );
    });

    it('returns null for a time that is not free', () => {
      expect(matchSlot({ days, wanted: '2026-10-21T12:00', notBefore })).toBeNull();
    });

    it('returns null for a free slot that starts too soon', () => {
      expect(
        matchSlot({
          days,
          wanted: '2026-10-20T09:00',
          notBefore: new Date('2026-10-20T08:00:00Z'),
        }),
      ).toBeNull();
    });
  });
});
