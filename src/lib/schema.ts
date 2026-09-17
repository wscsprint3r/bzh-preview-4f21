/**
 * What a service day is, and the only place that decides whether one is valid.
 *
 * This schema is the safety barrier of the site. The person editing the
 * schedule is a parish volunteer, not a developer, and the alternative to a
 * failed build is a wrong service time in front of someone who drove to church
 * for it. So every rule here is written to fail loudly at build time rather
 * than to be forgiving at runtime.
 *
 * Two consequences of that principle are easy to undo by accident, so they are
 * spelled out:
 *
 * - **The objects are strict.** A misspelled key is the likeliest mistake in
 *   hand-edited YAML and the quietest one: `greatfeast:` simply never becomes
 *   `praznic_mare`, the day loses its feast styling, and the build stays green.
 *   Strict turns that into a build failure. Strict-and-wrong costs a minute;
 *   permissive-and-wrong costs a parishioner a wasted trip.
 * - **`time` is normalised here, not downstream.** The editor may type `7:30`;
 *   everything that reads this schema gets `07:30`.
 *
 * Kept in `lib/` rather than inline in `content.config.ts` so it can be
 * unit-tested without booting Astro.
 */

import { z } from 'astro/zod';
/*
 * THE `.ts` EXTENSION IS LOAD-BEARING, do not tidy it away.
 *
 * Node's type-stripping resolves relative specifiers literally - it does not do
 * bundler-style extension guessing - so `'./date-ro'` makes this module fail
 * with ERR_MODULE_NOT_FOUND under plain `node`, while Vite, Astro and vitest all
 * resolve it happily. It was written that way and nobody noticed, because
 * nothing in the suite loads this file outside a bundler.
 *
 * It matters now because `./content-schema.ts` imports `strictKeys` from here,
 * and that module IS loaded by the migration scripts under plain node. The guard
 * is `content-schema.test.ts`'s 'se poate importa din node simplu', which
 * spawns a real child process; vitest alone would never catch a regression here.
 */
import { dateParts } from './date-ro.ts';

const FILENAME = /^(\d{4}-\d{2}-\d{2})\.yml$/;

/** The same date, as it may also appear INSIDE a file that the CMS wrote. */
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates a schedule filename and returns the date it encodes.
 *
 * The filename *is* the primary key of the schedule: it is the entry id, and
 * every later task joins on it. Zod never sees it - a collection schema is
 * handed the file's `date`, never its `id` - so without this the one field that
 * identifies a day would be the only unvalidated thing in the system.
 * `2026-02-30.yml`, `2026-9-21.yml`, a stray `.yaml` or a file in a subfolder
 * would each produce a missing or bogus day on a green build.
 *
 * Called from `generateId` in `content.config.ts`, where a throw fails the
 * build. `dateParts` does the date half: one parser for this format in the
 * codebase, already tested against every date it accepts, now guarding the key
 * as well as the contents. A regex alone would wave `2026-02-30` through.
 */
export function idFromFilename(entry: string, content?: Record<string, unknown>): string {
  const m = FILENAME.exec(entry);
  if (!m) {
    throw new Error(
      `Fișier de program cu nume nepermis: "${entry}". Numele trebuie să fie exact o dată, ` +
        `de forma 2026-09-14.yml, fără subdirectoare.`,
    );
  }
  try {
    dateParts(m[1]); // aruncă pentru date inexistente, de exemplu 2026-02-30
  } catch (cause) {
    // dateParts names the date but not the file, and its stack points into
    // date-ro.ts, so on its own it leaves you hunting for which entry is wrong.
    throw new Error(
      `Fișier de program cu dată inexistentă: "${entry}". Ziua aceasta nu există în calendar.`,
      { cause: cause },
    );
  }
  /*
   * And now the other half of the same key, which only exists because the CMS
   * puts it there.
   *
   * Sveltia writes EVERY declared field into the file, including the one it
   * names the file after - so a day created through `/admin/` carries its own
   * date as well as wearing it. The two can disagree: the slug is computed when
   * an entry is CREATED, and afterwards the date field and the filename are
   * edited through different controls. A volunteer who opens a published day and
   * corrects a wrong date changes the contents and not the name.
   *
   * Nothing downstream would notice. All three consumers build their day as
   * `{ ...e.data, date: e.id }`, filename last and winning, so the correction
   * would have NO effect on the site and produce no error anywhere - the
   * quietest possible outcome for the one edit a volunteer is most likely to
   * make in a hurry. Hence a build error, here, where the filename is already
   * the thing being judged.
   */
  const writtenDate = content?.date;
  if (writtenDate instanceof Date) {
    throw new Error(
      // The example is the file's OWN date, never a date written into the source:
      // a hardcoded `2026-09-14` reads as stale within the month, and a volunteer
      // comparing it with their own file has to work out that it is an example.
      `Fișier de program cu data scrisă fără ghilimele: "${entry}". YAML citește ` +
        `${m[1]} ca dată calendaristică, nu ca text. Scrieți data: "${m[1]}", ` +
        `cu ghilimele.`,
    );
  }
  if (writtenDate !== undefined && writtenDate !== m[1]) {
    /*
     * The message names BOTH dates and then gives a remedy for each direction,
     * because nothing here can know which of the two is the right one - only the
     * person who typed it can. Saying "make them match" would leave whoever
     * reads it guessing which half to edit, and guessing wrong means a service
     * on the wrong day rather than a build that failed.
     */
    throw new Error(
      `Fișier de program cu două date diferite: numele spune ${m[1]}, iar înăuntru ` +
        `scrie data: ${JSON.stringify(writtenDate)}. Numele fișierului este cel care decide ` +
        `ce apare pe site. Dacă ziua este ${JSON.stringify(writtenDate)}, ștergeți-o din ` +
        `administrare și adăugați-o din nou cu data aceea, fiindcă redenumirea nu se ` +
        `face singură. Dacă ziua este ${JSON.stringify(m[1])}, puneți la loc ` +
        `data: ${JSON.stringify(m[1])}.`,
    );
  }
  return m[1];
}

