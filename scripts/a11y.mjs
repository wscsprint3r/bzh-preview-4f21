/*
 * Loads the built site in a real headless Chrome and checks two things nothing
 * else in this repository can see: what axe-core says about it, and what the
 * Content-Security-Policy in `_headers` does to it.
 *
 * ===========================================================================
 * WHY A BROWSER, AND WHY THIS BROWSER RATHER THAN THE axe CLI.
 *
 * Contrast is owned here. A static scan of CSS text cannot do it: specificity,
 * `@layer`, media context and source order across stylesheets are cascade
 * rules, and anything asserting over CSS text is re-implementing the cascade.
 *
 * This file used to drive `@axe-core/cli`. It cannot any more, and the reason
 * is measured rather than argued:
 *
 *   - The CLI parses `--chrome-options` with `val.split(/[,;]/)`, so
 *     `window-size=390,844` arrives as `--window-size=390` and `--844`. There
 *     is no escape.
 *   - Even passed correctly, `window-size` is clamped: launching with
 *     `390,844` on macOS measured `innerWidth === 500`.
 *   - It has no way to stop the page's own scripts from running.
 *
 * THE CLAMP HAS NOW COST THIS PROJECT TWICE. Task 9's first responsive
 * measurement asked for 375px, silently got 500px, and measured a layout nobody
 * had asked about; its report records the same conclusion this file reached
 * independently - Chrome refuses a window narrower than about 500px, so
 * `Emulation.setDeviceMetricsOverride` is the only way to ask for a phone width,
 * and the width must be PRINTED beside every result rather than assumed. Both
 * halves are here: the override in `pregateste`, and `innerWidth` on every line
 * of output, checked against what the condition asked for.
 *
 * `Emulation.setDeviceMetricsOverride` and `Emulation.setScriptExecutionDisabled`
 * do both exactly, and both are CDP-only. So the driver is `selenium-webdriver`
 * and the engine is `axe-core` injected directly - the same axe-core the CLI
 * used, at the same version. Replacing a checker is the easiest place in a
 * project to lose coverage without anyone noticing, so the swap was not trusted
 * to "it still passes": both engines were run over the same build and their
 * passes, violations AND incompletes compared rule id by rule id.
 *
 * THAT COMPARISON WAS A ONE-TIME GATE, NOT A RUNNING GUARD, and this repository
 * no longer contains `@axe-core/cli` to repeat it with. Its result, the rule
 * inventory on this side, and the procedure to redo it if the engine or the
 * driver changes again are in `docs/a11y-differential.md`. Set `A11Y_REGULI=1`
 * to make any pass print its rule ids, which is the input that document's
 * procedure diffs.
 * ===========================================================================
 *
 * ---------------------------------------------------------------------------
 * HONEST SCOPE. A green run means this and no more:
 *
 *   No failing text reaches a visitor IN THE DEFAULT STATE, ON A FLAT
 *   BACKGROUND, AT EACH AUDITED VIEWPORT, DARK-SCHEME, ON A BUILT PAGE - and
 *   no page provokes a CSP violation the policy did not already expect.
 *
 * It does NOT cover:
 *   - text over a gradient or a background-image. axe reports those as
 *     `incomplete` rather than as a pass, so this script fails on any
 *     `incomplete` for color-contrast and prints the selector. "Could not
 *     determine" is a decision someone makes, not a silence.
 *   - :hover, :focus and :active states
 *   - anything display:none, visibility:hidden, opacity:0 or [hidden]. This is
 *     why the JavaScript-off condition exists at all: with scripts running, the
 *     week picker hides every week but one and axe skips them.
 *   - viewports other than the ones some pass in `TRECERI` really loads THESE
 *     pages at. This is the one disclaimer here that is also a check:
 *     `verificaPraguri` derives the breakpoints from the built CSS and fails
 *     when they cut out a band of widths nothing runs in, so "unaudited branch"
 *     is a red build rather than a caveat. It counts a width only where a pass
 *     over this same set of pages uses it - a width declared in `CONDITII` and
 *     run over some other build buys this one nothing. What stays uncovered is
 *     width WITHIN a band, and any axis that is not width.
 *   - colour-scheme branches other than dark
 *   - ::before / ::after content, and SVG <text>
 *   - pages that were not built when the audit ran
 *   - non-hex colour literals, which neither this nor the hex guard catches
 *   - whether Cloudflare actually applies `_headers`. This serves the file's
 *     rules itself; only `curl -sI` against the deployed host can say what the
 *     host does with them.
 * ---------------------------------------------------------------------------
 *
 * Run with `npm run a11y`, `npm run a11y:mobil`, `npm run a11y:selector`, or as
 * a step of `npm run test:build`.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Builder } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import chromedriver from 'chromedriver';
import { anteteleRutei, parseazaHeaders } from './headers.mjs';

const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

const TIPURI = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ics': 'text/calendar',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
};

/*
 * THE ONE PAGE THE AXE AUDIT DOES NOT COVER, and why measuring it would be
 * worse than skipping it.
 *
 * `admin/index.html` is the host page for Sveltia CMS: a `<script>` tag and a
 * `<noscript>`, nothing else. Everything an editor sees is drawn by the bundle
 * after load, so what axe measures is the empty shell - which is why a run
 * across it reports `landmark-one-main` and `page-has-heading-one` against
 * `<html>` itself, and why `color-contrast` never runs at all.
 *
 * The tempting fix is to give the page a `<main>` and an `<h1>` so the rules
 * have something to bite on. That would be worse: the markup is replaced a
 * second later by markup we did not write and cannot change, so the green would
 * be about a placeholder while reading as a guarantee about the CMS.
 *
 * SO `/admin/` IS UNAUDITED BY axe, and its accessibility is Sveltia's. It is
 * NOT exempt from the CSP check below - it is the page where an editor's GitHub
 * credential lives, which makes it the page whose policy matters most.
 *
 * Excluded BY EXACT PATH, not by folder - the same rule `stylesheet.itest.ts`
 * follows - so the next page put under `admin/` is audited like any other.
 *
 * KEYED BY PATH WITH THE REASON BESIDE IT, like `FARA_JS_MOTIVAT` and
 * `TRASATURI_NEAUDITATE`, and for the same reason those two are. This list is the
 * one lever that SHRINKS the audit's subject: a page named here is audited by no
 * axe run, and its CSS leaves the derived breakpoint set with it. As a bare array
 * it was the last narrowing list in this file whose entries did not have to say
 * anything, and an entry nobody has to justify is the cheapest way out of a red
 * build. `verificaTreceri` fails on an entry with no reason written, so adding a
 * page here is a decision somebody signed rather than a line somebody appended.
 *
 * @type {Record<string, string>}
 */
export const FARA_AXE_MOTIVAT = {
  'admin/index.html': [
    'gazda Sveltia CMS: un `<script>` și un `<noscript>`, nimic altceva. Tot ce vede un editor',
    'este desenat de bundle după încărcare, deci ce ar măsura axe este învelișul gol — de unde',
    'și `landmark-one-main` și `page-has-heading-one` pe `<html>` însuși, și `color-contrast`',
    'care nu rulează deloc. A-i da un `<main>` și un `<h1>` ca regulile să aibă în ce mușca ar fi',
    'mai rău: markup-ul este înlocuit o secundă mai târziu de markup pe care nu l-am scris noi',
    'și nu îl putem schimba, deci verdele ar fi despre un substitut și s-ar citi ca o garanție',
    'despre CMS. Accesibilitatea ei este a lui Sveltia. NU este scutită de verificarea CSP —',
    'este pagina pe care stă o credențială GitHub, deci pagina a cărei politică contează cel mai',
    'mult.',
  ].join('\n      '),
};

/** The paths above, which is all most of this file needs. */
const FARA_AXE = Object.keys(FARA_AXE_MOTIVAT);

/*
 * The CSP violations `/admin/` is EXPECTED to provoke, each measured in a real
 * browser and each verified to fail gracefully - the sign-in screen draws
 * correctly with all five refused. `public/_headers` explains every one.
 *
 * FIVE REFUSALS, FOUR ENTRIES: `img-src <- blob` happens twice per load, and the
 * comparison below is set-based, so listing it once is correct. Count the
 * refusals in a run, not the lines here.
 *
 * THE EXPECTED SET IS WRITTEN HERE, NOT DERIVED FROM THE RUN. A list rebuilt
 * from whatever the browser reported would accept anything the CMS decided to
 * fetch next, which is the one thing this check exists to notice: a Sveltia
 * upgrade reaching for a new origin from the page that holds a credential.
 *
 * Keyed `directive <- blockedURI`, which is what Chrome reports.
 */
const CSP_ASTEPTAT = {
  'admin/index.html': [
    'connect-src <- data',
    'connect-src <- https://unpkg.com/@sveltia/cms/package.json',
    'connect-src <- https://www.githubstatus.com/api/v2/status.json',
    'img-src <- blob',
  ],
};

/** Every `.html` in a build, as paths relative to it. */
export function paginile(radacina, relativ = '') {
  const gasite = [];
  for (const intrare of readdirSync(join(radacina, relativ), { withFileTypes: true })) {
    const cale = relativ === '' ? intrare.name : `${relativ}/${intrare.name}`;
    if (intrare.isDirectory()) gasite.push(...paginile(radacina, cale));
    else if (intrare.name.endsWith('.html')) gasite.push(cale);
  }
  return gasite.sort();
}

/*
 * The harness's own control page, served from memory and NOT from the build.
 *
 * It answers one question that the audit cannot answer about itself: is the
 * JavaScript-off condition actually off? Without it, a broken switch would turn
 * every "with scripts disabled" pass into a second copy of the pass above it,
 * and the weeks the picker hides would go back to being audited by nothing
 * while the output still said they were.
 *
 * Served WITHOUT the site's CSP, deliberately: the policy admits exactly the
 * hashes of the scripts the build produced, so this page's script would be
 * refused and the control would report "scripts did not run" in both
 * conditions - agreeing with a broken switch instead of catching it.
 */
const CALE_CONTROL = '/__control__.html';
const CONTROL = `<!doctype html><html lang="ro"><head><meta charset="utf-8"><title>inainte</title></head>
<body><p id="p">inainte</p><script>document.title = 'dupa'; document.getElementById('p').textContent = 'dupa';</script></body></html>`;

