/*
 * Moves every root-absolute reference in a built tree under a path prefix, so
 * the site can be served from `https://<user>.github.io/<repo>/`.
 *
 * THIS IS PREVIEW-ONLY SCAFFOLDING. It lives on the `github-pages-preview`
 * branch beside `.github/workflows/pages.yml` and is deleted with it. The real
 * target is Cloudflare Pages at the domain root, where none of this is needed.
 *
 * WHY A REWRITE RATHER THAN ASTRO'S `base`. `base` rewrites the links Astro
 * itself generates. This site's links are hand-written — in components and in
 * the migrated markdown — and measured on the build of 2026-09-22 there are
 * 1,047 `href`, 108 `src`, 42 `srcset` and 544 `url()` root-absolute
 * references in the built HTML. `base` leaves every one of them pointing at
 * the domain root, which on a project site is somebody else's page.
 *
 * IT REFUSES TO DO NOTHING. A run that moves no reference exits non-zero: the
 * tree is already prefixed, or it is not a built site, and both are mistakes
 * worth stopping a deployment for rather than publishing a broken preview.
 *
 * `--verify` is the second half, and it asserts BOTH directions: no reference
 * still points at the domain root, and every reference that moved resolves to
 * a file in the tree. A positive control — one page that must be there — keeps
 * "nothing is missing" from being true of an empty set.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const verify = argv.includes('--verify');
const [dir, rawPrefix] = argv.filter((a) => a !== '--verify');

if (dir === undefined || rawPrefix === undefined) {
  console.error('usage: node scripts/pages-prefix.mjs [--verify] <dist dir> <prefix>');
  process.exit(2);
}
const prefix = `/${rawPrefix.replace(/^\/|\/$/g, '')}`;

/** Every file under `dir`, recursively. */
function filesUnder(d, found = []) {
  for (const entry of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, entry.name);
    if (entry.isDirectory()) filesUnder(p, found);
    else found.push(p);
  }
  return found;
}

/**
 * One URL, moved. A protocol-relative `//host/…` is another origin and is left
 * alone; a URL already under the prefix is left alone, so a second pass cannot
 * double it.
 */
function move(url) {
  if (!url.startsWith('/') || url.startsWith('//')) return url;
  if (url === prefix || url.startsWith(`${prefix}/`)) return url;
  return prefix + url;
}

/** The three shapes a root-absolute reference takes in this build's output. */
function rewrite(text) {
  let moved = 0;
  let out = text.replace(/\b(href|src|action|poster)="(\/[^"]*)"/g, (_whole, attr, url) => {
    const next = move(url);
    if (next !== url) moved += 1;
    return `${attr}="${next}"`;
  });
  out = out.replace(/\b(srcset|imagesrcset)="([^"]*)"/g, (_whole, attr, value) => {
    const candidates = value.split(',').map((part) => {
      const trimmed = part.trim();
      if (trimmed === '') return part;
      const [url, ...descriptor] = trimmed.split(/\s+/);
      const next = move(url);
      if (next !== url) moved += 1;
      return [next, ...descriptor].join(' ');
    });
    return `${attr}="${candidates.join(', ')}"`;
  });
  out = out.replace(/url\((['"]?)(\/[^)'"]*)\1\)/g, (_whole, quote, url) => {
    const next = move(url);
    if (next !== url) moved += 1;
    return `url(${quote}${next}${quote})`;
  });
  return { out, moved };
}

/** Every root-absolute reference on one page, whatever shape it came in. */
function referencesIn(html) {
  const urls = [];
  for (const m of html.matchAll(/\b(?:href|src|action|poster)="(\/[^"]*)"/g)) urls.push(m[1]);
  for (const m of html.matchAll(/\b(?:srcset|imagesrcset)="([^"]*)"/g)) {
    for (const part of m[1].split(',')) {
      const url = part.trim().split(/\s+/)[0];
      if (url !== undefined && url.startsWith('/')) urls.push(url);
    }
  }
  for (const m of html.matchAll(/url\((['"]?)(\/[^)'"]*)\1\)/g)) urls.push(m[2]);
  return urls;
}

const files = filesUnder(dir);
const pages = files.filter((f) => f.endsWith('.html'));

if (pages.length === 0) {
  console.error(`${dir} holds no HTML — this run would prove nothing. Build first.`);
  process.exit(1);
}

if (!verify) {
  let moved = 0;
  let touched = 0;
  for (const file of files) {
    if (!/\.(html|css|xml|svg)$/.test(file)) continue;
    const text = readFileSync(file, 'utf8');
    const result = rewrite(text);
    if (result.moved === 0) continue;
    writeFileSync(file, result.out);
    moved += result.moved;
    touched += 1;
  }
  process.stdout.write(
    `pages-prefix: ${moved} reference(s) moved under ${prefix}/ across ${touched} file(s)\n`,
  );
  if (moved === 0) {
    console.error('Nothing moved — the tree is already prefixed, or it is not a built site.');
    process.exit(1);
  }
  process.exit(0);
}

const prefixed = new Set();
const atRoot = new Map();
for (const page of pages) {
  for (const url of referencesIn(readFileSync(page, 'utf8'))) {
    if (url.startsWith('//')) continue;
    if (url === prefix || url.startsWith(`${prefix}/`)) prefixed.add(url.split(/[?#]/)[0]);
    else atRoot.set(url, (atRoot.get(url) ?? 0) + 1);
  }
}

const missing = [...prefixed].filter((ref) => {
  const rel = ref.slice(prefix.length).replace(/^\//, '');
  return ![join(dir, rel), join(dir, rel, 'index.html')].some(
    (c) => existsSync(c) && statSync(c).isFile(),
  );
});

// The positive control: a page that must be in every build of this site, so
// "0 missing" is a statement about the tree and not about an empty set.
const controlResolves = existsSync(join(dir, 'program', 'index.html'));

process.stdout.write(
  `pages-prefix --verify: ${pages.length} page(s), ${prefixed.size} distinct reference(s) under ${prefix}/\n` +
    `  still pointing at the domain root: ${atRoot.size}\n` +
    `  moved but not resolving:           ${missing.length}\n` +
    `  control ${prefix}/program/ resolves: ${controlResolves}\n`,
);
if (atRoot.size > 0) console.error('  at the root:', [...atRoot.keys()].slice(0, 10));
if (missing.length > 0) console.error('  not resolving:', missing.slice(0, 10));

process.exit(atRoot.size === 0 && missing.length === 0 && controlResolves ? 0 : 1);
