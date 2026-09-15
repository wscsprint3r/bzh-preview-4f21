import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { idDinNumeFisier, ziSchema } from './lib/schema';

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
    generateId: ({ entry }) => idDinNumeFisier(entry),
  }),
  schema: ziSchema,
});

export const collections = { slujbe };
