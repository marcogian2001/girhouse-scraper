import { AppConfig } from '@/utils/AppConfig';

/** An inclusive span of calendar days, each as `YYYY-MM-DD`. */
export type DateRange = { from: string; to: string };

const ISO_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * Checks that a search param is a single, real calendar day.
 * @param value The raw search param.
 * @returns Whether the value is a valid `YYYY-MM-DD` date.
 */
const isIsoDay = (value: string | string[] | undefined): value is string => {
  if (typeof value !== 'string' || !ISO_DAY_PATTERN.test(value)) {
    return false;
  }

  const time = Date.parse(value);

  // Round-tripping rejects days that do not exist, such as 2026-02-30, which `Date` rolls over
  return !Number.isNaN(time) && new Date(time).toISOString().startsWith(value);
};

/**
 * Builds the range covering one whole calendar month.
 * @param year The four-digit year.
 * @param month The month, from 1 to 12.
 * @returns The first and last day of that month.
 */
const monthRange = (year: number, month: number): DateRange => {
  // Day 0 of the next month is the last day of this one
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const prefix = `${year}-${String(month).padStart(2, '0')}`;

  return { from: `${prefix}-01`, to: `${prefix}-${String(lastDay).padStart(2, '0')}` };
};

/**
 * Reads the calendar day a moment falls on in the app time zone.
 * @param now The moment to read.
 * @returns The year and month of that day.
 */
const localYearMonth = (now: Date) => {
  // `en-CA` formats as YYYY-MM-DD
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: AppConfig.timeZone }).format(now);

  return { year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)) };
};

/**
 * Builds the range of the current calendar month in the app time zone.
 * @param now The moment treated as today.
 * @returns The first and last day of the month.
 */
export const currentMonthRange = (now = new Date()) => {
  const { year, month } = localYearMonth(now);

  return monthRange(year, month);
};

/**
 * Builds the range of the calendar month before the current one.
 * @param now The moment treated as today.
 * @returns The first and last day of the previous month.
 */
export const previousMonthRange = (now = new Date()) => {
  const { year, month } = localYearMonth(now);

  return month === 1 ? monthRange(year - 1, 12) : monthRange(year, month - 1);
};

/**
 * Reads a date filter from the URL, defaulting to the current month.
 * @param params The `from` and `to` search params.
 * @param now The moment treated as today.
 * @returns A valid range with `from` on or before `to`.
 */
export const parseDateRange = (
  params: { from?: string | string[]; to?: string | string[] },
  now = new Date(),
): DateRange => {
  const fallback = currentMonthRange(now);
  const from = isIsoDay(params.from) ? params.from : fallback.from;
  const to = isIsoDay(params.to) ? params.to : fallback.to;

  // Picking the dates the wrong way round is a slip, not a reason to show nothing
  return from <= to ? { from, to } : { from: to, to: from };
};
