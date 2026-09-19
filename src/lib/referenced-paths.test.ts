import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

/*
 * WHAT THIS PROVES: every path this repository names in backticks is a path that
 * exists.
 *
 * `headers.itest.ts` already makes this claim about `public/_headers`, because a
 * security rule for a file that is not there looks exactly like a rule that
 * works. The same is true of a comment, and nothing was checking those.
 *
 * IT WAS NOT HYPOTHETICAL. The 2026-09-17 rename replaced identifiers inside
 * backtick spans - right for a name, wrong for a filename, and the two are
 * indistinguishable to anything short of a compiler. The CMS start-up script,
 * then called pornire.mjs, became startedAt.mjs in five places;
 * `scripts/page-scripts.mjs` became scripts/pageScripts.mjs in two; and two
 * planned migration scripts took an identifier's target as their name.
 * Fourteen references to files that do not exist, across two commits, with the
 * whole suite green: `npm test` reads code, not prose, and a path named in a
 * comment is prose.
 *
 * THE NAMES THAT ARE WRONG ARE WRITTEN WITHOUT BACKTICKS, ON PURPOSE, and so is
 * the planted path in the control below. This file is swept like every other, so
 * a backticked path here would have to exist - and the alternative, exempting the
 * one file whose whole subject is paths, is the arrangement `CLAUDE.md` already
 * rejects for the four cedilla codepoints: a file that spells out what it forbids
 * cannot be swept for it. The guard found this in itself the moment it was first
 * committed, which is the only reason anybody knows the rule is enforceable.
 *
 * THE DOCUMENTS ARE IN SCOPE, not an afterthought - twelve of the fourteen were
 * in `docs/`. A plan whose file names have rotted is a plan that sends the next
 * person looking for something that is not there.
 *
 * WHAT IT DOES NOT CLAIM. A backticked path is only checked for EXISTENCE. That
 * a comment describes the right file, or still describes it correctly, is not
 * something any parser can tell you.
 */

/** Tracked files, which is the subject: what git knows about, nothing else. */
const TRACKED = execSync('git ls-files', { encoding: 'utf8' }).trim().split('\n');
const TRACKED_SET = new Set(TRACKED);

/**
 * Paths that are named on purpose and are not there, with the reason for each.
 *
 * An explicit list rather than "skip anything under a directory that does not
 * exist", because the second is the shape that hides a real defect: rename a
 * directory and every reference into it goes quiet at once. Keyed by reason, so
 * a reason cannot be omitted, and asserted in BOTH directions below - a token
 * here that has since been written is a stale exemption and fails.
 */
const ABSENT_ON_PURPOSE: Record<string, readonly string[]> = {
  'inside an installed npm package or the vendored CMS bundle, which git does not track': [
    'chunks/react-dom.js',
    'dist/sveltia-cms.mjs',
    'public/admin/sveltia-cms.mjs',
    'schema/sveltia-cms.json',
    'sveltia-cms.js',
    'sveltia-cms.mjs',
  ],
  'outside this repository: the forensic backups in the parent folder, and the scratch ledger': [
    'NEW-DB-PASSWORD.txt',
    'backup-2026-08-27/database.sql.gz',
    'backup-2026-08-27/htdocs.tar.gz',
    'database.sql.gz',
    'htdocs.tar.gz',
    'htdocs/galerie.html',
    'localhost.sql',
    'task-1-report.md',
  ],
  "build output and the wrapper's report: untracked by design, so a clone that has not run a build or a test does not have them": [
    '.vitest/json/output.json',
    'dist/admin/index.html',
    'dist/index.html',
    'dist/program.ics',
    'dist/program/index.html',
  ],
  'named BECAUSE it must not exist - a rejected filename, a route that must 404, or the fixture for a broken reference': [
    '2026-02-30.yml',
    '2026-09-21.yaml',
    '2026-9-21.yml',
    'public/index.html',
    'robots.txt',
    'scripts/csp-browser.mjs',
    'settings.yaml',
    'src/content/services/2026-09-14.md',
  ],
  'historical: a design this project dropped, a workflow it renamed, or a filename quoted as a fragment': [
    'data.json',
    'nightly.yml',
    'test.ts',
    'web/.github/workflows/nightly.yml',
  ],
};

