/**
 * The questions the site asks of the schedule: what a service is called, which
 * week a day belongs to, what happens next, and what else happens at that same
 * moment.
 *
 * Nothing here reads the clock and nothing here builds a `Date`. Dates arrive
 * as plain `YYYY-MM-DD` and times as plain `HH:MM`, both already validated and
 * normalised by `schema.ts`; the only clock in the codebase is
 * `aziLaZurich`/`oraLaZurich` in `week.ts`, and callers pass their results in.
 * That is what makes every function below a pure function of its arguments and
 * testable without freezing time.
 *
 * Two invariants from `schema.ts` are load-bearing here and must not be
 * re-derived or re-checked:
 *
 * - `ora` is already canonical `HH:MM`. `minute()` still parses `9:30`, because
 *   it is cheap and because `ics.ts` shares it, but nothing downstream pads.
 * - A day may list two *different* services at the same time - confession runs
 *   during vespers, so `17:00 Spovedanie` beside `17:00 Vecernie` is an
 *   ordinary parish evening. What the schema forbids is the *same* service
 *   twice at one time. Nothing here may merge or drop a same-time pair.
 *
 * The only Romanian literal in this module is the fallback label `Slujbă`,
 * whose `ă` is U+0103 (a-breve). No comma-below character appears in this file;
 * `schedule.test.ts` asserts that by codepoint.
 */

import { partiData } from './date-ro';
import type { Slujba, ZiSlujba } from './schema';
import { cheieSaptamana, inceputSaptamana, sfarsitSaptamana } from './week';

export type Saptamana = {
  cheie: string;
  luni: string;
  duminica: string;
  zile: ZiSlujba[];
};

/**
 * Ascending order for plain `YYYY-MM-DD` strings.
 *
 * Deliberately not `localeCompare`. That is ICU-backed, and both `date-ro.ts`
 * and `week.ts` go out of their way to keep ICU data from deciding anything the
 * site renders, because it differs between Node builds and between a laptop and
 * the CI container. These strings are fixed-width ASCII, so `<` is already the
 * correct total order - and it is the very comparison the filters further down
 * use (`z.data >= azi`, `s.luni >= lunea`). One comparison semantics per date
 * string, not two that happen to agree today.
 */
