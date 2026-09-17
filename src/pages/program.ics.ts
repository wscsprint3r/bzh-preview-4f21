/**
 * The calendar feed, at `/program.ics`.
 *
 * Three places in the source already point here. Two of them are in the shared
 * layout and so land on every page: the `<link rel="alternate">` in
 * `Base.astro` and the footer's "Abonare la program (.ics)". The third is the
 * button at the foot of `/program/`. So the built site carries two references
 * on the homepage and three on `/program/`, and until this file existed every
 * one of them was broken. `build-output.itest.ts` pins those counts per page.
 *
 * All this route does is join two things that are each tested on their own:
 * the collection (`content.config.ts` + `schema.ts`) and the generator
 * (`lib/ics.ts`). The joint itself has no unit test and cannot have one, which
 * is what `lib/build-output.itest.ts` is for: it reads the built `dist/` and
 * asserts that every day in the collection came out the other end.
 */
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { generateIcs } from '../lib/ics';

/**
 * Where the services are, unless a day says otherwise.
 *
 * `ics.ts` writes `z.location || opts.location` into LOCATION, so this is the
 * address a subscriber's phone shows on an ordinary day. Fuller than the
 * footer's two lines on purpose: a calendar entry is read away from the site,
 * often in a map application, so it carries the building's name as well as the
 * street. The commas are escaped by `ics.ts` per RFC 5545 §3.3.11 — do not
 * escape them here as well.
 */
const LOCATION = 'Capela Sf. Katharina, Wehntalerstrasse 451, 8046 Zürich';

export const GET: APIRoute = async () => {
  const entries = await getCollection('services');
  /*
   * `data` and `date` are two different things on this line. `e.data` is
   * Astro's own name for the parsed frontmatter — every field `daySchema`
   * validated, which is every field of a day EXCEPT its date, because Zod is
   * handed a file's contents and never its name. The date is the filename, i.e.
   * `e.id`, validated by `idFromFilename`. So `date` comes from the id, and
   * that is the whole of why this line exists.
   *
   * DROPPING the override is the mistake that bites, and it bites loudly: the
   * build dies with `TypeError: Cannot read properties of undefined (reading
   * 'replace')` inside `toIcsDate`, because there is no date to format. The two
   * pages fail differently on the same slip — `Dată invalidă: undefined` out of
   * `dateParts` — but all three fail the build rather than shipping. Verified
   * by doing it in each.
   *
   * REVERSING the order is a different thing and is not load-bearing today, and
   * a comment here used to claim it was — that reversing it left `day.date`
   * undefined and filled the feed with the word `undefined`. It does not:
   * `daySchema` is strict and declares no `date` key, so the spread has nothing
   * to overwrite and both orders produce the same pairs. Checked by building
   * the site both ways; the feed is byte-identical apart from DTSTAMP.
   *
   * What the order does say is which source wins IF the schema ever gains a
   * `date` field: writing it last keeps the filename authoritative over a YAML
   * field that could contradict it, and the filename is the one that was
   * validated as a date. That is a real reason and it is the one to keep. A
   * comment that threatens a failure nobody can reproduce teaches the next
   * reader to discount the comments that are accurate.
   */
  const days = entries.map((e) => ({ ...e.data, date: e.id }));

  /*
   * THIS CALL SITE OWNS THE CORRECTNESS OF THIS STRING. `generateIcs` takes
   * `dtstamp` as a parameter and does not validate it — that is deliberate, so
   * its own tests get deterministic output — so nothing downstream will notice
   * if what arrives is not an RFC 5545 §3.3.5 UTC date-time. It must be exactly
   * YYYYMMDDTHHMMSSZ, and a malformed DTSTAMP is the kind of defect that makes
   * a strict parser reject the whole calendar rather than one event.
   *
   * `toISOString` is specified to return exactly `YYYY-MM-DDTHH:mm:ss.sssZ` for
   * every year this site will see, so dropping the separators and cutting at 15
   * characters is a slice of a fixed-width string rather than a parse. The
   * property is asserted against the built feed in `build-output.itest.ts`,
   * which is where it can be checked rather than merely asserted by comment.
   */
  const dtstamp = `${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;

  /*
   * The headers are honoured by `astro dev` and `astro preview`. A static build
   * writes the body to `dist/program.ics` and drops them, so on the deployed
   * site the content type comes from the host's mapping for `.ics` — which is
   * `text/calendar` by default everywhere, and is also declared by the
   * `<link rel="alternate" type="text/calendar">` in `Base.astro`.
   *
   * `inline` rather than `attachment`: this link is for subscribing, and an
   * `attachment` disposition pushes a browser towards saving a one-off copy of
   * the file, which is the one outcome that would leave a parishioner with a
   * schedule that never updates again.
   */
  return new Response(generateIcs(days, { dtstamp, location: LOCATION }), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="program-liturgic.ics"',
    },
  });
};
