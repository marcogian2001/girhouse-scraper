import { AppConfig } from './AppConfig';

/** Calls before this hour count as morning. */
const AFTERNOON_FROM_HOUR = 13;

type FreeDay = { date: string; slots: string[] };

/**
 * Reads the Italian hour of a slot.
 * @param slot An ISO start time.
 * @returns The hour, from 0 to 23, in `AppConfig.timeZone`.
 */
const hourOf = (slot: string) =>
  Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: AppConfig.timeZone,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(slot)),
  );

/**
 * Keeps the slots that start late enough to be booked.
 * @param days The free days.
 * @param notBefore The earliest start allowed.
 * @returns The days with only the bookable slots, empty days dropped.
 */
const bookableDays = (days: FreeDay[], notBefore: Date) =>
  days
    .map((day) => ({ ...day, slots: day.slots.filter((slot) => new Date(slot) >= notBefore) }))
    .filter((day) => day.slots.length > 0);

/**
 * Picks the two times a lead is offered first: on different days, one in the
 * morning and one in the afternoon when the calendar allows it.
 * @param options The inputs.
 * @param options.days The free days from the calendar, in order.
 * @param options.notBefore The earliest start that may be offered.
 * @returns Up to two ISO start times, earliest first.
 */
export const pickTwoSlots = (options: { days: FreeDay[]; notBefore: Date }) => {
  const days = bookableDays(options.days, options.notBefore);
  const [first, ...rest] = days;

  if (!first) {
    return [];
  }

  const morning = first.slots.find((slot) => hourOf(slot) < AFTERNOON_FROM_HOUR) ?? first.slots[0];
  const otherDay = rest.at(0);

  const afternoon = otherDay
    ? (otherDay.slots.find((slot) => hourOf(slot) >= AFTERNOON_FROM_HOUR) ?? otherDay.slots[0])
    : first.slots.find((slot) => hourOf(slot) >= AFTERNOON_FROM_HOUR && slot !== morning);

  return [morning, afternoon].filter((slot): slot is string => Boolean(slot));
};

/**
 * Keeps the days and slots shown under "other times".
 * @param options The inputs.
 * @param options.days The free days from the calendar, in order.
 * @param options.notBefore The earliest start that may be offered.
 * @param options.maxDays How many days to show.
 * @returns The bookable days.
 */
export const upcomingDays = (options: { days: FreeDay[]; notBefore: Date; maxDays: number }) =>
  bookableDays(options.days, options.notBefore).slice(0, options.maxDays);

/**
 * Writes a slot as the classifier reads and returns call times.
 * @param slot An ISO start time.
 * @returns The Italian date and time, such as 2026-10-20T09:00.
 */
export const slotKey = (slot: string) =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: AppConfig.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(new Date(slot))
    .replace(' ', 'T');

/**
 * Writes a slot the way an Italian email says it.
 * @param slot An ISO start time.
 * @returns A label such as "martedì 20 ottobre alle 9:00".
 */
export const slotLabel = (slot: string) => {
  const date = new Date(slot);
  const day = date.toLocaleDateString('it-IT', {
    timeZone: AppConfig.timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const time = date.toLocaleTimeString('it-IT', {
    timeZone: AppConfig.timeZone,
    hour: 'numeric',
    minute: '2-digit',
  });

  return `${day} alle ${time}`;
};

/**
 * Joins the offered slots into the words that end the email's proposal.
 * @param slots The ISO start times, earliest first.
 * @returns "martedì 20 ottobre alle 9:00 oppure mercoledì 21 ottobre alle 13:00".
 */
export const joinSlotLabels = (slots: string[]) => slots.map(slotLabel).join(' oppure ');

/**
 * Finds the free slot a lead asked for.
 * @param options The inputs.
 * @param options.days The free days from the calendar.
 * @param options.wanted The time the classifier read, as YYYY-MM-DDTHH:mm in Italian time.
 * @param options.notBefore The earliest start that may be booked.
 * @returns The ISO start time of that slot, or null when it is not free.
 */
export const matchSlot = (options: { days: FreeDay[]; wanted: string; notBefore: Date }) =>
  bookableDays(options.days, options.notBefore)
    .flatMap((day) => day.slots)
    .find((slot) => slotKey(slot) === options.wanted.trim().slice(0, 16)) ?? null;
