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
 * halves are here: the override in `prepare`, and `innerWidth` on every line
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
 * driver changes again are in `docs/a11y-differential.md`. Set `A11Y_RULES=1`
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
 *   - text drawn inside an inline `<svg>`, which axe can never resolve a
 *     background for: `elementHasImage` treats every SVG node as a graphic, so
 *     the `color-contrast` rule returns `incomplete` for each `<text>`/`<tspan>`
 *     whatever the markup says. `svgTextIncompletes` recognises exactly those
 *     nodes, and the pass PRINTS them every run as this declared gap instead of
 *     failing. Every other incomplete still fails, and a node the classifier
 *     cannot clearly place inside an SVG stays in scope - see the block above
 *     `runAudit`.
 *   - :hover, :focus and :active states
 *   - anything display:none, visibility:hidden, opacity:0 or [hidden]. This is
 *     why the JavaScript-off condition exists at all: with scripts running, the
 *     week picker hides every week but one and axe skips them.
 *   - viewports other than the ones some pass in `PASSES` really loads THESE
 *     pages at. This is the one disclaimer here that is also a check:
 *     `checkBreakpoints` derives the breakpoints from the built CSS and fails
 *     when they cut out a band of widths nothing runs in, so "unaudited branch"
 *     is a red build rather than a caveat. It counts a width only where a pass
 *     over this same set of pages uses it - a width declared in `CONDITIONS` and
 *     run over some other build buys this one nothing. What stays uncovered is
 *     width WITHIN a band, and any axis that is not width.
 *   - colour-scheme branches other than dark
 *   - ::before / ::after content, and SVG <text> (reported and exempted, not
 *     silent - the bullet above the list says how)
 *   - pages that were not built when the audit ran
 *   - non-hex colour literals, which neither this nor the hex guard catches
 *   - whether Cloudflare actually applies `_headers`. This serves the file's
 *     rules itself; only `curl -sI` against the deployed host can say what the
 *     host does with them.
 * ---------------------------------------------------------------------------
 *
 * Run with `npm run a11y`, `npm run a11y:mobile`, `npm run a11y:picker`, or as
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
import { headersForPath, parseHeaders } from './headers.mjs';

const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

