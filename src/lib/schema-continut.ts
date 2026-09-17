/**
 * What an article, a prose page and the parish's own details are, and the only
 * place that decides whether one of them is valid.
 *
 * Same principle as `./schema.ts`, for the same reason: the person editing this
 * content is a parish volunteer, not a developer, and the alternative to a
 * failed build is wrong information in front of someone who acted on it. A
 * wrong service time sends someone to a locked church; a wrong IBAN sends their
 * money somewhere else. So every rule here fails loudly at build time rather
 * than being forgiving at runtime.
 *
 * TWO CONSTRAINTS SHAPE THIS FILE THAT DO NOT APPLY TO `./schema.ts`, and both
 * are easy to undo by accident:
 *
 * - **It must run under plain `node`, outside Astro and outside vitest.** The
 *   migration scripts validate a post's frontmatter BEFORE writing the file,
 *   and they are `.mjs` run directly by node. That is what makes a bad post a
 *   failed migration rather than a failed build an hour later. Two things
 *   follow, and the second was measured rather than assumed:
 *   - Import nothing that exists only inside Astro's build - above all never
 *     `astro:content`, which is a virtual module that plain node cannot
 *     resolve. `astro/zod` is a real file and resolves fine.
 *   - **Relative imports carry their `.ts` extension.** Node's type-stripping
 *     does not do bundler-style extension guessing: importing `./date-ro` the
 *     way `./schema.ts` does fails with ERR_MODULE_NOT_FOUND, which is why
 *     `./schema.ts` itself cannot be imported from a script. Measured on node
 *     22.18.0. `allowImportingTsExtensions` is already on in Astro's base
 *     tsconfig, so the explicit extension type-checks and builds unchanged.
 * - **Only erasable TypeScript.** No `enum`, no `namespace`, no parameter
 *   properties - anything node's type-stripper cannot simply delete is a
 *   runtime error outside the Astro build, and one that appears nowhere in this
 *   project's own test suite.
 *
 * Kept in `lib/` rather than inline in `content.config.ts` so it can be
 * unit-tested, and imported, without booting Astro.
 */

import { z } from 'astro/zod';
import { partiData } from './date-ro.ts';

/**
 * The categories the migrated corpus actually uses.
 *
 * Measured over the 45 posts: `Noutati` on 42 and `Catehismul Bisericii
 * Ortodoxe` on 3, which the migration renames to `Cateheza`. The design's model
 * also listed a third, for announcements, which no post has ever carried - so
 * it is not offered. An option nobody uses is an option a volunteer has to
 * think about every week.
 *
 * THIS SET IS A CONTRACT, not a local convenience. The migration stops the run
 * on a category outside it, and the CMS builds its dropdown from it, so the
 * three must agree. The values are deliberately ASCII: they are keys that
 * travel into frontmatter and a URL, not prose a visitor reads.
 */
export const CATEGORII = ['Noutati', 'Cateheza'] as const;

/**
 * Zod's own message for a rejected key is English and names no remedy, and a
 * rejected key is the error these schemas are most likely to show a volunteer:
 * a field misspelled in the CMS or in a hand-edited file. Returning `undefined`
 * for every other issue code leaves Zod's own messages alone.
 *
 * COPIED FROM `./schema.ts` RATHER THAN IMPORTED, deliberately. Importing it
 * would drag this module's whole import graph along - and `./schema.ts` is not
 * loadable from plain node, for the extension reason in the header, so that one
 * import would break the migration scripts while every test here stayed green.
 * The wording must stay identical in both: a volunteer who learns what "Câmp
 * necunoscut" means on the schedule should not meet a second phrasing on an
 * article. `schema-continut.test.ts` asserts the two messages match, because
 * nothing else would notice them drifting apart.
 */
const mesajCheiNecunoscute = (chei: readonly string[]) =>
  `Câmp necunoscut: ${chei.join(', ')}. Verificați scrierea.`;

const cheiStricte = {
  error: (issue: { code: string; keys?: string[] }) =>
    issue.code === 'unrecognized_keys' ? mesajCheiNecunoscute(issue.keys ?? []) : undefined,
};

/** A title that is actually there. `.trim()` runs first, so "   " is empty. */
const titluNevid = z.string().trim().min(1, { message: 'Titlul nu poate fi gol.' });

/**
 * `YYYY-MM-DD` that is a real calendar date, validated by Phase 1's parser.
 *
 * `partiData` rather than a regex, and for the reason it was written: a regex
 * waves `2025-02-30` through, and `Date.UTC` then rolls it silently to 2 March.
 * One parser for this format in the codebase.
 *
 * The `invalid_type` message is the other half, and it is the mistake that will
 * actually happen. Unquoted, YAML reads `data: 2025-11-05` as a calendar date
 * rather than as text, so the schema is handed a `Date` and Zod says "expected
 * string, received Date" - true, in English, and about types rather than about
 * what to do. The schedule paid for this once already; the message here names
 * the remedy instead.
 */
