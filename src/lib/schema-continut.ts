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
 * TWO CONSTRAINTS SHAPE THIS FILE THAT DO NOT APPLY TO MOST OF `src/lib/`, and
 * both are easy to undo by accident:
 *
 * - **It must run under plain `node`, outside Astro and outside vitest.** The
 *   migration scripts validate a post's frontmatter BEFORE writing the file,
 *   and they are `.mjs` run directly by node. That is what makes a bad post a
 *   failed migration rather than a failed build an hour later. Two things
 *   follow, and the second was measured rather than assumed:
 *   - Import nothing that exists only inside Astro's build - above all never
 *     `astro:content`, which is a virtual module that plain node cannot
 *     resolve. `astro/zod` is a real file and resolves fine.
 *   - **Every relative import carries its `.ts` extension**, here and in
 *     anything it pulls in. Node's type-stripping resolves relative specifiers
 *     literally, so a bare `'./date-ro'` throws ERR_MODULE_NOT_FOUND - which is
 *     what `./schema.ts` used to do, and why this file briefly kept its own
 *     copy of `cheiStricte` rather than importing one. The import there is fixed
 *     now and the copy is gone.
 *   Vite, Astro and vitest all resolve extensionless imports happily, so NONE of
 *   this is visible to the ordinary suite. The guard is the child-process test
 *   in `schema-continut.test.ts`, which spawns a real `node`.
 * - **Only erasable TypeScript.** No `enum`, no `namespace`, no parameter
 *   properties - anything node's type-stripper cannot simply delete is a
 *   runtime error outside the Astro build.
 *
 * EVERY MESSAGE NAMES ITS OWN FIELD AND ITS OWN REMEDY. Zod's defaults are
 * English and talk about types ("expected string, received undefined"), which
 * tells a volunteer nothing they can act on. The mistakes worth spelling out
 * are the ones a person actually makes in YAML: deleting a line, dropping the
 * quotation marks, typing `"true"` for a flag. A shared helper that produced one
 * message for several fields was worse than the English, because it named the
 * wrong field: blanking the telephone number used to answer "Titlul nu poate fi
 * gol."
 */

import { z } from 'astro/zod';
import { partiData } from './date-ro.ts';
import { cheiStricte } from './schema.ts';

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
 * A required, non-empty text field, with both of its messages given by the
 * caller.
 *
 * Two messages and not one, because the two mistakes are different and want
 * different words: `lipsa` is what a volunteer reads when the line is gone
 * altogether (Zod reports that as a type error, since the value is `undefined`),
 * and `gol` is what they read when the line is there but holds only spaces.
 *
 * Both are passed in rather than built from a field name, because Romanian
 * agreement makes a template wrong: the address is "goală" where the title is
 * "gol". A helper that guessed would produce confident, misspelled Romanian.
 */
const textNevid = (lipsa: string, gol: string) =>
  z
    .string({ error: (issue) => (issue.code === 'invalid_type' ? lipsa : undefined) })
    .trim()
    .min(1, { message: gol });

/**
 * `YYYY-MM-DD` that is a real calendar date, validated by Phase 1's parser.
 *
 * `partiData` rather than a regex, and for the reason it was written: a regex
 * waves `2025-02-30` through, and `Date.UTC` then rolls it silently to 2 March.
 * One parser for this format in the codebase.
 *
 * THE TYPE ERROR IS SPLIT THREE WAYS, because one message for all of them was
 * actively misleading. `data` missing, `data: null` and `data: 20251105` are all
 * `invalid_type` exactly as a YAML-parsed `Date` is, so a single handler told
 * someone who had DELETED the line to add quotation marks to it. `issue.input`
 * is what tells them apart - the same discrimination `./schema.ts` makes with
 * `instanceof Date`, at the only point where the offending value is in hand.
 */
