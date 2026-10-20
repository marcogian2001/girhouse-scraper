/** Italian weekdays, Monday first, as Google Maps names them. */
const WEEK = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];

/**
 * Tidies the opening hours Apify scraped: Monday first, and "09 to 13" written as "09-13".
 * @param hours The hours, starting from whichever day the scrape ran on.
 * @returns The hours in week order; unknown day names keep their place at the end.
 */
export const normalizeOpeningHours = (hours: { day: string; hours: string }[]) =>
  hours
    .map((row) => ({ day: row.day, hours: row.hours.replaceAll(/\s+to\s+/giu, '-') }))
    .toSorted((a, b) => {
      const rank = (day: string) => {
        const index = WEEK.indexOf(day.toLowerCase());

        return index === -1 ? WEEK.length : index;
      };

      return rank(a.day) - rank(b.day);
    });