const MIME_TYPES = {
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
 * KEYED BY PATH WITH THE REASON BESIDE IT, like `NO_JS_REASONS` and
 * `UNAUDITED_FEATURES`, and for the same reason those two are. This list is the
 * one lever that SHRINKS the audit's subject: a page named here is audited by no
 * axe run, and its CSS leaves the derived breakpoint set with it. As a bare array
 * it was the last narrowing list in this file whose entries did not have to say
 * anything, and an entry nobody has to justify is the cheapest way out of a red
 * build. `checkPasses` fails on an entry with no reason written, so adding a
 * page here is a decision somebody signed rather than a line somebody appended.
 *
 * @type {Record<string, string>}
 */
export const NO_AXE_REASONS = {
  'admin/index.html': [
    'the Sveltia CMS host: one `<script>` and one `<noscript>`, nothing else. Everything an',
    'editor sees is drawn by the bundle after it loads, so what axe would measure is the empty',
    'shell — hence `landmark-one-main` and `page-has-heading-one` on `<html>` itself, and',
    '`color-contrast` never running at all. Giving it a `<main>` and an `<h1>` for the rules to',
    'bite on would be worse: the markup is replaced a second later by markup we did not write',
    'and cannot change, so the green would be about a stand-in and would read as a guarantee',
    'about the CMS. Its accessibility is Sveltia\'s. It is NOT exempt from the CSP check — it is',
    'the page a GitHub credential sits on, so the page whose policy matters most.',
  ].join('\n      '),
};

/** The paths above, which is all most of this file needs. */
const NO_AXE = Object.keys(NO_AXE_REASONS);

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
const CSP_EXPECTED = {
  'admin/index.html': [
    'connect-src <- data',
    'connect-src <- https://unpkg.com/@sveltia/cms/package.json',
    'connect-src <- https://www.githubstatus.com/api/v2/status.json',
    'img-src <- blob',
  ],
};

/** Every `.html` in a build, as paths relative to it. */
export function htmlPages(root, relative = '') {
  const found = [];
  for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
    const path = relative === '' ? entry.name : `${relative}/${entry.name}`;
    if (entry.isDirectory()) found.push(...htmlPages(root, path));
    else if (entry.name.endsWith('.html')) found.push(path);
  }
  return found.sort();
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
const CONTROL_PATH = '/__control__.html';
const CONTROL = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>before</title></head>
<body><p id="p">before</p><script>document.title = 'after'; document.getElementById('p').textContent = 'after';</script></body></html>`;

function serve(dist, rules) {
  return createServer((req, res) => {
    const path = decodeURIComponent(req.url.split('?')[0]);
    if (path === CONTROL_PATH) {
      res.writeHead(200, { 'Content-Type': MIME_TYPES['.html'] });
      res.end(CONTROL);
      return;
    }
    const file = join(dist, path.endsWith('/') ? `${path}index.html` : path);
    if (!existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404);
      res.end('404');
      return;
    }
    const headers = { 'Content-Type': MIME_TYPES[extname(file)] ?? 'application/octet-stream' };
    // Matched against the REQUEST path, which is what Cloudflare matches, not
    // against the file it resolved to: `/` and `/index.html` are different
    // strings to a rule like `/index.html`.
    for (const [name, value] of headersForPath(rules, path)) headers[name] = value;
    res.writeHead(200, headers);
    res.end(readFileSync(file));
  });
}

/**
 * The conditions an audit runs under.
 *
 * `width: null` means "whatever headless Chrome gives by default" - 756 CSS px
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
 *     enough - and `checkBreakpoints` below is what keeps that true.
 *
 * `media` is the intent, written down. It is checked from two sides: the browser
 * answers each query with `matchMedia` at the measured width, and
 * `checkBreakpoints` refuses any query here that the built CSS no longer
 * declares. Only the second catches a breakpoint that MOVED - see the note
 * above `breakpointsFromCss`.
 */
const PHONE = '(max-width: 34rem)';
const WIDE = '(min-width: 62rem)';

export const CONDITIONS = {
  desk: { label: 'desk, JS on', width: null, js: true, media: { [PHONE]: false, [WIDE]: false } },
  deskNoJs: { label: 'desk, JS off', width: null, js: false, media: { [PHONE]: false, [WIDE]: false } },
  phone: { label: 'phone 390px, JS on', width: 390, height: 844, js: true, media: { [PHONE]: true, [WIDE]: false } },
  phoneNoJs: { label: 'phone 390px, JS off', width: 390, height: 844, js: false, media: { [PHONE]: true, [WIDE]: false } },
  wide: { label: 'wide 1100px, JS on', width: 1100, height: 900, js: true, media: { [PHONE]: false, [WIDE]: true } },
  wideNoJs: { label: 'wide 1100px, JS off', width: 1100, height: 900, js: false, media: { [PHONE]: false, [WIDE]: true } },
};

/* -------------------------------------------------------------------------- *
 * THE PASSES. A CONDITION NOTHING RUNS IS NOT COVERAGE.
 *
 * `CONDITIONS` above is a DECLARATION, and until this table existed the band
 * check below was measured against it. Measured: add one line to `CONDITIONS` -
 * `tablet: { width: 850, … }` - and nothing else. No npm script, no argument,
 * no pass. All three `dist` passes went green printing
 * `widths audited by those passes: 390, 756, 850, 1100px` while NOTHING had ever loaded a page
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
 * list of conditions. `runAudit` takes a key from this table rather than a list
 * of conditions, so the conditions a pass runs and the conditions its coverage
 * is credited for cannot be two different things.
 *
 * SETS OF PAGES, NOT ONE GLOBAL LIST, and that is the second hole this closes.
 * `dist` and the picker pass's scratch build are different builds with
 * different markup, so a width audited on one proves nothing about the other.
 * Crediting the whole matrix to both hid `WeekBand`'s `min-width: 62rem`
 * branch completely: it renders in the fixture build with the picker bar
 * VISIBLE - the only build where that bar is not `hidden` - and no picker
 * width reached 992px, while in `dist/` the bar is hidden and axe skips it. The
 * Holy Week row with the bar showing had never been audited by anything. It is
 * `PASSES.picker`'s third condition now.
 *
 * WHAT IS ASSERTED ABOUT THIS TABLE, on every run, before the browser opens -
 * each one a way a declaration can drift from what executes:
 *
 *   - every entry's command is reachable from `npm run test:all`, following
 *     `npm run` chains. A pass no suite runs audits nothing;
 *   - every a11y command anywhere in `package.json` is described by an entry. A
 *     pass this table does not know about is a pass whose widths go uncounted;
 *   - every `CONDITIONS` key is named by some entry - the hole above, by name;
 *   - every condition an entry names exists in `CONDITIONS`;
 *   - every condition declares at least one media query, because assertion (a)
 *     of the breakpoint check iterates exactly those and an empty `media` makes
 *     it a loop over nothing;
 *   - every set of pages is audited with scripts OFF by some entry, or is named
 *     in `NO_JS_REASONS` with the reason. See the block above this table.
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
 * @typedef {{ limit: number, px: number, texts: Set<string>, sources: Set<string> }} Breakpoint
 * @typedef {{ name: string, sources: Set<string>, conditions: Set<string> }} MediaFeature
 * @typedef {{ label: string, width: number | null, height?: number, js: boolean,
 *             media: Record<string, boolean> }} Condition
 * @typedef {{ file: string, args: string[], pages: string, conditions: string[],
 *             label: string }} Pass
 */

/** This file's own path as `package.json` spells it, read off the module URL. */
const THIS_FILE = `scripts/${new URL(import.meta.url).pathname.split('/').pop()}`;

export const PASSES = {
  defaultWidth: {
    file: 'scripts/a11y.mjs',
    args: [],
    pages: 'dist',
    conditions: ['desk', 'deskNoJs'],
    label: 'axe at the default width',
  },
  mobile: {
    file: 'scripts/a11y.mjs',
    args: ['--mobile'],
    pages: 'dist',
    conditions: ['phone', 'phoneNoJs'],
    label: 'axe at phone width (390px)',
  },
  wide: {
    file: 'scripts/a11y.mjs',
    args: ['--wide'],
    pages: 'dist',
    conditions: ['wide', 'wideNoJs'],
    label: 'axe above the 62rem breakpoint (1100px)',
  },
  picker: {
    file: 'scripts/a11y-picker.mjs',
    args: [],
    pages: 'fixture',
    // `wide` is here because the 62rem branch of the week band renders in this
    // build too, and this is the ONLY build in which the picker bar above it is
    // visible. Without it the ≥992px band of the scratch build is audited by
    // nothing at all - which is exactly what the check below now says.
    conditions: ['desk', 'phone', 'wide'],
    label: 'axe over the week picker (fixture build)',
  },
};

/* -------------------------------------------------------------------------- *
 * THE SECOND AXIS: SCRIPTS ON AND SCRIPTS OFF.
 *
 * The table above closed the WIDTH axis - no width counts unless some pass over
 * these pages really loads them at it. The JavaScript axis had nothing at all,
 * and it is the axis on which this site deliberately renders two different
 * pages. Measured: delete `deskNoJs`, `phoneNoJs` and `wideNoJs` from
 * `CONDITIONS` and from the three `PASSES` entries that name them, change nothing
 * else, and all four browser passes plus the whole unit suite stay GREEN - while
 * the only audit that ever renders the weeks the picker hides has been removed.
 *
 * That pass is not optional and three places in this repository say so: the
 * plan's Global Constraints ("Neither pass alone is the guarantee"), the HONEST
 * SCOPE block at the top of this file, and `WeekPicker.astro`, which
 * explains that axe skips hidden elements and drives Chrome with scripts ON, so
 * every week but one leaves the audit the moment the picker works. Today the
 * parish publishes one week and nothing is hidden; the first week two are
 * published, the JS-on passes audit one week of the homepage band and the JS-off
 * passes audit three.
 *
 * So each SET OF PAGES must be audited with scripts off by some pass that
 * `npm run test:all` really runs - or be named here, in words, with the reason.
 * The check reads `PASSES` and `CONDITIONS`, the same tables the width check
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
export const NO_JS_REASONS = {
  fixture: [
    'the picker bar exists only with scripts on: the component ships it `hidden` and the script',
    'reveals it, so with JS off the fixture build has no state of its own to audit — it renders',
    'exactly what `dist` renders, every week visible, and `checkPickerBar` returns early for',
    '`condition.js === false` anyway. The no-JS state of these pages is covered by the passes',
    'over `dist`, which really do have one.',
  ].join('\n      '),
};

/**
 * A pass as `package.json` has to spell it.
 *
 * @param {Pass} pass
 */
export function passCommand(pass) {
  return ['node', pass.file, ...pass.args].join(' ');
}

/**
 * Every command `npm run <name>` ends up executing, `npm run` chains followed.
 * Commands are normalised on whitespace so a reformatted `package.json` is not
 * a failure.
 *
 * @param {Record<string, string>} pageScripts
 * @param {string} name
 * @param {Set<string>} [seen]
 * @returns {{ commands: string[], problems: string[] }}
 */
export function scriptCommands(pageScripts, name, seen = new Set()) {
  const commands = [];
  const problems = [];
  if (!(name in pageScripts)) {
    problems.push(`package.json has no script "${name}" — there is no way to say what the suite runs.`);
    return { commands, problems };
  }
  if (seen.has(name)) return { commands, problems };
  seen.add(name);
  for (const piece of pageScripts[name].split('&&')) {
    const command = piece.trim().replace(/\s+/g, ' ');
    if (command === '') continue;
    const chained = command.match(/^npm run ([\w:.-]+)$/);
    if (chained === null) {
      commands.push(command);
      continue;
    }
    const more = scriptCommands(pageScripts, chained[1], seen);
    commands.push(...more.commands);
    problems.push(...more.problems);
  }
  return { commands, problems };
}

/**
 * Every audit command `package.json` contains, wherever it sits.
 *
 * @param {Record<string, string>} pageScripts
 * @returns {string[]}
 */
export function a11yCommands(pageScripts) {
  const found = new Set();
  for (const value of Object.values(pageScripts)) {
    for (const piece of String(value).split('&&')) {
      const command = piece.trim().replace(/\s+/g, ' ');
      if (/^node scripts\/a11y[\w.-]*\.mjs(\s|$)/.test(command)) found.add(command);
    }
  }
  return [...found].sort();
}

/**
 * The assertions above, as sentences. Empty means the table and `package.json`
 * agree, every condition is executed by something, every condition says what it
 * expects of the CSS, and every set of pages is audited in both JavaScript
 * states or says why not.
 *
 * @param {{ scripts?: Record<string, string> }} [pkg]
 * @param {Record<string, Pass>} [passes]
 * @param {Record<string, Condition>} [conditions]
 * @param {Record<string, string>} [reasons]
 * @param {Record<string, string>} [noAxe]
 * @returns {string[]}
 */
export function checkPasses(
  pkg = readPackageJson(),
  passes = PASSES,
  conditions = CONDITIONS,
  reasons = NO_JS_REASONS,
  noAxe = NO_AXE_REASONS,
) {
  const pageScripts = pkg.scripts ?? {};
  const failures = [];

  const { commands, problems } = scriptCommands(pageScripts, 'test:all');
  failures.push(...problems);
  const commandsRun = new Set(commands);
  const described = new Map(Object.entries(passes).map(([key, t]) => [passCommand(t), key]));

  for (const [command, key] of described) {
    if (commandsRun.has(command)) continue;
    failures.push(
      `pass "${key}" is not started by "npm run test:all": nothing in its chain runs \`${command}\`.\n` +
        '    A pass the suite never runs audits no width at all, whatever PASSES declares.',
    );
  }
  for (const command of a11yCommands(pageScripts)) {
    if (described.has(command)) continue;
    failures.push(
      `package.json runs \`${command}\`, but no entry in PASSES describes it.\n` +
        '    Its widths are counted nowhere: add it to PASSES, with its set of pages and its conditions.',
    );
  }

  const used = new Set(Object.values(passes).flatMap((t) => t.conditions));
  for (const [key, condition] of Object.entries(conditions)) {
    if (used.has(key)) continue;
    failures.push(
      `CONDITIONS declares "${key}" (${condition.label}), but no pass in PASSES runs it.\n` +
        '    Nobody loads any page at its width, so it covers no band. Put it in the conditions of a\n' +
        '    pass, and that pass in a script "npm run test:all" starts — BOTH, because only the\n' +
        '    second half makes the audit happen.',
    );
  }
  for (const [key, t] of Object.entries(passes)) {
    for (const name of t.conditions) {
      if (name in conditions) continue;
      failures.push(`pass "${key}" names condition "${name}", which does not exist in CONDITIONS.`);
    }
  }

  /*
   * A CONDITION THAT DECLARES NOTHING MAKES ASSERTION (a) VACUOUS. That check
   * iterates the union of the `media` keys of the conditions a set of pages is
   * loaded under; empty every `media` and the loop body never runs, with no
   * complaint. Measured: with `media: {}` everywhere AND `DayRow.astro`'s phone
   * breakpoint moved from 34rem to 30rem, all four passes are exit 0 - against
   * exit 1 for the identical breakpoint move with `media` populated. Band
   * coverage (b) still holds, so nothing else fires, and the default pass is
   * then auditing a layout branch nobody asked about.
   *
   * `media` is also the only thing the BROWSER checks about a width: it answers
   * each query with `matchMedia` at the measured viewport. An empty one leaves
   * that silent too.
   */
  for (const [key, condition] of Object.entries(conditions)) {
    if (Object.keys(condition.media ?? {}).length > 0) continue;
    failures.push(
      `CONDITIONS declares "${key}" (${condition.label}) with no query at all in media.\n` +
        '    Assertion (a) of checkBreakpoints iterates exactly those queries, so an empty media\n' +
        '    checks nothing: a breakpoint that MOVES goes unseen, and the browser has nothing to\n' +
        '    confirm with matchMedia at the measured width. Write what must and must not match\n' +
        '    there — a condition that declares nothing can contradict nothing.',
    );
  }

  // Every set of pages is audited with scripts off, or says why it is not.
  const pageSets = [...new Set(Object.values(passes).map((t) => t.pages))].sort();
  for (const pageSet of pageSets) {
    const { withoutJs } = auditedStates(pageSet, passes, conditions);
    const reason = reasons[pageSet];
    if (!withoutJs && reason === undefined) {
      failures.push(
        `no pass audits the set of pages \u201e${pageSet}\u201d with scripts OFF.\n` +
          '    axe skips everything hidden, and the week picker hides every week but one — so with\n' +
          '    JS on the week band is audited on a single week, and without the no-JS pass the rest\n' +
          '    is audited by nobody. The same goes for anything else a script reveals.\n' +
          '    It closes in three steps, as a width does: a condition with js: false in CONDITIONS,\n' +
          `    its name in the conditions of a pass with pages: "${pageSet}", and that pass\'s\n` +
          '    command in a script "npm run test:all" starts.\n' +
          '    Or, if this set really has no no-JS state to audit, write the reason in\n' +
          '    NO_JS_REASONS in scripts/a11y.mjs — a gap said out loud beats a pass for nothing.',
      );
    }
    if (withoutJs && reason !== undefined) {
      failures.push(
        `NO_JS_REASONS excuses the set of pages \u201e${pageSet}\u201d, but a pass really does audit it\n` +
          '    with scripts off. Remove the excuse: one nobody needs stays in the code looking like\n' +
          '    a rule, ready to cover something else under the same name.',
      );
    }
  }
  for (const pageSet of Object.keys(reasons)) {
    if (pageSets.includes(pageSet)) continue;
    failures.push(
      `NO_JS_REASONS names the set of pages \u201e${pageSet}\u201d, which no pass in PASSES audits.\n` +
        '    The excuse has fallen behind the table.',
    );
  }
  /*
   * Every page excluded from axe says why, in words. The other direction - an
   * exclusion for a page that does not exist - is checked in `runAudit`, where
   * the build is in hand.
   */
  for (const [path, reason] of Object.entries(noAxe)) {
    if (typeof reason === 'string' && reason.trim().length > 40) continue;
    failures.push(
      `NO_AXE_REASONS takes \u201e${path}\u201d out of the axe audit without saying why.\n` +
        '    This list is the one lever that SHRINKS the audit\'s subject: the page is no longer\n' +
        '    audited by any pass, and its CSS leaves the derived breakpoint set with it. Write the\n' +
        '    reason beside the path — an exemption nobody has to justify is the cheapest way out\n' +
        '    of a red build.',
    );
  }
  return failures;
}

