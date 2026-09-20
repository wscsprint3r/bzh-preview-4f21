/*
 * The sitemap's positive control: a scratch build with `INDEXABLE = true`.
 *
 * The flag is `false` in this repository by design, so the normal build
 * contains no sitemap and no robots.txt — and a guard that only checked their
 * absence would pass just as well if the routes never existed. This copies the
 * project the way `a11y-picker.mjs` does, flips the one line, builds, and
 * asserts the files are there, absolute, and correct; then asserts the real
 * `dist/` has neither. Both directions, one run.
 *
 * ---------------------------------------------------------------------------
 * THE STATE OF `src/lib/site.ts` DECIDES WHICH DIRECTION THE REAL `dist/` IS,
 * because this check has to survive its own cutover. While the flag is false the
 * real build must contain neither file and ABSENCE is the claim, so the scratch
 * build is the presence control. After the DNS cutover flips the flag to true
 * the real build must contain both and PRESENCE is the claim — and a patch
 * guard that demanded the literal `false` line would fail on a state that is
 * correct, turning CI red for the cutover itself. So the assignment is read
 * from the real file: false is patched in the scratch copy and asserted absent
 * from the real `dist/`; true is left alone and asserted present there. A file
 * with no such assignment fails by name rather than guessing a state.
 *
 * MISSING `dist/` IS NOT ABSENCE. `existsSync` on a file in a directory that is
 * not there is false, so without the pre-build guard on `dist/index.html` a
 * fresh clone, or a checkout after `rm -rf dist`, printed "both absent from
 * dist/" and exited 0 having read nothing — the vacuous pass this repository's
 * guards exist to make impossible.
 *
 * AND `process.exit` INSIDE THE `try` IS NOT CLEANUP. It terminates without
 * unwinding, so every failing run of the first version leaked its scratch copy;
 * `a11y-picker.mjs` documents the same measured defect at its own command line.
 * The work lives in an async `main()` that returns, and the only `process.exit`
 * is the one after it, so the `finally` really runs.
 * ---------------------------------------------------------------------------
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

const ROOT = process.cwd();

/** The one line both this check and the build turn on. */
const ASSIGNMENT = /export const INDEXABLE = (true|false);/;

/*
 * THE SITEMAP'S FIXED ROUTES, WRITTEN OUT BY HAND, copied from `FIXED_PATHS` in
 * `src/lib/sitemap.ts`. Read from the artifact rather than imported so a fixed
 * route added to the build without a line here fails the count below — the same
 * shape as the expected CSP: a copy that follows the artifact cannot notice the
 * artifact changing.
 */
const FIXED_PATHS = [
  '/',
  '/program/',
  '/noutati/',
  '/evenimente/',
  '/galerie/',
  '/pastorale/',
  '/contact/',
  '/doneaza/',
];

/** `articleSlug`'s one rule, so a migrated article's public slug is derived here too. */
const DATE_PREFIX = /^\d{4}-\d{2}-\d{2}-/;

/** Prints the reason and answers null, which every caller returns onward. */
function fail(message) {
  console.error(`\n${message}\n`);
  return null;
}

/** One content file's frontmatter, parsed. Fails by name when the block is absent. */
function frontmatter(file) {
  const text = readFileSync(file, 'utf8');
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (block === null) return fail(`${file} has no frontmatter block.`);
  return parseYaml(block[1]);
}

/**
 * The URL set the scratch project's content produces, or null after printing why
 * not. This is what the sitemap's `<loc>` list is compared against, so a
 * sitemap that dropped the `publishedArticles` filter — or one that lost a
 * route — is named rather than counted.
 *
 * `new URL(path, ...)` and a Set, exactly as `sitemapPaths` builds it: two
 * pages whose `path` is a fixed route (`/contact/`, `/doneaza/`) collapse to one
 * URL there, and the expected set must collapse them the same way or the count
 * would be wrong for the right build.
 */
function expectedSitemap(project) {
  const content = (name) => join(project, 'src/content', name);
  const files = (name) => readdirSync(content(name)).filter((f) => f.endsWith('.md'));
  const named = [];

  const pageFiles = files('pages');
  for (const file of pageFiles) {
    const data = frontmatter(join(content('pages'), file));
    if (data === null) return null;
    if (typeof data.path !== 'string') return fail(`${file} has no path frontmatter, so its URL cannot be derived.`);
    named.push(`/${data.path}/`);
  }

  const albumFiles = files('galerii');
  for (const file of albumFiles) named.push(`/galerie/${file.slice(0, -'.md'.length)}/`);

  const eventFiles = files('events');
  for (const file of eventFiles) named.push(`/evenimente/${file.slice(0, -'.md'.length)}/`);

  const published = [];
  const unpublished = [];
  const articleFiles = files('articles');
  for (const file of articleFiles) {
    const data = frontmatter(join(content('articles'), file));
    if (data === null) return null;
    if (typeof data.published !== 'boolean') {
      return fail(`${file} has no boolean published field, so the sitemap's filter cannot be checked.`);
    }
    const slug = file.slice(0, -'.md'.length).replace(DATE_PREFIX, '');
    (data.published ? published : unpublished).push(`/noutati/${slug}/`);
  }

  const expected = new Set([...FIXED_PATHS, ...named, ...published]);
  return {
    expected,
    published,
    unpublished,
    counts: {
      pages: pageFiles.length,
      albums: albumFiles.length,
      events: eventFiles.length,
      articles: articleFiles.length,
      named: FIXED_PATHS.length + named.length + published.length,
    },
  };
}

/**
 * The scratch build's sitemap and robots, or null after printing why not.
 *
 * Returns the URL count and its parts so the verdict can print them. The
 * assertions are the same in both states: the scratch build always runs with
 * the flag true, so it is always the build whose files must be there.
 */