export function inainte(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Minutes since midnight. '9:30' and '09:30' both yield 570. */
export function minute(ora: string): number {
  const [h, m] = ora.split(':');
  return Number(h) * 60 + Number(m);
}

/**
 * The label shown to a visitor. `Altceva` is the CMS escape hatch for a service
 * not on the dropdown: the editor types the real name into `detaliu`, so the
 * word "Altceva" itself must never reach the page or the calendar feed.
 *
 * This is the single place a service name is rendered - `RandZi`, the week
 * banner and the `.ics` SUMMARY all come through here. Without that, the escape
 * hatch would render three different ways and the feed would emit
 * "Altceva Cerc de studiu".
 *
 * The `|| 'Slujbă'` fallback should be unreachable: `slujbaSchema` refuses an
 * `Altceva` without a non-blank `detaliu`. It stays because the alternative to
 * an unreachable branch here is the word "Altceva" on the schedule if that rule
 * is ever relaxed.
 */
export function etichetaSlujba(s: Slujba): string {
  const detaliu = s.detaliu?.trim() ?? '';
  if (s.slujba === 'Altceva') return detaliu || 'Slujbă';
  return detaliu ? `${s.slujba} ${detaliu}` : s.slujba;
}

/**
 * Buckets days into ISO weeks, ascending, dropping weeks that have no entries.
 *
 * `z.slujbe` is passed through untouched - not sorted, not de-duplicated - so
 * two services at the same time both survive, in the order the editor wrote
 * them. Only the days are reordered, and only inside their own week.
 */
export function grupeazaPeSaptamani(zile: ZiSlujba[]): Saptamana[] {
  const cos = new Map<string, ZiSlujba[]>();

  for (const z of zile) {
    const cheie = cheieSaptamana(z.data);
    const lista = cos.get(cheie);
    if (lista) lista.push(z);
    else cos.set(cheie, [z]);
  }

  return [...cos.values()]
    .map((grup) => {
      const sortate = [...grup].sort((a, b) => inainte(a.data, b.data));
      // Every date in the bucket shares a week key, hence a Monday, so any one
      // of them yields the same bounds. The first is simply the cheapest.
      const orice = sortate[0].data;
      return {
        cheie: cheieSaptamana(orice),
        luni: inceputSaptamana(orice),
        duminica: sfarsitSaptamana(orice),
        zile: sortate,
      };
    })
    // By Monday, not by `cheie`: the Monday is a real date, so this stays right
    // across the New Year, where 2026-W53 runs into 2027-01-03.
    .sort((a, b) => inainte(a.luni, b.luni));
}

/**
 * The first service at or after `azi ora`, or null if the schedule is spent.
 *
 * Times are compared as minutes, never as text: lexically '9:30' sorts after
 * '10:00', which would put the homepage's "next service" an hour in the past.
 *
 * Returns a `Slujba` widened with its date, so the caller can hand the result
 * straight to `etichetaSlujba`. Among services that start at the same minute,
 * the sort is stable (required since ES2019), so the first one the editor wrote
 * wins - arbitrary, but deterministic between builds.
 *
 * A cancelled day is skipped whole, not service by service: `ziSchema` requires
 * an `anulat` day to keep its `slujbe` list, so the flag rather than the list is
 * what carries the cancellation. Keeping the times is not a convention a tidy
 * editor may undo - `ics.ts` writes one VEVENT per service, so a cancelled day
 * stripped of its times would emit nothing to mark CANCELLED, and a subscriber
 * holding last Sunday's Liturgy would never learn it was called off.
 *
 * Throws on an `azi` that is not a real `YYYY-MM-DD` date. `ora` is not
 * validated: a malformed one makes `acum` NaN, which skips the rest of today
 * and moves on - wrong, but not confidently wrong in the way a bad `azi` is.
 */
export function urmatoareaSlujba(
  zile: ZiSlujba[],
  azi: string,
  ora: string,
): (Slujba & { data: string }) | null {
  // The other two functions here validate their date for free, by handing it to
  // cheieSaptamana/inceputSaptamana. This one only ever string-compares, so
  // without this call it would be the single unvalidated date path in the
  // codebase - and it fails silently rather than loudly: '15/09/2026' sorts
  // below every stored date, so every day clears `z.data >= azi` and the
  // function returns the first service in the whole schedule. A wrong service
  // time, stated confidently, is the worst answer this site can give.
  partiData(azi);

  const acum = minute(ora);
  const candidate = [...zile]
    .filter((z) => !z.anulat && z.data >= azi)
    .sort((a, b) => inainte(a.data, b.data));

  for (const z of candidate) {
    const slujbe = [...z.slujbe].sort((a, b) => minute(a.ora) - minute(b.ora));
    for (const s of slujbe) {
      if (z.data > azi || minute(s.ora) >= acum) {
        return { ...s, data: z.data };
      }
    }
  }
  return null;
}

/**
 * Every service in `slujbe` that starts at the same minute as `ora`.
 *
 * The companion to `urmatoareaSlujba`, and the reason it needs one: that
 * function answers "which service is next" and can only return a single entry,
 * but two DIFFERENT services at one time are an ordinary parish evening.
 * Confession runs during vespers, which is why `ziSchema` permits `17:00
 * Spovedanie` beside `17:00 Vecernie` and forbids only the same service twice
 * at one time. A homepage card that named just the one the sort happened to put
 * first would tell someone coming for confession that vespers is what is on, or
 * the reverse. That is a product ruling, not a nicety, so it lives here with a
 * test rather than as an expression on a page.
 *
 * Compared as minutes, like everything else in this module: `ora` is already
 * canonical `HH:MM` out of the schema, so string equality would agree today,
 * and would stop agreeing the moment anything upstream stopped padding.
 *
 * Order is the caller's: `slujbe` is not sorted here, so the editor's order
 * survives, exactly as it does through `grupeazaPeSaptamani`.
 */
export function slujbeLaAceeasiOra(slujbe: Slujba[], ora: string): Slujba[] {
  const cand = minute(ora);
  return slujbe.filter((s) => minute(s.ora) === cand);
}

/**
 * The week containing `azi` plus the following `nr - 1` weeks that have
 * entries.
 *
 * The current week is kept entire, including days already past: a schedule that
 * erased Monday on Tuesday would make a parishioner think they had misread it.
 * Filtering starts at the *Monday*, which is what makes that true.
 *
 * `Math.max` guards a non-positive `nr`: `slice(0, -1)` would otherwise return
 * every week but the last, which reads like a plausible answer and is not one.
 */
export function saptamaniViitoare(zile: ZiSlujba[], azi: string, nr: number): Saptamana[] {
  const lunea = inceputSaptamana(azi);
  return grupeazaPeSaptamani(zile)
    .filter((s) => s.luni >= lunea)
    .slice(0, Math.max(0, nr));
}