function serveste(dist, reguli) {
  return createServer((req, res) => {
    const cale = decodeURIComponent(req.url.split('?')[0]);
    if (cale === CALE_CONTROL) {
      res.writeHead(200, { 'Content-Type': TIPURI['.html'] });
      res.end(CONTROL);
      return;
    }
    const fisier = join(dist, cale.endsWith('/') ? `${cale}index.html` : cale);
    if (!existsSync(fisier) || !statSync(fisier).isFile()) {
      res.writeHead(404);
      res.end('404');
      return;
    }
    const antete = { 'Content-Type': TIPURI[extname(fisier)] ?? 'application/octet-stream' };
    // Matched against the REQUEST path, which is what Cloudflare matches, not
    // against the file it resolved to: `/` and `/index.html` are different
    // strings to a rule like `/index.html`.
    for (const [nume, valoare] of anteteleRutei(reguli, cale)) antete[nume] = valoare;
    res.writeHead(200, antete);
    res.end(readFileSync(fisier));
  });
}

/**
 * The conditions an audit runs under.
 *
 * `latime: null` means "whatever headless Chrome gives by default" - 756 CSS px
 * on every machine this has run on, and MEASURED at the start of every run
 * rather than believed, because that number is what decides which layout the
 * default pass is looking at. `js: false` means the page's own scripts never
 * ran.
 *
 * WHAT EACH WIDTH IS FOR:
 *   - 390px is below the `34rem` breakpoint, where the day row drops its month
 *     name and the week band stacks. Most of the parish reads this on a phone.
 *   - 1100px is above the `62rem` breakpoint, where the week band regrids to fit
 *     a seven-day Holy Week.
 *   - the default sits between the two, which is the only reason one pass is not
 *     enough - and `verificaPraguri` below is what keeps that true.
 *
 * `medii` is the intent, written down. It is checked from two sides: the browser
 * answers each query with `matchMedia` at the measured width, and
 * `verificaPraguri` refuses any query here that the built CSS no longer
 * declares. Only the second catches a breakpoint that MOVED - see the note
 * above `pragurile`.
 */
const TELEFON = '(max-width: 34rem)';
const LARG = '(min-width: 62rem)';

export const CONDITII = {
  birou: { eticheta: 'birou, JS pornit', latime: null, js: true, medii: { [TELEFON]: false, [LARG]: false } },
  birouFaraJs: { eticheta: 'birou, JS oprit', latime: null, js: false, medii: { [TELEFON]: false, [LARG]: false } },
  telefon: { eticheta: 'telefon 390px, JS pornit', latime: 390, inaltime: 844, js: true, medii: { [TELEFON]: true, [LARG]: false } },
  telefonFaraJs: { eticheta: 'telefon 390px, JS oprit', latime: 390, inaltime: 844, js: false, medii: { [TELEFON]: true, [LARG]: false } },
  larg: { eticheta: 'larg 1100px, JS pornit', latime: 1100, inaltime: 900, js: true, medii: { [TELEFON]: false, [LARG]: true } },
  largFaraJs: { eticheta: 'larg 1100px, JS oprit', latime: 1100, inaltime: 900, js: false, medii: { [TELEFON]: false, [LARG]: true } },
};

/* -------------------------------------------------------------------------- *
 * THE PASSES. A CONDITION NOTHING RUNS IS NOT COVERAGE.
 *
 * `CONDITII` above is a DECLARATION, and until this table existed the band
 * check below was measured against it. Measured: add one line to `CONDITII` -
 * `tableta: { latime: 850, … }` - and nothing else. No npm script, no argument,
 * no pass. All three `dist` passes went green printing
 * `lățimi auditate: 390, 756, 850, 1100px` while NOTHING had ever loaded a page
 * at 850px, and the band that 850 was supposed to cover stayed audited by
 * nobody. The check credited a declaration instead of an execution - the third
 * time on this task that the audit wore the defect it exists to catch.
 *
 * The failure message even said what to do: "add a condition with a width from
 * the band (AND PUT IT IN THE package.json SCRIPTS)". It instructed two things
 * and checked the first. The parenthesis was the load-bearing half, and
 * following the instruction exactly closed the guard without closing the gap.
 *
 * So the audited widths are read from HERE instead. One entry per pass; a pass
 * is a command `package.json` actually runs, over one SET OF PAGES, with a named
 * list of conditions. `auditeaza` takes a key from this table rather than a list
 * of conditions, so the conditions a pass runs and the conditions its coverage
 * is credited for cannot be two different things.
 *
 * SETS OF PAGES, NOT ONE GLOBAL LIST, and that is the second hole this closes.
 * `dist` and the selector pass's scratch build are different builds with
 * different markup, so a width audited on one proves nothing about the other.
 * Crediting the whole matrix to both hid `BandaSaptamanii`'s `min-width: 62rem`
 * branch completely: it renders in the fixture build with the picker bar
 * VISIBLE - the only build where that bar is not `hidden` - and no selector
 * width reached 992px, while in `dist/` the bar is hidden and axe skips it. The
 * Holy Week row with the bar showing had never been audited by anything. It is
 * `TRECERI.selector`'s third condition now.
 *
 * WHAT IS ASSERTED ABOUT THIS TABLE, on every run, before the browser opens -
 * each one a way a declaration can drift from what executes:
 *
 *   - every entry's command is reachable from `npm run test:all`, following
 *     `npm run` chains. A pass no suite runs audits nothing;
 *   - every a11y command anywhere in `package.json` is described by an entry. A
 *     pass this table does not know about is a pass whose widths go uncounted;
 *   - every `CONDITII` key is named by some entry - the hole above, by name;
 *   - every condition an entry names exists in `CONDITII`;
 *   - every condition declares at least one media query, because assertion (a)
 *     of the breakpoint check iterates exactly those and an empty `medii` makes
 *     it a loop over nothing;
 *   - every set of pages is audited with scripts OFF by some entry, or is named
 *     in `FARA_JS_MOTIVAT` with the reason. See the block above this table.
 *
 * IT CANNOT PASS BY HAVING READ NOTHING: an unreadable or emptied `package.json`
 * makes all four commands unreachable and fails four times over, so there is no
 * arrangement where the check is silent because it found no input.
 *
 * DERIVED FROM package.json, COMPARED AGAINST WHAT IS WRITTEN HERE. The command
 * strings below are a second copy of four strings in `package.json` - on purpose,
 * and the opposite of the decayed copy of two breakpoints that the section after
 * this one exists to have deleted. The difference is that both directions are
 * asserted: a command here that `package.json` does not run fails, and a command
 * `package.json` runs that is not here fails too. A copy nothing compares is what
 * rots; a copy compared in both directions is an agreement between two files.
 * -------------------------------------------------------------------------- */

/**
 * @typedef {{ limita: number, px: number, texte: Set<string>, surse: Set<string> }} Prag
 * @typedef {{ nume: string, surse: Set<string>, conditii: Set<string> }} Trasatura
 * @typedef {{ eticheta: string, latime: number | null, inaltime?: number, js: boolean,
 *             medii: Record<string, boolean> }} Conditie
 * @typedef {{ fisier: string, argumente: string[], pagini: string, conditii: string[],
 *             eticheta: string }} Trecere
 */

/** This file's own path as `package.json` spells it, read off the module URL. */
const ACEST_FISIER = `scripts/${new URL(import.meta.url).pathname.split('/').pop()}`;

export const TRECERI = {
  implicita: {
    fisier: 'scripts/a11y.mjs',
    argumente: [],
    pagini: 'dist',
    conditii: ['birou', 'birouFaraJs'],
    eticheta: 'axe la lățimea implicită',
  },
  mobil: {
    fisier: 'scripts/a11y.mjs',
    argumente: ['--mobil'],
    pagini: 'dist',
    conditii: ['telefon', 'telefonFaraJs'],
    eticheta: 'axe la lățime de telefon (390px)',
  },
  larg: {
    fisier: 'scripts/a11y.mjs',
    argumente: ['--larg'],
    pagini: 'dist',
    conditii: ['larg', 'largFaraJs'],
    eticheta: 'axe peste pragul de 62rem (1100px)',
  },
  selector: {
    fisier: 'scripts/a11y-selector.mjs',
    argumente: [],
    pagini: 'proba',
    // `larg` is here because the 62rem branch of the week band renders in this
    // build too, and this is the ONLY build in which the picker bar above it is
    // visible. Without it the ≥992px band of the scratch build is audited by
    // nothing at all - which is exactly what the check below now says.
    conditii: ['birou', 'telefon', 'larg'],
    eticheta: 'axe peste selectorul de săptămână (construcție de probă)',
  },
};

/* -------------------------------------------------------------------------- *
 * THE SECOND AXIS: SCRIPTS ON AND SCRIPTS OFF.
 *
 * The table above closed the WIDTH axis - no width counts unless some pass over
 * these pages really loads them at it. The JavaScript axis had nothing at all,
 * and it is the axis on which this site deliberately renders two different
 * pages. Measured: delete `birouFaraJs`, `telefonFaraJs` and `largFaraJs` from
 * `CONDITII` and from the three `TRECERI` entries that name them, change nothing
 * else, and all four browser passes plus the whole unit suite stay GREEN - while
 * the only audit that ever renders the weeks the picker hides has been removed.
 *
 * That pass is not optional and three places in this repository say so: the
 * plan's Global Constraints ("Neither pass alone is the guarantee"), the HONEST
 * SCOPE block at the top of this file, and `SelectorSaptamana.astro`, which
 * explains that axe skips hidden elements and drives Chrome with scripts ON, so
 * every week but one leaves the audit the moment the picker works. Today the
 * parish publishes one week and nothing is hidden; the first week two are
 * published, the JS-on passes audit one week of the homepage band and the JS-off
 * passes audit three.
 *
 * So each SET OF PAGES must be audited with scripts off by some pass that
 * `npm run test:all` really runs - or be named here, in words, with the reason.
 * The check reads `TRECERI` and `CONDITII`, the same tables the width check
 * reads and the same ones the browser is driven from, so what it credits is what
 * executes rather than what is declared.
 *
 * BOTH DIRECTIONS ARE ASSERTED, as with the command strings above. An exemption
 * for a set that DOES have a scripts-off condition fails, and so does one for a
 * set no pass audits: an excuse nobody needs is an excuse waiting to cover
 * something else, and this project has already paid twice for a list that fell
 * behind the thing it described.
 * -------------------------------------------------------------------------- */

