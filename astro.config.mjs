import { defineConfig } from 'astro/config';
import { copiazaCms } from './scripts/copy-cms.mjs';

/**
 * Puts the Sveltia CMS bundle under `public/admin/` before anything reads that
 * folder.
 *
 * AN INTEGRATION RATHER THAN AN npm LIFECYCLE HOOK, and the difference is not
 * style. `prebuild` and `predev` are skipped by three of this repository's own
 * commands - `npm run test:build` and `npm run a11y` call `astro build`
 * directly, and CLAUDE.md documents `astro dev --background` as the way to
 * start the dev server - so a fresh clone driven any of those ways serves an
 * `/admin/` whose only script is a 404. `astro:config:setup` runs for dev,
 * build, sync, check and preview alike, which makes the copy a property of
 * building this site rather than of which command someone happened to type.
 *
 * The bundle is git-ignored, so this is also what makes a fresh clone work at
 * all. See `scripts/copy-cms.mjs` for what is copied and why it is more than
 * the one entry file.
 */
const copiereaCms = {
  name: 'copiaza-cms',
  hooks: {
    'astro:config:setup': ({ logger }) => {
      copiazaCms((mesaj) => logger.info(mesaj));
    },
  },
};

export default defineConfig({
  integrations: [copiereaCms],
  site: 'https://www.bor-zh.ch',
  output: 'static',
  trailingSlash: 'always',
  i18n: {
    defaultLocale: 'ro',
    locales: ['ro', 'de'],
    routing: { prefixDefaultLocale: false },
  },
  build: { inlineStylesheets: 'always' },
});
