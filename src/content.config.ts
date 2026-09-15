import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { ziSchema } from './lib/schema';

const slujbe = defineCollection({
  loader: glob({
    pattern: '**/*.yml',
    base: './src/content/slujbe',
    // The filename is the date, so use the stem verbatim rather than letting
    // github-slugger rewrite it.
    generateId: ({ entry }) => entry.replace(/\.yml$/, ''),
  }),
  schema: ziSchema,
});

export const collections = { slujbe };