/**
 * The widths at which some pass really loads this set of pages, and which passes
 * they come from. Never the whole of `CONDITIONS`.
 *
 * @param {string} pageSet
 * @param {number} measuredDefaultWidth
 * @param {Record<string, Pass>} [passes]
 * @param {Record<string, Condition>} [conditions]
 * @returns {{ passes: string[], widths: number[] }}
 */
export function auditedWidths(pageSet, measuredDefaultWidth, passes = PASSES, conditions = CONDITIONS) {
  const passKeys = Object.keys(passes).filter((key) => passes[key].pages === pageSet);
  const widths = new Set();
  for (const key of passKeys) {
    for (const name of passes[key].conditions) {
      const condition = conditions[name];
      if (condition !== undefined) widths.add(condition.width ?? measuredDefaultWidth);
    }
  }
  return { passes: passKeys, widths: [...widths].sort((a, b) => a - b) };
}

/**
 * The widths this set of pages is really loaded at, SPLIT BY JAVASCRIPT STATE.
 *
 * `auditedWidths` answers "which widths", `auditedStates` answers "which
 * states", and the guard asked those two questions separately. That is the sixth
 * blind arrangement, found while closing the fifth and measured before it was
 * closed: delete `phoneNoJs` from `CONDITIONS` and from `PASSES.mobile`, change
 * nothing else, and the unit guard is 28 passed, both `dist` passes exit 0, and
 * the run prints `JavaScript states audited: JS on - JS off` - true of the
 * SET, false of the phone band, which has just lost its only scripts-off audit.
 * The band below 34rem is where the day row drops its month name, where the week
 * band stacks, and where most of the parish reads this; with scripts on the
 * picker hides every week but one and axe skips them.
 *
 * Coverage is therefore a property of the PAIR, and that is what this returns.
 *
 * @param {string} pageSet
 * @param {number} measuredDefaultWidth
 * @param {Record<string, Pass>} [passes]
 * @param {Record<string, Condition>} [conditions]
 * @returns {{ withJs: number[], withoutJs: number[] }}
 */
export function widthsByState(pageSet, measuredDefaultWidth, passes = PASSES, conditions = CONDITIONS) {
  const sets = { withJs: new Set(), withoutJs: new Set() };
  for (const key of Object.keys(passes).filter((k) => passes[k].pages === pageSet)) {
    for (const name of passes[key].conditions) {
      const condition = conditions[name];
      if (condition === undefined) continue;
      sets[condition.js === true ? 'withJs' : 'withoutJs'].add(condition.width ?? measuredDefaultWidth);
    }
  }
  return {
    withJs: [...sets.withJs].sort((a, b) => a - b),
    withoutJs: [...sets.withoutJs].sort((a, b) => a - b),
  };
}

/** The two JavaScript states, as they are named in output and in code. */
export const STATES = [
  { key: 'withJs', label: 'ON', short: 'JS on' },
  { key: 'withoutJs', label: 'OFF', short: 'JS off' },
];

/**
 * The states a set of pages must be audited in: scripts on always, scripts off
 * unless `NO_JS_REASONS` says in words why that set has no such state.
 *
 * @param {string} pageSet
 * @param {Record<string, string>} [reasons]
 */
export function requiredStates(pageSet, reasons = NO_JS_REASONS) {
  return STATES.filter((s) => s.key === 'withJs' || reasons[pageSet] === undefined);
}

