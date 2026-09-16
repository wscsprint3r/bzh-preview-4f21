/*
 * `/admin/` under `astro dev`, which was a 404.
 *
 * ===========================================================================
 * WHAT WAS ACTUALLY WRONG, because there are two different 404s here and only
 * one of them was ever fixed.
 *
 * Ruling #46 chose an Astro integration over `prebuild`/`predev` hooks because
 * three of this repository's own commands bypass npm lifecycle hooks, so a fresh
 * clone would serve `/admin/`'s only SCRIPT as a 404 - the Sveltia bundle had
 * never been copied into `public/admin/`. That is real and that integration
 * fixed it: `astro dev` serves `/admin/sveltia-cms.mjs` (1.96 MB) and
 * `/admin/chunks/react-dom.js` with status 200.
 *
 * The other 404 is this one, and it is unrelated. Astro's dev server serves
 * `public/` as static files and does NOT resolve a directory index for them, so
 * `/admin/index.html` is 200 while `/admin/` and `/admin` are both Astro's own
 * 404 page. Nothing in the repository said so, and every instruction a developer
 * follows - `README.md`, handover D1, G and H1 - says `/admin/`. Opening the CMS
 * locally is the first thing anybody does.
 *
 * Production is unaffected: Cloudflare Pages resolves the directory index, and so
 * does `scripts/a11y.mjs`'s own server, which is why every audit and every
 * integration test sees `/admin/` correctly. That is precisely what made this
 * invisible - the one surface with no test coverage behaving differently in the
 * one place with no test coverage.
 *
 * DEV ONLY, BY CONSTRUCTION. This is wired into `astro:server:setup`, which runs
 * for `astro dev` and nothing else. It changes no built output and it is not a
 * substitute for what the host does - it makes the dev server agree with the
 * host, rather than making the site depend on it.
 *
 * WHY A REWRITE AND NOT A REDIRECT: a redirect would change the URL in the
 * address bar to `/admin/index.html`, which is the string this exists to stop
 * anybody having to learn.
 * ===========================================================================
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));

/**
 * The `index.html` a directory request should be served, or null to leave the
 * request alone.
 *
 * Pure, and separated from the middleware, so it can be tested without a server:
 * `src/lib/dev-index.test.ts`.
 *
 * The site root is excluded explicitly. `/` is an Astro ROUTE, and a rewrite
 * there would hand a static file to a request Astro is meant to render - today
 * `public/index.html` does not exist so nothing would change, which is exactly
 * the kind of "harmless because of a coincidence" this project does not keep.
 *
 * @param {string} url the request URL, query and fragment included
 * @param {(cale: string) => boolean} [exista] whether that path is a file in `public/`
 * @returns {string | null}
 */
export function indexulPublic(url, exista = (cale) => existsSync(join(PUBLIC, cale))) {
  const taietura = url.search(/[?#]/);
  const cale = taietura === -1 ? url : url.slice(0, taietura);
  const coada = taietura === -1 ? '' : url.slice(taietura);
  if (cale === '/' || !cale.startsWith('/') || !cale.endsWith('/')) return null;
  const candidat = `${cale}index.html`;
  return exista(decodeURIComponent(candidat.slice(1))) ? `${candidat}${coada}` : null;
}

/** The integration `astro.config.mjs` registers. */
export const indexeDirectoare = {
  name: 'indexe-directoare',
  hooks: {
    'astro:server:setup': ({ server }) => {
      server.middlewares.use((req, _res, next) => {
        const rescris = indexulPublic(req.url ?? '');
        if (rescris !== null) req.url = rescris;
        next();
      });
    },
  },
};