const EXEMPT = new Set(Object.values(ABSENT_ON_PURPOSE).flat());

const EXTENSION = /\.(ts|mjs|cjs|js|astro|md|ya?ml|json|css|html|ics|csv|svg|ico|woff2?|sql|gz|txt)$/i;

/**
 * Is this backticked token a path this repository is claiming exists?
 *
 * Deliberately narrow, and each exclusion is a thing that is not a path:
 *
 * - a leading `/` is a SITE ROUTE (`/program.ics`, `/admin/`), which is served,
 *   not stored, and whose file may be named nothing like it;
 * - a scheme (`astro:content`, `https:`, `data:`) is a specifier or a URL;
 * - a leading `@` is a scoped npm package;
 * - a host-shaped first segment (`unpkg.com/...`) is a URL with the scheme left
 *   off in prose;
 * - `...` is an elision a person wrote, not a directory;
 * - anything with whitespace, a glob or an interpolation is a pattern or a
 *   template, and `${…}` in particular would make this guard assert about a
 *   string that only exists at run time.
 */
export function isPathLike(token: string): boolean {
  if (!EXTENSION.test(token)) return false;
  if (/[\s<>${}*|()[\]]/.test(token) || token.includes('…')) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(token)) return false;
  if (token.startsWith('/') || token.startsWith('//')) return false;
  if (token.startsWith('@')) return false;
  if (token.includes('...')) return false;
  const segments = token.split('/');
  if (segments.length > 1 && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(segments[0] as string)) return false;
  return token.includes('/') || /^[\w-][\w.-]*\.[a-z0-9]+$/i.test(token);
}

/**
 * Four ways a token may be a real file, and no more than four.
 *
 * `web/` is stripped because the plan documents were written from the parent
 * directory, where this repository is the `web/` folder; the bare-basename rule
 * is what lets a comment say `week.ts` rather than `src/lib/week.ts`. Generous
 * resolution only risks a false PASS, so the list stays short on purpose.
 *
 * TRACKED FILES ONLY, PLUS `node_modules`, AND THAT IS THE FIX FOR A FRESH CLONE.
 * The root and `beside` arms used to be `existsSync`, which made this guard green
 * only in a working tree where something had already been built: `dist/` is
 * untracked, so `dist/index.html` resolved here and resolved to nothing in a
 * clone that had not run a build — and `npm test` runs BEFORE the build in
 * `test:all` and in `ci.yml`, so the first step of a fresh clone was red. Build
 * outputs are named in `ABSENT_ON_PURPOSE` with their reason now, and the
 * "no exemption has quietly become real" check below still fires if one is ever
 * committed.
 */