const dataReala = z
  .string({
    error: (issue) =>
      issue.code === 'invalid_type'
        ? 'Data trebuie scrisă între ghilimele, de exemplu data: "2025-11-05". ' +
          'Fără ghilimele, fișierul o citește ca dată calendaristică, nu ca text.'
        : undefined,
  })
  .refine(
    (v) => {
      try {
        partiData(v);
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Data trebuie să fie o zi reală, scrisă ca 2025-11-05.' },
  );

export const articolSchema = z.strictObject(
  {
    titlu: titluNevid,
    data: dataReala,
    /*
     * NO DEFAULT, DELIBERATELY. 32 of the 45 migrated posts arrive
     * `publicat: false` because a bulk import destroyed their dates, and the
     * parish dates them later in the CMS. A default of `true` would publish all
     * 32 the first time anyone touched a file; a default of `false` would
     * silently unpublish a post whose flag was lost. Requiring it means the
     * file always says which it is, and a lost flag is a failed build.
     *
     * An unpublished post is absent from `/noutati`, from the homepage and from
     * the feed, AND has no page of its own - otherwise "unpublished" would mean
     * "reachable by anyone with the link".
     */
    publicat: z.boolean(),
    categorie: z.enum(CATEGORII),
    autor: z.string().trim().min(1, { message: 'Numele autorului nu poate fi gol.' }).default('Parohia'),
    rezumat: z.string().trim().optional(),
    imagine: z.string().trim().optional(),
  },
  cheiStricte,
);

export const paginaSchema = z.strictObject(
  {
    titlu: titluNevid,
    /*
     * The route, WITHOUT a leading or trailing slash: `parohia/istoric`.
     * `[...pagina].astro` builds `/${cale}/` from it, so a stored slash yields
     * `//parohia/istoric//` - a 404 produced by a file that reads correctly.
     *
     * Lower-case ASCII, digits and single hyphens between segments. Diacritics
     * are rejected rather than transliterated here: the page titles carry them
     * ("Pictură", "Școala"), the URLs must not, and silently mapping one to the
     * other in the schema would hide which of the two a mismatch came from.
     */
    cale: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/, {
      message:
        'Calea se scrie cu litere mici, cifre și liniuțe, fără diacritice și fără slash ' +
        'la început sau la sfârșit, de exemplu parohia/istoric.',
    }),
    ordine: z.number().int({ message: 'Ordinea este un număr întreg, de exemplu 10.' }),
    descriere: z.string().trim().optional(),
    imagine: z.string().trim().optional(),
  },
  cheiStricte,
);

/**
 * The two values the live WordPress footer shows today, both Athos theme demo
 * leftovers: an address nobody reads and a French phone number nobody answers.
 * Migrating either would be worse than leaving the field blank, because a
 * plausible wrong contact is one a parishioner will actually try.
 */
const DEMO = ['info@website.com', '+33 877 554 332'];

export const setariSchema = z
  .strictObject(
    {
      nume: titluNevid,
      adresa: titluNevid,
      telefon: titluNevid,
      /*
       * `.pipe(z.email())` rather than the shorter `.email()`, which Zod 4
       * deprecates: the short form still works but makes `astro check` report a
       * deprecation hint, and CI runs that check. The pipe keeps the `.trim()`
       * in front, so a value pasted into the CMS with a stray space is cleaned
       * before it is judged rather than rejected for the space.
       */
      email: z.string().trim().pipe(z.email({ message: 'Adresa de e-mail nu este validă.' })),
      telefon2: z.string().trim().optional(),
      email2: z
        .string()
        .trim()
        .pipe(z.email({ message: 'A doua adresă de e-mail nu este validă.' }))
        .optional(),
      iban: z.string().trim().optional(),
      iban2: z.string().trim().optional(),
      program_vizite: z.string().trim().optional(),
      /*
       * HTTPS CERUT ANUME, nu doar "o adresă". Un `z.url()` simplu primește
       * și `http://`, și `ftp://`, și - măsurat - `javascript:alert(1)`, care
       * pus într-un `href` ar fi exact felul de gaură din care a pornit tot
       * proiectul. Restrângerea face și mesajul adevărat: fără ea el promitea
       * un https pe care regula nu îl cerea.
       */
      harta: z
        .string()
        .trim()
        .pipe(
          z.url({
            protocol: /^https$/,
            message: 'Adresa hărții trebuie să înceapă cu https://.',
          }),
        )
        .optional(),
    },
    cheiStricte,
  )
  /*
   * Checked across EVERY field rather than on `email` and `telefon` by name.
   * The second e-mail and the second phone number are exactly where a value
   * copied off the old site would come to rest, and a rule that named only the
   * first two would let it through while looking like it had checked.
   */
  .superRefine((v, ctx) => {
    for (const [cheie, valoare] of Object.entries(v)) {
      if (typeof valoare === 'string' && DEMO.includes(valoare.trim())) {
        ctx.addIssue({
          code: 'custom',
          path: [cheie],
          message:
            `Valoarea „${valoare}” este o rămășiță demo de pe situl vechi, ` +
            'nu un contact al parohiei.',
        });
      }
    }
  });

export type Articol = z.infer<typeof articolSchema>;
export type Pagina = z.infer<typeof paginaSchema>;
export type Setari = z.infer<typeof setariSchema>;
