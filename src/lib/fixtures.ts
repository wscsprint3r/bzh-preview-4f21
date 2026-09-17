/**
 * A schedule wide enough to exercise the paths `src/content/services/` cannot.
 *
 * WHY THIS IS NOT SEED CONTENT. The files under `src/content/services/` are the
 * parish's real published schedule, and this repository is the source of truth
 * for what the parish actually does — so nothing invented may go in there. A
 * reader six months from now cannot tell a fabricated Vecernie from a real one.
 * Everything below IS fabricated, which is why it lives here, under a name that
 * says so, and is imported only by tests.
 *
 * WHAT IT COVERS, and why each one is here rather than in the seeds:
 *
 * - **A gap week.** 2026-W39 has no entries at all, sitting between W38 and
 *   W40. `upcomingWeeks` counts weeks WITH ENTRIES, not calendar weeks, so
 *   a window of three spans four calendar weeks here. That is the property that
 *   forbids any heading from promising "the next three weeks" as a date range,
 *   and without a gap in the data nothing would ever demonstrate it.
 * - **Two services at one time.** 2026-09-16 runs Spovedanie and Vecernie both
 *   at 17:00 — confession during vespers, an ordinary parish evening, and the
 *   case `servicesAtSameTime` exists for.
 * - **A month boundary** (2026-W40 runs 28 September to 4 October) and a **year
 *   boundary** (2026-W53 runs into 2027-01-03, and 2027-W01 follows), because
 *   week keys are compared lexically and an ISO year is not a calendar year.
 * - **A moved day** (`location`) and a **cancelled day** (`anulat`), the two
 *   exceptions the homepage band renders differently from an ordinary day.
 * - **A past week**, 2026-W37, so that "excludes weeks already over" is tested
 *   against data rather than against an empty list.
 *
 * Every day is built through `daySchema`, not written as a literal. That costs a
 * line and buys the guarantee that the fixture can only contain days the CMS
 * could actually produce: a fixture that drifted from the schema would prove
 * things about a schedule the site can never be given.
 */

import { daySchema, type ServiceDay } from './schema';

/** Validates the frontmatter through the real schema, then attaches the date. */
function day(date: string, raw: unknown): ServiceDay {
  return { ...daySchema.parse(raw), date };
}

/** The Wednesday the seed content is written around. 2026-W38. */
export const FIXTURE_TODAY = '2026-09-16';

export const FIXTURE_DAYS: ServiceDay[] = [
  // 2026-W37 — already over on FIXTURE_TODAY.
  day('2026-09-09', { services: [{ time: '18:30', service: 'Acatist' }] }),

  // 2026-W38 — the week containing FIXTURE_TODAY.
  day('2026-09-14', {
    feast: 'Praznic de probă',
    great_feast: true,
    fast_day: true,
    services: [
      { time: '07:30', service: 'Utrenia' },
      { time: '08:30', service: 'Sfânta Liturghie' },
    ],
  }),
  day('2026-09-16', {
    // DELIBERATELY OUT OF ORDER, and it must stay that way. `daySchema` neither
    // sorts `services` nor requires them sorted, so this is what a volunteer who
    // adds the evening service first and remembers confession afterwards
    // actually produces. `servicesInOrder` is what both pages see instead.
    //
    // It also pins the stability of that sort: Spovedanie is written before
    // Vecernie and they share a minute, so any ordering that swapped them would
    // be reordering a same-time pair, which carries meaning the code cannot see.
    services: [
      { time: '18:30', service: 'Paraclisul Maicii Domnului' },
      // Same minute, different services. The schema permits exactly this and
      // forbids only the same service twice at one time.
      { time: '17:00', service: 'Spovedanie' },
      { time: '17:00', service: 'Vecernie' },
    ],
  }),
  day('2026-09-20', { services: [{ time: '10:00', service: 'Sfânta Liturghie' }] }),

  // 2026-W39 — deliberately absent. Do not fill this in.

  // 2026-W40 — crosses from September into October.
  day('2026-09-30', {
    // ENDS IN A FULL STOP, on purpose, and must keep it. `daySchema` trims this
    // field but does not strip punctuation from it: it is free text, and
    // `ics.ts` writes it into the feed's LOCATION, which a calendar client
    // stores. The doubled stop the two pages would otherwise print is fixed by
    // `fullStop` where the sentence is composed, not here.
    location: 'Capela Sf. Gallus, Winterthur.',
    services: [{ time: '18:30', service: 'Acatist' }],
  }),
  day('2026-10-04', {
    cancelled: true,
    // The times stay on a cancelled day: `ics.ts` writes one VEVENT per
    // service, so a day stripped of them would emit nothing to mark CANCELLED.
    services: [{ time: '10:00', service: 'Sfânta Liturghie' }],
  }),

  // 2026-W41 — the fourth week with entries, which a window of three must drop.
  day('2026-10-07', { services: [{ time: '18:30', service: 'Acatist' }] }),

  // 2026-W53 and 2027-W01 — the ISO year boundary.
  day('2026-12-28', { services: [{ time: '18:30', service: 'Acatist' }] }),
  day('2027-01-06', { services: [{ time: '18:30', service: 'Acatist' }] }),
];
