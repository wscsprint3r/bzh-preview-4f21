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

import { partiData, titluZi } from './date-ro';
import type { Slujba, ZiSlujba } from './schema';
import { cheieSaptamana, inceputSaptamana, sfarsitSaptamana } from './week';

/**
 * The least a service has to be for the three questions below to have answers:
 * a start time.
 *
 * `Slujba` is that plus what the service is called; the projection the homepage
 * embeds for its client script is that plus the name ALREADY RENDERED. Both are
 * honest answers to "what happens at 17:00", and none of the functions taking
 * this reads anything beyond `ora` - so none of them asks for anything more.
 * Widening them is what lets the browser run the same decision as the build over
 * a smaller record, instead of a second copy of the rule over a bigger one.
 */
export type CuOra = { ora: string };

/**
 * The part of a day that deciding "what happens next" actually reads.
 *
 * `urmatoareaSlujba` takes this rather than a whole `ZiSlujba` because from Task
 * 10 the same call also runs in the browser, over a projection of the schedule
 * embedded in the page. That projection carries these four fields and no others
 * - a `praznic` or a `note` would be bytes on every homepage for a card that
 * never renders them. Naming the subset here is what keeps the projection honest
 * rather than cast into shape: drop `anulat` from it and this stops compiling,
 * instead of quietly putting a cancelled Liturgy under "next service".
 *
 * `ZiSlujba` is assignable to it, so every server-side caller is unchanged.
 */
export type ZiDinProgram<S extends CuOra = Slujba> = Pick<
  ZiSlujba,
  'data' | 'anulat' | 'locatie'
> & { slujbe: S[] };

/** A service as the card shows it: a time, and the name `etichetaSlujba` gave it. */
export type SlujbaPeCard = CuOra & { nume: string };

/**
 * A day as the homepage embeds it for the client, so that the next-service card
 * can be recomputed once the build's clock has stopped being now.
 *
 * Every word the card displays arrives ALREADY RENDERED - `titlu` is "Duminică,
 * 20 septembrie" and `nume` is what `etichetaSlujba` returned, both written by
 * the server that was going to write them anyway. The browser is sent the
 * DECISION and not the rendering: which service is next stays `urmatoareaSlujba`
 * and `slujbeLaAceeasiOra`, the same functions on both sides, so the two answers
 * can differ only because the clock moved. A string copied cannot be formatted
 * differently from the one it was copied from, and `NUME_LUNI` never has to
 * cross the wire to say "septembrie" twice.
 */
export type ZiPentruCard = ZiDinProgram<SlujbaPeCard> & { titlu: string };

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
 * The full stop a composed sentence needs after `valoare`, or `''` when the
 * value already brings its own.
 *
 * Two pages wrap `locatie` in a sentence - "Slujbele acestei zile au loc la X."
 * on `/program/` and "Slujbele au loc la X." in the homepage band - so an editor
 * who ends the field with a stop used to get "Winterthur..".
 *
 * Fixed HERE, at presentation time, and deliberately not in `ziSchema` where
 * the trim lives: normalise for presentation at presentation time; do not
 * mutate stored data to fix how it reads. Stripping the stop at the boundary
 * would lose information - "Capela Sf." would become "Capela Sf" - and would
 * change what `ics.ts` writes into LOCATION, which is data a calendar client
 * stores rather than prose this site is composing. Canonicalising `ora` to
 * `HH:MM` is the legitimate kind of normalisation; editing a free-text field's
 * punctuation is not.
 *
 * One function rather than the same conditional in both components, for the
 * reason `slujbeInOrdine` exists: two components composing the same sentence
 * around the same field is how two pages drift apart.
 *
 * `…` counts as well as `.`, since it likewise ends a sentence. `!` and `?` do
 * not: nothing in this project composes a sentence around a value that could
 * end in one, and treating them as terminators would be a guess.
 */
export function punctFinal(valoare: string): string {
  return /[.…]$/.test(valoare) ? '' : '.';
}

