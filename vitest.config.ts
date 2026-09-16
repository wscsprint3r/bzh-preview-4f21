/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

export default getViteConfig({
  test: {
    // `migrare/**/*.test.mjs` is Phase 2's migration harness: plain Node ESM,
    // not TypeScript under `src/`, so it needs its own arm of the glob or
    // `npm test` silently stops running it - and every later migration task's
    // guard - the moment it lands.
    include: ['src/**/*.test.ts', 'migrare/**/*.test.mjs'],
  },
});