/**
 * Sets of pages with no scripts-off pass, and why each one has none.
 *
 * NOT A LIST OF EXCEPTIONS TO BE ADDED TO WHEN A PASS IS INCONVENIENT. An entry
 * here says the set has no no-JS STATE worth auditing, not that auditing it is
 * awkward. `dist` has one - it is the whole site as a visitor without JavaScript
 * sees it - and will never belong here.
 *
 * @type {Record<string, string>}
 */
export const FARA_JS_MOTIVAT = {
  proba: [
    'bara selectorului există numai cu scripturile pornite: componenta o trimite `hidden` și',
    'scriptul o dezvăluie, deci cu JS oprit construcția de probă nu are nicio stare proprie de',
    'auditat — randează exact ce randează `dist`, toate săptămânile vizibile, iar `verificaBara`',
    'se și întoarce devreme pentru `conditie.js === false`. Starea fără JS a acestor pagini este',
    'acoperită de trecerile peste `dist`, care chiar o au.',
  ].join('\n      '),
};

/**
 * A pass as `package.json` has to spell it.
 *
 * @param {Trecere} trecere
 */
export function comandaTrecerii(trecere) {
  return ['node', trecere.fisier, ...trecere.argumente].join(' ');
}

/**
 * Every command `npm run <nume>` ends up executing, `npm run` chains followed.
 * Commands are normalised on whitespace so a reformatted `package.json` is not
 * a failure.
 *
 * @param {Record<string, string>} scripturi
 * @param {string} nume
 * @param {Set<string>} [vazute]
 * @returns {{ comenzi: string[], probleme: string[] }}
 */
export function comenzileScriptului(scripturi, nume, vazute = new Set()) {
  const comenzi = [];
  const probleme = [];
  if (!(nume in scripturi)) {
    probleme.push(`package.json nu are scriptul "${nume}" — nu se poate spune ce rulează suita.`);
    return { comenzi, probleme };
  }
  if (vazute.has(nume)) return { comenzi, probleme };
  vazute.add(nume);
  for (const bucata of scripturi[nume].split('&&')) {
    const comanda = bucata.trim().replace(/\s+/g, ' ');
    if (comanda === '') continue;
    const inlantuit = comanda.match(/^npm run ([\w:.-]+)$/);
    if (inlantuit === null) {
      comenzi.push(comanda);
      continue;
    }
    const mai = comenzileScriptului(scripturi, inlantuit[1], vazute);
    comenzi.push(...mai.comenzi);
    probleme.push(...mai.probleme);
  }
  return { comenzi, probleme };
}

/**
 * Every audit command `package.json` contains, wherever it sits.
 *
 * @param {Record<string, string>} scripturi
 * @returns {string[]}
 */
export function comenziA11y(scripturi) {
  const gasite = new Set();
  for (const valoare of Object.values(scripturi)) {
    for (const bucata of String(valoare).split('&&')) {
      const comanda = bucata.trim().replace(/\s+/g, ' ');
      if (/^node scripts\/a11y[\w.-]*\.mjs(\s|$)/.test(comanda)) gasite.add(comanda);
    }
  }
  return [...gasite].sort();
}

/**
 * The assertions above, as sentences. Empty means the table and `package.json`
 * agree, every condition is executed by something, every condition says what it
 * expects of the CSS, and every set of pages is audited in both JavaScript
 * states or says why not.
 *
 * @param {{ scripts?: Record<string, string> }} [pachet]
 * @param {Record<string, Trecere>} [treceri]
 * @param {Record<string, Conditie>} [conditii]
 * @param {Record<string, string>} [motive]
 * @param {Record<string, string>} [faraAxe]
 * @returns {string[]}
 */
export function verificaTreceri(
  pachet = citestePachet(),
  treceri = TRECERI,
  conditii = CONDITII,
  motive = FARA_JS_MOTIVAT,
  faraAxe = FARA_AXE_MOTIVAT,
) {
  const scripturi = pachet.scripts ?? {};
  const esecuri = [];

  const { comenzi, probleme } = comenzileScriptului(scripturi, 'test:all');
  esecuri.push(...probleme);
  const rulate = new Set(comenzi);
  const descrise = new Map(Object.entries(treceri).map(([cheie, t]) => [comandaTrecerii(t), cheie]));

  for (const [comanda, cheie] of descrise) {
    if (rulate.has(comanda)) continue;
    esecuri.push(
      `trecerea "${cheie}" nu este pornită de "npm run test:all": nimic din lanțul lui nu rulează \`${comanda}\`.\n` +
        '    O trecere pe care suita nu o rulează nu auditează nicio lățime, oricâte ar declara TRECERI.',
    );
  }
  for (const comanda of comenziA11y(scripturi)) {
    if (descrise.has(comanda)) continue;
    esecuri.push(
      `package.json rulează \`${comanda}\`, dar nicio intrare din TRECERI nu o descrie.\n` +
        '    Lățimile ei nu se socotesc nicăieri: adaug-o în TRECERI, cu setul de pagini și condițiile ei.',
    );
  }

  const folosite = new Set(Object.values(treceri).flatMap((t) => t.conditii));
  for (const [cheie, conditie] of Object.entries(conditii)) {
    if (folosite.has(cheie)) continue;
    esecuri.push(
      `CONDITII declară "${cheie}" (${conditie.eticheta}), dar nicio trecere din TRECERI nu o rulează.\n` +
        '    Nimeni nu încarcă nicio pagină la lățimea ei, deci ea nu acoperă nicio bandă. Pune-o în\n' +
        '    condițiile unei treceri, și trecerea aceea într-un script pornit de "npm run test:all" —\n' +
        '    ambele, fiindcă numai a doua jumătate face auditul să se întâmple.',
    );
  }
  for (const [cheie, t] of Object.entries(treceri)) {
    for (const nume of t.conditii) {
      if (nume in conditii) continue;
      esecuri.push(`trecerea "${cheie}" numește condiția "${nume}", care nu există în CONDITII.`);
    }
  }

  /*
   * A CONDITION THAT DECLARES NOTHING MAKES ASSERTION (a) VACUOUS. That check
   * iterates the union of the `medii` keys of the conditions a set of pages is
   * loaded under; empty every `medii` and the loop body never runs, with no
   * complaint. Measured: with `medii: {}` everywhere AND `RandZi.astro`'s phone
   * breakpoint moved from 34rem to 30rem, all four passes are exit 0 - against
   * exit 1 for the identical breakpoint move with `medii` populated. Band
   * coverage (b) still holds, so nothing else fires, and the default pass is
   * then auditing a layout branch nobody asked about.
   *
   * `medii` is also the only thing the BROWSER checks about a width: it answers
   * each query with `matchMedia` at the measured viewport. An empty one leaves
   * that silent too.
   */
  for (const [cheie, conditie] of Object.entries(conditii)) {
    if (Object.keys(conditie.medii ?? {}).length > 0) continue;
    esecuri.push(
      `CONDITII declară "${cheie}" (${conditie.eticheta}) fără nicio interogare în medii.\n` +
        '    Verificarea (a) din verificaPraguri iterează exact aceste interogări, deci cu medii gol\n' +
        '    nu verifică nimic: un prag care se MUTĂ trece nevăzut, iar browserul nu are ce\n' +
        '    confirma cu matchMedia la lățimea măsurată. Scrie ce trebuie și ce nu trebuie să se\n' +
        '    potrivească acolo — o condiție care nu declară nimic nu poate contrazice nimic.',
    );
  }

  // Every set of pages is audited with scripts off, or says why it is not.
  const seturi = [...new Set(Object.values(treceri).map((t) => t.pagini))].sort();
  for (const setPagini of seturi) {
    const { faraJs } = moduriAuditate(setPagini, treceri, conditii);
    const motiv = motive[setPagini];
    if (!faraJs && motiv === undefined) {
      esecuri.push(
        `nicio trecere nu auditează setul de pagini „${setPagini}” cu scripturile OPRITE.\n` +
          '    axe sare peste tot ce e ascuns, iar selectorul de săptămână ascunde toate\n' +
          '    săptămânile în afară de una — deci cu JS pornit banda săptămânii este auditată pe o\n' +
          '    singură săptămână, și fără trecerea fără JS restul nu e auditat de nimeni. La fel\n' +
          '    pentru orice altceva dezvăluit de un script.\n' +
          '    Se închide în trei pași, ca și o lățime: o condiție cu js: false în CONDITII, numele\n' +
          `    ei în conditii-le unei treceri cu pagini: "${setPagini}", și comanda acelei treceri\n` +
          '    într-un script pornit de "npm run test:all".\n' +
          `    Sau, dacă setul acesta chiar nu are o stare fără JS de auditat, scrie motivul în\n` +
          '    FARA_JS_MOTIVAT din scripts/a11y.mjs — o lipsă spusă e mai bună decât o trecere degeaba.',
      );
    }
    if (faraJs && motiv !== undefined) {
      esecuri.push(
        `FARA_JS_MOTIVAT scuză setul de pagini „${setPagini}”, dar o trecere chiar îl auditează cu\n` +
          '    scripturile oprite. Scoate scuza: una de care nu are nimeni nevoie rămâne în cod\n' +
          '    arătând ca o regulă, gata să acopere altceva cu același nume.',
      );
    }
  }
  for (const setPagini of Object.keys(motive)) {
    if (seturi.includes(setPagini)) continue;
    esecuri.push(
      `FARA_JS_MOTIVAT numește setul de pagini „${setPagini}”, pe care nicio trecere din TRECERI\n` +
        '    nu îl auditează. Scuza a rămas în urma tabelului.',
    );
  }
  /*
   * Every page excluded from axe says why, in words. The other direction - an
   * exclusion for a page that does not exist - is checked in `auditeaza`, where
   * the build is in hand.
   */
  for (const [cale, motiv] of Object.entries(faraAxe)) {
    if (typeof motiv === 'string' && motiv.trim().length > 40) continue;
    esecuri.push(
      `FARA_AXE_MOTIVAT scoate „${cale}” din auditul axe fără să spună de ce.\n` +
        '    Lista aceasta este singura pârghie care MICȘOREAZĂ subiectul auditului: pagina nu mai\n' +
        '    este auditată de nicio trecere, iar CSS-ul ei iese odată cu ea din setul de praguri\n' +
        '    derivat. Scrie motivul lângă cale — o scutire pe care nu trebuie s-o justifice nimeni\n' +
        '    este cea mai ieftină ieșire dintr-o construcție roșie.',
    );
  }
  return esecuri;
}

