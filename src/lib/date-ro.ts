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

export const NUME_ZILE = [
  'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă', 'Duminică',
] as const;

export const NUME_LUNI = [
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
export function partiData(data: string): { an: number; luna: number; zi: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  if (!m) throw new Error(`Dată invalidă: ${data}`);
  const an = Number(m[1]);
  const luna = Number(m[2]);
  const zi = Number(m[3]);
  // Date.UTC rolls impossible dates over silently: 2026-02-30 becomes 2 March,
  // and month 13 becomes January of the next year. Compare the parts back to
  // catch that, so a bad filename fails loudly instead of rendering a wrong day.
  const d = new Date(Date.UTC(an, luna - 1, zi));
  if (d.getUTCFullYear() !== an || d.getUTCMonth() !== luna - 1 || d.getUTCDate() !== zi) {
    throw new Error(`Dată inexistentă: ${data}`);
  }
  return { an, luna, zi };
}

/** 0 = Monday … 6 = Sunday. */
export function indiceZi(data: string): number {
  const { an, luna, zi } = partiData(data);
  const jsDay = new Date(Date.UTC(an, luna - 1, zi)).getUTCDay(); // 0 = Sunday
  return (jsDay + 6) % 7;
}

export function numeZi(data: string): string {
  return NUME_ZILE[indiceZi(data)];
}

export function numeLuna(data: string): string {
  return NUME_LUNI[partiData(data).luna - 1];
}

export function ziuaDinLuna(data: string): number {
  return partiData(data).zi;
}

export function formatIntervalSaptamana(luni: string, duminica: string): string {
  const a = partiData(luni);
  const b = partiData(duminica);

  if (a.an !== b.an) {
    return `${a.zi} ${NUME_LUNI[a.luna - 1]} ${a.an} – ${b.zi} ${NUME_LUNI[b.luna - 1]} ${b.an}`;
  }
  if (a.luna !== b.luna) {
    return `${a.zi} ${NUME_LUNI[a.luna - 1]} – ${b.zi} ${NUME_LUNI[b.luna - 1]} ${b.an}`;
  }
  return `${a.zi} – ${b.zi} ${NUME_LUNI[b.luna - 1]} ${b.an}`;
}
