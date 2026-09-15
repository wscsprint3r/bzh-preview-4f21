/**
 * What a service day is, and the only place that decides whether one is valid.
 *
 * This schema is the safety barrier of the site. The person editing the
 * schedule is a parish volunteer, not a developer, and the alternative to a
 * failed build is a wrong service time in front of someone who drove to church
 * for it. So every rule here is written to fail loudly at build time rather
 * than to be forgiving at runtime.
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

export const slujbaSchema = z.object({
  ora: z.string().regex(ORA, 'Ora trebuie scrisă ca 08:30'),
  slujba: z.enum(NUME_SLUJBE),
  detaliu: z.string().optional(),
});

export const ziSchema = z
  .object({
    praznic: z.string().optional(),
    praznic_mare: z.boolean().default(false),
    zi_de_post: z.boolean().default(false),
    anulat: z.boolean().default(false),
    note: z.string().optional(),
    locatie: z.string().optional(),
    slujbe: z.array(slujbaSchema),
  })
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
