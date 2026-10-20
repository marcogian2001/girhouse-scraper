import { AppConfig } from './AppConfig';

/** The window emails may leave in, as whole hours of Italian wall-clock time. */
export type BusinessHours = { startHour: number; endHour: number };

type WallClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: AppConfig.timeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  weekday: 'short',
  hourCycle: 'h23',
});

/** National holidays on a fixed date, as `month-day`. */
const FIXED_HOLIDAYS = new Set([
  '1-1',
  '1-6',
  '4-25',
  '5-1',
  '6-2',
  '8-15',
  '11-1',
  '12-8',
  '12-25',
  '12-26',
]);

/**
 * Reads an instant as Italian wall-clock time.
 * @param date The instant.
 * @returns Its date, time and weekday in `AppConfig.timeZone`, Sunday being 0.
 */
const toWallClock = (date: Date): WallClock => {
  const parts = Object.fromEntries(
    FORMATTER.formatToParts(date).map((part) => [part.type, part.value]),
  );

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: WEEKDAYS.indexOf(parts.weekday ?? ''),
  };
};

/**
 * Finds the instant of an Italian wall-clock time, daylight saving included.
 * @param options The wall-clock time.
 * @param options.year The year.
 * @param options.month The month, from 1.
 * @param options.day The day of the month.
 * @param options.hour The hour, from 0 to 23.
 * @returns The instant.
 */
const fromWallClock = (options: { year: number; month: number; day: number; hour: number }) => {
  const asUtc = Date.UTC(options.year, options.month - 1, options.day, options.hour);
  const shown = toWallClock(new Date(asUtc));
  const offset = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute) - asUtc;

  return new Date(asUtc - offset);
};

/**
 * Computes Easter Sunday with the anonymous Gregorian algorithm.
 * @param year The year.
 * @returns The month, from 1, and day of Easter Sunday.
 */
const easterSunday = (year: number) => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return { month, day };
};

/**
 * Tells whether a day is a working day in Italy: Monday to Friday, not a national holiday.
 * @param clock The day, as Italian wall-clock time.
 * @returns True on working days.
 */
const isBusinessDay = (clock: WallClock) => {
  if (clock.weekday === 0 || clock.weekday === 6) {
    return false;
  }

  if (FIXED_HOLIDAYS.has(`${clock.month}-${clock.day}`)) {
    return false;
  }

  const easter = easterSunday(clock.year);
  const easterMonday = new Date(Date.UTC(clock.year, easter.month - 1, easter.day + 1));

  return !(
    easterMonday.getUTCMonth() + 1 === clock.month && easterMonday.getUTCDate() === clock.day
  );
};

/**
 * Tells whether an instant falls inside Italian business hours.
 * @param date The instant.
 * @param hours The business hours.
 * @returns True on a working day between the start and end hour.
 */
export const isBusinessTime = (date: Date, hours: BusinessHours) => {
  const clock = toWallClock(date);

  return isBusinessDay(clock) && clock.hour >= hours.startHour && clock.hour < hours.endHour;
};

/**
 * Finds the next opening of business hours after an instant.
 * @param date The instant.
 * @param hours The business hours.
 * @returns The start of the next working day's hours, or of today's if they have not begun.
 */
const nextOpening = (date: Date, hours: BusinessHours) => {
  const today = toWallClock(date);

  // Two weeks covers the longest run of weekends and holidays
  for (let offset = 0; offset < 14; offset += 1) {
    const day = new Date(Date.UTC(today.year, today.month - 1, today.day + offset));
    const opening = fromWallClock({
      year: day.getUTCFullYear(),
      month: day.getUTCMonth() + 1,
      day: day.getUTCDate(),
      hour: hours.startHour,
    });

    if (opening > date && isBusinessDay(toWallClock(opening))) {
      return opening;
    }
  }

  throw new Error('No business day in the next two weeks');
};

/**
 * Picks when a reply leaves: a random delay so it does not look automated, moved
 * into Italian business hours when it would land outside them.
 * @param options The scheduling options.
 * @param options.now When the reply is ready.
 * @param options.hours The business hours.
 * @param options.minDelayMinutes The shortest delay.
 * @param options.maxDelayMinutes The longest delay.
 * @param options.random A number from 0 to 1, injectable for tests.
 * @returns The send time.
 */
export const scheduleSend = (options: {
  now: Date;
  hours: BusinessHours;
  minDelayMinutes: number;
  maxDelayMinutes: number;
  random?: number;
}) => {
  const random = options.random ?? Math.random();
  const delayMs =
    (options.minDelayMinutes + random * (options.maxDelayMinutes - options.minDelayMinutes)) *
    60_000;
  const candidate = new Date(options.now.getTime() + delayMs);

  if (isBusinessTime(candidate, options.hours)) {
    return candidate;
  }

  return new Date(nextOpening(candidate, options.hours).getTime() + delayMs);
};

/**
 * Moves an instant into business hours when it falls outside them.
 * @param date The instant.
 * @param hours The business hours.
 * @returns The instant itself, or the next opening.
 */
export const toBusinessTime = (date: Date, hours: BusinessHours) =>
  isBusinessTime(date, hours) ? date : nextOpening(date, hours);

/**
 * Counts working days forward, keeping the time of day, so a follow-up lands like the
 * email before it: two working days after a Friday morning email is Tuesday morning.
 * @param options The inputs.
 * @param options.from The instant to count from.
 * @param options.days How many working days to add.
 * @param options.hours The business hours the result must fall in.
 * @returns The instant, moved into business hours when needed.
 */
export const addBusinessDays = (options: { from: Date; days: number; hours: BusinessHours }) => {
  const start = toWallClock(options.from);
  let target = options.from;
  let added = 0;

  // Each working day is at most a long weekend of holidays away
  for (let offset = 1; added < options.days && offset <= options.days * 7 + 14; offset += 1) {
    const day = new Date(Date.UTC(start.year, start.month - 1, start.day + offset));
    const candidate = new Date(
      fromWallClock({
        year: day.getUTCFullYear(),
        month: day.getUTCMonth() + 1,
        day: day.getUTCDate(),
        hour: start.hour,
      }).getTime() +
        start.minute * 60_000,
    );

    if (isBusinessDay(toWallClock(candidate))) {
      target = candidate;
      added += 1;
    }
  }

  return toBusinessTime(target, options.hours);
};
