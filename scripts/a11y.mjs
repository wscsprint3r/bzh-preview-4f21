/*
 * Runs axe-core over every built page in a real headless Chrome.
 *
 * This is the guard that owns contrast on this site. A static scan of CSS text
 * cannot do it: specificity, @layer, media context and source order across
 * stylesheets are cascade rules, and anything asserting over CSS text is
 * re-implementing the cascade. A browser is the only correct implementation of
 * it, so a browser is what checks. axe computes the real computed style of
 * every text node against its real background, including one inherited from an
 * ancestor — which is most of them.
 *
 * Run with `npm run a11y`, which builds first so dist/ is never stale.
 */
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';

const DIST = 'dist';
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
  const urls = pagini.map((p) => {
    const rel = p.slice(DIST.length).replace(/index\.html$/, '');
    return `http://localhost:${port}${rel}`;
  });

  console.log(`axe peste ${urls.length} pagină(i):`);
  for (const u of urls) console.log(`  ${u}`);

  // spawn, not spawnSync: spawnSync blocks the event loop, so the server above
  // could never answer axe and the two would deadlock.
  const proces = spawn(
    'node_modules/.bin/axe',
    [...urls, '--chrome-options=headless,no-sandbox,disable-gpu', '--exit'],
    { stdio: 'inherit' },
  );

  proces.on('close', (cod) => {
    server.close();
    if (cod !== 0) console.error('\naxe a raportat încălcări de accesibilitate (inclusiv contrast).');
    process.exit(cod ?? 1);
  });
});
