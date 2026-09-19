import type { Event } from './content-schema';
import { dayHeading } from './date-ro';

export interface EventEntry {
  id: string;
  data: Event;
}

/**
 * The public slug of an event: the collection id, unchanged.
 *
 * The file name is the slug. Unlike an article, whose migration name carries a
 * date prefix that `articleSlug` strips, an event file is named
 * `hramul-parohiei` and the id Astro's loader gives it is already the value
 * the URL is made of. This function exists anyway, and the route and the card
 * both go through it, so a future decision to date-prefix event filenames is one
 * edit here rather than two links that silently disagree.
 */
export function eventSlug(id: string): string {
  return id;
}

/**
 * The events split around `today`, each side sorted for reading.
 *
 * UPCOMING FIRST, ASCENDING: the next event is what a visitor came for. PAST
 * DESCENDING, because the most recent is the one a reader is most likely
 * looking for. `today` is a plain `YYYY-MM-DD` string from `nowInZurich()` - the
 * comparison is lexical, which is chronological for this format - and an event
 * that starts today is upcoming, not past.
 *
 * The id tiebreak is the same one `publishedArticles` uses: two events sharing a
 * start date would otherwise order by whatever `getCollection` returned, and
 * every rebuild could reorder them with nothing else changing.
 */
export function splitEvents<T extends EventEntry>(
  entries: T[],
  today: string,
): { upcoming: T[]; past: T[] } {
  const byStart = (a: T, b: T): number =>
    a.data.start_date === b.data.start_date
      ? a.id.localeCompare(b.id, 'en')
      : a.data.start_date.localeCompare(b.data.start_date, 'en');
  return {
    upcoming: entries.filter((e) => e.data.start_date >= today).sort(byStart),
    past: entries.filter((e) => e.data.start_date < today).sort((a, b) => -byStart(a, b)),
  };
}

/**
 * An event's dates as the page writes them, split so each can be a `<time>`.
 *
 * `dayHeading` gives the weekday and the day-and-month but no year, on purpose:
 * it was written for a week band that never crosses one. An event does, so the
 * year is appended here - once when both dates share it, on each date when they
 * do not, so a New Year event cannot read as a day earlier than it is.
 *
 * `endDate` equal to the start date is the same day said twice, and the pair is
 * rendered as one date. The CMS hint tells a volunteer to leave `end_date` empty
 * for a one-day event, but the schema permits equality and a range of one day
 * would be the page's own invention rather than the file's content. Callers pass
 * `null` for "no end date at all" - both pages normalise an equal end date to it
 * before calling - so the function accepts it and answers the same as
 * `undefined`.
 */
export function eventDates(
  startDate: string,
  endDate?: string | null,
): { start: string; end: string | null } {
  const startYear = startDate.slice(0, 4);
  if (endDate === undefined || endDate === null || endDate === startDate) {
    return { start: `${dayHeading(startDate)} ${startYear}`, end: null };
  }
  const endYear = endDate.slice(0, 4);
  return {
    start: startYear === endYear ? dayHeading(startDate) : `${dayHeading(startDate)} ${startYear}`,
    end: `${dayHeading(endDate)} ${endYear}`,
  };
}
