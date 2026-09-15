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
);

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
  });

export type Slujba = z.infer<typeof slujbaSchema>;
export type ZiSlujba = z.infer<typeof ziSchema> & { data: string };
