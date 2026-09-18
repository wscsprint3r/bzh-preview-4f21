/**
 * Romanian day and month names, and the formatting of a week's date range.
 *
 * The names are a hardcoded table on purpose. Do not replace them with
 * `Intl.DateTimeFormat('ro-RO')`: ICU data differs between Node builds and
 * between a developer machine and the CI container, so `Intl` would make the
 * rendered site depend on its build environment. A table is deterministic and
 * testable.
 *
 * Diacritics, stated exactly, because the near-identical glyphs invite bad
 * "corrections". Characters that must NOT appear are named by codepoint rather
 * than shown, so this file stays greppable for them:
 *
 * - The tables are almost entirely ASCII. Not one month name contains a
 *   non-ASCII character, and the only comma-below character in the whole module
 *   is the `ț` in `Marți` (U+021B). U+0219, s-with-comma-below, appears nowhere.
 * - The `s` and `t` in `august`, `septembrie`, `martie`, `octombrie` and
 *   `Sâmbătă` are plain ASCII and must stay that way. Do not add a comma below.
 * - `â` (U+00E2) and `ă` (U+0103), in `Sâmbătă` and `Duminică`, are circumflex and
 *   breve. They are not comma-below characters and are already correct.
 * - What must never appear is the Turkish cedilla: U+015F, s-with-cedilla, and
 *   U+0163, t-with-cedilla. They are a defect, not a variant spelling.
 *
 * `date-ro.test.ts` asserts both tables by value, so any drift fails there.
 *
 * Dates are plain `YYYY-MM-DD` strings. No `Date` objects cross this module's
 * public surface, so nothing here depends on the host timezone.
 */

export const DAY_NAMES = [
  'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă', 'Duminică',
] as const;

export const MONTH_NAMES = [
  'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
  'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
] as const;

/**
 * Splits and validates a plain YYYY-MM-DD string. Throws rather than returning
 * a partial result, so a bad date fails at build time instead of reaching a
 * visitor. Exported because `week.ts` needs the same validation; there must be
 * exactly one parser for this format in the codebase.
 *
 * The returned parts are numbers, and the `Date` built below never escapes this
 * function, so the module's public surface stays free of `Date` and timezones.
 */
export function dateParts(date: string): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`Invalid date: ${date}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  // Date.UTC rolls impossible dates over silently: 2026-02-30 becomes 2 March,
  // and month 13 becomes January of the next year. Compare the parts back to
  // catch that, so a bad filename fails loudly instead of rendering a wrong day.
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    throw new Error(`Nonexistent date: ${date}`);
  }
  return { year, month, day };
}

/** 0 = Monday … 6 = Sunday. */
export function dayIndex(date: string): number {
  const { year, month, day } = dateParts(date);
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = Sunday
  return (jsDay + 6) % 7;
}

export function dayName(date: string): string {
  return DAY_NAMES[dayIndex(date)];
}

export function monthName(date: string): string {
  return MONTH_NAMES[dateParts(date).month - 1];
}

export function dayOfMonth(date: string): number {
  return dateParts(date).day;
}

/**
 * A day's heading as the homepage writes it: "Duminică, 20 septembrie".
 *
 * One composition, used twice - by the next-service card the server renders and
 * by the projection it embeds for the client script to rewrite that card from.
 * It was an arrow function inside `index.astro` when those were its only two
 * callers and the projection was built on the same page; it moved here when the
 * projection did, so the two cannot come to be formatted differently.
 *
 * No year: the card only ever names a day inside the schedule's own window.
 */
export function dayHeading(date: string): string {
  return `${dayName(date)}, ${dayOfMonth(date)} ${monthName(date)}`;
}

export function formatWeekRange(monday: string, sunday: string): string {
  const a = dateParts(monday);
  const b = dateParts(sunday);

  if (a.year !== b.year) {
    return `${a.day} ${MONTH_NAMES[a.month - 1]} ${a.year} – ${b.day} ${MONTH_NAMES[b.month - 1]} ${b.year}`;
  }
  if (a.month !== b.month) {
    return `${a.day} ${MONTH_NAMES[a.month - 1]} – ${b.day} ${MONTH_NAMES[b.month - 1]} ${b.year}`;
  }
  return `${a.day} – ${b.day} ${MONTH_NAMES[b.month - 1]} ${b.year}`;
}
