/**
 * Romanian day and month names, and the formatting of a week's date range.
 *
 * The names are a hardcoded table on purpose. Do not replace them with
 * `Intl.DateTimeFormat('ro-RO')`: ICU data differs between Node builds and
 * between a developer machine and the CI container, so `Intl` would make the
 * rendered site depend on its build environment. A table is deterministic and
 * testable.
 *
 * Every `s` and `t` below carries a comma below (U+0219 / U+021B), which is the
 * correct Romanian letter. The Turkish cedilla forms (U+015F / U+0163) look
 * near-identical in most fonts but are a defect; `date-ro.test.ts` guards this.
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

/** Splits a plain YYYY-MM-DD string. No Date object, no timezone. */
function parti(data: string): { an: number; luna: number; zi: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  if (!m) throw new Error(`Dată invalidă: ${data}`);
  return { an: Number(m[1]), luna: Number(m[2]), zi: Number(m[3]) };
}

/** 0 = Monday … 6 = Sunday. */
export function indiceZi(data: string): number {
  const { an, luna, zi } = parti(data);
  const jsDay = new Date(Date.UTC(an, luna - 1, zi)).getUTCDay(); // 0 = Sunday
  return (jsDay + 6) % 7;
}

export function numeZi(data: string): string {
  return NUME_ZILE[indiceZi(data)];
}

export function numeLuna(data: string): string {
  return NUME_LUNI[parti(data).luna - 1];
}

export function ziuaDinLuna(data: string): number {
  return parti(data).zi;
}

export function formatIntervalSaptamana(luni: string, duminica: string): string {
  const a = parti(luni);
  const b = parti(duminica);

  if (a.an !== b.an) {
    return `${a.zi} ${NUME_LUNI[a.luna - 1]} ${a.an} – ${b.zi} ${NUME_LUNI[b.luna - 1]} ${b.an}`;
  }
  if (a.luna !== b.luna) {
    return `${a.zi} ${NUME_LUNI[a.luna - 1]} – ${b.zi} ${NUME_LUNI[b.luna - 1]} ${b.an}`;
  }
  return `${a.zi} – ${b.zi} ${NUME_LUNI[b.luna - 1]} ${b.an}`;
}