/**
 * The list the CMS offers as a dropdown. Keeping it closed is what stops
 * "Sf. Liturghie", "Sfanta Liturghie" and "Sfânta Liturghie" from all appearing
 * on the same page. "Altceva" plus `detail` is the escape hatch.
 */
export const SERVICE_NAMES = [
  'Utrenia',
  'Sfânta Liturghie',
  'Vecernie',
  'Spovedanie',
  'Acatist',
  'Paraclisul Maicii Domnului',
  'Sfântul Maslu',
  'Litie',
  'Parastas',
  'Priveghere',
  'Denie',
  'Liturghia Darurilor mai înainte sfințite',
  'Botez',
  'Cununie',
  'Altceva',
] as const;

const TIME = /^([01]?\d|2[0-3]):[0-5]\d$/;

/**
 * Zod's own message for a rejected key is English, and a rejected key is the
 * error this schema is most likely to show the volunteer. Returning `undefined`
 * for every other issue code leaves Zod's own messages alone.
 */
const unknownKeysMessage = (keys: readonly string[]) =>
  `Câmp necunoscut: ${keys.join(', ')}. Verificați scrierea.`;

/**
 * Shared with `./content-schema.ts`, so that the schedule and the three content
 * collections answer a misspelled key with one voice rather than two. It was
 * briefly copied into that file instead, to keep it loadable under plain node;
 * fixing the import above removed the reason for the copy.
 */
export const strictKeys = {
  error: (issue: { code: string; keys?: string[] }) =>
    issue.code === 'unrecognized_keys' ? unknownKeysMessage(issue.keys ?? []) : undefined,
};

export const serviceSchema = z.strictObject(
  {
    time: z
      .string()
      .regex(TIME, 'Ora trebuie scrisă ca 08:30')
      // Safe to destructure: `.transform` only runs once the regex above has
      // passed, and that regex guarantees exactly one colon.
      .transform((s) => {
        const [h, m] = s.split(':');
        return `${h.padStart(2, '0')}:${m}`;
      }),
    service: z.enum(SERVICE_NAMES),
    detail: z.string().optional(),
  },
  strictKeys,
).refine((s) => s.service !== 'Altceva' || Boolean(s.detail?.trim()), {
  // "Altceva" is the escape hatch for a service not on the dropdown, and it is
  // only an escape hatch if the real name follows. Left empty, the word
  // "Altceva" is what a parishioner reads off the schedule.
  message: 'Pentru "Altceva" completați și câmpul detaliu cu numele slujbei.',
  path: ['detail'],
});

/**
 * Do not add a `$schema` key to this shape, however tempting.
 *
 * Astro's `generateJSONSchema` calls `.extend({ $schema })` on the collection
 * schema, and Zod 4 refuses to overwrite a key that already exists on a schema
 * carrying refinements. Declaring `$schema` here therefore fails *every* build
 * with "Cannot overwrite keys on object schemas containing refinements", from
 * inside `astro sync`, before any of this file's own rules ever run. Strictness
 * is not the cause - a non-strict object with a `$schema` key fails identically.
 *
 * Astro injects `$schema` into the generated JSON schema on its own, so editors
 * still get autocomplete. The only cost is that a hand-written `$schema:` line
 * inside a YAML file is rejected - loudly, and by name.
 */
