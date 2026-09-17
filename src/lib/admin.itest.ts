/*
 * WHAT THIS PROVES: that `/admin/` serves a page whose script actually exists,
 * and that every piece of the CMS it can ask for at run time is served from
 * this origin rather than fetched from a CDN.
 *
 * WHY THAT NEEDS A TEST AT ALL. Sveltia's entry file does not carry the whole
 * program. It lazily imports `chunks/<name>.js`, and the loader inside it tries
 * TWO candidates in order: a sibling of itself, and failing that
 * `https://unpkg.com/@sveltia/cms@<version>/dist/chunks/<name>.js`. So a build
 * that copies only the entry file still WORKS in development, silently over the
 * public internet, and then fails in production the moment Task 13's
 * `script-src 'self'` says no. The fallback is invisible until it is fatal,
 * which is why the set of vendored files is closed here rather than sampled.
 *
 * THE EXPECTED SET COMES FROM THE INSTALLED PACKAGE, which `dist/` cannot edit.
 * `scripts/copy-cms.mjs` is the thing under test; a test that read its output to
 * decide what its output should be would agree with any bug it contains.
 *
 * WHAT IT DOES NOT PROVE: that the CMS runs. Nothing here opens a browser, signs
 * in to GitHub or renders a form. See `cms.test.ts` for how far the config can
 * be checked, and Task 12 Step 9 for the part that needs a person.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FONTS, rewriteFonts } from '../../scripts/copy-cms.mjs';

const DIST = fileURLToPath(new URL('../../dist/', import.meta.url));
const PUBLIC = fileURLToPath(new URL('../../public/', import.meta.url));

const CMS_ENTRY = createRequire(import.meta.url).resolve('@sveltia/cms');
const CMS_SOURCE = dirname(CMS_ENTRY);

/** The file's bytes, having proved there was a file and that it had some. */
function read(path: string): Buffer {
  expect(existsSync(path), `${path} lipsește`).toBe(true);
  const bytes = readFileSync(path);
  expect(bytes.length, `${path} există dar este gol`).toBeGreaterThan(0);
  return bytes;
}

/** Every file under one folder, as `/`-separated paths relative to it. */
function files(root: string, relative = ''): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
    const path = posix.join(relative, entry.name);
    if (entry.isDirectory()) found.push(...files(root, path));
    else found.push(path);
  }
  return found.sort();
}

/*
 * What `copy-cms.mjs` is supposed to have produced, stated here independently of
 * it: the entry file npm resolved, plus every file in every subfolder beside it
 * (that is where the lazily-imported chunks live), minus the source maps.
 */
const EXPECTED_FROM_PACKAGE = [
  basename(CMS_ENTRY),
  ...readdirSync(CMS_SOURCE, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => files(CMS_SOURCE, entry.name)),
]
  .filter((f) => !f.endsWith('.map'))
  .sort();

/*
 * And the three fonts, whose expected set comes from the DECLARATION in
 * `copy-cms.mjs` rather than from anything in `dist/`. That is a weaker source
 * than the package folder above - it is the same table the script rewrites with
 * - so it is not asked to carry the claim on its own. Three other assertions
 * below come at it from outside: the served bundle must name no CDN while the
 * package's own copy still does, every font URL it does name must resolve to a
 * real file, and each of those files must match the npm package byte for byte.
 */
const EXPECTED_FONTS = FONTS.map(({ pkgFile }) => `fonts/${basename(pkgFile)}`);

const EXPECTED = [...EXPECTED_FROM_PACKAGE, ...EXPECTED_FONTS].sort();

/** Our own files under `admin/`, which are not vendored and are tracked in git. */
const OURS = ['index.html', 'config.yml', 'start.mjs'];

const SERVED_ENTRY = join(DIST, 'admin', basename(CMS_ENTRY));

function countOccurrences(text: string, piece: string): number {
  let n = 0;
  for (let i = text.indexOf(piece); i !== -1; i = text.indexOf(piece, i + piece.length)) n += 1;
  return n;
}