const dataReala = z
  .string({
    error: (issue) => {
      if (issue.code !== 'invalid_type') return undefined;
      if (issue.input instanceof Date) {
        return (
          'Data trebuie scrisă între ghilimele, de exemplu data: "2025-11-05". ' +
          'Fără ghilimele, fișierul o citește ca dată calendaristică, nu ca text.'
        );
      }
      if (issue.input === undefined) {
        return 'Articolul trebuie să aibă o dată, scrisă ca data: "2025-11-05".';
      }
      return 'Data se scrie ca text, între ghilimele, de exemplu data: "2025-11-05".';
    },
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

export const articolSchema = z
  .strictObject(
    {
      titlu: textNevid('Articolul trebuie să aibă un titlu.', 'Titlul nu poate fi gol.'),
      data: dataReala,
      /*
       * NO DEFAULT, DELIBERATELY. 32 of the 45 migrated posts arrive
       * `publicat: false` because a bulk import destroyed their dates, and the
       * parish dates them later in the CMS. A default of `true` would publish
       * all 32 the first time anyone touched a file; a default of `false` would
       * silently unpublish a post whose flag was lost. Requiring it means the
       * file always says which it is, and a lost flag is a failed build.
       *
       * An unpublished post is absent from `/noutati`, from the homepage and
       * from the feed, AND has no page of its own - otherwise "unpublished"
       * would mean "reachable by anyone with the link".
       *
       * The second message exists because `publicat: "true"` is a string, and a
       * non-empty string is truthy anywhere downstream that forgets to care.
       */
      publicat: z.boolean({
        error: (issue) => {
          if (issue.code !== 'invalid_type') return undefined;
          return issue.input === undefined
            ? 'Articolul trebuie să spună dacă este publicat: scrieți publicat: true sau publicat: false.'
            : 'Câmpul publicat primește doar true sau false, scrise fără ghilimele.';
        },
      }),
      /*
       * A missing enum and a wrong enum are the same issue code in Zod 4
       * (`invalid_value`, measured), so the two are told apart by `issue.input`
       * rather than by the code. The list comes from `CATEGORII` so the message
       * cannot fall behind the set it describes.
       */
      categorie: z.enum(CATEGORII, {
        error: (issue) =>
          issue.input === undefined
            ? `Articolul trebuie să aibă o categorie: ${CATEGORII.join(' sau ')}.`
            : `Categoria poate fi doar ${CATEGORII.join(' sau ')}.`,
      }),
      autor: z
        .string({
          error: (issue) =>
            issue.code === 'invalid_type' ? 'Numele autorului se scrie ca text.' : undefined,
        })
        .trim()
        .min(1, { message: 'Numele autorului nu poate fi gol.' })
        .default('Parohia'),
      rezumat: z.string().trim().optional(),
      imagine: z.string().trim().optional(),
    },
    cheiStricte,
  )
  .describe('Un articol de pe /noutati.');

export const paginaSchema = z
  .strictObject(
    {
      titlu: textNevid('Pagina trebuie să aibă un titlu.', 'Titlul paginii nu poate fi gol.'),
      /*
       * The route, WITHOUT a leading or trailing slash: `parohia/istoric`.
       * `[...pagina].astro` builds `/${cale}/` from it, so a stored slash yields
       * `//parohia/istoric//` - a 404 produced by a file that reads correctly.
       *
       * Lower-case ASCII, digits and single hyphens between segments. Diacritics
       * are rejected rather than transliterated here: the page titles carry them
       * ("Pictură", "Școala"), the URLs must not, and silently mapping one to
       * the other in the schema would hide which of the two a mismatch came
       * from.
       */
      cale: z
        .string({
          error: (issue) => {
            if (issue.code !== 'invalid_type') return undefined;
            return issue.input === undefined
              ? 'Pagina trebuie să aibă o cale, de exemplu cale: "parohia/istoric".'
              : 'Calea se scrie ca text, între ghilimele.';
          },
        })
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/, {
          message:
            'Calea se scrie cu litere mici, cifre și liniuțe, fără diacritice și fără slash ' +
            'la început sau la sfârșit, de exemplu parohia/istoric.',
        }),
      ordine: z
        .number({
          error: (issue) => {
            if (issue.code !== 'invalid_type') return undefined;
            return issue.input === undefined
              ? 'Pagina trebuie să aibă o ordine, un număr întreg, de exemplu 10.'
              : 'Ordinea se scrie ca număr, fără ghilimele, de exemplu 10.';
          },
        })
        .int({ message: 'Ordinea trebuie să fie un număr întreg, de exemplu 10.' }),
      descriere: z.string().trim().optional(),
      imagine: z.string().trim().optional(),
    },
    cheiStricte,
  )
  .describe('O pagină de text editabilă.');

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
      nume: textNevid(
        'Setările trebuie să cuprindă numele parohiei.',
        'Numele parohiei nu poate fi gol.',
      ),
      adresa: textNevid(
        'Setările trebuie să cuprindă adresa parohiei.',
        'Adresa parohiei nu poate fi goală.',
      ),
      telefon: textNevid(
        'Setările trebuie să cuprindă numărul de telefon.',
        'Numărul de telefon nu poate fi gol.',
      ),
      /*
       * `.pipe(z.email())` rather than the shorter `.email()`, which Zod 4
       * deprecates: the short form still works but makes `astro check` report a
       * deprecation hint, and CI runs that check. The pipe keeps the `.trim()`
       * in front, so a value pasted into the CMS with a stray space is cleaned
       * before it is judged rather than rejected for the space.
       */
      email: z
        .string({
          error: (issue) => {
            if (issue.code !== 'invalid_type') return undefined;
            return issue.input === undefined
              ? 'Setările trebuie să cuprindă o adresă de e-mail.'
              : 'Adresa de e-mail se scrie ca text.';
          },
        })
        .trim()
        .pipe(z.email({ message: 'Adresa de e-mail nu este validă.' })),
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
       * HTTPS CERUT ANUME, nu doar "o adresă". Un `z.url()` simplu primește și
       * `http://`, și `ftp://`, și - măsurat - `javascript:alert(1)`, care pus
       * într-un `href` ar fi exact felul de gaură din care a pornit tot
       * proiectul. Restrângerea face și mesajul adevărat: fără ea el promitea un
       * https pe care regula nu îl cerea.
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
  })
  .describe('Datele parohiei, editabile din CMS.');

export type Articol = z.infer<typeof articolSchema>;
export type Pagina = z.infer<typeof paginaSchema>;
export type Setari = z.infer<typeof setariSchema>;