export const daySchema = z
  .strictObject(
    {
      /*
       * THE FILENAME IS STILL THE PRIMARY KEY. This field is only allowed here.
       *
       * The CMS has to declare a `date` field - `slug: "{{fields.date}}"` and
       * `identifier_field: date` in `public/admin/config.yml` both name it, and
       * that is what makes the filename the date. Sveltia then writes it into
       * the file like any other field, and this object is strict, so without
       * this line the FIRST day a volunteer publishes fails the build with
       * "Câmp necunoscut: data".
       *
       * Optional, because the hand-written seed files in `src/content/services/`
       * do not carry it and should not have to. When it is present,
       * `idFromFilename` requires it to equal the filename; the schema cannot
       * check that itself, because Zod is handed a file's contents and never
       * its name.
       */
      date: z
        .string()
        .regex(DATE, 'Data trebuie scrisă ca 2026-09-14, între ghilimele.')
        .optional(),
      feast: z.string().optional(),
      great_feast: z.boolean().default(false),
      fast_day: z.boolean().default(false),
      cancelled: z.boolean().default(false),
      notes: z.string().optional(),
      /*
       * Trimmed, and ONLY trimmed.
       *
       * The trim is a real fix and belongs here: whitespace carries no meaning,
       * a value of "   " used to print "Slujbele acestei zile au loc la  ." and
       * to put spaces in the feed's LOCATION, and no consumer wants it. Emptying
       * it makes it falsy, so the sentence is skipped and `ics.ts` falls back to
       * the parish address.
       *
       * A trailing full stop is NOT stripped, and that is a deliberate reversal.
       * Both pages compose a sentence around this field, so "Winterthur." used
       * to read "Winterthur..", and the tempting fix was to strip the stop here
       * alongside the whitespace. It is the wrong place:
       *
       *   NORMALISE FOR PRESENTATION AT PRESENTATION TIME; DO NOT MUTATE STORED
       *   DATE TO FIX HOW IT READS.
       *
       * Canonicalising `time` to `HH:MM` above is the legitimate kind - one
       * value, one spelling, nothing lost. Stripping punctuation from a
       * free-text field is the other kind: it loses information ("Capela Sf."
       * becomes "Capela Sf"), and this field is not only prose. `ics.ts` writes
       * it into LOCATION, which is data a calendar client stores, not a sentence
       * we are composing. A presentation problem must not edit the record of
       * what the parish typed.
       *
       * The doubled stop is handled where the sentence is built, by
       * `fullStop` in `schedule.ts`.
       */
      location: z.string().trim().optional(),
      services: z.array(serviceSchema),
    },
    strictKeys,
  )
  /**
   * At least one service, even on a cancelled day.
   *
   * The `anulat` exemption used to live here, and it quietly broke the promise
   * in spec 8 that a cancelled day emits STATUS:CANCELLED rather than
   * disappearing. `ics.ts` writes one VEVENT per service, so a cancelled day
   * left with no times emits nothing at all: a subscriber who already has
   * Sunday's Liturgy keeps it, never sees the cancellation, and drives to a
   * locked church. The one group the feed exists to inform is the one group it
   * fails.
   *
   * So the times stay and the flag carries the cancellation. The message says so
   * rather than only refusing, because deleting the rows is exactly what a
   * volunteer's instinct says to do when a service is called off.
   */
  .refine((z_) => z_.services.length > 0, {
    message:
      'Ziua trebuie să aibă cel puțin o slujbă. Dacă slujbele nu mai au loc, ' +
      'păstrați orele și bifați „anulat”: altfel, cei abonați la calendar rămân ' +
      'cu vechiul program și nu află de anulare.',
    path: ['services'],
  })
  .refine((z_) => !z_.great_feast || Boolean(z_.feast?.trim()), {
    message: 'Un praznic mare trebuie să aibă și numele praznicului completat.',
    path: ['feast'],
  })
  /**
   * Two *different* services at one time are legitimate - confession runs
   * during vespers - so this rejects only the same service listed twice at the
   * same time, which is always a mistake.
   *
   * The calendar feed's UID scheme depends on this. UIDs are built from the
   * date, the time and the service name, so this invariant is the only thing
   * stopping two entries from sharing a UID and silently collapsing into one
   * event in every subscriber's calendar. Do not relax it without changing
   * that scheme first.
   *
   * `time` is normalised before this runs, so `7:30` and `07:30` count as the
   * same time rather than slipping past as two spellings.
   */
  .refine(
    (z_) => {
      const keys = z_.services.map((s) => `${s.time} ${s.service}`);
      return new Set(keys).size === keys.length;
    },
    {
      message: 'Aceeași slujbă nu poate apărea de două ori la aceeași oră.',
      path: ['services'],
    },
  );

export type Service = z.infer<typeof serviceSchema>;
export type ServiceDay = z.infer<typeof daySchema> & { date: string };