describe('the admin page exists', () => {
  it('dist/admin/index.html was built', () => {
    const html = read(join(DIST, 'admin', 'index.html')).toString('utf8');
    expect(html).toContain('<html lang="ro"');
    expect(html).toContain('</html>');
    // Nu este o măsură de securitate - CMS-ul este apărat de autentificarea
    // GitHub - dar o pagină de administrare indexată este o invitație.
    expect(html).toMatch(/<meta\b[^>]*name="robots"[^>]*noindex/);
  });

  /*
   * Referința, urmărită până la fișier. Trei generații ale aceleiași greșeli pe
   * acest proiect au venit din aserțiuni care spuneau „textul apare în pagină";
   * `src="/admin/sveltia-cms.mjs"` este adevărat și atunci când fișierul nu a
   * fost copiat niciodată, iar pagina arată atunci exact ca o pagină goală.
   */
  it('each of its <script src> leads to a real file in dist/', () => {
    const html = read(join(DIST, 'admin', 'index.html')).toString('utf8');
    const sources = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]*)"/g)].map((m) => m[1] as string);
    expect(sources.length, 'pagina de administrare nu încarcă niciun script').toBe(1);
    for (const src of sources) {
      expect(src.startsWith('/'), `${src} nu este absolută`).toBe(true);
      read(join(DIST, src.slice(1).split(/[?#]/)[0] as string));
    }
  });

  /*
   * Al doilea capăt al aceluiași lanț. `start.mjs` este fișierul care chiar
   * pornește CMS-ul, iar el importă bundle-ul pe cale relativă. Dacă acel import
   * nu duce nicăieri, pagina rămâne albă și tăcută - exact starea în care a fost
   * găsită înainte să existe fișierul acesta.
   */
  it("each of start.mjs's imports leads to a real file", () => {
    const source = read(join(DIST, 'admin', 'start.mjs')).toString('utf8');
    const imports = [
      ...source.matchAll(/\bfrom\s*'([^']+)'/g),
      ...source.matchAll(/\bimport\(\s*'([^']+)'/g),
    ].map((m) => m[1] as string);
    expect(imports.length, 'start.mjs nu importă nimic').toBeGreaterThan(0);
    for (const specifier of imports) {
      expect(specifier.startsWith('./'), `${specifier} nu este relativ`).toBe(true);
      read(join(DIST, 'admin', specifier.slice(2)));
    }
    // Și chiar cheamă init: un import fără apel ar trece testul de mai sus și ar
    // lăsa pagina tot albă.
    expect(source).toMatch(/\binit\s*\(/);
  });

  it('serves the very configuration the tests check', () => {
    // `cms.test.ts` validează `public/admin/config.yml`. Dacă ce ajunge în
    // `dist/` ar fi altceva, acea validare ar fi despre un fișier pe care nu îl
    // citește nimeni.
    expect(read(join(DIST, 'admin', 'config.yml')).equals(read(join(PUBLIC, 'admin', 'config.yml')))).toBe(true);
  });
});

describe('the CMS bundle is served from this site, not from a CDN', () => {
  it('the package really does have something to give', () => {
    // Fără asta, o mulțime așteptată goală ar face ca egalitatea de mai jos să
    // fie adevărată despre un `dist/admin/` fără niciun fișier vendorizat.
    expect(EXPECTED.length).toBeGreaterThan(1);
    expect(EXPECTED).toContain(basename(CMS_ENTRY));
    expect(EXPECTED.some((f) => f.startsWith('chunks/'))).toBe(true);
    expect(EXPECTED.some((f) => f.startsWith('fonts/'))).toBe(true);
  });

  /*
   * Mulțime închisă, în amândouă sensurile. Prea puțin: o bucată lipsă pe care
   * CMS-ul o cere de la unpkg, unde CSP-ul o oprește. Prea mult: harta de surse
   * de 7 MB sau a doua copie a programului, publicate lumii degeaba.
   */
  it("carries exactly the package's files, not one more, not one fewer", () => {
    const vendored = files(join(DIST, 'admin')).filter((f) => !OURS.includes(f));
    expect(vendored).toEqual(EXPECTED);
  });

  it("carries the package's bytes, not a stale copy", () => {
    for (const path of EXPECTED_FROM_PACKAGE) {
      // Fișierul de intrare este singurul rescris; are testul lui mai jos.
      if (path === basename(CMS_ENTRY)) continue;
      const copied = read(join(DIST, 'admin', path));
      expect(copied.equals(readFileSync(join(CMS_SOURCE, path))), path).toBe(true);
    }
  });

  /*
   * FIȘIERUL DE ENTRY ESTE SINGURUL COD STRĂIN PE CARE ÎL MODIFICĂM, deci
   * egalitatea este exactă: ce se servește trebuie să fie chiar pachetul trecut
   * prin `rewriteFonts`, nici un octet mai mult. O modificare în plus -
   * strecurată, sau făcută de o unealtă pe drum - pică aici.
   */
  it('the entry file is the package with the fonts rewritten and nothing else', () => {
    const served = read(SERVED_ENTRY).toString('utf8');
    expect(served).toBe(rewriteFonts(readFileSync(CMS_ENTRY, 'utf8')));
  });

  /*
   * Și dovada că rescrierea are ce să rescrie. Fără controlul pozitiv, „nu
   * numește niciun CDN" ar fi la fel de adevărat despre un pachet care nu l-a
   * numit niciodată - iar atunci nimeni nu ar afla că tabelul `FONTS` a rămas
   * în urmă.
   */
  it('no longer names the font CDN, although the package does', () => {
    const CDN = 'cdn.jsdelivr.net';
    expect(countOccurrences(readFileSync(CMS_ENTRY, 'utf8'), CDN)).toBeGreaterThan(0);
    expect(countOccurrences(read(SERVED_ENTRY).toString('utf8'), CDN)).toBe(0);
  });

  /*
   * Referințele, urmărite până la fișier - aceeași regulă ca pentru `.ics`: o
   * adresă rescrisă greșit ar ieși din mulțimea verificată în loc să o facă să
   * pice, dacă nimeni nu ar număra și nu ar deschide fișierele.
   */
  it('every font it asks for leads to a real file in dist/', () => {
    const served = read(SERVED_ENTRY).toString('utf8');
    const urls = [...served.matchAll(/url\((\/admin\/[^)]+)\)/g)].map((m) => m[1] as string);
    expect(urls.length, 'bundle-ul nu cere niciun font local').toBe(FONTS.length);
    for (const url of urls) read(join(DIST, url.slice(1)));
  });

  it('the served fonts really are the fonts from the npm packages', () => {
    const require = createRequire(import.meta.url);
    for (const { pkgFile } of FONTS) {
      const name = basename(pkgFile);
      const served = read(join(DIST, 'admin', 'fonts', name));
      expect(served.equals(readFileSync(require.resolve(pkgFile))), name).toBe(true);
    }
  });

  it('does not publish the source maps', () => {
    // Controlul pozitiv: pachetul chiar ARE hărți, deci absența lor din `dist/`
    // este o alegere, nu o constatare despre un pachet care nu le are.
    const sourceMaps = files(CMS_SOURCE).filter((f) => f.endsWith('.map'));
    expect(sourceMaps.length).toBeGreaterThan(0);
    for (const mapping of sourceMaps) {
      expect(existsSync(join(DIST, 'admin', mapping)), mapping).toBe(false);
    }
  });

  it('costs the visitor nothing, because nobody lands there by accident', () => {
    // Nu un buget, ci ordinul de mărime: dacă bundle-ul ar ajunge vreodată sub
    // 100 KB, cel mai probabil s-a copiat altceva decât programul.
    const bytes = EXPECTED.reduce((n, f) => n + statSync(join(DIST, 'admin', f)).size, 0);
    expect(bytes).toBeGreaterThan(100 * 1024);
  });
});
