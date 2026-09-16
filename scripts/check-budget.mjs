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
 * cannot work here: at 2,988 bytes - the figure every run prints below, which is
 * the one to trust if this sentence ever disagrees with it - the week picker lands
 * under Vite's 4 KB inline threshold, so Astro writes it INTO the document and
 * emits no `.js` file at all. A file-walking check reports `0 / 3800 OK` and is
 * loudest exactly when it has measured nothing - the same failure shape as a missing
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
 * ---------------------------------------------------------------------------
 * EVERY TAG SCAN BELOW EXCEPT THE `<script>` ONE IS NOT COMMENT-AWARE, AND THE
 * DIRECTION IT CAN BE WRONG IN IS WHY THAT IS FINE.
 *
 * `<link>`, `<style>`, `<img>`, `<iframe>`, `<video>`, `<audio>`, `<source>` and
 * `<embed>` are matched with a plain regex, so a tag commented out in the HTML
 * is counted as though it were live. Every one of those counts feeds a
 * `valoare <= limita` comparison, so the only outcome over-counting can reach is
 * a FAILED budget. A false red costs somebody a minute and a `git blame`; a
 * false green is the thing this whole file exists to prevent.
 *
 * `<script>` was the exception, and it had to be fixed, because it fed a
 * measurement that could come out LOW. `public/admin/index.html` carries a
 * comment mentioning `<script>`, and the naive pattern ate the comment and the
 * real tag as one match: a 758-byte inline script that does not exist, the real
 * tag's `src` gone with it, weight nothing measured and a CSP hash for nothing.
 * That is why `scripturi()` consumes comments first and why the scans below do
 * not need to.
 *
 * So before "fixing" one of them into comment-awareness, work out which
 * direction it can be wrong in. Making one of these feed a count that can come
 * out low is the change that would matter.
 * ---------------------------------------------------------------------------
 *
 * Run with `npm run budget`, and as the last step of `npm run test:build`.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
/*
 * Script types the BROWSER EXECUTES, and script types it merely reads, live in
 * `scripts/scripturi.mjs`. Anything in neither list stops the build rather than
 * being skipped: a `<script>` shape this file has never seen is precisely what a
 * budget must not wave through, and it is the mistake the old file-walking check
 * made in a different costume.
 *
 * SHARED WITH `csp-hash.mjs` RATHER THAN COPIED, because the two must agree.
 * This file weighs every executed script; that one puts a hash of every inline
 * executed script into `script-src`. The same misreading makes this one
 * under-count and that one lock the script out of the deployed site — which has
 * no visible symptom at all here, since running without JavaScript is the
 * designed fallback. One classification, one place.
 */
import { ATRIBUT, scripturi } from './scripturi.mjs';

const DIST = 'dist';

/*
 * Spec §13 budgets the homepage at 30 KB of HTML and 15 KB of CSS. Because
 * astro.config.mjs sets `inlineStylesheets: 'always'`, the CSS is *inside* the
 * HTML - so a separate CSS check would measure an empty set and always pass,
 * while the HTML check would fail for carrying weight the spec had allotted to
 * CSS. The honest translation of those two numbers under inlining is one
 * combined 45 KB limit on the document.
 *
 * ---------------------------------------------------------------------------
 * THESE PAGES GROW WITH CONTENT, AND ONE OF THEM USED TO GROW WITHOUT BOUND.
 *
 * Nothing else in this file says so, and it is the only way a green build turns
 * red without anybody changing a line of code. Measured on scratch builds with a
 * realistic parish week (Wed/Fri/Sat/Sun, four service days):
 *
 *   - `index.html` was a constant 20,693 bytes plus the JSON island, and the
 *     island carried EVERY future day at about 133 bytes each. 47 weeks
 *     published ahead -> 45,567 B, exit 0. 48 weeks -> 46,093 B, exit 1, by
 *     thirteen bytes. The first symptom is a parish publishing further ahead
 *     than usual.
 *   - `/program/` renders the whole schedule by design and STILL GROWS: 136,943 B
 *     at 57 weeks published (exit 0), 139,171 B at 58 (exit 1). That page IS the
 *     full list - browsing ahead is the point, Ctrl+F has to work - so its weight
 *     is the feature rather than a defect, and the limit is what says how much of
 *     a future somebody can publish before the page stops being a page. It is a
 *     GAP, stated rather than closed: `EXPLICATIA_PAGINII` below is what a
 *     volunteer meets if it is ever reached.
 *
 * The island is now bounded - `ZILE_INSULA` days in `src/lib/schedule.ts`, about
 * 5.3 KB - so the homepage no longer tracks the published horizon at all. The
 * `date application/json NNN B (neexecutat)` line every run prints beside
 * `index.html` is that island, measured; it is the number to read if anything
 * here disagrees with it.
 *
 * WHICH ONE GOVERNS IF THEY DISAGREE: this limit does. It is a measurement of the
 * artifact, and `ZILE_INSULA` is an argument about what the artifact will weigh -
 * a day can always carry more services, a longer `locatie` or a longer `detaliu`
 * than the arithmetic assumed. So a red build here is a real red build even with
 * the island inside its window: the bound is what keeps this limit out of reach
 * of CONTENT, and it is not a licence to disbelieve the limit. The direction that
 * must never be taken is the other one - raising 45 KB because a page grew.
 * ---------------------------------------------------------------------------
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
 * THE SCRIPT IS INLINED, AND THAT IS A DECISION - so it is asserted, not
 * inferred.
 *
 * `BUGET_JS` sits at 3,800 precisely because Astro inlines below roughly 4,096
 * bytes, so the ceiling is what keeps the script inside the page. But that is
 * arithmetic about a Vite default, not a fact about this build. Raise
 * `vite.build.assetsInlineLimit`, take an upgrade that moves the threshold, or
 * add a second entry that makes Rollup hoist a shared chunk, and a script well
 * under the ceiling becomes a file anyway.
 *
 * Nothing else here would notice. Measured: flipping this build to an emitted
 * file takes the homepage from 11 requests to 12, which PASSES - one under the
 * cap - while the page quietly gains a request and a cache entry, which is the
 * exact silent change this whole file exists to prevent.
 *
 * Set it to `true` when a file is what you want, and give BUGET_CERERI the room
 * it then needs.
 */
