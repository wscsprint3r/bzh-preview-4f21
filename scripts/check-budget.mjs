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
 * `value <= limit` comparison, so the only outcome over-counting can reach is
 * a FAILED budget. A false red costs somebody a minute and a `git blame`; a
 * false green is the thing this whole file exists to prevent.
 *
 * `<script>` was the exception, and it had to be fixed, because it fed a
 * measurement that could come out LOW. `public/admin/index.html` carries a
 * comment mentioning `<script>`, and the naive pattern ate the comment and the
 * real tag as one match: a 758-byte inline script that does not exist, the real
 * tag's `src` gone with it, weight nothing measured and a CSP hash for nothing.
 * That is why `pageScripts()` consumes comments first and why the scans below do
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
 * `scripts/page-scripts.mjs`. Anything in neither list stops the build rather than
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
import { ATTRIBUTE, pageScripts } from './page-scripts.mjs';

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
 *     GAP, stated rather than closed: `PAGE_EXPLANATION` below is what a
 *     volunteer meets if it is ever reached.
 *
 * THE HOMEPAGE NO LONGER CARRIES AN ISLAND AT ALL. It was there to feed a
 * next-service card, and the card was removed at the parish's request - the week
 * bands below it say the same thing - so the page stopped tracking the published
 * horizon by losing the thing that tracked it, rather than by being bounded.
 * `ISLAND_DAYS` and `scheduleForIsland` remain in `src/lib/schedule.ts`, tested
 * and unused by any page; if a next-service surface ever returns, the bound is
 * already argued for there and this limit is what it answers to.
 *
 * WHICH ONE GOVERNS IF THEY DISAGREE: this limit does. It is a measurement of the
 * artifact, and `ISLAND_DAYS` is an argument about what the artifact will weigh -
 * a day can always carry more services, a longer `location` or a longer `detail`
 * than the arithmetic assumed. So a red build here is a real red build even with
 * the island inside its window: the bound is what keeps this limit out of reach
 * of CONTENT, and it is not a licence to disbelieve the limit. The direction that
 * must never be taken is the other one - raising 45 KB because a page grew.
 * ---------------------------------------------------------------------------
 */
const PAGE_BUDGET = {
  'index.html': 45 * 1024,
  'program/index.html': 135 * 1024,
  /*
   * `/noutati/` GROWS WITH EVERY POST THE PARISH PUBLISHES, like `/program/`
   * grows with every week. Measured on the Task 8 build: 14,562 bytes at 13
   * published posts, of which 8,270 is the fixed skeleton (document, inlined
   * CSS, header, footer) and 6,292 is the 13 cards - 484 bytes per card.
   * Derived from those two numbers rather than built: the 30 KiB limit is
   * crossed at 47 posts, and at 29 posts if every card carried a 300-byte
   * summary, which none does today because `summary` is optional and the
   * migrated corpus has none. Both numbers are arithmetic on the measured
   * bytes, labelled as such because no 47-post build exists.
   *
   * Task 12 owns the pagination decision this limit defers; the comment is
   * here so the red build that decision arrives as says how far away it was.
   */
  'noutati/index.html': 30 * 1024,
  /*
   * THE PATTERN IS A PREFIX, and this is the only entry that needs one:
   * article pages are one per published post, so naming all thirteen by hand
   * would mean the next post the parish publishes fails the build until
   * somebody edits this file - a red build sent to the volunteer who pressed
   * Save, for a page that is not wrong. A key ending in `*` matches every
   * page whose path starts with what comes before it. Exact keys still win,
   * which is why the /noutati/ index above is matched by its own entry and
   * not by this one.
   *
   * The limit is one post's whole body, which is the feature rather than a
   * defect - the same ruling `/program/` gets above. Measured over the
   * thirteen on the final Task 8 build: smallest 9,468 bytes, largest 16,120
   * (the 26 April 2025 adormiti post, which repeats its section five times).
   * 35 KiB is 2.2x the largest, enough that a long pastoral letter ships
   * without a conversation, and small enough that a post twice the size of
   * the current longest is a red build asking whether it should be split
   * rather than a silent 200 KB page.
   */
  'noutati/*': 35 * 1024,
  /*
   * THE NINE PROSE PAGES, three groups and one exact key. They are a fixed
   * contract - the CMS does not create them - so a pattern per URL group is
   * the honest shape: the pages inside a group are the same kind of document,
   * and a tenth would be a decision somebody made.
   *
   * MEASURED ON THE TASK 9 BUILD, all nine:
   *   parohia/istoric        13,346    parohia/consiliul      10,392
   *   servicii-liturgice     21,385
   *   comunitate/scoala      15,701    comunitate/pictura     11,324
   *   resurse/catehism       10,845    resurse/studii         15,755
   *   resurse/doxologia      18,074    resurse/linkuri        12,095
   *
   * The limits are 1.5-2.4x the largest in each group. What makes a prose
   * page grow is an image or a paragraph, so the headroom is what a normal
   * content edit costs - and `servicii-liturgice` is already the largest of
   * the nine at 21 KB because its text is a long list of the services and
   * the bank details, which is the page's content rather than a defect.
   */
  'parohia/*': 24 * 1024,
  'comunitate/*': 24 * 1024,
  'resurse/*': 30 * 1024,
  'servicii-liturgice/index.html': 30 * 1024,
};

