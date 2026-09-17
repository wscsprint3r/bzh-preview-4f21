import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { idDinNumeFisier, ziSchema } from './lib/schema';
import { articolSchema, paginaSchema, setariSchema } from './lib/schema-continut';

const slujbe = defineCollection({
  loader: glob({
    // `.yaml` is matched on purpose even though only `.yml` is allowed. With a
    // pattern of `**/*.yml` alone, a file named `2026-09-21.yaml` is never read
    // at all: no error, no entry, just a day missing from the schedule on a
    // green build. Matching it here is what lets `idDinNumeFisier` reject it by
    // name instead.
    pattern: ['**/*.yml', '**/*.yaml'],
    base: './src/content/slujbe',
    // The filename is the date, and the date is this collection's primary key,
    // so it is validated rather than handed to github-slugger. A throw here
    // fails the build - which is the point, because Zod only ever sees a file's
    // contents, never its name.
    // `data` is the file's PARSED, UNVALIDATED contents - Zod has not run yet.
    // It is passed in so that a `data:` field written by the CMS can be checked
    // against the filename, which is the only place the two are visible at once:
    // the loader knows the name, the schema knows the contents, and neither
    // knows both.
    generateId: ({ entry, data }) => idDinNumeFisier(entry, data),
  }),
  schema: ziSchema,
});

/*
 * The three content collections of Phase 2. Their rules live in
 * `./lib/schema-continut.ts` rather than inline here, for the same reason
 * `ziSchema` does: that file is unit-tested without booting Astro, and it is
 * imported directly by the migration scripts, which run under plain node.
 *
 * Unlike `slujbe`, none of these three has a meaningful primary key of its own,
 * so none overrides `generateId`. The article slug and the page id come from
 * the filename by Astro's own slugger, which is what the migration writes and
 * what the CMS expects.
 */
const articole = defineCollection({
  loader: glob({ pattern: ['**/*.md'], base: './src/content/articole' }),
  schema: articolSchema,
});

const pagini = defineCollection({
  loader: glob({ pattern: ['**/*.md'], base: './src/content/pagini' }),
  schema: paginaSchema,
});

const setari = defineCollection({
  // Both extensions, for the reason spelled out on `slujbe` above: a file saved
  // as `setari.yaml` would otherwise not be read at all, and the site would
  // silently fall back to having no settings rather than say so.
  loader: glob({ pattern: ['**/*.yml', '**/*.yaml'], base: './src/content/setari' }),
  schema: setariSchema,
});

export const collections = { slujbe, articole, pagini, setari };
