import { describe, expect, it } from 'vitest';
import { normalizeOpeningHours } from './OpeningHours';

describe('OpeningHours', () => {
  it('starts the week on Monday and writes ranges with a hyphen', () => {
    expect(
      normalizeOpeningHours([
        { day: 'giovedì', hours: '09 to 13, 15 to 19' },
        { day: 'domenica', hours: 'Chiuso' },
        { day: 'lunedì', hours: '07:30 to 18' },
      ]),
    ).toStrictEqual([
      { day: 'lunedì', hours: '07:30-18' },
      { day: 'giovedì', hours: '09-13, 15-19' },
      { day: 'domenica', hours: 'Chiuso' },
    ]);
  });
});