/**
 * A Romanian enumeration of names: "A", "A și B", "A, B și C".
 *
 * Written out rather than handed to `Intl.ListFormat`, for the reason
 * `date-ro.ts` hardcodes its month names: ICU data differs between Node builds
 * and between a laptop and the CI container, and here it would also differ
 * between the server and whatever browser runs the same composition. Romanian
 * puts no comma before the final `și`, which is the whole rule.
 *
 * Here rather than as an expression on the homepage, because from Task 10 the
 * next-service card is composed TWICE - once by `index.astro` at build time and
 * once by the week picker's script when the clock has moved past that service.
 * Two copies of one sentence rule is exactly how the three spellings of a
 * service sort came to disagree; see `slujbeInOrdine`.
 *
 * The empty list yields `''`, not `undefined`. The card is never rendered
 * without a service, so that branch is unreachable today - and the word
 * "undefined" on the homepage is what it would cost on the day it stopped being.
 */
export function listaRomaneasca(nume: string[]): string {
  if (nume.length === 0) return '';
  if (nume.length === 1) return nume[0];
  return `${nume.slice(0, -1).join(', ')} și ${nume[nume.length - 1]}`;
}

/**
 * A day's services in the order they happen.
 *
 * `ziSchema` neither sorts `slujbe` nor requires them sorted - YAML keeps the
 * order the volunteer typed - so an editor who adds an 18:30 Acatist and then
 * remembers the 17:00 Spovedanie has a day whose times run backwards. This is
 * the one place that decides what "in order" means, and there are three
 * callers: `urmatoareaSlujba` (which has always sorted), `ics.ts` (which has
 * always sorted) and `grupeazaPeSaptamani`, through which both pages read the
 * schedule and which did not. Three copies of `sort((a, b) => minute(a.ora) -
 * minute(b.ora))` is how they came to disagree, exactly as two spellings of a
 * date comparison would - see `inainte`.
 *
 * Copies rather than sorting in place: the caller's array is never reordered.
 *
 * Stable, which is load-bearing rather than incidental. `Array.prototype.sort`
 * has been required to be stable since ES2019, so two services at the SAME
 * minute keep the order the editor wrote - `17:00 Spovedanie` stays above
 * `17:00 Vecernie` if that is how the day was entered. Ordering by time must not
 * become an excuse to reorder a same-time pair, which carries meaning this
 * module cannot see.
 */
export function slujbeInOrdine<S extends CuOra>(slujbe: S[]): S[] {
  return [...slujbe].sort((a, b) => minute(a.ora) - minute(b.ora));
}

