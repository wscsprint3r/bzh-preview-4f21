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
 * AND THE FONTS, which is the one place this script REWRITES what it copies.
 *
 * The CMS's own stylesheet points three `@font-face` rules at `cdn.jsdelivr.net`,
 * one of them the 748 KB Material Symbols icon font. Those URLs are literal text
 * inside the bundle - nothing is built from `import.meta.url` - and there is no
 * configuration option for them, so the chunk trick above does not reach them.
 * Left alone under Task 13's `script-src`/`font-src 'self'`, the icon face fails
 * to load and, because it is declared `font-display: block`, every button in the
 * CMS renders its ligature as a WORD: `save`, `delete`, `close`. Measured, on
 * this build: 24 px of glyph becoming 75 px of text.
 *
 * So the three URLs are rewritten to local copies, taken from npm at exactly the
 * versions the URLs themselves name, and verified byte-for-byte against what
 * jsDelivr serves (SHA-256, all three identical). `/admin/` is the page where an
 * editor's GitHub credential lives, so it keeps `'self'` like the rest of the
 * site rather than being granted an exception.
 *
 * THIS PATCHES SOMEONE ELSE'S CODE, AND MUST BE RE-VERIFIED ON EVERY UPGRADE.
 * That is the cost, stated plainly so nobody discovers it by surprise: bumping
 * `@sveltia/cms` means re-reading `FONTS` and re-running the browser check, not
 * just the changelog.
 *
 * THE ASSERTIONS BELOW ARE LOAD-BEARING, NOT FUSSY. Do not soften one to get a
 * build through. Each URL must be found EXACTLY ONCE, and afterwards the file
 * must contain no `cdn.jsdelivr.net` at all - the same shape as `ICS_REFERENCES`
 * in `build-output.itest.ts`, and for the same reason: a count is what closes the
 * set, so an upgrade that moves a URL or adds a fourth font FAILS THE BUILD
 * rather than silently restoring the CDN on the one page that holds an editor's
 * GitHub credential. A guard that only checked "we replaced what we knew about"
 * would pass while the CDN came back.
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
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join, posix } from 'node:path';
import { argv } from 'node:process';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

/** `node_modules/@sveltia/cms/dist/sveltia-cms.mjs`, per the package's `exports`. */
const ENTRY = require.resolve('@sveltia/cms');
const SOURCE = dirname(ENTRY);
const TARGET = join('public', 'admin');

/** Source maps only. Everything else the package ships is program text. */
const isSourceMap = (name) => name.endsWith('.map');

/** Every file under one subfolder of `SOURCE`, relative to `SOURCE`, `/`-separated. */
function filesUnder(relative) {
  const found = [];
  for (const entry of readdirSync(join(SOURCE, relative), { withFileTypes: true })) {
    const path = posix.join(relative, entry.name);
    if (entry.isDirectory()) found.push(...filesUnder(path));
    else if (!isSourceMap(entry.name)) found.push(path);
  }
  return found;
}

/** The folders the package ships beside its entry file; today just `chunks`. */
/**
 * The CMS's three font URLs, and the npm package file that serves each instead.
 *
 * Keyed by the EXACT url, so the rewrite is an equality and not a pattern. The
 * versions are the ones the URLs themselves name, and each file is byte-identical
 * to what jsDelivr serves - checked by SHA-256 once, by hand, when this was
 * written; `admin.itest.ts` re-checks the served copy against the package on
 * every build.
 */
export const FONTS = [
  {
    url: 'https://cdn.jsdelivr.net/fontsource/fonts/source-sans-3:vf@5.3.0/latin-wght-normal.woff2',
    pkgFile: '@fontsource-variable/source-sans-3/files/source-sans-3-latin-wght-normal.woff2',
  },
  {
    url: 'https://cdn.jsdelivr.net/fontsource/fonts/noto-mono@5.3.0/latin-400-normal.woff2',
    pkgFile: '@fontsource/noto-mono/files/noto-mono-latin-400-normal.woff2',
  },
  {
    url: 'https://cdn.jsdelivr.net/fontsource/fonts/material-symbols-outlined:vf@5.3.1/latin-wght-normal.woff2',
    pkgFile: '@fontsource-variable/material-symbols-outlined/files/material-symbols-outlined-latin-wght-normal.woff2',
  },
];

/** Where the local copies go, under `TARGET`, and where the rewritten URLs point. */
const FONTS_DIR = 'fonturi';

/** How many times `cdn.jsdelivr.net` may appear in the copied bundle when we are done. */
const CDN = 'cdn.jsdelivr.net';

