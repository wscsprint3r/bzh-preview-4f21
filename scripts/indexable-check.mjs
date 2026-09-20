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
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = process.cwd();

/** The one line both this check and the build turn on. */
const ASSIGNMENT = /export const INDEXABLE = (true|false);/;

/** Prints the reason and answers null, which every caller returns onward. */
function fail(message) {
  console.error(`\n${message}\n`);
  return null;
}

/**
 * The scratch build's sitemap and robots, or null after printing why not.
 *
 * Returns the URL count so the verdict can print it. The assertions are the
 * same in both states: the scratch build always runs with the flag true, so it
 * is always the build whose files must be there.
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
  const robotsText = readFileSync(robots, 'utf8');
  if (!robotsText.includes('Sitemap: https://www.bor-zh.ch/sitemap-index.xml') || /Disallow/.test(robotsText)) {
    return fail('robots.txt is missing its Sitemap line, or carries a Disallow that must never exist.');
  }
  return locs.length;
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

    const count = validate(project);
    if (count === null) return false;

    if (indexable) {
      for (const name of ['sitemap-index.xml', 'robots.txt']) {
        if (existsSync(join(ROOT, 'dist', name))) continue;
        return fail(`INDEXABLE is true, but the real dist/${name} is missing — the routes are dead.`);
      }
      console.log(`indexable check: ${count} URLs, robots.txt clean, both present in dist/ (the flag is already true)`);
    } else {
      for (const name of ['sitemap-index.xml', 'robots.txt']) {
        if (!existsSync(join(ROOT, 'dist', name))) continue;
        return fail(`dist/${name} exists while INDEXABLE is false — the flag does not gate it.`);
      }
      console.log(`indexable check: ${count} URLs, robots.txt clean, both absent from dist/`);
    }
    return true;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

process.exit((await main()) ? 0 : 1);