/**
 * Buckets days into ISO weeks, ascending, dropping weeks that have no entries.
 *
 * Days are reordered inside their week, and each day's services are put in the
 * order they happen by `slujbeInOrdine`. Nothing is de-duplicated and no
 * same-time pair is merged or dropped: the sort is stable, so two services at
 * one minute survive in the order the editor wrote them.
 *
 * The service sort lives here, and not in the two components that render a day,
 * because `RandZi` on `/program/` and `BandaSaptamanii` on the homepage are
 * different components reading the same data through this one function. Fixing
 * it in each page is how the two pages would drift.
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
      const sortate = [...grup]
        .sort((a, b) => inainte(a.data, b.data))
        .map((z) => ({ ...z, slujbe: slujbeInOrdine(z.slujbe) }));
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
    /*
     * Ascending by Monday. This is NOT a New-Year fix, and it used to say it
     * was: "sorting by `cheie` would break where 2026-W53 runs into 2027-01-03"
     * describes a failure that cannot happen. Measured over 1,095 consecutive
     * weeks (Mondays 2020-01-06 to 2040-12-24, the boundary above among them):
     * the two orders are IDENTICAL and all 1,095 keys are distinct, because
     * `cheieSaptamana` zero-pads the week number, which makes `YYYY-Www` a
     * strictly monotone function of the Monday. Sorting by `a.cheie` here is a
     * mutation the suite does not kill, correctly, since it is equivalent.
     *
     * What the line does do is put the ordering on a real date compared with
     * `inainte` - this module's single comparison semantics for date strings -
     * instead of on the key's SPELLING. The key's monotonicity is a separate
     * property, asserted where it is actually relied upon: `alegeSaptamana` in
     * `week-picker.ts` compares keys lexically, and `schedule.test.ts` pins that
     * the rendered keys come out sorted. Dropping the padding would break those
     * and leave this line right.
     */
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
export function urmatoareaSlujba<S extends CuOra>(
  zile: ZiDinProgram<S>[],
  azi: string,
  ora: string,
): (S & { data: string }) | null {
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
    const slujbe = slujbeInOrdine(z.slujbe);
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
export function slujbeLaAceeasiOra<S extends CuOra>(slujbe: S[], ora: string): S[] {
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

/* -------------------------------------------------------------------------- *
 * THE HOMEPAGE'S DATA ISLAND, AND WHY IT IS BOUNDED BY A COUNT.
 *
 * The homepage embeds a projection of the schedule so the client script can
 * recompute the next-service card once the build's clock has stopped being now.
 * It used to carry EVERY future day - `zile.filter((z) => z.data >= azi)` - which
 * is a page that grows without bound with how far ahead the parish publishes,
 * and the first symptom of that is a parish publishing further ahead than usual,
 * which is a sign of a well-organised one.
 *
 * Measured, on scratch builds with a realistic parish week (Wed/Fri/Sat/Sun):
 * the homepage without the island is a CONSTANT 20,693 bytes and the island is
 * about 133 bytes per future service day. 47 weeks published -> 45,567 B, exit 0;
 * 48 weeks -> 46,093 B, exit 1 against the 45 KB budget, by thirteen bytes.
 * `/program/` crosses its own 135 KB limit at about the same distance.
 *
 * That is not an outage - Cloudflare's build command does not run the budget, so
 * the site keeps deploying - and it is worse than one for the person it lands on.
 * `ci.yml` runs on push to the build branch and the CMS commits there, so from
 * that day EVERY save a volunteer makes produces a red run and a GitHub failure
 * email addressed to them, about content that is entirely valid, naming no file
 * and offering nothing they could act on. `README.md` has already told them a red
 * build means their file has a problem.
 *
 * WHY A COUNT OF DAYS AND NOT A DATE WINDOW. Spec §7 sized this payload as "60
 * days past to 365 days future", and that was right for what it described: a
 * SEPARATE, CACHEABLE, GZIPPED `/program/date.json`. Deviation 1 dropped that
 * file, Task 10 reinstated the same data INLINE in the document, and the window
 * came with it unexamined. A date window does not bound bytes - a year of a busy
 * parish is 30 KB uncompressed inside every homepage response - whereas a count
 * of days does, whatever the publishing rhythm. The number of services per day is
 * bounded by what a day can hold; how far ahead somebody publishes is not.
 *
 * WHY 40. The card only ever needs the FIRST future day with a service that has
 * not started yet, so one day would serve a fresh build; the rest is staleness
 * margin. The designed bound on staleness is six hours (`rebuild.yml`). The
 * realistic worst case is that schedule dying quietly: GitHub disables a
 * `schedule` trigger after 60 days without repository activity, and 60 days at
 * the parish's four service days a week is about 34 days of schedule. 40 covers
 * that window whole, at roughly 5.3 KB.
 *
 * WHAT HAPPENS PAST THE BOUND, and it is the safe direction: the client finds no
 * future service in the island and HIDES the card - `SelectorSaptamana`'s one
 * branch for "this card can no longer be trusted". A card that is gone beats one
 * that states a time which has passed.
 *
 * WHICH DAYS THE BOUND COUNTS, because the answer used to be the wrong one and an
 * earlier version of this paragraph described a degradation that could not be
 * reached the only way it actually was. The slice used to run BEFORE cancelled
 * days were discarded, while `urmatoareaSlujba` discards them afterwards. So
 * `ZILE_INSULA` consecutive cancelled published days emptied the island of
 * answers while the schedule was full of them: the server rendered a correct card
 * and the client then hid it, ON A FRESH BUILD, with no staleness involved at
 * all. Measured on these functions, threshold exact - 39 cancelled days and the
 * two agree, 40 and they do not. Forty consecutive cancelled days is about ten
 * weeks at four service days a week: a vacancy, a closure or a long illness,
 * entered exactly the way `README.md` and ruling #28 ask for it, since an editor
 * is told to KEEP the times and tick the cancellation rather than delete the day
 * so that calendar subscribers learn of it. So the filter runs before the slice
 * and the bound counts days the card could actually use.
 *
 * WHAT IS LEFT, and it is the case the sentence above used to claim was the only
 * one: the site goes unrebuilt for longer than the island reaches, by which point
 * every rendered week is in the past as well and the picker reveals nothing
 * either. HOW FAR IT REACHES IS A FUNCTION OF THE PUBLISHING RHYTHM, which the
 * "60 days" arithmetic below states without stating its converse: 40 entries at
 * the parish's four service days a week is 67 calendar days, comfortably past the
 * 60-day rule, while a parish with a service every day gets 40. Still the safe
 * direction - the card goes rather than lying - but the window is in days with
 * services, not in days.
 *
 * It also comfortably contains the three weeks the page renders, so the island
 * can always answer for a day the visitor can see. That is a consequence rather
 * than the reason: `saptamaniViitoare` counts weeks WITH ENTRIES and can span
 * further than 40 service days if the schedule is sparse enough, and the card's
 * answer may legitimately lie outside the rendered weeks anyway.
 * -------------------------------------------------------------------------- */

/** How many future days with services the homepage's island carries. */
export const ZILE_INSULA = 40;

/**
 * The days the client script can actually use, as the homepage embeds them:
 * from `azi` forward, in order, at most `nr` of them.
 *
 * A projection rather than the days themselves - a `praznic` or a `note` would be
 * bytes on every homepage for fields the card never renders.
 *
 * CANCELLED DAYS ARE DISCARDED BEFORE THE SLICE, not after, so `nr` bounds days
 * the card could actually answer with. The block above says what that cost when
 * it was the other way round.
 *
 * `anulat` STAYS IN THE PROJECTION EVEN THOUGH IT IS NOW ALWAYS false, and that is
 * a decision rather than a leftover. It is the second belt: the browser runs the
 * same `urmatoareaSlujba` this module exports, which skips a cancelled day whole,
 * so if this filter is ever loosened again the client still refuses to announce a
 * cancelled Liturgy instead of announcing one. `ZiDinProgram` requires the field,
 * which is what makes dropping it a compile error rather than a silent change of
 * behaviour, and `schedule.test.ts` pins both halves separately.
 *
 * Every word the card displays is rendered HERE, by the server that was going to
 * render it anyway: `etichetaSlujba` owns the `Altceva` escape hatch, and the
 * card must never be the one place that word reaches a page. The browser gets the
 * DECISION - `urmatoareaSlujba` and `slujbeLaAceeasiOra`, the same functions on
 * both sides - and never a second copy of the rendering.
 */
export function programPentruInsula(
  zile: ZiSlujba[],
  azi: string,
  nr: number = ZILE_INSULA,
): ZiPentruCard[] {
  // Validated for the same reason `urmatoareaSlujba` validates it: a malformed
  // `azi` sorts below every stored date, so every day would clear the filter and
  // the island would silently start in the past.
  partiData(azi);
  return zile
    .filter((z) => !z.anulat && z.data >= azi)
    .sort((a, b) => inainte(a.data, b.data))
    .slice(0, Math.max(0, nr))
    .map((z) => ({
      data: z.data,
      anulat: z.anulat,
      locatie: z.locatie,
      slujbe: z.slujbe.map((s) => ({ ora: s.ora, nume: etichetaSlujba(s) })),
      titlu: titluZi(z.data),
    }));
}
