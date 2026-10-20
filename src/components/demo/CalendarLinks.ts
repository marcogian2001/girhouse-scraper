/** What an "add to calendar" link needs. */
type CalendarEvent = { title: string; details: string; start: Date; minutes: number };

/**
 * Writes an instant as the compact UTC stamp calendars expect.
 * @param date The instant.
 * @returns A stamp such as 20261023T083000Z.
 */
const toStamp = (date: Date) => `${date.toISOString().replaceAll(/[-:]/gu, '').slice(0, 15)}Z`;

/**
 * Builds the link that opens Google Calendar with the call filled in.
 * @param event The call.
 * @returns The Google Calendar URL.
 */
export const googleCalendarUrl = (event: CalendarEvent) => {
  const end = new Date(event.start.getTime() + event.minutes * 60_000);
  const query = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    details: event.details,
    dates: `${toStamp(event.start)}/${toStamp(end)}`,
  });

  return `https://calendar.google.com/calendar/render?${query.toString()}`;
};