/**
 * The widths at which some pass really loads this set of pages, and which passes
 * they come from. Never the whole of `CONDITII`.
 *
 * @param {string} setPagini
 * @param {number} latimeImplicita
 * @param {Record<string, Trecere>} [treceri]
 * @param {Record<string, Conditie>} [conditii]
 * @returns {{ treceri: string[], latimi: number[] }}
 */
export function latimiAuditate(setPagini, latimeImplicita, treceri = TRECERI, conditii = CONDITII) {
  const cheile = Object.keys(treceri).filter((cheie) => treceri[cheie].pagini === setPagini);
  const latimi = new Set();
  for (const cheie of cheile) {
    for (const nume of treceri[cheie].conditii) {
      const conditie = conditii[nume];
      if (conditie !== undefined) latimi.add(conditie.latime ?? latimeImplicita);
    }
  }
  return { treceri: cheile, latimi: [...latimi].sort((a, b) => a - b) };
}

/**
 * The widths this set of pages is really loaded at, SPLIT BY JAVASCRIPT STATE.
 *
 * `latimiAuditate` answers "which widths", `moduriAuditate` answers "which
 * states", and the guard asked those two questions separately. That is the sixth
 * blind arrangement, found while closing the fifth and measured before it was
 * closed: delete `telefonFaraJs` from `CONDITII` and from `TRECERI.mobil`, change
 * nothing else, and the unit guard is 28 passed, both `dist` passes exit 0, and
 * the run prints `stari JavaScript auditate: JS pornit - JS oprit` - true of the
 * SET, false of the phone band, which has just lost its only scripts-off audit.
 * The band below 34rem is where the day row drops its month name, where the week
 * band stacks, and where most of the parish reads this; with scripts on the
 * picker hides every week but one and axe skips them.
 *
 * Coverage is therefore a property of the PAIR, and that is what this returns.
 *
 * @param {string} setPagini
 * @param {number} latimeImplicita
 * @param {Record<string, Trecere>} [treceri]
 * @param {Record<string, Conditie>} [conditii]
 * @returns {{ cuJs: number[], faraJs: number[] }}
 */
export function latimiPeStare(setPagini, latimeImplicita, treceri = TRECERI, conditii = CONDITII) {
  const pe = { cuJs: new Set(), faraJs: new Set() };
  for (const cheie of Object.keys(treceri).filter((k) => treceri[k].pagini === setPagini)) {
    for (const nume of treceri[cheie].conditii) {
      const conditie = conditii[nume];
      if (conditie === undefined) continue;
      pe[conditie.js === true ? 'cuJs' : 'faraJs'].add(conditie.latime ?? latimeImplicita);
    }
  }
  return {
    cuJs: [...pe.cuJs].sort((a, b) => a - b),
    faraJs: [...pe.faraJs].sort((a, b) => a - b),
  };
}

/** The two JavaScript states, as they are named in output and in code. */
export const STARI = [
  { cheie: 'cuJs', eticheta: 'PORNITE', scurt: 'JS pornit' },
  { cheie: 'faraJs', eticheta: 'OPRITE', scurt: 'JS oprit' },
];

/**
 * The states a set of pages must be audited in: scripts on always, scripts off
 * unless `FARA_JS_MOTIVAT` says in words why that set has no such state.
 *
 * @param {string} setPagini
 * @param {Record<string, string>} [motive]
 */
export function stariCerute(setPagini, motive = FARA_JS_MOTIVAT) {
  return STARI.filter((s) => s.cheie === 'cuJs' || motive[setPagini] === undefined);
}

/**
 * The JavaScript states some pass really loads this set of pages in, and which
 * passes they come from. Never the whole of `CONDITII` - the same rule as
 * `latimiAuditate`, on the other axis: a scripts-off condition run over some
 * other build buys this one nothing.
 *
 * @param {string} setPagini
 * @param {Record<string, Trecere>} [treceri]
 * @param {Record<string, Conditie>} [conditii]
 * @returns {{ treceri: string[], cuJs: boolean, faraJs: boolean }}
 */
export function moduriAuditate(setPagini, treceri = TRECERI, conditii = CONDITII) {
  const cheile = Object.keys(treceri).filter((cheie) => treceri[cheie].pagini === setPagini);
  const stari = new Set();
  for (const cheie of cheile) {
    for (const nume of treceri[cheie].conditii) {
      const conditie = conditii[nume];
      if (conditie !== undefined) stari.add(conditie.js === true);
    }
  }
  return { treceri: cheile, cuJs: stari.has(true), faraJs: stari.has(false) };
}

/** `package.json`, resolved next to this file rather than to a working directory. */
export function citestePachet() {
  return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
}

/* -------------------------------------------------------------------------- *
 * THE BREAKPOINTS, DERIVED FROM THE BUILT CSS INSTEAD OF COPIED FROM IT.
 *
 * This file used to write `(max-width: 34rem)` and `(min-width: 62rem)` out by
 * hand. They were right, and they were a SECOND COPY of two numbers whose first
 * copy lives in the components' styles, with nothing tying the two spellings
 * together. Measured: change `RandZi.astro` to `48rem`, rebuild, and all four
 * passes stay green while the default pass at 756px is silently auditing the
 * phone branch and the 769-991px band is audited by nobody at all.
 *
 * Asserting the queries in the browser did not close it and could not:
 * `matchMedia('(max-width: 34rem)')` answers at any width whether or not a
 * single stylesheet still asks that question. The browser was being asked the
 * right question about the wrong number.
 *
 * So the set is read out of the CSS of the pages this audit actually loads.
 *
 * ===========================================================================
 * WHY THE AXES KEPT ARRIVING, AND THE RESTATEMENT THAT IS MEANT TO STOP THEM.
 *
 * This guard has been green while blind FIVE TIMES, found by three different
 * reviewers: hardcoded breakpoints; widths declared in `CONDITII` that no pass
 * ran; the JavaScript axis, which nothing indexed; `medii: {}`, which made the
 * comparison a loop over nothing; and assertion (a) being one-directional. Each
 * fix closed the arrangement it was shown. A SIXTH was then found here while
 * closing the fifth - coverage indexed on the page SET rather than on the band,
 * so one width could lose its scripts-off pass with nothing going red.
 *
 * Six instances, one shape: THE GUARD COMPARED A DECLARATION AGAINST A SUBJECT
 * ALONG SOME AXES AND NOT OTHERS, AND WAS SILENT ABOUT WHAT IT DID NOT INDEX.
 * Whichever axis was left unindexed was the next one somebody walked through.
 *
 * So the check is stated as one sentence with no axis left implicit:
 *
 *   EVERYTHING THE BUILT CSS DEMANDS IS MATCHED AGAINST EVERYTHING THE SUITE
 *   RUNS, IN BOTH DIRECTIONS - and anything this file cannot index is NAMED in
 *   words or is a failure.
 *
 * "What the CSS demands" is every `@media` condition of the pages being audited,
 * decomposed into width comparisons (which this file indexes, into breakpoints
 * and bands) and everything else (which it cannot, and therefore must not
 * silently drop). "What the suite runs" is the (width, JavaScript state) pairs of
 * the `TRECERI` entries whose `pagini` is this set. Five assertions, and the
 * letters say which direction each one goes:
 *
 *   (a)  declaration -> CSS. Every query a condition DECLARES is still a
 *        breakpoint the CSS has, so a breakpoint that MOVED is named immediately,
 *        at its old value.
 *   (a') CSS -> declaration. Every breakpoint the CSS HAS is named by the `medii`
 *        of some condition this set is loaded under. Without this, dropping a
 *        breakpoint from every `medii` and then moving it is green on everything:
 *        measured, all four passes and the unit guard, with a 62rem breakpoint
 *        sitting at 60rem and printed in the output. There is deliberately NO
 *        exemption table beside it - a breakpoint the CSS has is a branch of the
 *        layout, and the repair is always to say what should match there, never
 *        to excuse it.
 *   (b)  CSS -> execution, per band AND per JavaScript state. Every band the
 *        breakpoints cut the width axis into is loaded at some width IN EVERY
 *        STATE this set must be audited in - the pair, not the two axes
 *        separately. A breakpoint that is ADDED, which (a) cannot see, fails as
 *        soon as it opens a band nothing looks at; a state dropped from one band
 *        fails even though other bands still have it.
 *   (c)  CSS -> named. Every media feature that is NOT a width comparison is
 *        named in `TRASATURI_NEAUDITATE` with the reason in words. This is the
 *        assertion that closes the CLASS rather than an instance:
 *        `prefers-reduced-motion` has been in the built CSS the whole time,
 *        indexed by nothing, declared by nothing and silent - a seventh
 *        arrangement already standing when the sixth was found. A
 *        `prefers-color-scheme: light` branch, a `print` block or an `@container`
 *        query would each have been the eighth.
 *   (c') named -> CSS, like every other list in this file: a feature named there
 *        that the CSS no longer has is a stale excuse and fails.
 *
 * "AUDITED" MEANS A PASS RUNS THERE, over these pages. Every assertion takes its
 * widths, its states and its declared queries from the `TRECERI` entries whose
 * `pagini` is the set being audited, never from `CONDITII` as a whole - see the
 * table above for the two green arrangements that taught us the difference.
 *
 * WHAT IS STILL NOT CLOSED, said plainly rather than left to be found seventh:
 * width WITHIN a band; `@supports`, which branches on the browser rather than on
 * the viewport, and this audit is one browser by construction; and any state a
 * script can put the page into other than "ran" and "did not run" - the picker's
 * other weeks are audited by the scripts-off passes, and nothing else on the site
 * has one. None of those three is a media query, so none of them is something the
 * CSS declares and this file ignores, which is the property (c) is for.
 * ===========================================================================
 *
 * SCOPE, SAID PLAINLY, BECAUSE IT CUTS AGAINST A RULE THIS PROJECT HOLDS. The
 * expectation here is derived FROM the artifact a defect would edit - our own
 * built CSS - which is exactly what `CSP_ASTEPTAT` above must never do. The
 * difference is what each list is for. `CSP_ASTEPTAT` is a boundary against a
 * third party: if a Sveltia upgrade could add its own entries it could excuse
 * any origin it liked, so that set is written by hand. The CSS is not a suspect
 * to be held to a fixed list - it is the SUBJECT, and the property being checked
 * is precisely that the audit follows it wherever it goes. The hand-written list
 * is the thing that decayed. What this cannot catch is a breakpoint that never
 * reaches the built CSS at all; the build and `stylesheet.itest.ts` stand
 * between a component's styles and `dist/`.
 *
 * `rem` and `em` IN A MEDIA QUERY resolve against the initial font size, never
 * against the root element's - a `:root { font-size: … }` does not move a
 * breakpoint, and an earlier comment here claiming it could was wrong. 16px,
 * therefore, by specification and not by measurement.
 * -------------------------------------------------------------------------- */

