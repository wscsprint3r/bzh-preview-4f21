/*
 * Copies the Sveltia CMS bundle out of `node_modules` into `public/admin/`, so
 * that `/admin/` serves its own code from its own origin.
 *
 * WHY IT IS COPIED AT ALL, rather than pointed at a CDN. Spec §14 promises
 * `script-src 'self'` on every page, `/admin/` included. The parish is here
 * because a WordPress install was broken into twice, and a CMS that fetches its
 * own code from someone else's host at run time is the same bet in a new
 * costume — on the one page that can write to the repository.
 *
 * WHY MORE THAN THE ENTRY FILE. The entry file is not the whole program.
 * `sveltia-cms.mjs` lazily imports `chunks/react-dom.js`, and the loader inside
 * it takes TWO candidates in order: `new URL('chunks/<name>.js',
 * import.meta.url)` — a sibling of this copy — and failing that
 * `https://unpkg.com/@sveltia/cms@<version>/dist/chunks/<name>.js`. Copying only
 * the entry file does not remove the CDN, it hides it: nothing fetches unpkg
 * until something needs the chunk, and under Task 13's CSP that fetch is
 * blocked rather than merely slow. Copying the folders makes the self-hosting
 * claim true by construction rather than true by my reading of minified code.
 *
 * WHAT IS LEFT BEHIND, and why the rule is a shape rather than a list of names:
 *
 *   - the ENTRY FILE that `require.resolve` returns, and every file in every
 *     SUBFOLDER beside it — that is the program plus everything it can lazily
 *     import, since the loader always builds `chunks/<name>.js`, a subpath.
 *   - not its top-level SIBLINGS. `dist/` also ships `sveltia-cms.js`, the
 *     classic-script build of the same 1.9 MB program for a page that loads it
 *     without `type="module"`. `index.html` loads the module, so the other
 *     entry point is 1.9 MB published to the world and never requested.
 *   - not `.map` files: 7 MB that help only a developer with devtools open.
 *
 * No filename is written here, so a chunk that an upgrade adds is copied
 * without anyone remembering to.
 *
 * RUN AS AN ASTRO INTEGRATION, from `astro.config.mjs`, and not from an npm
 * lifecycle hook. `prebuild` and `predev` are what the plan asked for and they
 * are bypassed by three of this repository's own commands - `npm run test:build`
 * and `npm run a11y` both call `astro build` directly, and CLAUDE.md documents
 * `astro dev --background` as the way to start the dev server. Every one of them
 * skips npm's hooks, and the result is an `/admin/` whose only script is a 404.
 * `astro:config:setup` runs for dev, build, sync, check and preview alike, so
 * the copy is a property of building this site rather than of which command
 * someone typed.
 *
 * Still runnable on its own - `node scripts/copy-cms.mjs` - for when the
 * question is whether the copy works rather than whether the site builds.
 *
 * Everything written here is git-ignored, and `.gitignore` has to keep up: see
 * the Task 12 report.
 */
import { copyFileSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join, posix } from 'node:path';
import { argv } from 'node:process';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

/** `node_modules/@sveltia/cms/dist/sveltia-cms.mjs`, per the package's `exports`. */
const INTRARE = require.resolve('@sveltia/cms');
const SURSA = dirname(INTRARE);
const TINTA = join('public', 'admin');

/** Source maps only. Everything else the package ships is program text. */
const esteHarta = (nume) => nume.endsWith('.map');

/** Every file under one subfolder of `SURSA`, relative to `SURSA`, `/`-separated. */
function fisiereDin(relativ) {
  const gasite = [];
  for (const intrare of readdirSync(join(SURSA, relativ), { withFileTypes: true })) {
    const cale = posix.join(relativ, intrare.name);
    if (intrare.isDirectory()) gasite.push(...fisiereDin(cale));
    else if (!esteHarta(intrare.name)) gasite.push(cale);
  }
  return gasite;
}

/** The folders the package ships beside its entry file; today just `chunks`. */
const SUBFOLDERE = readdirSync(SURSA, { withFileTypes: true })
  .filter((intrare) => intrare.isDirectory())
  .map((intrare) => intrare.name);

const DE_COPIAT = [basename(INTRARE), ...SUBFOLDERE.flatMap(fisiereDin)].sort();

/**
 * Puts the bundle where `/admin/` can serve it. Returns the paths it wrote.
 *
 * @param {(mesaj: string) => void} [jurnal] Where to report what was copied.
 */
export function copiazaCms(jurnal = console.log) {
  /*
   * A step that copies files must prove it copied something. Without this, an
   * empty or moved package folder leaves `/admin/` serving a page whose only
   * script is a 404 - and this step reports success while doing so.
   */
  if (DE_COPIAT.length === 0) {
    throw new Error(`Nimic de copiat din ${SURSA} - pachetul @sveltia/cms pare gol.`);
  }

  /*
   * Stale vendored files go first, but ONLY the folders the package itself
   * ships. `public/admin/index.html`, `config.yml` and `pornire.mjs` are this
   * repository's own files, tracked in git, and nothing here may touch them:
   * they are what a volunteer actually reads.
   */
  for (const nume of SUBFOLDERE) {
    rmSync(join(TINTA, nume), { recursive: true, force: true });
  }

  let octeti = 0;
  for (const fisier of DE_COPIAT) {
    const destinatie = join(TINTA, fisier);
    mkdirSync(dirname(destinatie), { recursive: true });
    copyFileSync(join(SURSA, fisier), destinatie);
    octeti += statSync(destinatie).size;
  }

  jurnal(`CMS copiat din ${SURSA}: ${DE_COPIAT.length} fișier(e), ${octeti} octeți.`);
  return DE_COPIAT.map((fisier) => join(TINTA, fisier));
}

// Rulat direct, nu importat: `node scripts/copy-cms.mjs`.
if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  for (const cale of copiazaCms()) console.log(`  ${cale}`);
}