const JS_EMIS_PERMIS = false;

/*
 * The Sveltia CMS bundle lives under dist/admin/. It is a few hundred KB of
 * third-party code that only a signed-in editor ever loads, behind a login, and
 * it is not part of what a visitor downloads - so that whole subtree is outside
 * every budget here. Excluded by DIRECTORY, and the `.mjs` it ships is why the
 * exclusion has to come before any extension test rather than after it.
 */
const EXCLUSE = ['admin'];

let esec = false;

function raporteaza(eticheta, valoare, limita, unitate = 'octeți', explicatie = '') {
  const ok = valoare <= limita;
  if (!ok) esec = true;
  console.log(`${ok ? 'OK       ' : 'PREA MARE'} ${eticheta}: ${valoare} / ${limita} ${unitate}`);
  if (!ok && explicatie !== '') console.log(explicatie);
}

/*
 * WHO READS A FAILED PAGE BUDGET, and why the number alone is the wrong thing to
 * hand them.
 *
 * The CMS commits to the build branch and `ci.yml` runs on that push, so a red
 * run here sends a GitHub failure email to WHOEVER SAVED LAST - a volunteer, who
 * `README.md` has already told that a red build means their file has a problem
 * and that the email says which file. This failure names no file, because there
 * is nothing wrong with any of them. Spec §16 exists to prevent exactly that
 * conversation, so the message says which of the two things happened and who has
 * to decide.
 */
const EXPLICATIA_PAGINII = [
  '          Cel mai probabil NU este o greșeală într-un fișier de program.',
  '          Ori pagina a căpătat ceva nou (markup, un stil, un script), ori a crescut',
  '          cu ce s-a publicat: /program/ ține fiecare zi publicată, iar limita spune',
  '          cât de departe poate publica parohia înainte ca pagina să înceteze a mai fi',
  '          o pagină. Măsurat pe o săptămână parohială obișnuită: /program/ trece de',
  '          limită în jurul a 58 de săptămâni publicate înainte.',
  '          Dacă tocmai ați salvat o zi în /admin/: ziua s-a publicat și situl este în',
  '          regulă. Anunțați persoana care se ocupă de site; nu este ceva de reparat',
  '          din CMS.',
].join('\n');

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

/** A `/`-rooted URL as a path inside `dist/`, or null when it points elsewhere. */
function inDist(url) {
  if (url === null || !url.startsWith('/')) return null;
  const cale = decodeURIComponent(url.split('?')[0].split('#')[0]).slice(1);
  return existsSync(join(DIST, cale)) ? cale : null;
}

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

/*
 * The CSS one built page ships: linked stylesheets and inline blocks.
 *
 * FIRST OF THE NOT-COMMENT-AWARE TAG SCANS; the rest are in the page loop
 * below. See the note at the top of this file for why they are left that way
 * and what would have to change before one of them could be made to matter.
 */
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
  raporteaza(pagina, statSync(join(DIST, pagina)).size, BUGET_PAGINI[pagina], 'octeți', EXPLICATIA_PAGINII);

  // ---- JavaScript, inlined or emitted ----
  let js = 0;
  const detalii = [];
  const vazuteAici = new Set();

  const scripturilePaginii = scripturi(html);

  for (const { atribute, continut, src, fel } of scripturilePaginii) {
    if (fel === 'date') {
      const tip = (ATRIBUT(atribute, 'type') ?? '').trim().toLowerCase();
      detalii.push(`date ${tip} ${Buffer.byteLength(continut)} B (neexecutat)`);
      continue;
    }
    if (fel === 'necunoscut') {
      opreste(
        `${pagina}: <script${atribute}> nu e nici cod, nici date cunoscute.\n` +
          'Adaugă-l în TIPURI_EXECUTATE sau în TIPURI_DATE din scripts/scripturi.mjs. ' +
          'Un buget care sare peste ce nu recunoaște nu e un buget.',
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
   * it honestly ships no JavaScript, and this line reads `0 / 3800` beside
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
  // The same list the JS weighing used, so a `<script>` written inside an HTML
  // comment cannot be counted as a request here while being ignored there.
  for (const { src } of scripturilePaginii) {
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

if (!JS_EMIS_PERMIS && fisiereVazute.size > 0) {
  esec = true;
  console.error(
    `\nScript emis ca fișier, deși JS_EMIS_PERMIS este false: ${[...fisiereVazute].join(', ')}.\n` +
      'Scriptul acestui sit este inline, ceea ce îl ține la zero cereri și e motivul ' +
      'pentru care plafonul de JS stă sub pragul de 4096 al Vite. Dacă schimbarea e ' +
      'intenționată, pune JS_EMIS_PERMIS pe true și lasă loc în bugetul de cereri.',
  );
}

if (esec) {
  console.error('\nBugetul de performanță a fost depășit (specificație §13).');
  process.exit(1);
}
console.log('\nBuget respectat.');