const PX_PE_UNITATE = { px: 1, rem: 16, em: 16 };
const OGLINDA = { '<': '>', '<=': '>=', '>': '<', '>=': '<=' };

/*
 * MEDIA FEATURES THIS AUDIT DOES NOT VARY, each with the reason in words.
 *
 * Assertion (c) above. Width is the only axis this file indexes; every other
 * feature a built stylesheet asks about is a branch of the page that no pass here
 * renders, and until this table existed it was dropped in silence. `comparatii`
 * consumed the width comparisons and the leftover was only inspected for the word
 * "width" - so `@media (prefers-reduced-motion: reduce)` went through every
 * version of this guard, including the two written specifically to close blind
 * arrangements, without a line of output.
 *
 * AN ENTRY HERE IS A STATED GAP, NOT A COVERED ONE, and that is the whole value
 * of it: a reader of a green run can see which branches of the CSS were rendered
 * and which were only reasoned about. It is not a place to put a feature that is
 * merely inconvenient to audit - if a branch can change what a visitor reads, the
 * repair is a condition that renders it.
 *
 * Both directions fail, as with `FARA_JS_MOTIVAT` and the command strings: a
 * feature the CSS no longer has, named here, is a stale excuse.
 *
 * @type {Record<string, string>}
 */
export const TRASATURI_NEAUDITATE = {
  'prefers-reduced-motion': [
    'nicio trecere nu schimbă preferința: Chrome pornește pe `no-preference`, deci ramura',
    '`reduce` nu este randată de nimeni. Ce face ea este să stingă animațiile și tranzițiile',
    '(`animation: none`, `transition: none` în src/styles/global.css) — scoate mișcare, nu',
    'adaugă nimic: nu poate strica un contrast, un nume accesibil sau un inel de focalizare pe',
    'care ramura implicită să nu le aibă deja, iar axe măsoară oricum starea rezolvată a unui',
    'DOM static, nu mișcarea. Ce ar putea ascunde este un control a cărui singură indicație',
    'vizuală este o animație; situl nu are niciunul. Deci este o lipsă spusă, nu una acoperită.',
  ].join('\n      '),
};

/*
 * At-rules other than `@media` that can make the built page render differently
 * depending on the environment. `@container` is the one that exists; it is a
 * SECOND width axis, keyed to an element rather than to the viewport, and nothing
 * in this file would index it. It is not used today, and the moment it is, (c)
 * fails until somebody decides what audits it.
 *
 * `@supports` is deliberately not here: it branches on the BROWSER, not on the
 * viewport, and this audit is one browser by construction - that gap is in the
 * HONEST SCOPE block at the top of the file, where it belongs.
 */
const REGULI_DE_MEDIU = ['container'];

/** The logical words that join media features, which are not features. */
const CUVINTE_LOGICE = new Set(['and', 'not', 'only', 'or']);

/**
 * Every media feature in one `@media` condition that is NOT a width comparison,
 * lower-cased. A media TYPE (`print`, `screen`) counts as one, and so does any
 * leftover this file failed to parse: a guard that derives its subject can only
 * check what it recognised, so what it did not recognise has to be loud.
 */
export function trasaturileConditiei(conditie) {
  const { rest } = comparatii(conditie);
  const nume = new Set();
  const ramas = rest.replace(/\(\s*([a-zA-Z][\w-]*)\s*(?::[^()]*)?\)/g, (_, f) => {
    nume.add(f.toLowerCase());
    return ' ';
  });
  for (const bucata of ramas.split(/[\s,]+/)) {
    const cuvant = bucata.trim().toLowerCase();
    if (cuvant === '' || CUVINTE_LOGICE.has(cuvant)) continue;
    nume.add(cuvant);
  }
  return [...nume].sort();
}

/*
 * A width comparison as the largest integer viewport width on its LOWER side.
 * `(max-width: 544px)` matches at 544 and not at 545, so its limit is 544;
 * `(min-width: 992px)` matches at 992 and not at 991, so its limit is 991. Two
 * queries with the same limit cut the axis in the same place, which is what
 * makes `(width<=34rem)` - the form the minifier emits - and
 * `(max-width: 34rem)` comparable at all.
 */
function limitaJoasa(semn, px) {
  return semn === '<=' || semn === '>' ? Math.floor(px) : Math.ceil(px) - 1;
}

/** Every width comparison in one `@media` condition, and what was left over. */
export function comparatii(conditie) {
  const gasite = [];
  let rest = conditie;
  const strange = (tipar, citeste) => {
    rest = rest.replace(tipar, (...m) => {
      const c = citeste(m);
      const px = parseFloat(c.numar) * (PX_PE_UNITATE[(c.unitate ?? 'px').toLowerCase()] ?? Number.NaN);
      gasite.push({ text: m[0].trim(), px, limita: limitaJoasa(c.semn, px) });
      return ' ';
    });
  };
  strange(/\(\s*(min|max)-width\s*:\s*([\d.]+)(px|rem|em)?\s*\)/gi, (m) => ({
    semn: m[1].toLowerCase() === 'max' ? '<=' : '>=',
    numar: m[2],
    unitate: m[3],
  }));
  strange(/\(\s*width\s*(<=|>=|<|>)\s*([\d.]+)(px|rem|em)?\s*\)/gi, (m) => ({
    semn: m[1],
    numar: m[2],
    unitate: m[3],
  }));
  strange(/\(\s*([\d.]+)(px|rem|em)?\s*(<=|>=|<|>)\s*width\s*\)/gi, (m) => ({
    semn: OGLINDA[m[3]],
    numar: m[1],
    unitate: m[2],
  }));
  return { gasite, rest };
}

/** The CSS one built page ships: every inline `<style>` and every stylesheet it links. */
function cssPaginii(dist, pagina) {
  const html = readFileSync(join(dist, pagina), 'utf8');
  const bucati = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => ({ css: m[1], mediu: '' }));
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    if (!/rel\s*=\s*["']?stylesheet/i.test(m[0])) continue;
    const href = m[0].match(/\bhref\s*=\s*["']([^"']*)["']/i)?.[1] ?? '';
    // A stylesheet this function cannot read is a stylesheet whose breakpoints
    // are not in the derived set, which would make the coverage check below
    // pass by having looked at less. Say so instead.
    if (href === '' || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) {
      throw new Error(`${pagina}: foaia de stil "${href}" nu e un fișier din build — pragurile ei nu pot fi citite.`);
    }
    const cale = href.startsWith('/') ? href.slice(1) : join(dirname(pagina), href);
    if (!existsSync(join(dist, cale))) throw new Error(`${pagina}: leagă ${href}, care nu există în build.`);
    /*
     * THE `media` ATTRIBUTE IS A MEDIA CONDITION LIKE ANY OTHER, and reading the
     * file while ignoring it would fold a `media="print"` stylesheet into the set
     * as if it always applied - a whole branch of the page counted as
     * unconditional, and the `print` axis invisible. It is carried alongside the
     * text and joined onto every `@media` condition inside it.
     */
    bucati.push({
      css: readFileSync(join(dist, cale), 'utf8'),
      mediu: (m[0].match(/\bmedia\s*=\s*["']([^"']*)["']/i)?.[1] ?? '').trim(),
    });
  }
  return bucati;
}

/**
 * WHAT THE BUILT CSS OF THESE PAGES DEMANDS: every width breakpoint, sorted and
 * deduplicated by where it cuts the width axis, AND every media feature that is
 * not a width comparison. Each carries the pages it was found in.
 *
 * The second half is assertion (c)'s subject. It used to be thrown away: the
 * leftover of `comparatii` was tested for the word "width" and otherwise dropped,
 * so every `@media` question this file cannot ask was invisible to it.
 */
