/*
 * Spec §13's performance budget, checked against the built output.
 *
 * Three numbers: what one page weighs, how much JavaScript a visitor runs on
 * it, and how many requests it takes to render.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS READS THE PAGES RATHER THAN THE FILES IN `dist/_astro/`.
 *
 * The obvious JS check is to add up `dist/**\/*.js`. Task 10 proved that check
 * cannot work here: at 2,982 bytes the week picker lands under Vite's 4 KB
 * inline threshold, so Astro writes it INTO the document and emits no `.js`
 * file at all. A file-walking check reports `0 / 3072 OK` and is loudest
 * exactly when it has measured nothing - the same failure shape as a missing
 * `dist/`. Worse, the threshold is a cliff: about a kilobyte more script and
 * Astro flips to emitting a file, which changes the request count and the
 * caching story with nothing failing either way.
 *
 * So every number below is derived from the built HTML, which is the only place
 * that knows which form the script took.
 * ---------------------------------------------------------------------------
 *
 * THE REQUEST COUNT IS AN UPPER BOUND, and deliberately so. Counting exactly
 * what a browser fetches means re-implementing the browser - `unicode-range`
 * decides which font subsets load, and `rel=icon` sizes decide which icon does.
 * That is the mistake that cost this project its CSS contrast guard. Instead
 * every term below is something a browser fetches AT MOST once:
 *
 *   - the document itself
 *   - each linked stylesheet, each external script, each modulepreload
 *   - each image, media source and iframe
 *   - each declared icon (a browser picks ONE of them; today 2 are declared and
 *     a real browser was measured fetching 1)
 *   - each `@font-face` rule (a browser fetches at most one file per face, and
 *     none at all for a face whose `unicode-range` never matches)
 *
 * The total is therefore >= what any browser actually requests, so a bound
 * under the cap proves the real count is under the cap. Measured against a real
 * headless Chrome on the Task 10 build: bound 11, actual 10.
 *
 * Not counted, because nothing fetches them on load: `rel=canonical`,
 * `rel=alternate` (the `.ics` feed is fetched when someone subscribes),
 * `preconnect` and `dns-prefetch`.
 *
 * Run with `npm run budget`, and as the last step of `npm run test:build`.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';

const DIST = 'dist';

/*
 * Spec §13 budgets the homepage at 30 KB of HTML and 15 KB of CSS. Because
 * astro.config.mjs sets `inlineStylesheets: 'always'`, the CSS is *inside* the
 * HTML - so a separate CSS check would measure an empty set and always pass,
 * while the HTML check would fail for carrying weight the spec had allotted to
 * CSS. The honest translation of those two numbers under inlining is one
 * combined 45 KB limit on the document.
 */
const BUGET_PAGINI = {
  'index.html': 45 * 1024,
  'program/index.html': 135 * 1024,
};
/*
 * 3,800 bytes, not a round 3 KB or 4 KB. Astro inlines a script below roughly
 * 4,096 bytes; above that it emits a file and the request count and the caching
 * story both change, so the ceiling belongs just under that cliff rather than on
 * a round number.
 *
 * The original 3 KB was set when this script only revealed a week. Recomputing
 * the next-service card is real work the browser has to do, and a budget that
 * makes the correct architecture uncomfortable gets met by moving rendering back
 * into the browser - which is the thing this budget exists to prevent. Kept in
 * step with the plan and the spec; do not lower it without changing those too.
 */
const BUGET_JS = 3800;
const BUGET_CERERI = 12;

/*
 * The Sveltia CMS bundle lives under dist/admin/. It is a few hundred KB of
 * third-party code that only a signed-in editor ever loads, behind a login, and
 * it is not part of what a visitor downloads - so that whole subtree is outside
 * every budget here. Excluded by DIRECTORY, and the `.mjs` it ships is why the
 * exclusion has to come before any extension test rather than after it.
 */
const EXCLUSE = ['admin'];

let esec = false;

function raporteaza(eticheta, valoare, limita, unitate = 'octeți') {
  const ok = valoare <= limita;
  if (!ok) esec = true;
  console.log(`${ok ? 'OK       ' : 'PREA MARE'} ${eticheta}: ${valoare} / ${limita} ${unitate}`);
}

function opreste(mesaj) {
  console.error(mesaj);
  process.exit(1);
}

/** Every visitor-facing page in the build, as paths relative to `dist/`. */
function paginiVizitator(relativ = '') {
  const gasite = [];
  for (const intrare of readdirSync(join(DIST, relativ), { withFileTypes: true })) {
    if (intrare.isDirectory()) {
      if (relativ === '' && EXCLUSE.includes(intrare.name)) continue;
      gasite.push(...paginiVizitator(posix.join(relativ, intrare.name)));
    } else if (intrare.name.endsWith('.html')) {
      gasite.push(posix.join(relativ, intrare.name));
    }
  }
  return gasite.sort();
}

// A guard that reads files must prove it read something: without these, a
// missing or empty build would make every check below pass vacuously.
if (!existsSync(DIST)) opreste(`${DIST}/ nu există — rulează mai întâi build-ul.`);
const PAGINI = paginiVizitator();
if (PAGINI.length === 0) opreste(`${DIST}/ nu conține nicio pagină de vizitator.`);