export function resolvesFrom(token: string, fromFile: string): boolean {
  const bare = token.replace(/^\.\//, '').replace(/^web\//, '');
  if (TRACKED_SET.has(bare)) return true;
  if (existsSync(join('node_modules', bare.replace(/^node_modules\//, '')))) return true;
  const beside = normalize(join(dirname(fromFile), token));
  if (TRACKED_SET.has(beside)) return true;
  return TRACKED.some((f) => f.endsWith(`/${bare}`));
}

/** Every backticked path-shaped token in these files that resolves to nothing. */
export function unresolvedPaths(
  files: readonly { path: string; text: string }[],
): { token: string; where: string }[] {
  const found: { token: string; where: string }[] = [];
  for (const { path, text } of files) {
    for (const m of text.matchAll(/`([^`\n]+)`/g)) {
      const token = m[1] as string;
      if (!isPathLike(token)) continue;
      if (resolvesFrom(token, path)) continue;
      const line = text.slice(0, m.index).split('\n').length;
      found.push({ token, where: `${path}:${line}` });
    }
  }
  return found;
}

const NUL = String.fromCodePoint(0);

/** Every tracked file this guard can read, with `package-lock.json` left out. */
function readable(): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  for (const path of TRACKED) {
    if (path === 'package-lock.json') continue;
    let text: string;
    try {
      text = readFileSync(path, 'utf8');
    } catch {
      continue;
    }
    if (text.includes(NUL)) continue;
    out.push({ path, text });
  }
  return out;
}

const FILES = readable();
const TOKENS = FILES.flatMap(({ path, text }) =>
  [...text.matchAll(/`([^`\n]+)`/g)].map((m) => m[1] as string).filter(isPathLike).map(() => path),
);

describe('the sweep really has something to sweep', () => {
  it('reads the tracked files, including the documents', () => {
    expect(FILES.length).toBeGreaterThan(80);
    expect(FILES.some((f) => f.path.startsWith('docs/'))).toBe(true);
    expect(FILES.some((f) => f.path.endsWith('.astro'))).toBe(true);
  });

  it('finds path-shaped tokens to check', () => {
    // Printed, not merely asserted: a later reader checks a claim against this
    // number, and vitest hides a passing test's `console.log`.
    process.stdout.write(
      `\nBackticked path-shaped tokens: ${TOKENS.length} across ${FILES.length} tracked files ` +
        `(${EXEMPT.size} paths named on purpose and absent)\n`,
    );
    expect(TOKENS.length).toBeGreaterThan(500);
  });
});

describe('the detector can fire', () => {
  it('reports a path that does not exist', () => {
    // The backticks are built from their codepoint rather than written, so this
    // file does not itself contain a backticked path that resolves to nothing -
    // see the note at the top. An escape would not do it: a backslash-u escape
    // decodes on its way to disk, which is the hazard `CLAUDE.md` documents.
    const tick = String.fromCodePoint(0x60);
    const absent = 'src/lib/does-not-exist.ts';
    const planted = [{ path: 'src/lib/probe.ts', text: `see ${tick}${absent}${tick} for it` }];
    expect(unresolvedPaths(planted)).toEqual([{ token: absent, where: 'src/lib/probe.ts:1' }]);
  });

  it('does not report a path that does exist, by any of the four routes', () => {
    const tick = String.fromCodePoint(0x60);
    const wrap = (...tokens: string[]) => tokens.map((t) => `${tick}${t}${tick}`).join(' ');
    const real = [
      { path: 'docs/x.md', text: wrap('src/lib/week.ts', 'web/src/lib/week.ts', 'week.ts', 'axe-core/package.json') },
      { path: 'src/lib/x.ts', text: `beside it: ${wrap('./week.ts')}` },
    ];
    expect(unresolvedPaths(real)).toEqual([]);
  });

  it('leaves routes, specifiers and templates alone', () => {
    for (const token of [
      '/program.ics',
      '/admin/index.html',
      'astro:content',
      'https://example.com/a.json',
      '@fontsource/spectral/latin-400.css',
      'unpkg.com/@sveltia/cms/package.json',
      'src/**/*.test.ts',
      'src/content/services/${day}.yml',
    ]) {
      expect(isPathLike(token), token).toBe(false);
    }
  });
});

describe('every backticked path exists', () => {
  it('in every tracked file, documents included', () => {
    const missing = unresolvedPaths(FILES).filter((m) => !EXEMPT.has(m.token));
    expect(
      missing.map((m) => `${m.token}  (${m.where})`),
      'a path named in backticks that is not there - a stale reference, or a rename that ' +
        'moved the file and not the text naming it',
    ).toEqual([]);
  });

  it('and no exemption has quietly become real', () => {
    // The other direction, as with every list in this project: a token here that
    // now resolves is an excuse nobody needs, sitting in the code looking like a
    // rule and ready to cover the next real defect of that name.
    const stale = [...EXEMPT].filter((token) => resolvesFrom(token, 'docs/x.md'));
    expect(stale, 'these are no longer absent - remove them from ABSENT_ON_PURPOSE').toEqual([]);
  });

  it('and every exemption says why, in words', () => {
    for (const [reason, tokens] of Object.entries(ABSENT_ON_PURPOSE)) {
      expect(reason.length, reason).toBeGreaterThan(30);
      expect(tokens.length, reason).toBeGreaterThan(0);
    }
    // One reason each: a token in two groups would let either reason rot unseen.
    const all = Object.values(ABSENT_ON_PURPOSE).flat();
    expect(all.length).toBe(EXEMPT.size);
  });
});