export function pragurile(dist, pagini) {
  const dupaLimita = new Map();
  const trasaturi = new Map();
  const probleme = [];
  const noteaza = (nume, pagina, conditie) => {
    const intrare = trasaturi.get(nume) ?? { nume, surse: new Set(), conditii: new Set() };
    intrare.surse.add(pagina);
    intrare.conditii.add(conditie);
    trasaturi.set(nume, intrare);
  };
  for (const pagina of pagini) {
    let bucati;
    try {
      bucati = cssPaginii(dist, pagina);
    } catch (e) {
      probleme.push(e.message);
      continue;
    }
    const css = bucati.map((b) => b.css).join('\n');
    /*
     * A STYLESHEET THIS FILE DOES NOT FOLLOW IS A SUBJECT SILENTLY NARROWED.
     * `cssPaginii` follows `<link rel=stylesheet>` and throws on one it cannot
     * read; an `@import` inside a stylesheet it DID read was followed by nobody
     * and reported by nobody, so every breakpoint behind one would be missing
     * from the derived set while the coverage check below said it had looked.
     */
    for (const m of css.matchAll(/@import\b([^;]*);/g)) {
      probleme.push(
        `${pagina}: CSS-ul construit conține @import${m[1].trim() === '' ? '' : ` ${m[1].trim()}`}, ` +
          'pe care acest fișier nu îl urmărește — pragurile din foaia importată nu sunt în setul derivat. ' +
          'Fie o legi cu <link>, fie o urmărești aici.',
      );
    }
    // The `media` attribute of a linked stylesheet conditions everything in it.
    for (const b of bucati) {
      if (b.mediu === '' || b.mediu.toLowerCase() === 'all') continue;
      for (const nume of trasaturileConditiei(b.mediu)) noteaza(nume, pagina, `<link media="${b.mediu}">`);
      for (const g of comparatii(b.mediu).gasite) {
        if (!Number.isFinite(g.px)) {
          probleme.push(`${pagina}: <link media="${b.mediu}"> — unitate necunoscută în "${g.text}".`);
          continue;
        }
        const intrare = dupaLimita.get(g.limita) ?? { limita: g.limita, px: g.px, texte: new Set(), surse: new Set() };
        intrare.texte.add(g.text);
        intrare.surse.add(pagina);
        dupaLimita.set(g.limita, intrare);
      }
    }
    for (const nume of REGULI_DE_MEDIU) {
      for (const m of css.matchAll(new RegExp(`@${nume}([^{]*)\\{`, 'g'))) {
        noteaza(`@${nume}`, pagina, `@${nume} ${m[1].trim()}`);
      }
    }
    for (const m of css.matchAll(/@media([^{]*)\{/g)) {
      const conditie = m[1].trim();
      const { gasite, rest } = comparatii(conditie);
      // Anything width-shaped that this parser did not consume. A guard that
      // derives its subject can only check what it recognised, so the part it
      // failed to recognise has to be loud rather than absent.
      if (/width/i.test(rest)) {
        probleme.push(
          `${pagina}: @media ${conditie} — o condiție de lățime pe care acest fișier nu o înțelege ` +
            `(a rămas necitit: "${rest.trim()}"). Adaug-o în comparatii() din scripts/a11y.mjs.`,
        );
      }
      // Everything that is not a width. Silent until this line existed.
      for (const nume of trasaturileConditiei(conditie)) noteaza(nume, pagina, `@media ${conditie}`);
      for (const g of gasite) {
        if (!Number.isFinite(g.px)) {
          probleme.push(`${pagina}: @media ${conditie} — unitate necunoscută în "${g.text}".`);
          continue;
        }
        const intrare = dupaLimita.get(g.limita) ?? { limita: g.limita, px: g.px, texte: new Set(), surse: new Set() };
        intrare.texte.add(g.text);
        intrare.surse.add(pagina);
        dupaLimita.set(g.limita, intrare);
      }
    }
  }
  return {
    praguri: [...dupaLimita.values()].sort((a, b) => a.limita - b.limita),
    trasaturi: [...trasaturi.values()].sort((a, b) => (a.nume < b.nume ? -1 : a.nume > b.nume ? 1 : 0)),
    probleme,
  };
}

/** How a breakpoint reads in output: the query as the CSS writes it, plus its px. */
function scriePrag(p) {
  return `${[...p.texte].join('/')} = ${p.px}px (${[...p.surse].join(', ')})`;
}

/**
 * EVERYTHING THE CSS DEMANDS AGAINST EVERYTHING THE SUITE RUNS, IN BOTH
 * DIRECTIONS - the five assertions (a), (a'), (b), (c) and (c') listed in the
 * block above this section, as lines to print and problems to report.
 * `latimeImplicita` is the measured default viewport.
 *
 * The widths and states are those of every pass over THIS SET OF PAGES, not the
 * subset the current run happens to execute: the claim is about what
 * `npm run test:all` covers over these pages between all of its passes, so an
 * uncovered band must fail every one of them rather than whichever happens to
 * hold the guilty width. What it is NOT is the whole of `CONDITII` - a width
 * declared there and run over some other build says nothing about this one.
 *
 * The tables are arguments with the real ones as defaults, so every assertion
 * below has a unit-level positive control in `a11y-treceri.test.ts` that runs in
 * milliseconds instead of four Chrome launches.
 *
 * @param {{ praguri: Prag[], trasaturi?: Trasatura[], probleme: string[] }} derivat
 * @param {number} latimeImplicita
 * @param {string} setPagini
 * @param {{ tabele?: Record<string, Trecere>, conditii?: Record<string, Conditie>,
 *           motive?: Record<string, string>, neauditate?: Record<string, string> }} [optiuni]
 * @returns {{ linii: string[], esecuri: string[] }}
 */
export function verificaPraguri(
  { praguri, trasaturi = [], probleme },
  latimeImplicita,
  setPagini,
  { tabele = TRECERI, conditii = CONDITII, motive = FARA_JS_MOTIVAT, neauditate = TRASATURI_NEAUDITATE } = {},
) {
  const esecuri = [...probleme];
  const { treceri, latimi } = latimiAuditate(setPagini, latimeImplicita, tabele, conditii);
  const numeleTrecerilor = treceri.map((cheie) => `${cheie} (${comandaTrecerii(tabele[cheie])})`).join(' · ');
  const peStare = latimiPeStare(setPagini, latimeImplicita, tabele, conditii);
  const cerute = stariCerute(setPagini, motive);
  // Printed rather than only asserted, on every axis, for the same reason the
  // widths are: the line below is what a later reader checks a claim against.
  const { cuJs, faraJs } = moduriAuditate(setPagini, tabele, conditii);
  const stari = [cuJs ? 'JS pornit' : null, faraJs ? 'JS oprit' : null].filter(Boolean);
  const linii = [
    `praguri din CSS-ul construit: ${praguri.length > 0 ? praguri.map(scriePrag).join(' · ') : '(niciunul)'}`,
    `trăsături de mediu care nu sunt lățimi: ${
      trasaturi.length > 0 ? trasaturi.map((t) => `${t.nume} (${[...t.surse].join(', ')})`).join(' · ') : '(niciuna)'
    }`,
    `set de pagini „${setPagini}” — treceri care îl auditează: ${numeleTrecerilor === '' ? '(niciuna)' : numeleTrecerilor}`,
    `lățimi auditate de aceste treceri: ${latimi.join(', ')}px (implicita măsurată: ${latimeImplicita}px)`,
    `stări JavaScript auditate: ${stari.length > 0 ? stari.join(' · ') : '(niciuna)'}` +
      `${faraJs ? '' : ` — scutit: ${motive[setPagini] === undefined ? 'NU' : 'da'}`}`,
    // The PAIR, which is what coverage is a property of. Two axes printed apart
    // is exactly what let one width lose its scripts-off pass unnoticed.
    ...STARI.map(
      (st) =>
        `  lățimi cu scripturile ${st.eticheta}: ${peStare[st.cheie].length > 0 ? `${peStare[st.cheie].join(', ')}px` : '(niciuna)'}` +
        `${cerute.some((c) => c.cheie === st.cheie) ? '' : ' — scutit, cu motiv scris'}`,
    ),
  ];

  /*
   * (c) CSS -> named, and (c') named -> CSS.
   *
   * Width is the only axis this file indexes. Every other question the built CSS
   * asks about the environment is a branch no pass renders, and it was dropped in
   * silence until this loop: `prefers-reduced-motion` sat in `global.css` through
   * every earlier version of this guard, including the two written to close blind
   * arrangements, without a line of output. This is the assertion that makes the
   * NEXT such feature a red build instead of the seventh finding.
   *
   * BEFORE THE EARLY RETURNS BELOW, deliberately: a build whose CSS had lost every
   * width breakpoint would otherwise leave this loop unrun, and an early return
   * that skips a check is the shape this project has paid for most.
   */
  const numite = new Set(Object.keys(neauditate));
  for (const t of trasaturi) {
    if (numite.has(t.nume)) continue;
    esecuri.push(
      `CSS-ul construit ramifică pe „${t.nume}”, pe care acest audit nu o variază și nimeni nu a numit-o.\n` +
        `    Găsită în: ${[...t.surse].join(', ')} — ${[...t.conditii].join(' · ')}.\n` +
        '    Lățimea este singura axă pe care fișierul acesta o indexează, deci ramura aceasta nu\n' +
        '    este randată de nicio trecere. Ori o auditezi (o condiție care o pune în starea ei),\n' +
        '    ori o scrii în TRASATURI_NEAUDITATE din scripts/a11y.mjs cu motivul în cuvinte.\n' +
        '    O lipsă spusă e mai bună decât o ramură pe care nimeni nu a văzut-o.',
    );
  }
  for (const nume of [...numite].sort()) {
    if (trasaturi.some((t) => t.nume === nume)) continue;
    esecuri.push(
      `TRASATURI_NEAUDITATE numește „${nume}”, pe care CSS-ul construit al setului „${setPagini}” ` +
        'nu-l mai conține.\n' +
        '    Scuza a rămas în urma foilor de stil: scoate-o. Una de care nu are nimeni nevoie rămâne\n' +
        '    în cod arătând ca o regulă, gata să acopere altceva cu același nume.',
    );
  }

  // A set of pages nothing audits cannot be said to cover any band. Without
  // this the loop below would report every band as uncovered and bury the
  // actual mistake, which is a `pagini` nobody spells the same way twice.
  if (treceri.length === 0) {
    esecuri.push(
      `nicio trecere din TRECERI nu are pagini: "${setPagini}". Auditul rulează peste un set de pagini ` +
        'pe care tabelul nu îl cunoaște, deci nicio lățime nu i se poate socoti.',
    );
    return { linii, esecuri };
  }

  // A guard that reads files must prove it read something.
  if (praguri.length === 0) {
    esecuri.push(
      'paginile auditate nu declară niciun prag de lățime. Ori CSS-ul construit le-a pierdut, ' +
        'ori comparatii() nu le mai recunoaște — în ambele cazuri acoperirea de mai jos nu ar dovedi nimic.',
    );
    return { linii, esecuri };
  }

  // The conditions this set of pages is actually loaded under, and the queries
  // they declare. Both (a) and (a') are about these two sets and nothing else.
  const numeConditii = new Set(treceri.flatMap((cheie) => tabele[cheie].conditii));
  const declarate = new Set(
    [...numeConditii].flatMap((nume) => Object.keys(conditii[nume]?.medii ?? {})),
  );

  // (a) declaration -> CSS. Every query a condition declares still names a
  // breakpoint the CSS has, so a breakpoint that MOVED is named at its old value.
  const limiteDeclarate = new Set();
  for (const interogare of [...declarate].sort()) {
    const { gasite } = comparatii(interogare);
    const limite = gasite.map((g) => g.limita);
    if (limite.length !== 1) {
      esecuri.push(`CONDITII declară "${interogare}", pe care comparatii() nu o citește ca un singur prag.`);
      continue;
    }
    limiteDeclarate.add(limite[0]);
    if (!praguri.some((p) => p.limita === limite[0])) {
      esecuri.push(
        `CONDITII declară "${interogare}", dar CSS-ul construit nu mai are un prag acolo.\n` +
          `    Praguri găsite: ${praguri.map(scriePrag).join(' · ')}.\n` +
          '    Un prag s-a mutat: mută-l și aici, și verifică ce lățime îl mai auditează.',
      );
    }
  }

  /*
   * (a') CSS -> declaration, AND THIS IS THE DIRECTION THAT WAS MISSING.
   *
   * (a) iterates the declarations, so a breakpoint dropped from every `medii`
   * leaves its loop with nothing to say about it. Measured before this existed:
   * remove `(min-width: 62rem)` from all six conditions - each `medii` still
   * non-empty, so the `medii: {}` check is satisfied - then move that breakpoint
   * in the component to 60rem and rebuild. All four browser passes and the unit
   * guard are exit 0, while the run PRINTS a breakpoint at 960px that nothing
   * declares and nothing compares against anything.
   *
   * There is no exemption table here on purpose. A breakpoint in the built CSS is
   * a branch of the layout; the repair is to say what should and should not match
   * at it, which is one line in each condition, and an excuse would be a way to
   * keep the branch and stop looking at it.
   */
  for (const prag of praguri) {
    if (limiteDeclarate.has(prag.limita)) continue;
    esecuri.push(
      `CSS-ul construit declară un prag pe care nicio condiție nu-l numește: ${scriePrag(prag)}.\n` +
        `    Condițiile sub care se încarcă setul „${setPagini}”: ${[...numeConditii].sort().join(', ')}.\n` +
        `    Interogări declarate de ele: ${[...declarate].sort().join(' · ') || '(niciuna)'}.\n` +
        '    Verificarea (a) iterează exact interogările declarate, deci un prag scos din toate\n' +
        '    `medii` iese din raza ei și supraviețuiește numai pe acoperirea benzilor — care vede\n' +
        '    doar mutările destul de mari cât să golească o bandă. Scrie interogarea în `medii`-le\n' +
        '    condițiilor de mai sus, cu ce trebuie și ce nu trebuie să se potrivească la fiecare.',
    );
  }

  /*
   * (b) CSS -> execution, ON THE PAIR (band, JavaScript state).
   *
   * These two used to be checked apart: bands against the union of the widths,
   * and JavaScript states against the set of pages. Measured while closing (a'):
   * delete `telefonFaraJs` from `CONDITII` and from `TRECERI.mobil` and
   * everything stays green - the unit guard, both `dist` passes - while the band
   * below 34rem loses its only scripts-off audit and the output still says the
   * set is audited in both states. True of the set, false of the band.
   */
  const limite = praguri.map((p) => p.limita);
  for (const stare of cerute) {
    const aleStarii = peStare[stare.cheie];
    for (let i = 0; i <= limite.length; i += 1) {
      const jos = i === 0 ? 0 : limite[i - 1] + 1;
      const sus = i === limite.length ? Number.POSITIVE_INFINITY : limite[i];
      if (aleStarii.some((l) => l >= jos && l <= sus)) continue;
      const vecine = praguri.filter((p) => p.limita === limite[i - 1] || p.limita === limite[i]).map(scriePrag);
      esecuri.push(
        `nicio trecere nu auditează lățimile ${jos}-${sus === Number.POSITIVE_INFINITY ? '∞' : sus}px ` +
          `din setul de pagini „${setPagini}” cu scripturile ${stare.eticheta}.\n` +
          `    Banda e delimitată de: ${vecine.join(' · ')}.\n` +
          `    Lățimile care chiar se rulează peste aceste pagini cu scripturile ${stare.eticheta}: ` +
          `${aleStarii.join(', ') || '(niciuna)'}px.\n` +
          `    (Pe cealaltă stare: ${peStare[stare.cheie === 'cuJs' ? 'faraJs' : 'cuJs'].join(', ') || '(niciuna)'}px — ` +
          'acoperirea este o proprietate a PERECHII, nu a celor două axe luate separat.)\n' +
          '    Se închide în TREI pași, toți trei verificați — niciunul singur nu ajunge:\n' +
          `      1. o condiție în CONDITII cu o lățime din bandă și js: ${stare.cheie === 'cuJs' ? 'true' : 'false'};\n` +
          `      2. numele ei în conditii-le unei treceri din TRECERI cu pagini: "${setPagini}";\n` +
          '      3. comanda trecerii aceleia într-un script pornit de "npm run test:all".\n' +
          '    Sau, dacă banda chiar nu trebuie auditată, scrie aici care e și de ce — o lipsă spusă ' +
          'e mai bună decât o trecere degeaba.',
      );
    }
  }

  return { linii, esecuri };
}

function deschide() {
  return new Builder()
    .forBrowser('chrome')
    .setChromeOptions(new chrome.Options().addArguments('headless=new', 'no-sandbox', 'disable-gpu'))
    .setChromeService(new chrome.ServiceBuilder(chromedriver.path))
    .build();
}

/** Puts the driver into one condition. Takes effect on the NEXT navigation. */
async function pregateste(driver, conditie) {
  if (conditie.latime === null) {
    await driver.sendDevToolsCommand('Emulation.clearDeviceMetricsOverride', {});
  } else {
    await driver.sendDevToolsCommand('Emulation.setDeviceMetricsOverride', {
      width: conditie.latime,
      height: conditie.inaltime,
      deviceScaleFactor: 0,
      // `mobile: false`, so the layout viewport IS the width asked for. With
      // `true` the page is laid out at 980px unless it carries a viewport meta
      // tag, which would make the audited width a property of the page rather
      // than of this file. Measured both ways.
      mobile: false,
    });
  }
  await driver.sendDevToolsCommand('Emulation.setScriptExecutionDisabled', { value: !conditie.js });
}

/*
 * axe itself needs to run, even when the PAGE's scripts must not.
 *
 * Measured: with `setScriptExecutionDisabled` still true, `axe.run` never
 * settles and the call times out - the flag stops the timers and promise jobs
 * axe depends on. Re-enabling AFTER the page has loaded does not resurrect the
 * page's own scripts: a module script skipped during parsing is not queued, so
 * the DOM stays exactly as a visitor without JavaScript sees it. Verified with
 * a page whose script rewrites its own title and body - unchanged under this
 * sequence, changed in the control with scripts enabled.
 */
async function ruleazaAxe(driver) {
  await driver.sendDevToolsCommand('Emulation.setScriptExecutionDisabled', { value: false });
  await driver.executeScript(AXE);
  return driver.executeAsyncScript(
    'const gata = arguments[arguments.length - 1];' +
      'axe.run(document).then((r) => gata({ ok: true, r })).catch((e) => gata({ ok: false, e: String(e) }));',
  );
}

const SURSA_CSP = `window.__csp = [];
document.addEventListener('securitypolicyviolation', (e) => {
  window.__csp.push(e.effectiveDirective + ' <- ' + (e.blockedURI || '(inline)'));
});`;

/*
 * Waits for the page to stop provoking CSP violations, and returns them.
 *
 * READING THEM STRAIGHT AFTER `driver.get` MEASURES NOTHING, and looks exactly
 * like a pass. Chrome's load event fires long before Sveltia has booted, so the
 * first version of this check reported `0 violations` for `/admin/` and printed
 * all four expected ones as "no longer appearing" - a clean bill of health for a
 * page whose CMS had not yet run a line. It was caught only because the missing
 * ones were printed; a check that had merely said "0 unexpected" would have been
 * green and empty.
 *
 * So: poll until the list has been unchanged for `LINISTE` and every expected
 * violation has arrived, up to `PLAFON`. Quiet pages leave after one quiet
 * second; `/admin/` takes as long as the bundle takes.
 */
const LINISTE = 1000;
const PLAFON = 20000;

async function asteaptaCsp(driver, asteptat) {
  const pornire = Date.now();
  let ultimele = [];
  let schimbat = Date.now();
  for (;;) {
    const acum = (await driver.executeScript('return window.__csp')) ?? null;
    if (acum === null) return null;
    if (acum.length !== ultimele.length) {
      ultimele = acum;
      schimbat = Date.now();
    }
    const toateVenite = asteptat.every((a) => acum.includes(a));
    if (toateVenite && Date.now() - schimbat >= LINISTE) return acum;
    if (Date.now() - pornire >= PLAFON) return acum;
    await driver.sleep(200);
  }
}

/**
 * Runs the audit and returns true when everything passed.
 *
 * `trecere` is a key of `TRECERI`, not a list of conditions: the conditions this
 * runs and the conditions its band coverage is credited for are then the same
 * list by construction, which is the whole of finding A.
 *
 * `cerinta` is an optional check run ONCE PER CONDITION, after that condition's
 * page loop, for things only one build can show - the week picker's bar, which
 * needs two rendered weeks. It navigates itself, so it is not tied to whichever
 * page the loop happened to leave loaded, and its line appears once per
 * condition in the output.
 */
export async function auditeaza({ dist, trecere, cerinta = null, spune = console.log }) {
  const definitia = TRECERI[trecere];
  if (definitia === undefined) {
    spune(`Trecere necunoscută: "${trecere}". Cunoscute: ${Object.keys(TRECERI).join(', ')}.`);
    return false;
  }

  /*
   * BEFORE THE BROWSER, because a table that does not match `package.json` makes
   * every width below meaningless and there is no reason to spend a Chrome
   * launch finding that out.
   */
  const problemeTabel = verificaTreceri();
  if (problemeTabel.length > 0) {
    spune(`\n=== ${definitia.eticheta} ===`);
    for (const problema of problemeTabel) spune(`  ${problema}`);
    spune('\nAUDIT PICAT.');
    return false;
  }

  const conditii = definitia.conditii.map((nume) => CONDITII[nume]);
  const eticheta = definitia.eticheta;

  if (!existsSync(dist)) {
    spune(`${dist}/ nu există — rulează mai întâi build-ul.`);
    return false;
  }
  const toate = paginile(dist);
  if (toate.length === 0) {
    spune(`${dist}/ nu conține nicio pagină .html.`);
    return false;
  }

  // An exception for a page that no longer exists excuses nothing: it stays in
  // the code looking like a rule, ready to excuse something else of that name.
  const lipsa = FARA_AXE.filter((e) => !toate.includes(e));
  if (lipsa.length > 0) {
    spune(`Excepții axe pentru pagini care nu există: ${lipsa.join(', ')}. Șterge-le.`);
    return false;
  }
  const deAuditat = toate.filter((p) => !FARA_AXE.includes(p));
  if (deAuditat.length === 0) {
    spune('Excepțiile au cuprins toate paginile — auditul nu ar verifica nimic.');
    return false;
  }

  const fisierHeaders = join(dist, '_headers');
  if (!existsSync(fisierHeaders)) {
    spune(`${fisierHeaders} lipsește — politica de securitate nu ar fi verificată deloc.`);
    return false;
  }
  const reguli = parseazaHeaders(readFileSync(fisierHeaders, 'utf8'));

  const server = serveste(dist, reguli);
  await new Promise((gata) => server.listen(0, gata));
  const port = server.address().port;
  const url = (pagina) => `http://localhost:${port}/${pagina.replace(/index\.html$/, '')}`;

  spune(`\n=== ${eticheta} ===`);
  spune(`${dist}/ · ${toate.length} pagină(i) · ${conditii.length} condiție(i)`);
  spune(`axe sare peste: ${FARA_AXE.join(', ')} (CSP le verifică pe toate)`);

  let esec = false;
  const nereusit = (mesaj) => {
    esec = true;
    spune(mesaj);
  };

  const driver = await deschide();
  try {
    await driver.sendDevToolsCommand('Page.enable', {});
    await driver.sendDevToolsCommand('Page.addScriptToEvaluateOnNewDocument', { source: SURSA_CSP });

    /*
     * The default viewport is MEASURED, once, before anything else - on the
     * harness's own control page, so no built page's markup can affect it. The
     * coverage of this SET OF PAGES is checked against the CSS's own breakpoints
     * here rather than inside the loop, because the claim is about every pass
     * over these pages and must fail all of them, not only the one running.
     */
    await driver.sendDevToolsCommand('Emulation.clearDeviceMetricsOverride', {});
    await driver.get(`http://localhost:${port}${CALE_CONTROL}`);
    const latimeImplicita = await driver.executeScript('return window.innerWidth');
    const { linii, esecuri } = verificaPraguri(pragurile(dist, deAuditat), latimeImplicita, definitia.pagini);
    for (const linie of linii) spune(`  ${linie}`);
    for (const problema of esecuri) nereusit(`  ${problema}`);

    for (const conditie of conditii) {
      spune(`\n--- ${conditie.eticheta} ---`);
      await pregateste(driver, conditie);

      // The control first, so a broken switch is reported before any result
      // that depends on it.
      await driver.get(`http://localhost:${port}${CALE_CONTROL}`);
      const aRulat = (await driver.getTitle()) === 'dupa';
      if (aRulat !== conditie.js) {
        nereusit(
          `Controlul spune că scripturile paginii ${aRulat ? 'AU' : 'NU au'} rulat, ` +
            `dar condiția cere ${conditie.js ? 'să ruleze' : 'să nu ruleze'}.`,
        );
      } else {
        spune(`  control: scripturile paginii ${aRulat ? 'rulează' : 'nu rulează'}, cum se cere`);
      }

      const masurate = await driver.executeScript(
        'return { latime: window.innerWidth, medii: ' +
          JSON.stringify(Object.keys(conditie.medii)) +
          '.map((q) => [q, window.matchMedia(q).matches]) };',
      );
      for (const [interogare, potriveste] of masurate.medii) {
        if (potriveste !== conditie.medii[interogare]) {
          nereusit(
            `  la ${masurate.latime}px, ${interogare} ${potriveste ? 'se potrivește' : 'nu se potrivește'}, ` +
              `dar condiția cere contrariul. Un prag s-a mutat, sau lățimea nu e cea cerută.`,
          );
        }
      }
      spune(
        `  ${masurate.latime}px · ` +
          masurate.medii.map(([q, m]) => `${q} ${m ? 'DA' : 'nu'}`).join(' · '),
      );

      await pregateste(driver, conditie);

      for (const pagina of toate) {
        await driver.get(url(pagina));
        const latime = await driver.executeScript('return window.innerWidth');
        if (conditie.latime !== null && latime !== conditie.latime) {
          nereusit(`  ${pagina}: lățimea măsurată este ${latime}px, nu ${conditie.latime}px.`);
        }

        /*
         * With the page's scripts disabled, NOTHING may be refused - the CMS
         * bundle never runs, and neither does anything else that could fetch.
         * So the expected set belongs to the scripts-on condition only, and
         * this doubles as a second control on the switch: an expected
         * violation appearing here would mean the page's scripts ran after all.
         */
        const asteptat = conditie.js ? (CSP_ASTEPTAT[pagina] ?? []) : [];
        const violari = await asteaptaCsp(driver, asteptat);
        if (violari === null) {
          nereusit(`  ${pagina}: ascultătorul de CSP nu s-a instalat — nu s-a verificat nimic.`);
        } else {
          const neasteptate = violari.filter((v) => !asteptat.includes(v));
          const lipsuri = asteptat.filter((a) => !violari.includes(a));
          spune(`  ${pagina} @ ${latime}px · CSP: ${violari.length} violare(ări), ${neasteptate.length} neașteptată(e)`);
          if (neasteptate.length > 0) {
            nereusit(
              `  ${pagina}: politica din _headers respinge ceva ce nimeni nu a prevăzut:\n` +
                neasteptate.map((v) => `    ${v}`).join('\n') +
                '\n    Dacă e legitim, adaugă-l în CSP_ASTEPTAT sau în politică — cu un motiv.',
            );
          }
          /*
           * A MISSING EXPECTED VIOLATION FAILS, and that is deliberate even
           * though one of the two explanations is good news.
           *
           * Either the CMS stopped reaching for that origin - worth a human
           * deciding, and one line to record - or the page never reached the
           * state where it tries, in which case this check proved nothing at
           * all while printing a clean result. The second is how the first
           * version of this file passed `/admin/` without the bundle having
           * run. A red build that costs a line beats a green one that means
           * nothing.
           */
          if (lipsuri.length > 0) {
            nereusit(
              `  ${pagina}: aceste violări așteptate nu au apărut în ${PLAFON} ms:\n` +
                lipsuri.map((v) => `    ${v}`).join('\n') +
                '\n    Ori CMS-ul nu mai cere acele origini — scoate-le din CSP_ASTEPTAT —, ' +
                'ori pagina nu a apucat să pornească, și atunci verificarea nu a dovedit nimic.',
            );
          }
        }

        if (FARA_AXE.includes(pagina)) continue;

        const raspuns = await ruleazaAxe(driver);
        if (!raspuns?.ok) {
          nereusit(`  ${pagina}: axe nu a rulat — ${raspuns?.e ?? 'niciun rezultat'}`);
          await pregateste(driver, conditie);
          continue;
        }
        const audit = raspuns.r;
        const rulate = [...(audit.passes ?? []), ...(audit.violations ?? []), ...(audit.incomplete ?? [])];
        // If color-contrast never ran, "0 violations" says nothing at all.
        if (!rulate.some((r) => r.id === 'color-contrast')) {
          nereusit(`  ${pagina}: regula color-contrast nu a rulat — un rezultat curat nu ar dovedi nimic.`);
        }
        spune(
          `    axe: ${audit.violations.length} violare(ări), ${audit.incomplete.length} nedecis(e), ` +
            `${audit.passes.length} regulă(i) trecute`,
        );
        /*
         * The rule IDS, not just how many - off by default because they are
         * three long lines per page per condition, and on demand because they
         * are what a differential against another engine is diffed on. The
         * counts above are a summary of this; `docs/a11y-differential.md` says
         * what to do with it.
         */
        if (process.env.A11Y_REGULI) {
          for (const [fel, lista] of [
            ['passes', audit.passes],
            ['violations', audit.violations],
            ['incomplete', audit.incomplete],
          ]) {
            const ids = (lista ?? []).map((r) => r.id).sort();
            spune(`    REGULI ${pagina} ${conditie.eticheta} ${fel} (${ids.length}): ${ids.join(' ')}`);
          }
        }
        for (const v of audit.violations) {
          nereusit(`  ${pagina} [${v.impact ?? 'n/a'}] ${v.id}: ${v.help}`);
          for (const nod of v.nodes ?? []) spune(`      ${(nod.target ?? []).join(' ')}`);
        }
        for (const nedecis of audit.incomplete ?? []) {
          if (nedecis.id !== 'color-contrast') continue;
          nereusit(`  ${pagina}: contrast nedeterminat (de obicei text peste un gradient sau o imagine):`);
          for (const nod of nedecis.nodes ?? []) {
            spune(`      ${(nod.target ?? []).join(' ')}`);
            const motiv = (nod.any ?? []).map((a) => a.message).filter(Boolean).join('; ');
            if (motiv) spune(`        ${motiv}`);
          }
        }

        // `ruleazaAxe` re-enabled script execution to run axe; put the
        // condition back before the next page loads.
        await pregateste(driver, conditie);
      }

      if (cerinta) {
        const rezultat = await cerinta(driver, conditie, url);
        if (rezultat !== null) nereusit(`  ${rezultat}`);
        await pregateste(driver, conditie);
      }
    }
  } finally {
    await driver.quit();
    server.close();
  }

  spune(esec ? '\nAUDIT PICAT.' : '\nAudit trecut.');
  return !esec;
}

/* -------------------------------------------------------------------------- *
 * Command line: `node scripts/a11y.mjs [--mobil|--larg]`.
 * -------------------------------------------------------------------------- */
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  /*
   * The arguments are not parsed here - they are LOOKED UP in `TRECERI`, which
   * is the same table the coverage check reads. A flag this file understood but
   * the table did not would be a pass whose widths nothing counts; a flag the
   * table declares but `package.json` never passes is caught by
   * `verificaTreceri`. There is no third place where the two could disagree.
   */
  const argumente = process.argv.slice(2);
  const cheie = Object.keys(TRECERI).find(
    (k) =>
      TRECERI[k].fisier === ACEST_FISIER &&
      TRECERI[k].argumente.length === argumente.length &&
      TRECERI[k].argumente.every((a, i) => a === argumente[i]),
  );
  if (cheie === undefined) {
    console.log(`Argumente pe care TRECERI nu le descrie: ${argumente.join(' ') || '(niciunul)'}.`);
    console.log('Treceri pornite din acest fișier:');
    for (const [k, t] of Object.entries(TRECERI)) {
      if (t.fisier === ACEST_FISIER) console.log(`  ${comandaTrecerii(t)}   (${k})`);
    }
    process.exit(1);
  }
  process.exit((await auditeaza({ dist: 'dist', trecere: cheie })) ? 0 : 1);
}
