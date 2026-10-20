import { describe, expect, it } from 'vitest';
import { parseFreeSlots } from './GoHighLevel';

describe('GoHighLevel', () => {
  describe('Free slots', () => {
    it('reads the days in order and drops the trace id and empty days', () => {
      expect(
        parseFreeSlots({
          '2026-10-21': { slots: ['2026-10-21T09:00:00+02:00'] },
          '2026-10-20': { slots: ['2026-10-20T09:00:00+02:00', '2026-10-20T09:30:00+02:00'] },
          '2026-10-22': { slots: [] },
          traceId: '7888a326-d638-477e-b0bf-61335256e3e4',
        }),
      ).toStrictEqual([
        { date: '2026-10-20', slots: ['2026-10-20T09:00:00+02:00', '2026-10-20T09:30:00+02:00'] },
        { date: '2026-10-21', slots: ['2026-10-21T09:00:00+02:00'] },
      ]);
    });
  });
});
