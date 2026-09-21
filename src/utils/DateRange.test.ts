import { describe, expect, it } from 'vitest';
import { currentMonthRange, parseDateRange, previousMonthRange } from './DateRange';

// 30 September, 23:30 in Rome
const lateSeptember = new Date('2026-09-30T21:30:00Z');

describe('DateRange', () => {
  describe('Current month', () => {
    it('spans the whole month in the app time zone', () => {
      expect(currentMonthRange(lateSeptember)).toStrictEqual({
        from: '2026-09-01',
        to: '2026-09-30',
      });
    });

    it('rolls over at midnight in Rome, not in UTC', () => {
      // 1 October, 00:30 in Rome, still 30 September in UTC
      const earlyOctober = new Date('2026-09-30T22:30:00Z');

      expect(currentMonthRange(earlyOctober)).toStrictEqual({
        from: '2026-10-01',
        to: '2026-10-31',
      });
    });

    it('ends February on the leap day', () => {
      expect(currentMonthRange(new Date('2028-02-10T12:00:00Z')).to).toBe('2028-02-29');
    });
  });

  describe('Previous month', () => {
    it('steps back one month', () => {
      expect(previousMonthRange(lateSeptember)).toStrictEqual({
        from: '2026-08-01',
        to: '2026-08-31',
      });
    });

    it('wraps January to December of the year before', () => {
      expect(previousMonthRange(new Date('2027-01-15T12:00:00Z'))).toStrictEqual({
        from: '2026-12-01',
        to: '2026-12-31',
      });
    });
  });

  describe('Search params', () => {
    it('defaults to the current month', () => {
      expect(parseDateRange({}, lateSeptember)).toStrictEqual({
        from: '2026-09-01',
        to: '2026-09-30',
      });
    });

    it('keeps a valid range', () => {
      expect(parseDateRange({ from: '2026-09-10', to: '2026-09-12' }, lateSeptember)).toStrictEqual(
        {
          from: '2026-09-10',
          to: '2026-09-12',
        },
      );
    });

    it('swaps dates given the wrong way round', () => {
      expect(parseDateRange({ from: '2026-09-12', to: '2026-09-10' }, lateSeptember)).toStrictEqual(
        {
          from: '2026-09-10',
          to: '2026-09-12',
        },
      );
    });

    it('ignores days that do not exist', () => {
      expect(parseDateRange({ from: '2026-02-30' }, lateSeptember).from).toBe('2026-09-01');
    });

    it('ignores malformed and repeated params', () => {
      expect(
        parseDateRange({ from: 'yesterday', to: ['2026-09-01', '2026-09-02'] }, lateSeptember),
      ).toStrictEqual({
        from: '2026-09-01',
        to: '2026-09-30',
      });
    });
  });
});
