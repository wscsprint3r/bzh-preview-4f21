import { defineConfig } from 'astro/config';
import { copyCms } from './scripts/copy-cms.mjs';
import { cspHashes } from './scripts/csp-hash.mjs';
import { directoryIndexes } from './scripts/dev-index.mjs';
import { redirects } from './scripts/redirects.mjs';

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
const cmsCopy = {
  name: 'copy-cms',
  hooks: {
    'astro:config:setup': ({ logger }) => {
      copyCms((message) => logger.info(message));
    },
  },
};

/*
 * `cspHashes` runs at `astro:build:done`, which is after `public/` has been
 * copied into `dist/` — so it rewrites the copy and never touches the source.
 * It is a build-only integration: `astro dev` serves `public/_headers` with its
 * placeholder intact, which costs nothing, because a dev server applies
 * `_headers` to nothing. The file only means anything on Cloudflare Pages.
 */
export default defineConfig({
  integrations: [cmsCopy, cspHashes, directoryIndexes, redirects],
  site: 'https://www.bor-zh.ch',
  output: 'static',
  trailingSlash: 'always',
  i18n: {
    defaultLocale: 'ro',
    locales: ['ro', 'de'],
    routing: { prefixDefaultLocale: false },
  },
  build: { inlineStylesheets: 'always' },
  markdown: {
    /*
     * SYNTAX HIGHLIGHTING OFF, and it is a decision about this site rather
     * than about a preference. This is a parish's prose: no page ever intends
     * a code block. One migrated article, however, carries an indented list
     * from WordPress that Turndown turned into a fenced block, and Shiki's
     * default theme rendered it as a dark panel with `background-color:
     * #24292e; color: #e1e4e8` written into a `style=` attribute. That failed
     * two guards at once: `stylesheet.itest.ts` ("the colours come from
     * tokens, not from hex literals") and the axe pass, which reported the
     * contrast inside it as an `incomplete` - and an incomplete is a failure
     * here. Off, the same block renders as a plain `<pre><code>` styled by
     * `[slug].astro` from the palette.
     *
     * Heading levels are normalised in `[slug].astro` via
     * `src/lib/markdown-headings.ts`, not here: Astro 7's default processor is
     * Sätteri, and `markdown.rehypePlugins` would require adding
     * `@astrojs/markdown-remark` as a dependency for one transform.
     */
    syntaxHighlight: false,
  },
});
