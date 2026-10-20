import { describe, expect, it } from 'vitest';
import { googleCalendarUrl } from './CalendarLinks';

const event = {
  title: 'Call Girhouse',
  details: 'Ci sentiamo, a presto',
  start: new Date('2026-10-23T08:30:00Z'),
  minutes: 30,
};

describe('CalendarLinks', () => {
  it('fills the Google Calendar template with start and end', () => {
    const url = new URL(googleCalendarUrl(event));

    expect(url.searchParams.get('dates')).toBe('20261023T083000Z/20261023T090000Z');
    expect(url.searchParams.get('text')).toBe('Call Girhouse');
  });
});
