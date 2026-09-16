/*
 * Runs axe-core over every built page in a real headless Chrome.
 *
 * This is the guard that owns contrast on this site. A static scan of CSS text
 * cannot do it: specificity, @layer, media context and source order across
 * stylesheets are cascade rules, and anything asserting over CSS text is
 * re-implementing the cascade. A browser is the only correct implementation of
 * it, so a browser is what checks.
 *
 * WHAT IT DOES: for the elements axe evaluates, it reads the computed colour
 * and the computed background — including one inherited from an ancestor, which
 * is where most of this site's rules get theirs — and compares them. It does
 * not visit every text node; the exclusions below are the ones that matter.
 *
 * ---------------------------------------------------------------------------
 * HONEST SCOPE. A green run means exactly this and no more:
 *
 *   No failing text reaches a visitor IN THE DEFAULT STATE, ON A FLAT
 *   BACKGROUND, AT ~750px, DARK-SCHEME, ON A BUILT PAGE.
 *
 * It does NOT cover:
 *   - text over a gradient or a background-image. axe reports those as
 *     `incomplete` rather than as a pass, and the CLI still exits 0 — so this
 *     script fails on any `incomplete` for color-contrast and prints the
 *     selector. "Could not determine" is a decision someone makes, not a
 *     silence.
 *   - :hover, :focus and :active states
 *   - anything display:none, visibility:hidden, opacity:0 or [hidden]. Task 10's
 *     week picker hides all but one week with `hidden`, so the content that task
 *     exists to manage is invisible to this guarantee.
 *   - off-screen text
 *   - media queries outside the audit viewport. It measures at 701-800 CSS px,
 *     so this site's 34rem phone breakpoint is never audited here.
 *   - colour-scheme branches other than dark
 *   - ::before / ::after content, and SVG <text>
 *   - pages that were not built when the audit ran
 *   - non-hex colour literals, which neither this nor the hex guard catches
 * ---------------------------------------------------------------------------
 *
 * Run with `npm run a11y`, or as the last step of `npm run test:build`.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';

const DIST = 'dist';
const NUME_REZULTATE = 'rezultate.json';
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
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
};

function paginile(dir = DIST) {
  const gasite = [];
  for (const intrare of readdirSync(dir, { withFileTypes: true })) {
    const cale = join(dir, intrare.name);
    if (intrare.isDirectory()) gasite.push(...paginile(cale));
    else if (intrare.name.endsWith('.html')) gasite.push(cale);
  }
  return gasite.sort();
}

// A guard that reads files must prove it read something: without this, a
// missing build would make an empty page list pass silently.
if (!existsSync(DIST)) {
  console.error(`${DIST}/ nu există — rulează mai întâi build-ul.`);
  process.exit(1);
}
const pagini = paginile();
if (pagini.length === 0) {
  console.error(`${DIST}/ nu conține nicio pagină .html.`);
  process.exit(1);
}

const dirIesire = mkdtempSync(join(tmpdir(), 'axe-'));

const server = createServer((req, res) => {
  let cale = decodeURIComponent(req.url.split('?')[0]);
  if (cale.endsWith('/')) cale += 'index.html';
  const fisier = join(DIST, cale);
  if (!existsSync(fisier) || !statSync(fisier).isFile()) {
    res.writeHead(404);
    res.end('404');
    return;
  }
  res.writeHead(200, { 'Content-Type': TIPURI[extname(fisier)] ?? 'application/octet-stream' });
  res.end(readFileSync(fisier));
});

server.listen(0, () => {
  const port = server.address().port;
  const urls = pagini.map((p) => `http://localhost:${port}${p.slice(DIST.length).replace(/index\.html$/, '')}`);

  console.log(`axe peste ${urls.length} pagină(i):`);
  for (const u of urls) console.log(`  ${u}`);

  // spawn, not spawnSync: spawnSync blocks the event loop, so the server above
  // could never answer axe and the two would deadlock.
  const proces = spawn(
    'node_modules/.bin/axe',
    [
      ...urls,
      '--chrome-options=headless,no-sandbox,disable-gpu',
      '--exit',
      '--save',
      NUME_REZULTATE,
      '--dir',
      dirIesire,
    ],
    { stdio: 'inherit' },
  );

  proces.on('close', (cod) => {
    server.close();
    let esec = cod !== 0;

    const fisier = join(dirIesire, NUME_REZULTATE);
    if (!existsSync(fisier)) {
      console.error('axe nu a scris niciun rezultat — auditul nu a rulat.');
      rmSync(dirIesire, { recursive: true, force: true });
      process.exit(1);
    }

    const rezultate = JSON.parse(readFileSync(fisier, 'utf8'));
    const audituri = Array.isArray(rezultate) ? rezultate : [rezultate];
    if (audituri.length !== urls.length) {
      console.error(`axe a raportat ${audituri.length} audit(uri) pentru ${urls.length} pagină(i).`);
      esec = true;
    }

    for (const audit of audituri) {
      const rulate = [...(audit.passes ?? []), ...(audit.violations ?? []), ...(audit.incomplete ?? [])];
      // If color-contrast never ran, "0 violations" says nothing at all.
      if (!rulate.some((r) => r.id === 'color-contrast')) {
        console.error(`\nRegula color-contrast nu a rulat pe ${audit.url} — un rezultat curat nu ar dovedi nimic.`);
        esec = true;
      }
      for (const nedecis of audit.incomplete ?? []) {
        if (nedecis.id !== 'color-contrast') continue;
        esec = true;
        console.error(`\nContrast nedeterminat pe ${audit.url} (de obicei text peste un gradient sau o imagine):`);
        for (const nod of nedecis.nodes ?? []) {
          console.error(`  ${(nod.target ?? []).join(' ')}`);
          const motiv = (nod.any ?? []).map((a) => a.message).filter(Boolean).join('; ');
          if (motiv) console.error(`    ${motiv}`);
        }
      }
    }

    rmSync(dirIesire, { recursive: true, force: true });
    if (esec) console.error('\naxe: contrastul nu este dovedit pentru toate elementele.');
    process.exit(esec ? 1 : 0);
  });
});
