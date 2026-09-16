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
 *   - viewports other than the ones listed in `CONDITII`. This is the one
 *     disclaimer here that is also a check: `verificaPraguri` derives the
 *     breakpoints from the built CSS and fails when they cut out a band of
 *     widths no condition audits, so "unaudited branch" is a red build rather
 *     than a caveat. What stays uncovered is width WITHIN a band, and any axis
 *     that is not width.
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
 */
const FARA_AXE = ['admin/index.html'];

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
 * So the set is read out of the CSS of the pages this audit actually loads, and
 * two things are asserted against it:
 *
 *   (a) every query a condition DECLARES is still a breakpoint the CSS has - so
 *       a breakpoint that moves is named immediately, at its old value;
 *   (b) every band the breakpoints cut the width axis into contains at least one
 *       audited viewport - so a breakpoint that is ADDED, which (a) cannot see,
 *       fails as soon as it opens a band nothing looks at.
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
  const bucati = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
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
    bucati.push(readFileSync(join(dist, cale), 'utf8'));
  }
  return bucati.join('\n');
}

/**
 * Every width breakpoint the given built pages declare, sorted, deduplicated by
 * where it cuts the width axis, each carrying the pages it was found in.
 */
export function pragurile(dist, pagini) {
  const dupaLimita = new Map();
  const probleme = [];
  for (const pagina of pagini) {
    let css;
    try {
      css = cssPaginii(dist, pagina);
    } catch (e) {
      probleme.push(e.message);
      continue;
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
  return { praguri: [...dupaLimita.values()].sort((a, b) => a.limita - b.limita), probleme };
}

/** How a breakpoint reads in output: the query as the CSS writes it, plus its px. */
function scriePrag(p) {
  return `${[...p.texte].join('/')} = ${p.px}px (${[...p.surse].join(', ')})`;
}

/**
 * The two assertions the derived set supports, as lines to print and problems to
 * report. `latimeImplicita` is the measured default viewport.
 *
 * The matrix is the WHOLE of `CONDITII`, not the subset this run happens to
 * audit: the claim is about what `npm run test:all` covers between all four
 * passes, so an uncovered band must fail every one of them rather than whichever
 * one happens to contain the guilty width.
 */
export function verificaPraguri({ praguri, probleme }, latimeImplicita) {
  const esecuri = [...probleme];
  const latimi = [...new Set(Object.values(CONDITII).map((c) => c.latime ?? latimeImplicita))].sort((a, b) => a - b);
  const linii = [
    `praguri din CSS-ul construit: ${praguri.length > 0 ? praguri.map(scriePrag).join(' · ') : '(niciunul)'}`,
    `lățimi auditate de CONDITII: ${latimi.join(', ')}px (implicita măsurată: ${latimeImplicita}px)`,
  ];

  // A guard that reads files must prove it read something.
  if (praguri.length === 0) {
    esecuri.push(
      'paginile auditate nu declară niciun prag de lățime. Ori CSS-ul construit le-a pierdut, ' +
        'ori comparatii() nu le mai recunoaște — în ambele cazuri acoperirea de mai jos nu ar dovedi nimic.',
    );
    return { linii, esecuri };
  }

  // (a) Every query a condition declares still names a breakpoint the CSS has.
  const declarate = new Set(Object.values(CONDITII).flatMap((c) => Object.keys(c.medii)));
  for (const interogare of [...declarate].sort()) {
    const { gasite } = comparatii(interogare);
    const limite = gasite.map((g) => g.limita);
    if (limite.length !== 1) {
      esecuri.push(`CONDITII declară "${interogare}", pe care comparatii() nu o citește ca un singur prag.`);
      continue;
    }
    if (!praguri.some((p) => p.limita === limite[0])) {
      esecuri.push(
        `CONDITII declară "${interogare}", dar CSS-ul construit nu mai are un prag acolo.\n` +
          `    Praguri găsite: ${praguri.map(scriePrag).join(' · ')}.\n` +
          '    Un prag s-a mutat: mută-l și aici, și verifică ce lățime îl mai auditează.',
      );
    }
  }

  // (b) Every band between breakpoints contains at least one audited width.
  const limite = praguri.map((p) => p.limita);
  for (let i = 0; i <= limite.length; i += 1) {
    const jos = i === 0 ? 0 : limite[i - 1] + 1;
    const sus = i === limite.length ? Number.POSITIVE_INFINITY : limite[i];
    if (latimi.some((l) => l >= jos && l <= sus)) continue;
    const vecine = praguri.filter((p) => p.limita === limite[i - 1] || p.limita === limite[i]).map(scriePrag);
    esecuri.push(
      `nicio trecere nu auditează lățimile ${jos}-${sus === Number.POSITIVE_INFINITY ? '∞' : sus}px.\n` +
        `    Banda e delimitată de: ${vecine.join(' · ')}.\n` +
        '    Adaugă în CONDITII o condiție cu o lățime din bandă (și pune-o în scripturile din package.json), ' +
        'sau scrie aici de ce ramura aceea nu trebuie auditată.',
    );
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
 * `cerinta` is an optional check run ONCE PER CONDITION, after that condition's
 * page loop, for things only one build can show - the week picker's bar, which
 * needs two rendered weeks. It navigates itself, so it is not tied to whichever
 * page the loop happened to leave loaded, and its line appears once per
 * condition in the output.
 */
export async function auditeaza({ dist, conditii, eticheta, cerinta = null, spune = console.log }) {
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
     * whole matrix is checked against the CSS's own breakpoints here rather than
     * inside the loop, because the claim is about all of `CONDITII` and must
     * fail every pass, not only the one running.
     */
    await driver.sendDevToolsCommand('Emulation.clearDeviceMetricsOverride', {});
    await driver.get(`http://localhost:${port}${CALE_CONTROL}`);
    const latimeImplicita = await driver.executeScript('return window.innerWidth');
    const { linii, esecuri } = verificaPraguri(pragurile(dist, deAuditat), latimeImplicita);
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
  const mobil = process.argv.includes('--mobil');
  const larg = process.argv.includes('--larg');
  const conditii = mobil
    ? [CONDITII.telefon, CONDITII.telefonFaraJs]
    : larg
      ? [CONDITII.larg, CONDITII.largFaraJs]
      : [CONDITII.birou, CONDITII.birouFaraJs];
  const eticheta = mobil
    ? 'axe la lățime de telefon (390px)'
    : larg
      ? 'axe peste pragul de 62rem (1100px)'
      : 'axe la lățimea implicită';
  process.exit((await auditeaza({ dist: 'dist', conditii, eticheta })) ? 0 : 1);
}