/**
 * The JavaScript states some pass really loads this set of pages in, and which
 * passes they come from. Never the whole of `CONDITIONS` - the same rule as
 * `auditedWidths`, on the other axis: a scripts-off condition run over some
 * other build buys this one nothing.
 *
 * @param {string} pageSet
 * @param {Record<string, Pass>} [passes]
 * @param {Record<string, Condition>} [conditions]
 * @returns {{ passes: string[], withJs: boolean, withoutJs: boolean }}
 */
export function auditedStates(pageSet, passes = PASSES, conditions = CONDITIONS) {
  const passKeys = Object.keys(passes).filter((key) => passes[key].pages === pageSet);
  const states = new Set();
  for (const key of passKeys) {
    for (const name of passes[key].conditions) {
      const condition = conditions[name];
      if (condition !== undefined) states.add(condition.js === true);
    }
  }
  return { passes: passKeys, withJs: states.has(true), withoutJs: states.has(false) };
}

/** `package.json`, resolved next to this file rather than to a working directory. */
export function readPackageJson() {
  return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
}

/* -------------------------------------------------------------------------- *
 * THE BREAKPOINTS, DERIVED FROM THE BUILT CSS INSTEAD OF COPIED FROM IT.
 *
 * This file used to write `(max-width: 34rem)` and `(min-width: 62rem)` out by
 * hand. They were right, and they were a SECOND COPY of two numbers whose first
 * copy lives in the components' styles, with nothing tying the two spellings
 * together. Measured: change `DayRow.astro` to `48rem`, rebuild, and all four
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
 * reviewers: hardcoded breakpoints; widths declared in `CONDITIONS` that no pass
 * ran; the JavaScript axis, which nothing indexed; `media: {}`, which made the
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
 * the `PASSES` entries whose `pages` is this set. Five assertions, and the
 * letters say which direction each one goes:
 *
 *   (a)  declaration -> CSS. Every query a condition DECLARES is still a
 *        breakpoint the CSS has, so a breakpoint that MOVED is named immediately,
 *        at its old value.
 *   (a') CSS -> declaration. Every breakpoint the CSS HAS is named by the `media`
 *        of some condition this set is loaded under. Without this, dropping a
 *        breakpoint from every `media` and then moving it is green on everything:
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
 *        named in `UNAUDITED_FEATURES` with the reason in words. This is the
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
 * widths, its states and its declared queries from the `PASSES` entries whose
 * `pages` is the set being audited, never from `CONDITIONS` as a whole - see the
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
 * built CSS - which is exactly what `CSP_EXPECTED` above must never do. The
 * difference is what each list is for. `CSP_EXPECTED` is a boundary against a
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

const PX_PER_UNIT = { px: 1, rem: 16, em: 16 };
const MIRROR = { '<': '>', '<=': '>=', '>': '<', '>=': '<=' };

/*
 * MEDIA FEATURES THIS AUDIT DOES NOT VARY, each with the reason in words.
 *
 * Assertion (c) above. Width is the only axis this file indexes; every other
 * feature a built stylesheet asks about is a branch of the page that no pass here
 * renders, and until this table existed it was dropped in silence. `widthComparisons`
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
 * Both directions fail, as with `NO_JS_REASONS` and the command strings: a
 * feature the CSS no longer has, named here, is a stale excuse.
 *
 * @type {Record<string, string>}
 */