/*
 * Every visitor page must have a budget. A page with none would otherwise be
 * the one page nobody is measuring, which is how a new route ships at 200 KB on
 * a green build.
 */
const faraBuget = PAGINI.filter((p) => !(p in BUGET_PAGINI));
if (faraBuget.length > 0) {
  opreste(
    `Pagini fără buget în BUGET_PAGINI: ${faraBuget.join(', ')}.\n` +
      'Adaugă-le o limită sau exclude-le explicit; o pagină nemăsurată nu e o pagină în regulă.',
  );
}

const ATRIBUT = (attrs, nume) =>
  attrs.match(new RegExp(`\\b${nume}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1] ?? null;

/** A `/`-rooted URL as a path inside `dist/`, or null when it points elsewhere. */
function inDist(url) {
  if (url === null || !url.startsWith('/')) return null;
  const cale = decodeURIComponent(url.split('?')[0].split('#')[0]).slice(1);
  return existsSync(join(DIST, cale)) ? cale : null;
}

/*
 * Script types the BROWSER EXECUTES, and script types it merely reads. Anything
 * in neither list stops the build rather than being skipped: a `<script>` shape
 * this file has never seen is precisely what a budget must not wave through,
 * and it is the mistake the old file-walking check made in a different costume.
 */
const TIPURI_EXECUTATE = new Set(['', 'module', 'text/javascript', 'application/javascript']);
const TIPURI_DATE = new Set(['application/json', 'application/ld+json', 'importmap', 'speculationrules']);

/** Bytes of one emitted module plus every module it statically pulls in. */
function octetiModul(cale, vazute) {
  if (vazute.has(cale)) return 0;
  vazute.add(cale);
  const sursa = readFileSync(join(DIST, cale));
  let total = sursa.length;
  const text = sursa.toString('utf8');
  const specificatoare = [
    ...text.matchAll(/\bfrom\s*["']([^"']+)["']/g),
    ...text.matchAll(/\bimport\s*\(\s*["']([^"']+)["']/g),
    ...text.matchAll(/\bimport\s*["']([^"']+)["']/g),
  ].map((m) => m[1]);
  for (const s of specificatoare) {
    const tinta = s.startsWith('/') ? s.slice(1) : posix.normalize(posix.join(dirname(cale), s));
    if (/\.m?js$/.test(tinta) && existsSync(join(DIST, tinta))) total += octetiModul(tinta, vazute);
  }
  return total;
}

/** The CSS one built page ships: linked stylesheets and inline blocks. */
function cssPagina(html) {
  const bucati = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    if (!/rel\s*=\s*["']?stylesheet/i.test(m[0])) continue;
    const cale = inDist(ATRIBUT(m[0], 'href'));
    if (cale) bucati.push(readFileSync(join(DIST, cale), 'utf8'));
  }
  for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) bucati.push(m[1]);
  return bucati.join('\n');
}

/**
 * Every request the page's CSS can make, as an upper bound.
 *
 * ONE PER `@font-face` RULE, not one per `url()` inside it: a face lists woff2
 * and woff, a browser fetches at most one of them, and none at all when the
 * face's `unicode-range` never matches. Every OTHER `url()` - a background, a
 * mask, a cursor, a `list-style-image` - is a request of its own, and so is
 * each `@import`.
 *
 * Counting only the faces was SOUND ON THE DAY IT WAS WRITTEN, because all
 * sixteen url()s in this build sit inside the eight faces. "Sound today" is the
 * state that decays, and this file claims its count is an upper bound BY
 * CONSTRUCTION, so the construction has to mean it: one background-image added
 * to global.css would otherwise be a request nothing counted.
 *
 * `data:` URIs and bare fragments (`url(#id)`, an SVG filter reference) fetch
 * nothing and are skipped.
 */
function cereriCss(css) {
  const BLOC_FATA = /@font-face\s*\{[^}]*\}/g;
  const fete = (css.match(BLOC_FATA) ?? []).length;
  // Faces first, then imports, so an `@import url(...)` is not counted twice.
  const restul = css.replace(BLOC_FATA, ' ');
  const importuri = (restul.match(/@import\b[^;]*;/g) ?? []).length;
  const urluri = [...restul.replace(/@import\b[^;]*;/g, ' ').matchAll(/\burl\(\s*[\x27"]?([^\x27")]+)/g)]
    .map((m) => m[1].trim())
    .filter((u) => !u.startsWith('data:') && !u.startsWith('#'));
  return { fete, importuri, urluri };
}

console.log(`Buget pentru ${PAGINI.length} pagină(i) de vizitator:\n`);

let jsUnion = 0;
const fisiereVazute = new Set();

for (const pagina of PAGINI) {
  const html = readFileSync(join(DIST, pagina), 'utf8');
  raporteaza(pagina, statSync(join(DIST, pagina)).size, BUGET_PAGINI[pagina]);

  // ---- JavaScript, inlined or emitted ----
  let js = 0;
  const detalii = [];
  const vazuteAici = new Set();

  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const [, atribute, continut] = m;
    const tip = (ATRIBUT(atribute, 'type') ?? '').trim().toLowerCase();
    const src = ATRIBUT(atribute, 'src');

    if (TIPURI_DATE.has(tip)) {
      detalii.push(`date ${tip} ${Buffer.byteLength(continut)} B (neexecutat)`);
      continue;
    }
    if (!TIPURI_EXECUTATE.has(tip)) {
      opreste(
        `${pagina}: <script type="${tip}"> nu e nici cod, nici date cunoscute.\n` +
          'Adaugă-l în TIPURI_EXECUTATE sau în TIPURI_DATE. Un buget care sare peste ' +
          'ce nu recunoaște nu e un buget.',
      );
    }
    if (src === null) {
      js += Buffer.byteLength(continut);
      detalii.push(`inline ${Buffer.byteLength(continut)} B`);
      continue;
    }
    const cale = inDist(src);
    if (cale === null) {
      opreste(
        `${pagina}: <script src="${src}"> nu se rezolvă în ${DIST}/.\n` +
          'Un script extern e tot JavaScript pe care vizitatorul îl descarcă.',
      );
    }
    const octeti = octetiModul(cale, vazuteAici);
    js += octeti;
    detalii.push(`${cale} ${octeti} B`);
  }

  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    if (!/rel\s*=\s*["']?modulepreload/i.test(m[0])) continue;
    const cale = inDist(ATRIBUT(m[0], 'href'));
    if (cale === null) continue;
    const octeti = octetiModul(cale, vazuteAici);
    js += octeti;
    detalii.push(`modulepreload ${cale} ${octeti} B`);
  }

  /*
   * A ZERO HERE IS A MEASUREMENT, NOT A MISSING ONE. Do not "fix" it into a
   * failure.
   *
   * `/program/` renders every week server-side and mounts no script at all, so
   * it honestly ships no JavaScript, and this line reads `0 / 3072` beside
   * `niciun script` - which looks exactly like the vacuous pass this whole file
   * was written to abolish.
   *
   * The difference is where the number comes from. The old check walked
   * `dist/**\/*.js` and said 0 because it had looked in the wrong place. This
   * one enumerates every `<script>` element on the page, counts the ones a
   * browser executes, resolves the ones it fetches, and STOPS THE BUILD on any
   * it does not recognise. So 0 here means "this page has no executable
   * script", which is the best result a page can have. A rule that failed on
   * zero would fail a page for being efficient.
   */
  raporteaza(`  JS pentru vizitator pe ${pagina}`, js, BUGET_JS);
  console.log(`          ${detalii.length > 0 ? detalii.join(' + ') : 'niciun script'}`);
  for (const f of vazuteAici) {
    if (!fisiereVazute.has(f)) { fisiereVazute.add(f); jsUnion += statSync(join(DIST, f)).size; }
  }

  // ---- requests, as an upper bound ----
  const cereri = [`documentul ${pagina}`];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = (ATRIBUT(m[0], 'rel') ?? '').toLowerCase();
    if (/\b(stylesheet|icon|modulepreload|preload|apple-touch-icon|manifest)\b/.test(rel)) {
      cereri.push(`${rel} ${ATRIBUT(m[0], 'href')}`);
    }
  }
  for (const m of html.matchAll(/<script\b([^>]*)>/gi)) {
    const src = ATRIBUT(m[1], 'src');
    if (src !== null) cereri.push(`script ${src}`);
  }
  for (const m of html.matchAll(/<(img|iframe|video|audio|source|embed)\b([^>]*)>/gi)) {
    if (ATRIBUT(m[2], 'src') !== null || ATRIBUT(m[2], 'srcset') !== null) cereri.push(`${m[1]}`);
  }
  const inDocument = cereri.length;
  const { fete, importuri, urluri } = cereriCss(cssPagina(html));
  for (let i = 0; i < fete; i += 1) cereri.push('@font-face');
  for (let i = 0; i < importuri; i += 1) cereri.push('@import');
  for (const u of urluri) cereri.push(`url(${u})`);

  raporteaza(`  cereri (limită superioară) pentru ${pagina}`, cereri.length, BUGET_CERERI, 'cereri');
  console.log(
    `          ${inDocument} în document + ${fete} @font-face` +
      `${importuri > 0 ? ` + ${importuri} @import` : ''}` +
      `${urluri.length > 0 ? ` + ${urluri.length} url() în CSS` : ''}`,
  );
  console.log('');
}

console.log(`JS emis în fișiere, peste tot: ${jsUnion} octeți în ${fisiereVazute.size} fișier(e).`);
console.log(
  fisiereVazute.size === 0
    ? 'Niciun fișier .js emis — scriptul e inline în pagini, deci nu costă nicio cerere.\n' +
        'Peste pragul de 4096 de octeți al Vite asta se inversează: un fișier, o cerere, o intrare de cache.'
    : 'Scriptul e emis ca fișier, deci costă o cerere și se păstrează în cache între pagini.',
);

if (esec) {
  console.error('\nBugetul de performanță a fost depășit (specificație §13).');
  process.exit(1);
}
console.log('\nBuget respectat.');