/**
 * The budget for one page in one table, or `undefined` when nothing covers it.
 *
 * EXACT KEYS FIRST, then the longest prefix key ending in `*`. Longest wins so
 * that two overlapping patterns resolve to the more specific one rather than
 * to whichever happens to sit earlier in the object - object order is a fact
 * about how somebody typed, and a budget must not be.
 *
 * The caller treats `undefined` as a failure, so the rule this function exists
 * for is also the rule that keeps "every visitor page has a budget" intact: a
 * page that matches neither shape still has no budget and still stops the
 * build. Both tables below go through it for exactly that reason.
 */
function budgetFor(table, page) {
  if (Object.hasOwn(table, page)) return table[page];
  let best;
  for (const [key, limit] of Object.entries(table)) {
    if (!key.endsWith('*')) continue;
    const prefix = key.slice(0, -1);
    if (!page.startsWith(prefix)) continue;
    if (best === undefined || prefix.length > best.prefix.length) best = { prefix, limit };
  }
  return best?.limit;
}

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
const JS_BUDGET = 3800;

/*
 * THE REQUEST BUDGET IS PER PAGE, because the spec's number is per page.
 *
 * Spec §13 budgets "requests (homepage) <= 12". The first version of this
 * script applied 12 to every page, which was true of the site while every
 * other page carried at most one image: the fixed chrome is 11 requests (the
 * document, two icons and eight `@font-face` files), so a one-image article
 * measured exactly 12 and a two-image one measured 13.
 *
 * THE NINE PROSE PAGES ARE MADE OF IMAGES, and that is their content rather
 * than a defect: `resurse/doxologia/` is a shelf of magazine covers (31
 * images) and `parohia/consiliul/` is portraits beside names (8). Measured on
 * the Task 9 build, requests: 12, 13, 14, 15, 19, 22, 42 - six of the nine
 * over a global 12, and the honest conclusion is not that the pages are
 * wrong but that one number was covering pages the spec never gave it.
 *
 * SO THE TABLE IS THE SAME SHAPE AS `PAGE_BUDGET`, exact keys winning and a
 * `*` meaning a prefix, and every page still has a limit - an unmeasured page
 * still stops the build. The homepage keeps the spec's 12. The prose limits
 * are the measured count plus room for a handful more images (2-6, stated per
 * group), because the next issue of the magazine is an image like the last
 * one; an unrelated request, like a new script or a stylesheet, is still a
 * red build. The article limit stays 12: it is the pre-existing cap and Task
 * 12 owns whether publishing a two-image post should change it.
 */
