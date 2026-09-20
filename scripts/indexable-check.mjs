/*
 * The sitemap's positive control: a scratch build with `INDEXABLE = true`.
 *
 * The flag is `false` in this repository by design, so the normal build
 * contains no sitemap and no robots.txt — and a guard that only checked their
 * absence would pass just as well if the routes never existed. This copies the
 * project the way `a11y-picker.mjs` does, flips the one line, builds, and
 * asserts the files are there, absolute, and correct; then asserts the real
 * `dist/` has neither. Both directions, one run.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = process.cwd();

function fail(message) {
  console.error(`\n${message}\n`);
  process.exitCode = 1;
}

const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'indexable-')));
try {
  const project = join(scratch, 'project');
  mkdirSync(project);
  for (const name of ['src', 'public', 'scripts', 'astro.config.mjs', 'tsconfig.json', 'package.json']) {
    cpSync(join(ROOT, name), join(project, name), { recursive: true });
  }
  mkdirSync(join(project, 'docs'), { recursive: true });
  cpSync(join(ROOT, 'docs/url-map.csv'), join(project, 'docs/url-map.csv'));
  symlinkSync(join(ROOT, 'node_modules'), join(project, 'node_modules'));
  const cache = join(project, 'cache');
  mkdirSync(cache, { recursive: true });
  const sharedAssets = join(ROOT, 'node_modules/.astro/assets');
  if (existsSync(sharedAssets)) symlinkSync(sharedAssets, join(cache, 'assets'));
  writeFileSync(
    join(project, 'astro.indexable.config.mjs'),
    `import base from './astro.config.mjs';\n` +
      `export default { ...base, cacheDir: ${JSON.stringify(cache)} };\n`,
  );

  const siteFile = join(project, 'src/lib/site.ts');
  const before = readFileSync(siteFile, 'utf8');
  const after = before.replace('export const INDEXABLE = false;', 'export const INDEXABLE = true;');
  if (after === before) {
    fail('site.ts no longer carries `export const INDEXABLE = false;` — this check patched nothing.');
    process.exit(1);
  }
  writeFileSync(siteFile, after);

  execFileSync(
    process.execPath,
    [join(ROOT, 'node_modules/astro/bin/astro.mjs'), 'build', '--root', project, '--config', 'astro.indexable.config.mjs'],
    { stdio: 'inherit', cwd: project },
  );

  const sitemap = join(project, 'dist/sitemap-index.xml');
  const robots = join(project, 'dist/robots.txt');
  if (!existsSync(sitemap) || !existsSync(robots)) {
    fail('INDEXABLE=true produced no sitemap-index.xml and/or robots.txt — the routes are dead.');
    process.exit(1);
  }
  const xml = readFileSync(sitemap, 'utf8');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  if (locs.length < 10 || !locs.every((l) => l.startsWith('https://www.bor-zh.ch/'))) {
    fail(`the sitemap names ${locs.length} URLs and not all are absolute www URLs.`);
    process.exit(1);
  }
  const robotsText = readFileSync(robots, 'utf8');
  if (!robotsText.includes('Sitemap: https://www.bor-zh.ch/sitemap-index.xml') || /Disallow/.test(robotsText)) {
    fail('robots.txt is missing its Sitemap line, or carries a Disallow that must never exist.');
    process.exit(1);
  }

  for (const name of ['sitemap-index.xml', 'robots.txt']) {
    if (existsSync(join(ROOT, 'dist', name))) {
      fail(`dist/${name} exists while INDEXABLE is false — the flag does not gate it.`);
      process.exit(1);
    }
  }
  console.log(`indexable check: ${locs.length} URLs, robots.txt clean, both absent from dist/`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}