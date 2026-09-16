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
 * Run by `prebuild` and `predev`. Everything written here is git-ignored, and
 * `.gitignore` has to keep up: see the Task 12 report.
 */
import { copyFileSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join, posix } from 'node:path';

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

const SUBFOLDERE = readdirSync(SURSA, { withFileTypes: true })
  .filter((intrare) => intrare.isDirectory())
  .map((intrare) => intrare.name);

const DE_COPIAT = [basename(INTRARE), ...SUBFOLDERE.flatMap(fisiereDin)].sort();

/*
 * A step that copies files must prove it copied something. Without this, an
 * empty or moved package folder leaves `/admin/` serving a page whose only
 * script is a 404 — and this step reports success while doing so.
 */
if (DE_COPIAT.length === 0) {
  console.error(`Nimic de copiat din ${SURSA} — pachetul @sveltia/cms pare gol.`);
  process.exit(1);
}

/*
 * Stale vendored files go first, but ONLY the folders the package itself ships.
 * `public/admin/index.html` and `public/admin/config.yml` are this repository's
 * own files, tracked in git, and nothing here may touch them: they are what a
 * volunteer actually reads.
 */
for (const nume of SUBFOLDERE) {
  rmSync(join(TINTA, nume), { recursive: true, force: true });
}

for (const fisier of DE_COPIAT) {
  const destinatie = join(TINTA, fisier);
  mkdirSync(dirname(destinatie), { recursive: true });
  copyFileSync(join(SURSA, fisier), destinatie);
}

console.log(`CMS copiat din ${SURSA}`);
let octeti = 0;
for (const fisier of DE_COPIAT) {
  const marime = statSync(join(TINTA, fisier)).size;
  octeti += marime;
  console.log(`  ${join(TINTA, fisier)} — ${marime} octeți`);
}
console.log(`  ${DE_COPIAT.length} fișier(e), ${octeti} octeți în total.`);