const REQUEST_BUDGET = {
  // The spec's own budget, and the page it was written about.
  'index.html': 12,
  'program/index.html': 12,
  'noutati/index.html': 12,
  // One body image measures exactly 12; the second is Task 12's decision.
  'noutati/*': 12,
  // Measured 14 and 19; 24 is room for five more portraits on either page.
  'parohia/*': 24,
  // Measured 13 on both; 16 is room for three more images.
  'comunitate/*': 16,
  // Measured 12, 15, 22 and 42; 48 is room for six more magazine covers.
  'resurse/*': 48,
  // Measured 12; 16 is room for four more images.
  'servicii-liturgice/index.html': 16,
};

/*
 * THE SCRIPT IS INLINED, AND THAT IS A DECISION - so it is asserted, not
 * inferred.
 *
 * `JS_BUDGET` sits at 3,800 precisely because Astro inlines below roughly 4,096
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
 * Set it to `true` when a file is what you want, and give REQUEST_BUDGET the room
 * it then needs.
 */
const EMITTED_JS_ALLOWED = false;

/*
 * The Sveltia CMS bundle lives under dist/admin/. It is a few hundred KB of
 * third-party code that only a signed-in editor ever loads, behind a login, and
 * it is not part of what a visitor downloads - so that whole subtree is outside
 * every budget here. Excluded by DIRECTORY, and the `.mjs` it ships is why the
 * exclusion has to come before any extension test rather than after it.
 */
const EXCLUDED = ['admin'];

let failed = false;

