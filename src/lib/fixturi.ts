/**
 * A schedule wide enough to exercise the paths `src/content/slujbe/` cannot.
 *
 * WHY THIS IS NOT SEED CONTENT. The files under `src/content/slujbe/` are the
 * parish's real published schedule, and this repository is the source of truth
 * for what the parish actually does — so nothing invented may go in there. A
 * reader six months from now cannot tell a fabricated Vecernie from a real one.
 * Everything below IS fabricated, which is why it lives here, under a name that
 * says so, and is imported only by tests.
 *
 * WHAT IT COVERS, and why each one is here rather than in the seeds:
 *
 * - **A gap week.** 2026-W39 has no entries at all, sitting between W38 and
 *   W40. `saptamaniViitoare` counts weeks WITH ENTRIES, not calendar weeks, so
 *   a window of three spans four calendar weeks here. That is the property that
 *   forbids any heading from promising "the next three weeks" as a date range,
 *   and without a gap in the data nothing would ever demonstrate it.
 * - **Two services at one time.** 2026-09-16 runs Spovedanie and Vecernie both
 *   at 17:00 — confession during vespers, an ordinary parish evening, and the
 *   case `slujbeLaAceeasiOra` exists for.
 * - **A month boundary** (2026-W40 runs 28 September to 4 October) and a **year
 *   boundary** (2026-W53 runs into 2027-01-03, and 2027-W01 follows), because
 *   week keys are compared lexically and an ISO year is not a calendar year.
 * - **A moved day** (`locatie`) and a **cancelled day** (`anulat`), the two
 *   exceptions the homepage band renders differently from an ordinary day.
 * - **A past week**, 2026-W37, so that "excludes weeks already over" is tested
 *   against data rather than against an empty list.
 *
 * Every day is built through `ziSchema`, not written as a literal. That costs a
 * line and buys the guarantee that the fixture can only contain days the CMS
 * could actually produce: a fixture that drifted from the schema would prove
 * things about a schedule the site can never be given.
 */

import { ziSchema, type ZiSlujba } from './schema';

/** Validates the frontmatter through the real schema, then attaches the date. */
function zi(data: string, brut: unknown): ZiSlujba {
  return { ...ziSchema.parse(brut), data };
}

/** The Wednesday the seed content is written around. 2026-W38. */
export const AZI_FIXTURA = '2026-09-16';

export const ZILE_FIXTURA: ZiSlujba[] = [
  // 2026-W37 — already over on AZI_FIXTURA.
  zi('2026-09-09', { slujbe: [{ ora: '18:30', slujba: 'Acatist' }] }),

  // 2026-W38 — the week containing AZI_FIXTURA.
  zi('2026-09-14', {
    praznic: 'Praznic de probă',
    praznic_mare: true,
    zi_de_post: true,
    slujbe: [
      { ora: '07:30', slujba: 'Utrenia' },
      { ora: '08:30', slujba: 'Sfânta Liturghie' },
    ],
  }),
  zi('2026-09-16', {
    slujbe: [
      // Same minute, different services. The schema permits exactly this and
      // forbids only the same service twice at one time.
      { ora: '17:00', slujba: 'Spovedanie' },
      { ora: '17:00', slujba: 'Vecernie' },
      { ora: '18:30', slujba: 'Paraclisul Maicii Domnului' },
    ],
  }),
  zi('2026-09-20', { slujbe: [{ ora: '10:00', slujba: 'Sfânta Liturghie' }] }),

  // 2026-W39 — deliberately absent. Do not fill this in.

  // 2026-W40 — crosses from September into October.
  zi('2026-09-30', {
    locatie: 'Capela Sf. Gallus, Winterthur',
    slujbe: [{ ora: '18:30', slujba: 'Acatist' }],
  }),
  zi('2026-10-04', {
    anulat: true,
    // The times stay on a cancelled day: `ics.ts` writes one VEVENT per
    // service, so a day stripped of them would emit nothing to mark CANCELLED.
    slujbe: [{ ora: '10:00', slujba: 'Sfânta Liturghie' }],
  }),

  // 2026-W41 — the fourth week with entries, which a window of three must drop.
  zi('2026-10-07', { slujbe: [{ ora: '18:30', slujba: 'Acatist' }] }),

  // 2026-W53 and 2027-W01 — the ISO year boundary.
  zi('2026-12-28', { slujbe: [{ ora: '18:30', slujba: 'Acatist' }] }),
  zi('2027-01-06', { slujbe: [{ ora: '18:30', slujba: 'Acatist' }] }),
];