export const UNAUDITED_FEATURES = {
  'prefers-reduced-motion': [
    'no pass changes the preference: Chrome starts on `no-preference`, so the `reduce` branch is',
    'rendered by nobody. What that branch does is switch animations and transitions off',
    '(`animation: none`, `transition: none` in src/styles/global.css) — it removes motion and adds',
    'nothing: it cannot break a contrast, an accessible name or a focus ring that the default',
    'branch does not already have, and axe measures the resolved state of a static DOM anyway,',
    'not motion. What it could hide is a control whose only visual cue is an animation; the site',
    'has none. So this is a gap said out loud, not one covered over.',
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
const ENVIRONMENT_AT_RULES = ['container'];

/** The logical words that join media features, which are not features. */
const LOGICAL_WORDS = new Set(['and', 'not', 'only', 'or']);

/**
 * Every media feature in one `@media` condition that is NOT a width comparison,
 * lower-cased. A media TYPE (`print`, `screen`) counts as one, and so does any
 * leftover this file failed to parse: a guard that derives its subject can only
 * check what it recognised, so what it did not recognise has to be loud.
 */
export function conditionFeatures(condition) {
  const { rest } = widthComparisons(condition);
  const names = new Set();
  const leftover = rest.replace(/\(\s*([a-zA-Z][\w-]*)\s*(?::[^()]*)?\)/g, (_, f) => {
    names.add(f.toLowerCase());
    return ' ';
  });
  for (const piece of leftover.split(/[\s,]+/)) {
    const word = piece.trim().toLowerCase();
    if (word === '' || LOGICAL_WORDS.has(word)) continue;
    names.add(word);
  }
  return [...names].sort();
}

/*
 * A width comparison as the largest integer viewport width on its LOWER side.
 * `(max-width: 544px)` matches at 544 and not at 545, so its limit is 544;
 * `(min-width: 992px)` matches at 992 and not at 991, so its limit is 991. Two
 * queries with the same limit cut the axis in the same place, which is what
 * makes `(width<=34rem)` - the form the minifier emits - and
 * `(max-width: 34rem)` comparable at all.
 */
function lowerLimit(sign, px) {
  return sign === '<=' || sign === '>' ? Math.floor(px) : Math.ceil(px) - 1;
}

/** Every width comparison in one `@media` condition, and what was left over. */
export function widthComparisons(condition) {
  const found = [];
  let rest = condition;
  const collect = (pattern, read) => {
    rest = rest.replace(pattern, (...m) => {
      const c = read(m);
      const px = parseFloat(c.number) * (PX_PER_UNIT[(c.unit ?? 'px').toLowerCase()] ?? Number.NaN);
      found.push({ text: m[0].trim(), px, limit: lowerLimit(c.sign, px) });
      return ' ';
    });
  };
  collect(/\(\s*(min|max)-width\s*:\s*([\d.]+)(px|rem|em)?\s*\)/gi, (m) => ({
    sign: m[1].toLowerCase() === 'max' ? '<=' : '>=',
    number: m[2],
    unit: m[3],
  }));
  collect(/\(\s*width\s*(<=|>=|<|>)\s*([\d.]+)(px|rem|em)?\s*\)/gi, (m) => ({
    sign: m[1],
    number: m[2],
    unit: m[3],
  }));
  collect(/\(\s*([\d.]+)(px|rem|em)?\s*(<=|>=|<|>)\s*width\s*\)/gi, (m) => ({
    sign: MIRROR[m[3]],
    number: m[1],
    unit: m[2],
  }));
  return { found, rest };
}

/** The CSS one built page ships: every inline `<style>` and every stylesheet it links. */
function pageStylesheets(dist, page) {
  const html = readFileSync(join(dist, page), 'utf8');
  const pieces = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => ({ css: m[1], media: '' }));
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    if (!/rel\s*=\s*["']?stylesheet/i.test(m[0])) continue;
    const href = m[0].match(/\bhref\s*=\s*["']([^"']*)["']/i)?.[1] ?? '';
    // A stylesheet this function cannot read is a stylesheet whose breakpoints
    // are not in the derived set, which would make the coverage check below
    // pass by having looked at less. Say so instead.
    if (href === '' || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) {
      throw new Error(`${page}: the stylesheet "${href}" is not a file in the build — its breakpoints cannot be read.`);
    }
    const path = href.startsWith('/') ? href.slice(1) : join(dirname(page), href);
    if (!existsSync(join(dist, path))) throw new Error(`${page}: links ${href}, which does not exist in the build.`);
    /*
     * THE `media` ATTRIBUTE IS A MEDIA CONDITION LIKE ANY OTHER, and reading the
     * file while ignoring it would fold a `media="print"` stylesheet into the set
     * as if it always applied - a whole branch of the page counted as
     * unconditional, and the `print` axis invisible. It is carried alongside the
     * text and joined onto every `@media` condition inside it.
     */
    pieces.push({
      css: readFileSync(join(dist, path), 'utf8'),
      media: (m[0].match(/\bmedia\s*=\s*["']([^"']*)["']/i)?.[1] ?? '').trim(),
    });
  }
  return pieces;
}

/**
 * WHAT THE BUILT CSS OF THESE PAGES DEMANDS: every width breakpoint, sorted and
 * deduplicated by where it cuts the width axis, AND every media feature that is
 * not a width comparison. Each carries the pages it was found in.
 *
 * The second half is assertion (c)'s subject. It used to be thrown away: the
 * leftover of `widthComparisons` was tested for the word "width" and otherwise dropped,
 * so every `@media` question this file cannot ask was invisible to it.
 */
export function breakpointsFromCss(dist, pages) {
  const byLimit = new Map();
  const features = new Map();
  const problems = [];
  const noteFeature = (name, page, condition) => {
    const entry = features.get(name) ?? { name, sources: new Set(), conditions: new Set() };
    entry.sources.add(page);
    entry.conditions.add(condition);
    features.set(name, entry);
  };
  for (const page of pages) {
    let pieces;
    try {
      pieces = pageStylesheets(dist, page);
    } catch (e) {
      problems.push(e.message);
      continue;
    }
    const css = pieces.map((b) => b.css).join('\n');
    /*
     * A STYLESHEET THIS FILE DOES NOT FOLLOW IS A SUBJECT SILENTLY NARROWED.
     * `pageStylesheets` follows `<link rel=stylesheet>` and throws on one it cannot
     * read; an `@import` inside a stylesheet it DID read was followed by nobody
     * and reported by nobody, so every breakpoint behind one would be missing
     * from the derived set while the coverage check below said it had looked.
     */
    for (const m of css.matchAll(/@import\b([^;]*);/g)) {
      problems.push(
        `${page}: the built CSS contains @import${m[1].trim() === '' ? '' : ` ${m[1].trim()}`}, ` +
          'which this file does not follow — the breakpoints of the imported sheet are not in the derived set. ' +
          'Either link it with <link>, or follow it here.',
      );
    }
    // The `media` attribute of a linked stylesheet conditions everything in it.
    for (const b of pieces) {
      if (b.media === '' || b.media.toLowerCase() === 'all') continue;
      for (const name of conditionFeatures(b.media)) noteFeature(name, page, `<link media="${b.media}">`);
      for (const g of widthComparisons(b.media).found) {
        if (!Number.isFinite(g.px)) {
          problems.push(`${page}: <link media="${b.media}"> — unknown unit in "${g.text}".`);
          continue;
        }
        const entry = byLimit.get(g.limit) ?? { limit: g.limit, px: g.px, texts: new Set(), sources: new Set() };
        entry.texts.add(g.text);
        entry.sources.add(page);
        byLimit.set(g.limit, entry);
      }
    }
    for (const name of ENVIRONMENT_AT_RULES) {
      for (const m of css.matchAll(new RegExp(`@${name}([^{]*)\\{`, 'g'))) {
        noteFeature(`@${name}`, page, `@${name} ${m[1].trim()}`);
      }
    }
    for (const m of css.matchAll(/@media([^{]*)\{/g)) {
      const condition = m[1].trim();
      const { found, rest } = widthComparisons(condition);
      // Anything width-shaped that this parser did not consume. A guard that
      // derives its subject can only check what it recognised, so the part it
      // failed to recognise has to be loud rather than absent.
      if (/width/i.test(rest)) {
        problems.push(
          `${page}: @media ${condition} — a width condition this file does not understand ` +
            `(left unread: "${rest.trim()}"). Add it to widthComparisons() in scripts/a11y.mjs.`,
        );
      }
      // Everything that is not a width. Silent until this line existed.
      for (const name of conditionFeatures(condition)) noteFeature(name, page, `@media ${condition}`);
      for (const g of found) {
        if (!Number.isFinite(g.px)) {
          problems.push(`${page}: @media ${condition} — unknown unit in "${g.text}".`);
          continue;
        }
        const entry = byLimit.get(g.limit) ?? { limit: g.limit, px: g.px, texts: new Set(), sources: new Set() };
        entry.texts.add(g.text);
        entry.sources.add(page);
        byLimit.set(g.limit, entry);
      }
    }
  }
  return {
    breakpoints: [...byLimit.values()].sort((a, b) => a.limit - b.limit),
    features: [...features.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
    problems,
  };
}

/** How a breakpoint reads in output: the query as the CSS writes it, plus its px. */
function formatBreakpoint(p) {
  return `${[...p.texts].join('/')} = ${p.px}px (${[...p.sources].join(', ')})`;
}

/**
 * EVERYTHING THE CSS DEMANDS AGAINST EVERYTHING THE SUITE RUNS, IN BOTH
 * DIRECTIONS - the five assertions (a), (a'), (b), (c) and (c') listed in the
 * block above this section, as lines to print and problems to report.
 * `measuredDefaultWidth` is the measured default viewport.
 *
 * The widths and states are those of every pass over THIS SET OF PAGES, not the
 * subset the current run happens to execute: the claim is about what
 * `npm run test:all` covers over these pages between all of its passes, so an
 * uncovered band must fail every one of them rather than whichever happens to
 * hold the guilty width. What it is NOT is the whole of `CONDITIONS` - a width
 * declared there and run over some other build says nothing about this one.
 *
 * The tables are arguments with the real ones as defaults, so every assertion
 * below has a unit-level positive control in `a11y-passes.test.ts` that runs in
 * milliseconds instead of four Chrome launches.
 *
 * @param {{ breakpoints: Breakpoint[], features?: MediaFeature[], problems: string[] }} derived
 * @param {number} measuredDefaultWidth
 * @param {string} pageSet
 * @param {{ passTable?: Record<string, Pass>, conditions?: Record<string, Condition>,
 *           reasons?: Record<string, string>, unaudited?: Record<string, string> }} [options]
 * @returns {{ lines: string[], failures: string[] }}
 */
export function checkBreakpoints(
  { breakpoints, features = [], problems },
  measuredDefaultWidth,
  pageSet,
  { passTable = PASSES, conditions = CONDITIONS, reasons = NO_JS_REASONS, unaudited = UNAUDITED_FEATURES } = {},
) {
  const failures = [...problems];
  const { passes, widths } = auditedWidths(pageSet, measuredDefaultWidth, passTable, conditions);
  const passNames = passes.map((key) => `${key} (${passCommand(passTable[key])})`).join(' · ');
  const byState = widthsByState(pageSet, measuredDefaultWidth, passTable, conditions);
  const required = requiredStates(pageSet, reasons);
  // Printed rather than only asserted, on every axis, for the same reason the
  // widths are: the line below is what a later reader checks a claim against.
  const { withJs, withoutJs } = auditedStates(pageSet, passTable, conditions);
  const states = [withJs ? 'JS on' : null, withoutJs ? 'JS off' : null].filter(Boolean);
  const lines = [
    `breakpoints in the built CSS: ${breakpoints.length > 0 ? breakpoints.map(formatBreakpoint).join(' · ') : '(none)'}`,
    `media features that are not widths: ${
      features.length > 0 ? features.map((t) => `${t.name} (${[...t.sources].join(', ')})`).join(' · ') : '(none)'
    }`,
    `page set \u201e${pageSet}\u201d — passes that audit it: ${passNames === '' ? '(none)' : passNames}`,
    `widths audited by those passes: ${widths.join(', ')}px (measured default: ${measuredDefaultWidth}px)`,
    `JavaScript states audited: ${states.length > 0 ? states.join(' · ') : '(none)'}` +
      `${withoutJs ? '' : ` — exempt: ${reasons[pageSet] === undefined ? 'NO' : 'yes'}`}`,
    // The PAIR, which is what coverage is a property of. Two axes printed apart
    // is exactly what let one width lose its scripts-off pass unnoticed.
    ...STATES.map(
      (st) =>
        `  widths with scripts ${st.label}: ${byState[st.key].length > 0 ? `${byState[st.key].join(', ')}px` : '(none)'}` +
        `${required.some((c) => c.key === st.key) ? '' : ' — exempt, with a written reason'}`,
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
  const named = new Set(Object.keys(unaudited));
  for (const t of features) {
    if (named.has(t.name)) continue;
    failures.push(
      `the built CSS branches on \u201e${t.name}\u201d, which this audit does not vary and nobody has named.\n` +
        `    Found in: ${[...t.sources].join(', ')} — ${[...t.conditions].join(' · ')}.\n` +
        '    Width is the only axis this file indexes, so this branch is rendered by no pass. Either\n' +
        '    audit it (a condition that puts it in its state), or write it into UNAUDITED_FEATURES in\n' +
        '    scripts/a11y.mjs with the reason in words.\n' +
        '    A gap said out loud beats a branch nobody has ever seen.',
    );
  }
  for (const name of [...named].sort()) {
    if (features.some((t) => t.name === name)) continue;
    failures.push(
      `UNAUDITED_FEATURES names \u201e${name}\u201d, which the built CSS of the set \u201e${pageSet}\u201d ` +
        'no longer contains.\n' +
        '    The excuse has fallen behind the stylesheets: remove it. One nobody needs stays in the\n' +
        '    code looking like a rule, ready to cover something else under the same name.',
    );
  }

  // A set of pages nothing audits cannot be said to cover any band. Without
  // this the loop below would report every band as uncovered and bury the
  // actual mistake, which is a `pages` nobody spells the same way twice.
  if (passes.length === 0) {
    failures.push(
      `no pass in PASSES has pages: "${pageSet}". The audit is running over a set of pages the ` +
        'table does not know about, so no width can be counted for it.',
    );
    return { lines, failures };
  }

  // A guard that reads files must prove it read something.
  if (breakpoints.length === 0) {
    failures.push(
      'the audited pages declare no width breakpoint at all. Either the built CSS has lost them, ' +
        'or widthComparisons() no longer recognises them — either way the coverage below would prove nothing.',
    );
    return { lines, failures };
  }

  // The conditions this set of pages is actually loaded under, and the queries
  // they declare. Both (a) and (a') are about these two sets and nothing else.
  const conditionNames = new Set(passes.flatMap((key) => passTable[key].conditions));
  const declared = new Set(
    [...conditionNames].flatMap((name) => Object.keys(conditions[name]?.media ?? {})),
  );

  // (a) declaration -> CSS. Every query a condition declares still names a
  // breakpoint the CSS has, so a breakpoint that MOVED is named at its old value.
  const declaredLimits = new Set();
  for (const mediaQuery of [...declared].sort()) {
    const { found } = widthComparisons(mediaQuery);
    const limits = found.map((g) => g.limit);
    if (limits.length !== 1) {
      failures.push(`CONDITIONS declares "${mediaQuery}", which widthComparisons() does not read as a single breakpoint.`);
      continue;
    }
    declaredLimits.add(limits[0]);
    if (!breakpoints.some((p) => p.limit === limits[0])) {
      failures.push(
        `CONDITIONS declares "${mediaQuery}", but the built CSS no longer has a breakpoint there.\n` +
          `    Breakpoints found: ${breakpoints.map(formatBreakpoint).join(' · ')}.\n` +
          '    A breakpoint has moved: move it here too, and check which width still audits it.',
      );
    }
  }

  /*
   * (a') CSS -> declaration, AND THIS IS THE DIRECTION THAT WAS MISSING.
   *
   * (a) iterates the declarations, so a breakpoint dropped from every `media`
   * leaves its loop with nothing to say about it. Measured before this existed:
   * remove `(min-width: 62rem)` from all six conditions - each `media` still
   * non-empty, so the `media: {}` check is satisfied - then move that breakpoint
   * in the component to 60rem and rebuild. All four browser passes and the unit
   * guard are exit 0, while the run PRINTS a breakpoint at 960px that nothing
   * declares and nothing compares against anything.
   *
   * There is no exemption table here on purpose. A breakpoint in the built CSS is
   * a branch of the layout; the repair is to say what should and should not match
   * at it, which is one line in each condition, and an excuse would be a way to
   * keep the branch and stop looking at it.
   */
  for (const breakpoint of breakpoints) {
    if (declaredLimits.has(breakpoint.limit)) continue;
    failures.push(
      `the built CSS declares a breakpoint no condition names: ${formatBreakpoint(breakpoint)}.\n` +
        `    The conditions the set \u201e${pageSet}\u201d is loaded under: ${[...conditionNames].sort().join(', ')}.\n` +
        `    Queries they declare: ${[...declared].sort().join(' · ') || '(none)'}.\n` +
        '    Assertion (a) iterates exactly the declared queries, so a breakpoint dropped from every\n' +
        '    `media` leaves its range and survives on band coverage alone — which only sees moves\n' +
        '    big enough to empty a band. Write the query into the `media` of the conditions above,\n' +
        '    with what must and must not match at each.',
    );
  }

  /*
   * (b) CSS -> execution, ON THE PAIR (band, JavaScript state).
   *
   * These two used to be checked apart: bands against the union of the widths,
   * and JavaScript states against the set of pages. Measured while closing (a'):
   * delete `phoneNoJs` from `CONDITIONS` and from `PASSES.mobile` and
   * everything stays green - the unit guard, both `dist` passes - while the band
   * below 34rem loses its only scripts-off audit and the output still says the
   * set is audited in both states. True of the set, false of the band.
   */
  const limits = breakpoints.map((p) => p.limit);
  for (const state of required) {
    const ofThisState = byState[state.key];
    for (let i = 0; i <= limits.length; i += 1) {
      const low = i === 0 ? 0 : limits[i - 1] + 1;
      const high = i === limits.length ? Number.POSITIVE_INFINITY : limits[i];
      if (ofThisState.some((l) => l >= low && l <= high)) continue;
      const neighbours = breakpoints.filter((p) => p.limit === limits[i - 1] || p.limit === limits[i]).map(formatBreakpoint);
      failures.push(
        `no pass audits the widths ${low}-${high === Number.POSITIVE_INFINITY ? '∞' : high}px ` +
          `of the page set \u201e${pageSet}\u201d with scripts ${state.label}.\n` +
          `    The band is bounded by: ${neighbours.join(' · ')}.\n` +
          `    The widths really run over these pages with scripts ${state.label}: ` +
          `${ofThisState.join(', ') || '(none)'}px.\n` +
          `    (On the other state: ${byState[state.key === 'withJs' ? 'withoutJs' : 'withJs'].join(', ') || '(none)'}px — ` +
          'coverage is a property of the PAIR, not of the two axes taken apart.)\n' +
          '    It closes in THREE steps, all three checked — no single one is enough:\n' +
          `      1. a condition in CONDITIONS with a width from the band and js: ${state.key === 'withJs' ? 'true' : 'false'};\n` +
          `      2. its name in the conditions of a pass in PASSES with pages: "${pageSet}";\n` +
          '      3. that pass\'s command in a script "npm run test:all" starts.\n' +
          '    Or, if the band really should not be audited, write here which it is and why — a gap ' +
          'said out loud beats a pass for nothing.',
      );
    }
  }

  return { lines, failures };
}

function openBrowser() {
  return new Builder()
    .forBrowser('chrome')
    .setChromeOptions(new chrome.Options().addArguments('headless=new', 'no-sandbox', 'disable-gpu'))
    .setChromeService(new chrome.ServiceBuilder(chromedriver.path))
    .build();
}

/** Puts the driver into one condition. Takes effect on the NEXT navigation. */
async function prepare(driver, condition) {
  if (condition.width === null) {
    await driver.sendDevToolsCommand('Emulation.clearDeviceMetricsOverride', {});
  } else {
    await driver.sendDevToolsCommand('Emulation.setDeviceMetricsOverride', {
      width: condition.width,
      height: condition.height,
      deviceScaleFactor: 0,
      // `mobile: false`, so the layout viewport IS the width asked for. With
      // `true` the page is laid out at 980px unless it carries a viewport meta
      // tag, which would make the audited width a property of the page rather
      // than of this file. Measured both ways.
      mobile: false,
    });
  }
  await driver.sendDevToolsCommand('Emulation.setScriptExecutionDisabled', { value: !condition.js });
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
async function runAxe(driver) {
  await driver.sendDevToolsCommand('Emulation.setScriptExecutionDisabled', { value: false });
  await driver.executeScript(AXE);
  return driver.executeAsyncScript(
    'const done = arguments[arguments.length - 1];' +
      'axe.run(document).then((r) => done({ ok: true, r })).catch((e) => done({ ok: false, e: String(e) }));',
  );
}

const CSP_LISTENER = `window.__csp = [];
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
 * So: poll until the list has been unchanged for `QUIET` and every expected
 * violation has arrived, up to `CEILING`. Quiet pages leave after one quiet
 * second; `/admin/` takes as long as the bundle takes.
 */
const QUIET = 1000;
const CEILING = 20000;

async function waitForCsp(driver, expected) {
  const startedAt = Date.now();
  let previous = [];
  let wasChanged = Date.now();
  for (;;) {
    const now = (await driver.executeScript('return window.__csp')) ?? null;
    if (now === null) return null;
    if (now.length !== previous.length) {
      previous = now;
      wasChanged = Date.now();
    }
    const allArrived = expected.every((a) => now.includes(a));
    if (allArrived && Date.now() - wasChanged >= QUIET) return now;
    if (Date.now() - startedAt >= CEILING) return now;
    await driver.sleep(200);
  }
}

/* -------------------------------------------------------------------------- *
 * THE DECLARED SVG-TEXT GAP, RECONCILED WITH THE CODE THAT ENFORCES IT.
 *
 * axe can never resolve a background for text drawn inside an inline `<svg>`:
 * `elementHasImage()` in axe-core treats any `SVG` node as a graphic, so a
 * `<text>`/`<tspan>` in an inline SVG comes back as an `incomplete` rather than
 * a pass or a violation - `imgNode` for the spans inside the QR-bill, and
 * `bgOverlap` for the one the bill's own layout overlaps. Measured on the Task
 * 11 build: `/doneaza`'s QR-bill produces 23 of them, and the audit below fails
 * on every `color-contrast` incomplete by design.
 *
 * The header above already declares SVG `<text>` out of scope. That declaration
 * and this enforcement disagreed - the build was red over something the audit
 * says it does not cover - and `svgTextIncompletes` is the reconciliation: the
 * nodes axe reported for SVG text are PRINTED every run as the declared gap,
 * and every other incomplete still fails the pass.
 *
 * THE TARGET IS THE TEST, NOT THE MESSAGE. `text` and `tspan` are SVG element
 * names; no HTML element has them, so a node whose selector chains all end in
 * one is SVG text whatever axe could not determine - which is why the
 * overlapped `<text>` is exempted alongside the `imgNode` spans. The reason is
 * not consulted, because the audit could never have judged any of them.
 *
 * IT FAILS CLOSED. A node is returned only when EVERY selector chain in its
 * target ends in `text` or `tspan`. A target that is missing, empty, not an
 * array of strings, an HTML element, or a set of chains that disagree stays in
 * scope and keeps failing. An exemption is a decision, and ambiguity is not
 * one. The contract is unit-tested in `src/lib/a11y-passes.test.ts` against
 * the exact nodes axe reported on this build.
 * -------------------------------------------------------------------------- */

/** The tag name at the end of one selector chain, or null when it has none. */
function selectorTag(chain) {
  if (typeof chain !== 'string') return null;
  const last = chain.trim().split(/\s*>\s*/).pop() ?? '';
  return /^([a-zA-Z][\w-]*)/.exec(last)?.[1]?.toLowerCase() ?? null;
}

/** Every chain's tag, or null when the target is not an array of selectors. */
function targetTags(target) {
  if (!Array.isArray(target) || target.length === 0) return null;
  const tags = target.map(selectorTag);
  return tags.every((tag) => tag !== null) ? tags : null;
}

/**
 * The nodes of a `color-contrast` incomplete that are SVG text.
 *
 * Returns an empty array for every other rule, and for every node whose target
 * does not clearly name an SVG text element - the fail-closed direction is the
 * only one allowed, for the reason in the block above.
 */
export function svgTextIncompletes(rule) {
  if (rule?.id !== 'color-contrast') return [];
  return (rule.nodes ?? []).filter((node) => {
    const tags = targetTags(node?.target);
    return tags !== null && tags.every((tag) => tag === 'text' || tag === 'tspan');
  });
}

/**
 * Runs the audit and returns true when everything passed.
 *
 * `pass` is a key of `PASSES`, not a list of conditions: the conditions this
 * runs and the conditions its band coverage is credited for are then the same
 * list by construction, which is the whole of finding A.
 *
 * `extraCheck` is an optional check run ONCE PER CONDITION, after that condition's
 * page loop, for things only one build can show - the week picker's bar, which
 * needs two rendered weeks. It navigates itself, so it is not tied to whichever
 * page the loop happened to leave loaded, and its line appears once per
 * condition in the output.
 */
export async function runAudit({ dist, pass, extraCheck = null, log = console.log }) {
  const definition = PASSES[pass];
  if (definition === undefined) {
    log(`Unknown pass: "${pass}". Known: ${Object.keys(PASSES).join(', ')}.`);
    return false;
  }

  /*
   * BEFORE THE BROWSER, because a table that does not match `package.json` makes
   * every width below meaningless and there is no reason to spend a Chrome
   * launch finding that out.
   */
  const tableProblems = checkPasses();
  if (tableProblems.length > 0) {
    log(`\n=== ${definition.label} ===`);
    for (const problem of tableProblems) log(`  ${problem}`);
    log('\nAUDIT FAILED.');
    return false;
  }

  const conditions = definition.conditions.map((name) => CONDITIONS[name]);
  const label = definition.label;

  if (!existsSync(dist)) {
    log(`${dist}/ does not exist — run the build first.`);
    return false;
  }
  const all = htmlPages(dist);
  if (all.length === 0) {
    log(`${dist}/ contains no .html page at all.`);
    return false;
  }

  // An exception for a page that no longer exists excuses nothing: it stays in
  // the code looking like a rule, ready to excuse something else of that name.
  const missing = NO_AXE.filter((e) => !all.includes(e));
  if (missing.length > 0) {
    log(`axe exceptions for pages that do not exist: ${missing.join(', ')}. Delete them.`);
    return false;
  }
  const toAudit = all.filter((p) => !NO_AXE.includes(p));
  if (toAudit.length === 0) {
    log('The exceptions covered every page — the audit would check nothing.');
    return false;
  }

  const headersFile = join(dist, '_headers');
  if (!existsSync(headersFile)) {
    log(`${headersFile} is missing — the security policy would not be checked at all.`);
    return false;
  }
  const rules = parseHeaders(readFileSync(headersFile, 'utf8'));

  const server = serve(dist, rules);
  await new Promise((done) => server.listen(0, done));
  const port = server.address().port;
  const url = (page) => `http://localhost:${port}/${page.replace(/index\.html$/, '')}`;

  log(`\n=== ${label} ===`);
  log(`${dist}/ · ${all.length} page(s) · ${conditions.length} condition(s)`);
  log(`axe skips: ${NO_AXE.join(', ')} (CSP checks all of them)`);

  let failed = false;
  const fail = (message) => {
    failed = true;
    log(message);
  };

  const driver = await openBrowser();
  try {
    await driver.sendDevToolsCommand('Page.enable', {});
    await driver.sendDevToolsCommand('Page.addScriptToEvaluateOnNewDocument', { source: CSP_LISTENER });

    /*
     * The default viewport is MEASURED, once, before anything else - on the
     * harness's own control page, so no built page's markup can affect it. The
     * coverage of this SET OF PAGES is checked against the CSS's own breakpoints
     * here rather than inside the loop, because the claim is about every pass
     * over these pages and must fail all of them, not only the one running.
     */
    await driver.sendDevToolsCommand('Emulation.clearDeviceMetricsOverride', {});
    await driver.get(`http://localhost:${port}${CONTROL_PATH}`);
    const measuredDefaultWidth = await driver.executeScript('return window.innerWidth');
    const { lines, failures } = checkBreakpoints(breakpointsFromCss(dist, toAudit), measuredDefaultWidth, definition.pages);
    for (const line of lines) log(`  ${line}`);
    for (const problem of failures) fail(`  ${problem}`);

    for (const condition of conditions) {
      log(`\n--- ${condition.label} ---`);
      await prepare(driver, condition);

      // The control first, so a broken switch is reported before any result
      // that depends on it.
      await driver.get(`http://localhost:${port}${CONTROL_PATH}`);
      const didRun = (await driver.getTitle()) === 'after';
      if (didRun !== condition.js) {
        fail(
          `The control says the page's scripts ${didRun ? 'DID' : 'did NOT'} run, ` +
            `but the condition asks for them ${condition.js ? 'to run' : 'not to run'}.`,
        );
      } else {
        log(`  control: the page's scripts ${didRun ? 'run' : 'do not run'}, as required`);
      }

      const measured = await driver.executeScript(
        'return { width: window.innerWidth, media: ' +
          JSON.stringify(Object.keys(condition.media)) +
          '.map((q) => [q, window.matchMedia(q).matches]) };',
      );
      for (const [mediaQuery, matches] of measured.media) {
        if (matches !== condition.media[mediaQuery]) {
          fail(
            `  at ${measured.width}px, ${mediaQuery} ${matches ? 'matches' : 'does not match'}, ` +
              `but the condition asks for the opposite. A breakpoint has moved, or the width is not the one asked for.`,
          );
        }
      }
      log(
        `  ${measured.width}px · ` +
          measured.media.map(([q, m]) => `${q} ${m ? 'YES' : 'no'}`).join(' · '),
      );

      await prepare(driver, condition);

      for (const page of all) {
        await driver.get(url(page));
        const width = await driver.executeScript('return window.innerWidth');
        if (condition.width !== null && width !== condition.width) {
          fail(`  ${page}: the measured width is ${width}px, not ${condition.width}px.`);
        }

        /*
         * With the page's scripts disabled, NOTHING may be refused - the CMS
         * bundle never runs, and neither does anything else that could fetch.
         * So the expected set belongs to the scripts-on condition only, and
         * this doubles as a second control on the switch: an expected
         * violation appearing here would mean the page's scripts ran after all.
         */
        const expected = condition.js ? (CSP_EXPECTED[page] ?? []) : [];
        const violations = await waitForCsp(driver, expected);
        if (violations === null) {
          fail(`  ${page}: the CSP listener did not install — nothing was checked.`);
        } else {
          const unexpected = violations.filter((v) => !expected.includes(v));
          const neverArrived = expected.filter((a) => !violations.includes(a));
          log(`  ${page} @ ${width}px · CSP: ${violations.length} violation(s), ${unexpected.length} unexpected`);
          if (unexpected.length > 0) {
            fail(
              `  ${page}: the policy in _headers refuses something nobody planned for:\n` +
                unexpected.map((v) => `    ${v}`).join('\n') +
                '\n    If it is legitimate, add it to CSP_EXPECTED or to the policy — with a reason.',
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
          if (neverArrived.length > 0) {
            fail(
              `  ${page}: these expected violations did not arrive within ${CEILING} ms:\n` +
                neverArrived.map((v) => `    ${v}`).join('\n') +
                '\n    Either the CMS no longer reaches for those origins — remove them from CSP_EXPECTED — ' +
                'or the page never got as far as starting, in which case this check proved nothing.',
            );
          }
        }

        if (NO_AXE.includes(page)) continue;

        const response = await runAxe(driver);
        if (!response?.ok) {
          fail(`  ${page}: axe did not run — ${response?.e ?? 'no result'}`);
          await prepare(driver, condition);
          continue;
        }
        const audit = response.r;
        const commandsRun = [...(audit.passes ?? []), ...(audit.violations ?? []), ...(audit.incomplete ?? [])];
        // If color-contrast never ran, "0 violations" says nothing at all.
        if (!commandsRun.some((r) => r.id === 'color-contrast')) {
          fail(`  ${page}: the color-contrast rule did not run — a clean result would prove nothing.`);
        }
        log(
          `    axe: ${audit.violations.length} violation(s), ${audit.incomplete.length} incomplete, ` +
            `${audit.passes.length} rule(s) passed`,
        );
        /*
         * The rule IDS, not just how many - off by default because they are
         * three long lines per page per condition, and on demand because they
         * are what a differential against another engine is diffed on. The
         * counts above are a summary of this; `docs/a11y-differential.md` says
         * what to do with it.
         */
        if (process.env.A11Y_RULES) {
          for (const [kind, list] of [
            ['passes', audit.passes],
            ['violations', audit.violations],
            ['incomplete', audit.incomplete],
          ]) {
            const ids = (list ?? []).map((r) => r.id).sort();
            log(`    RULES ${page} ${condition.label} ${kind} (${ids.length}): ${ids.join(' ')}`);
          }
        }
        for (const v of audit.violations) {
          fail(`  ${page} [${v.impact ?? 'n/a'}] ${v.id}: ${v.help}`);
          for (const node of v.nodes ?? []) log(`      ${(node.target ?? []).join(' ')}`);
        }
        for (const undecided of audit.incomplete ?? []) {
          if (undecided.id !== 'color-contrast') continue;
          /*
           * THE EXEMPTION IS VISIBLE, NOT SILENT. The SVG-text nodes are
           * printed with a label naming the declared gap; only the in-scope
           * incompletes fail. `svgTextIncompletes` returns nothing for anything
           * it cannot clearly place inside an inline SVG, so a node it is
           * unsure about lands in `inScope` and the pass fails - which is the
           * direction that must stay.
           */
          const exempt = svgTextIncompletes(undecided);
          const inScope = (undecided.nodes ?? []).filter((node) => !exempt.includes(node));
          const printNodes = (nodes) => {
            for (const node of nodes) {
              log(`      ${(node.target ?? []).join(' ')}`);
              const reason = (node.any ?? []).map((a) => a.message).filter(Boolean).join('; ');
              if (reason) log(`        ${reason}`);
            }
          };
          if (inScope.length > 0) {
            fail(`  ${page}: contrast undetermined (usually text over a gradient or an image):`);
            printNodes(inScope);
          }
          if (exempt.length > 0) {
            log(
              `    ${page}: ${exempt.length} contrast incomplete(s) exempted as the declared ` +
                'SVG-text gap (HONEST SCOPE at the top of this file), printed rather than failed:',
            );
            printNodes(exempt);
          }
        }

        // `runAxe` re-enabled script execution to run axe; put the
        // condition back before the next page loads.
        await prepare(driver, condition);
      }

      if (extraCheck) {
        const result = await extraCheck(driver, condition, url);
        if (result !== null) fail(`  ${result}`);
        await prepare(driver, condition);
      }
    }
  } finally {
    await driver.quit();
    server.close();
  }

  log(failed ? '\nAUDIT FAILED.' : '\nAudit passed.');
  return !failed;
}

/* -------------------------------------------------------------------------- *
 * Command line: `node scripts/a11y.mjs [--mobile|--wide]`.
 * -------------------------------------------------------------------------- */
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  /*
   * The arguments are not parsed here - they are LOOKED UP in `PASSES`, which
   * is the same table the coverage check reads. A flag this file understood but
   * the table did not would be a pass whose widths nothing counts; a flag the
   * table declares but `package.json` never passes is caught by
   * `checkPasses`. There is no third place where the two could disagree.
   */
  const args = process.argv.slice(2);
  const key = Object.keys(PASSES).find(
    (k) =>
      PASSES[k].file === THIS_FILE &&
      PASSES[k].args.length === args.length &&
      PASSES[k].args.every((a, i) => a === args[i]),
  );
  if (key === undefined) {
    console.log(`Arguments PASSES does not describe: ${args.join(' ') || '(none)'}.`);
    console.log('Passes started from this file:');
    for (const [k, t] of Object.entries(PASSES)) {
      if (t.file === THIS_FILE) console.log(`  ${passCommand(t)}   (${k})`);
    }
    process.exit(1);
  }
  process.exit((await runAudit({ dist: 'dist', pass: key })) ? 0 : 1);
}
