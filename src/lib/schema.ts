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
 *   hand-edited YAML and the quietest one: `praznicmare:` simply never becomes
 *   `praznic_mare`, the day loses its feast styling, and the build stays green.
 *   Strict turns that into a build failure. Strict-and-wrong costs a minute;
 *   permissive-and-wrong costs a parishioner a wasted trip.
 * - **`ora` is normalised here, not downstream.** The editor may type `7:30`;
 *   everything that reads this schema gets `07:30`.
 *
 * Kept in `lib/` rather than inline in `content.config.ts` so it can be
 * unit-tested without booting Astro.
 */

import { z } from 'astro/zod';
import { partiData } from './date-ro';

const NUME_FISIER = /^(\d{4}-\d{2}-\d{2})\.yml$/;

/**
 * Validates a schedule filename and returns the date it encodes.
 *
 * The filename *is* the primary key of the schedule: it is the entry id, and
 * every later task joins on it. Zod never sees it - a collection schema is
 * handed the file's `data`, never its `id` - so without this the one field that
 * identifies a day would be the only unvalidated thing in the system.
 * `2026-02-30.yml`, `2026-9-21.yml`, a stray `.yaml` or a file in a subfolder
 * would each produce a missing or bogus day on a green build.
 *
 * Called from `generateId` in `content.config.ts`, where a throw fails the
 * build. `partiData` does the date half: one parser for this format in the
 * codebase, already tested against every date it accepts, now guarding the key
 * as well as the contents. A regex alone would wave `2026-02-30` through.
 */
export function idDinNumeFisier(entry: string): string {
  const m = NUME_FISIER.exec(entry);
  if (!m) {
    throw new Error(
      `Fișier de program cu nume nepermis: "${entry}". Numele trebuie să fie exact o dată, ` +
        `de forma 2026-09-14.yml, fără subdirectoare.`,
    );
  }
  try {
    partiData(m[1]); // aruncă pentru date inexistente, de exemplu 2026-02-30
  } catch (cauza) {
    // partiData names the date but not the file, and its stack points into
    // date-ro.ts, so on its own it leaves you hunting for which entry is wrong.
    throw new Error(
      `Fișier de program cu dată inexistentă: "${entry}". Ziua aceasta nu există în calendar.`,
      { cause: cauza },
    );
  }
  return m[1];
}

/**
 * The list the CMS offers as a dropdown. Keeping it closed is what stops
 * "Sf. Liturghie", "Sfanta Liturghie" and "Sfânta Liturghie" from all appearing
 * on the same page. "Altceva" plus `detaliu` is the escape hatch.
 */
export const NUME_SLUJBE = [
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

const ORA = /^([01]?\d|2[0-3]):[0-5]\d$/;

/**
 * Zod's own message for a rejected key is English, and a rejected key is the
 * error this schema is most likely to show the volunteer. Returning `undefined`
 * for every other issue code leaves Zod's own messages alone.
 */
const mesajCheiNecunoscute = (chei: readonly string[]) =>
  `Câmp necunoscut: ${chei.join(', ')}. Verificați scrierea.`;

const cheiStricte = {
  error: (issue: { code: string; keys?: string[] }) =>
    issue.code === 'unrecognized_keys' ? mesajCheiNecunoscute(issue.keys ?? []) : undefined,
};

export const slujbaSchema = z.strictObject(
  {
    ora: z
      .string()
      .regex(ORA, 'Ora trebuie scrisă ca 08:30')
      // Safe to destructure: `.transform` only runs once the regex above has
      // passed, and that regex guarantees exactly one colon.
      .transform((s) => {
        const [h, m] = s.split(':');
        return `${h.padStart(2, '0')}:${m}`;
      }),
    slujba: z.enum(NUME_SLUJBE),
    detaliu: z.string().optional(),
  },
  cheiStricte,
).refine((s) => s.slujba !== 'Altceva' || Boolean(s.detaliu?.trim()), {
  // "Altceva" is the escape hatch for a service not on the dropdown, and it is
  // only an escape hatch if the real name follows. Left empty, the word
  // "Altceva" is what a parishioner reads off the schedule.
  message: 'Pentru "Altceva" completați și câmpul detaliu cu numele slujbei.',
  path: ['detaliu'],
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
export const ziSchema = z
  .strictObject(
    {
      praznic: z.string().optional(),
      praznic_mare: z.boolean().default(false),
      zi_de_post: z.boolean().default(false),
      anulat: z.boolean().default(false),
      note: z.string().optional(),
      locatie: z.string().optional(),
      slujbe: z.array(slujbaSchema),
    },
    cheiStricte,
  )
  .refine((z_) => z_.anulat || z_.slujbe.length > 0, {
    message: 'Ziua trebuie să aibă cel puțin o slujbă, sau să fie marcată ca anulată.',
    path: ['slujbe'],
  })
  .refine((z_) => !z_.praznic_mare || Boolean(z_.praznic?.trim()), {
    message: 'Un praznic mare trebuie să aibă și numele praznicului completat.',
    path: ['praznic'],
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
   * `ora` is normalised before this runs, so `7:30` and `07:30` count as the
   * same time rather than slipping past as two spellings.
   */
  .refine(
    (z_) => {
      const chei = z_.slujbe.map((s) => `${s.ora} ${s.slujba}`);
      return new Set(chei).size === chei.length;
    },
    {
      message: 'Aceeași slujbă nu poate apărea de două ori la aceeași oră.',
      path: ['slujbe'],
    },
  );

export type Slujba = z.infer<typeof slujbaSchema>;
export type ZiSlujba = z.infer<typeof ziSchema> & { data: string };