function countOccurrences(text, piece) {
  let n = 0;
  for (let i = text.indexOf(piece); i !== -1; i = text.indexOf(piece, i + piece.length)) n += 1;
  return n;
}

/**
 * Rewrites the bundle's three font URLs to point at the local copies.
 *
 * Every step is asserted, because this is the one place we edit someone else's
 * code: each URL exactly once, the leftover `preconnect` exactly once, and
 * nothing naming the CDN afterwards.
 *
 * @param {string} text The bundle, as the package ships it.
 * @returns {string} The same bundle, serving its fonts from this origin.
 */
export function rewriteFonts(text) {
  let result = text;

  for (const { url, pkgFile } of FONTS) {
    const occurrences = countOccurrences(result, url);
    if (occurrences !== 1) {
      throw new Error(
        `The font ${basename(pkgFile)} is expected exactly once in the CMS bundle, but ` +
          `appears ${occurrences} times: ${url}\n` +
          'A newer @sveltia/cms has moved its address. Update FONTS in ' +
          'scripts/copy-cms.mjs, or the font would load from the CDN again.',
      );
    }
    result = result.replace(url, `/${posix.join('admin', FONTS_DIR, basename(pkgFile))}`);
  }

  /*
   * What is left is the `<link rel="preconnect">` the bundle puts in `<head>` for
   * a CDN it no longer uses. CSP does not police preconnect, so it would not
   * fail - it would just open a TLS connection to a third party on every visit
   * to `/admin/`, quietly. Pointed at this origin instead, where the browser is
   * already connected and ignores it.
   */
  const preconnect = 'https://cdn.jsdelivr.net/';
  const rest = countOccurrences(result, preconnect);
  if (rest !== 1) {
    throw new Error(
      `After the fonts were rewritten, ${preconnect} should appear exactly once ` +
        `(the preconnect), but appears ${rest} times.`,
    );
  }
  result = result.replace(preconnect, '/');

  const remaining = countOccurrences(result, CDN);
  if (remaining !== 0) {
    throw new Error(
      `The CMS bundle still names ${CDN} ${remaining} times after the rewrite. ` +
        'Something new loads from the CDN - find out what, before it reaches production.',
    );
  }
  return result;
}

const SUBFOLDERS = readdirSync(SOURCE, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

const TO_COPY = [basename(ENTRY), ...SUBFOLDERS.flatMap(filesUnder)].sort();

/**
 * Puts the bundle where `/admin/` can serve it. Returns the paths it wrote.
 *
 * @param {(message: string) => void} [announce] Where to report what was copied.
 */
export function copyCms(announce = console.log) {
  /*
   * A step that copies files must prove it copied something. Without this, an
   * empty or moved package folder leaves `/admin/` serving a page whose only
   * script is a 404 - and this step reports success while doing so.
   */
  if (TO_COPY.length === 0) {
    throw new Error(`Nothing to copy from ${SOURCE} - the @sveltia/cms package looks empty.`);
  }

  /*
   * Stale vendored files go first: the folders the package itself ships, plus
   * `fonturi/`, which this script writes and therefore also owns.
   * `public/admin/index.html`, `config.yml` and `pornire.mjs` are this
   * repository's own files, tracked in git, and nothing here may touch them:
   * they are what a volunteer actually reads.
   */
  for (const name of [...SUBFOLDERS, FONTS_DIR]) {
    rmSync(join(TARGET, name), { recursive: true, force: true });
  }

  const written = [];
  for (const file of TO_COPY) {
    const destination = join(TARGET, file);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(join(SOURCE, file), destination);
    written.push(file);
  }

  /*
   * The entry file is the only one edited, and it is edited AFTER being copied,
   * so `node_modules` is never written to. `rewriteFonts` throws rather than
   * returning something half-done, which fails the build before the bundle can
   * ship still pointing at a CDN.
   */
  const entry = join(TARGET, basename(ENTRY));
  writeFileSync(entry, rewriteFonts(readFileSync(entry, 'utf8')));

  for (const { pkgFile } of FONTS) {
    const name = basename(pkgFile);
    const destination = join(TARGET, FONTS_DIR, name);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(require.resolve(pkgFile), destination);
    written.push(posix.join(FONTS_DIR, name));
  }

  const bytes = written.reduce((n, f) => n + statSync(join(TARGET, f)).size, 0);
  announce(
    `CMS copied from ${SOURCE}: ${written.length} file(s), ${bytes} bytes, ` +
      `fonts served from here, not from the CDN.`,
  );
  return written.map((file) => join(TARGET, file));
}

// Rulat direct, nu importat: `node scripts/copy-cms.mjs`.
if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  for (const path of copyCms()) console.log(`  ${path}`);
}