function validate(project) {
  const sitemap = join(project, 'dist/sitemap-index.xml');
  const robots = join(project, 'dist/robots.txt');
  if (!existsSync(sitemap) || !existsSync(robots)) {
    return fail('INDEXABLE=true produced no sitemap-index.xml and/or robots.txt — the routes are dead.');
  }
  const xml = readFileSync(sitemap, 'utf8');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  if (locs.length < 10 || !locs.every((l) => l.startsWith('https://www.bor-zh.ch/'))) {
    return fail(`the sitemap names ${locs.length} URLs and not all are absolute www URLs.`);
  }

  /*
   * THE PUBLISHED FILTER, WHICH NOTHING CHECKED BEFORE. The route uses
   * `publishedArticles`; a sitemap built from `getCollection('articles')` would
   * advertise every held-back post's URL, and every visible check — the file
   * exists, the URLs are absolute — would still pass. Both halves are asserted
   * against the content files themselves: a published slug is present, a
   * held-back slug is absent, and the whole set is compared so a route lost in
   * either direction is named.
   */
  const expected = expectedSitemap(project);
  if (expected === null) return null;
  const url = (path) => new URL(path, 'https://www.bor-zh.ch/').toString();
  const found = new Set(locs);
  const missing = [...expected.expected].filter((path) => !found.has(url(path)));
  const extra = locs.filter((loc) => !expected.expected.has(new URL(loc).pathname));
  if (missing.length > 0 || extra.length > 0) {
    return fail(
      `the sitemap disagrees with the content: missing ${missing.length} ` +
        `(${missing.slice(0, 4).join(', ') || 'none'}), unexpected ${extra.length} ` +
        `(${extra.slice(0, 4).join(', ') || 'none'}). A missing /noutati/ URL means the published ` +
        'list is short; an unexpected one means a held-back article leaked into the sitemap.',
    );
  }
  if (locs.length !== expected.expected.size) {
    const c = expected.counts;
    return fail(
      `the sitemap has ${locs.length} URLs, expected ${expected.expected.size}: ` +
        `${FIXED_PATHS.length} fixed + ${c.pages} pages + ${c.albums} albums + ${c.events} events + ` +
        `${expected.published.length} published articles, de-duplicated by path.`,
    );
  }

  const robotsText = readFileSync(robots, 'utf8');
  if (!robotsText.includes('Sitemap: https://www.bor-zh.ch/sitemap-index.xml') || /Disallow/.test(robotsText)) {
    return fail('robots.txt is missing its Sitemap line, or carries a Disallow that must never exist.');
  }
  return {
    count: locs.length,
    counts: expected.counts,
    published: expected.published.length,
    heldBack: expected.unpublished.length,
  };
}

async function main() {
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

    /*
     * THE STATE IS READ FROM THE REAL FILE, before anything is patched, so the
     * two directions of the final assertion can never be guessed from a
     * hardcoded expectation. A `site.ts` without the assignment is a failure by
     * name, not a state to assume.
     */
    const assignment = ASSIGNMENT.exec(readFileSync(join(ROOT, 'src/lib/site.ts'), 'utf8'));
    if (assignment === null) {
      return fail(
        'src/lib/site.ts carries no `export const INDEXABLE = true|false;` — this check cannot say '
          + 'which state the build is in, and guessing is how a control proves nothing.',
      );
    }
    const indexable = assignment[1] === 'true';

    /*
     * A MISSING `dist/` IS NOT AN ABSENT FILE. The guard is the positive control
     * for the absence assertion below: without it, a fresh clone or a checkout
     * after `rm -rf dist` finds no file because there is no directory, and
     * reports the gated state as proven.
     */
    if (!existsSync(join(ROOT, 'dist/index.html'))) {
      return fail('the real dist/ is not built, so its absence proves nothing; run the build first.');
    }

    if (!indexable) {
      const scratchSite = join(project, 'src/lib/site.ts');
      const before = readFileSync(scratchSite, 'utf8');
      const after = before.replace(ASSIGNMENT, 'export const INDEXABLE = true;');
      if (after === before) {
        return fail('site.ts no longer carries `export const INDEXABLE = false;` — this check patched nothing.');
      }
      writeFileSync(scratchSite, after);
    }

    execFileSync(
      process.execPath,
      [join(ROOT, 'node_modules/astro/bin/astro.mjs'), 'build', '--root', project, '--config', 'astro.indexable.config.mjs'],
      { stdio: 'inherit', cwd: project },
    );

    const result = validate(project);
    if (result === null) return false;
    const c = result.counts;
    const duplicates = c.named - result.count;
    const breakdown =
      `${FIXED_PATHS.length} fixed + ${c.pages} pages + ${c.albums} albums + ${c.events} events + ` +
      `${result.published} published (${result.heldBack} held back), ` +
      `${duplicates} path${duplicates === 1 ? '' : 's'} de-duplicated`;

    if (indexable) {
      for (const name of ['sitemap-index.xml', 'robots.txt']) {
        if (existsSync(join(ROOT, 'dist', name))) continue;
        return fail(`INDEXABLE is true, but the real dist/${name} is missing — the routes are dead.`);
      }
      console.log(`indexable check: ${result.count} URLs — ${breakdown}, robots.txt clean, both present in dist/ (the flag is already true)`);
    } else {
      for (const name of ['sitemap-index.xml', 'robots.txt']) {
        if (!existsSync(join(ROOT, 'dist', name))) continue;
        return fail(`dist/${name} exists while INDEXABLE is false — the flag does not gate it.`);
      }
      console.log(`indexable check: ${result.count} URLs — ${breakdown}, robots.txt clean, both absent from dist/`);
    }
    return true;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

process.exit((await main()) ? 0 : 1);