function report(label, value, limit, unit = 'bytes', explanation = '') {
  const ok = value <= limit;
  if (!ok) failed = true;
  console.log(`${ok ? 'OK      ' : 'TOO BIG '} ${label}: ${value} / ${limit} ${unit}`);
  if (!ok && explanation !== '') console.log(explanation);
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
 *
 * THIS TEXT STAYS ROMANIAN, AND IT IS THE ONLY STRING IN THIS FILE THAT DOES.
 * Everything else here is a build-time diagnostic read by whoever ran the build,
 * and the 2026-09-17 rename put all of it into English. This one is not that: it
 * is addressed to the parish volunteer who pressed Save, in an email they did not
 * ask for, about a failure that is not their fault. It is user-facing copy that
 * happens to live in a script. Do not "finish the job" on it.
 */
const PAGE_EXPLANATION = [
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

function stop(message) {
  console.error(message);
  process.exit(1);
}

/** Every visitor-facing page in the build, as paths relative to `dist/`. */
function visitorPages(relative = '') {
  const found = [];
  for (const entry of readdirSync(join(DIST, relative), { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (relative === '' && EXCLUDED.includes(entry.name)) continue;
      found.push(...visitorPages(posix.join(relative, entry.name)));
    } else if (entry.name.endsWith('.html')) {
      found.push(posix.join(relative, entry.name));
    }
  }
  return found.sort();
}

// A guard that reads files must prove it read something: without these, a
// missing or empty build would make every check below pass vacuously.
if (!existsSync(DIST)) stop(`${DIST}/ does not exist — run the build first.`);
const PAGES = visitorPages();
if (PAGES.length === 0) stop(`${DIST}/ contains no visitor page at all.`);

/*
 * Every visitor page must have a budget in BOTH tables. A page with none
 * would otherwise be the one page nobody is measuring, which is how a new
 * route ships at 200 KB and forty requests on a green build.
 */
const withoutBudget = PAGES.filter((p) => budgetFor(PAGE_BUDGET, p) === undefined);
if (withoutBudget.length > 0) {
  stop(
    `Pages with no budget in PAGE_BUDGET: ${withoutBudget.join(', ')}.\n` +
      'Give them a limit or exclude them explicitly; an unmeasured page is not a page in good order.',
  );
}
const withoutRequestBudget = PAGES.filter((p) => budgetFor(REQUEST_BUDGET, p) === undefined);
if (withoutRequestBudget.length > 0) {
  stop(
    `Pages with no request budget in REQUEST_BUDGET: ${withoutRequestBudget.join(', ')}.\n` +
      'Give them a limit or exclude them explicitly; an unmeasured page is not a page in good order.',
  );
}

/** A `/`-rooted URL as a path inside `dist/`, or null when it points elsewhere. */
function inDist(url) {
  if (url === null || !url.startsWith('/')) return null;
  const path = decodeURIComponent(url.split('?')[0].split('#')[0]).slice(1);
  return existsSync(join(DIST, path)) ? path : null;
}

/** Bytes of one emitted module plus every module it statically pulls in. */
function moduleBytes(path, seen) {
  if (seen.has(path)) return 0;
  seen.add(path);
  const source = readFileSync(join(DIST, path));
  let total = source.length;
  const text = source.toString('utf8');
  const specifiers = [
    ...text.matchAll(/\bfrom\s*["']([^"']+)["']/g),
    ...text.matchAll(/\bimport\s*\(\s*["']([^"']+)["']/g),
    ...text.matchAll(/\bimport\s*["']([^"']+)["']/g),
  ].map((m) => m[1]);
  for (const s of specifiers) {
    const target = s.startsWith('/') ? s.slice(1) : posix.normalize(posix.join(dirname(path), s));
    if (/\.m?js$/.test(target) && existsSync(join(DIST, target))) total += moduleBytes(target, seen);
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
function pageCss(html) {
  const pieces = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    if (!/rel\s*=\s*["']?stylesheet/i.test(m[0])) continue;
    const path = inDist(ATTRIBUTE(m[0], 'href'));
    if (path) pieces.push(readFileSync(join(DIST, path), 'utf8'));
  }
  for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) pieces.push(m[1]);
  return pieces.join('\n');
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
 * `date:` URIs and bare fragments (`url(#id)`, an SVG filter reference) fetch
 * nothing and are skipped.
 */
function cssRequests(css) {
  const FACE_BLOCK = /@font-face\s*\{[^}]*\}/g;
  const faces = (css.match(FACE_BLOCK) ?? []).length;
  // Faces first, then imports, so an `@import url(...)` is not counted twice.
  const rest = css.replace(FACE_BLOCK, ' ');
  const imports = (rest.match(/@import\b[^;]*;/g) ?? []).length;
  const urls = [...rest.replace(/@import\b[^;]*;/g, ' ').matchAll(/\burl\(\s*[\x27"]?([^\x27")]+)/g)]
    .map((m) => m[1].trim())
    .filter((u) => !u.startsWith('data:') && !u.startsWith('#'));
  return { faces, imports, urls };
}

console.log(`Budget for ${PAGES.length} visitor page(s):\n`);

let jsUnion = 0;
const filesSeen = new Set();

for (const page of PAGES) {
  const html = readFileSync(join(DIST, page), 'utf8');
  report(page, statSync(join(DIST, page)).size, budgetFor(PAGE_BUDGET, page), 'bytes', PAGE_EXPLANATION);

  // ---- JavaScript, inlined or emitted ----
  let js = 0;
  const details = [];
  const seenHere = new Set();

  const scriptsOnPage = pageScripts(html);

  for (const { attributes, content, src, kind } of scriptsOnPage) {
    if (kind === 'data') {
      const type = (ATTRIBUTE(attributes, 'type') ?? '').trim().toLowerCase();
      details.push(`data ${type} ${Buffer.byteLength(content)} B (not executed)`);
      continue;
    }
    if (kind === 'unknown') {
      stop(
        `${page}: <script${attributes}> is neither known code nor known data.\n` +
          'Add it to EXECUTED_TYPES or to DATA_TYPES in scripts/page-scripts.mjs. ' +
          'A budget that skips what it does not recognise is not a budget.',
      );
    }
    if (src === null) {
      js += Buffer.byteLength(content);
      details.push(`inline ${Buffer.byteLength(content)} B`);
      continue;
    }
    const path = inDist(src);
    if (path === null) {
      stop(
        `${page}: <script src="${src}"> does not resolve inside ${DIST}/.\n` +
          'An external script is still JavaScript the visitor downloads.',
      );
    }
    const bytes = moduleBytes(path, seenHere);
    js += bytes;
    details.push(`${path} ${bytes} B`);
  }

  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    if (!/rel\s*=\s*["']?modulepreload/i.test(m[0])) continue;
    const path = inDist(ATTRIBUTE(m[0], 'href'));
    if (path === null) continue;
    const bytes = moduleBytes(path, seenHere);
    js += bytes;
    details.push(`modulepreload ${path} ${bytes} B`);
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
  report(`  visitor JS on ${page}`, js, JS_BUDGET);
  console.log(`          ${details.length > 0 ? details.join(' + ') : 'no script'}`);
  for (const f of seenHere) {
    if (!filesSeen.has(f)) { filesSeen.add(f); jsUnion += statSync(join(DIST, f)).size; }
  }

  // ---- requests, as an upper bound ----
  const requests = [`the document ${page}`];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = (ATTRIBUTE(m[0], 'rel') ?? '').toLowerCase();
    if (/\b(stylesheet|icon|modulepreload|preload|apple-touch-icon|manifest)\b/.test(rel)) {
      requests.push(`${rel} ${ATTRIBUTE(m[0], 'href')}`);
    }
  }
  // The same list the JS weighing used, so a `<script>` written inside an HTML
  // comment cannot be counted as a request here while being ignored there.
  for (const { src } of scriptsOnPage) {
    if (src !== null) requests.push(`script ${src}`);
  }
  for (const m of html.matchAll(/<(img|iframe|video|audio|source|embed)\b([^>]*)>/gi)) {
    if (ATTRIBUTE(m[2], 'src') !== null || ATTRIBUTE(m[2], 'srcset') !== null) requests.push(`${m[1]}`);
  }
  const inDocument = requests.length;
  const { faces, imports, urls } = cssRequests(pageCss(html));
  for (let i = 0; i < faces; i += 1) requests.push('@font-face');
  for (let i = 0; i < imports; i += 1) requests.push('@import');
  for (const u of urls) requests.push(`url(${u})`);

  report(`  requests (upper bound) for ${page}`, requests.length, budgetFor(REQUEST_BUDGET, page), 'requests');
  console.log(
    `          ${inDocument} in the document + ${faces} @font-face` +
      `${imports > 0 ? ` + ${imports} @import` : ''}` +
      `${urls.length > 0 ? ` + ${urls.length} url() in CSS` : ''}`,
  );
  console.log('');
}

console.log(`JS emitted as files, everywhere: ${jsUnion} bytes in ${filesSeen.size} file(s).`);
console.log(
  filesSeen.size === 0
    ? 'No .js file emitted — the script is inline in the pages, so it costs no request.\n' +
        "Past Vite's 4096-byte threshold that reverses: a file, a request, and a cache entry."
    : 'The script is emitted as a file, so it costs one request and is cached between pages.',
);

if (!EMITTED_JS_ALLOWED && filesSeen.size > 0) {
  failed = true;
  console.error(
    `\nScript emitted as a file although EMITTED_JS_ALLOWED is false: ${[...filesSeen].join(', ')}.\n` +
      "This site's script is inline, which keeps it at zero requests and is why the JS " +
      "ceiling sits below Vite's 4096 threshold. If the change is intended, set " +
      'EMITTED_JS_ALLOWED to true and leave room in the request budget.',
  );
}

if (failed) {
  console.error('\nThe performance budget was exceeded (spec §13).');
  process.exit(1);
}
console.log('\nBudget met.');
