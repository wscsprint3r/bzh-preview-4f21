import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PLACEHOLDER } from '../../scripts/csp-hash.mjs';
import { headersForPath, parseHeaders } from '../../scripts/headers.mjs';

/*
 * WHAT THIS PROVES: that the file this repository ships as `dist/_headers` says
 * what it is meant to say — including the one value the build has to compute,
 * the SHA-256 that keeps the homepage's inline script executable.
 *
 * WHAT IT CANNOT PROVE, AND NOTHING HERE CAN: that Cloudflare applies any of
 * it. `_headers` is parsed by the host and never served, so no request to the
 * deployed site returns this file — the only evidence is the response headers
 * of some other URL:
 *
 *   curl -sI https://<project>.pages.dev/ | grep -i content-security-policy
 *   curl -sI https://<project>.pages.dev/program.ics | grep -i content-type
 *
 * Both are in the task 13 handover checklist, and both are the user's to run.
 * `npm run a11y` goes one step further than this file by serving the built site
 * with these headers and loading it in a real browser, which is what catches a
 * policy that is well-formed and still breaks the page. Neither is a claim
 * about the host.
 *
 * It reads `dist/`, so it runs only after a build: `npm run test:build`.
 */

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DIST = `${ROOT}dist/`;

/** The file's text, having proved there was a file and that it had text in it. */
function read(path: string): string {
  expect(existsSync(DIST + path), `${path} is missing from dist/`).toBe(true);
  const text = readFileSync(DIST + path, 'utf8');
  expect(text.length, `${path} exists but is empty`).toBeGreaterThan(0);
  return text;
}

const BUILT_TEXT = read('_headers');
const RULES = parseHeaders(BUILT_TEXT);

/** Every `.html` in `dist/`, as paths relative to it. */
function pages(relative = ''): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(DIST + relative, { withFileTypes: true })) {
    const path = relative + entry.name;
    if (entry.isDirectory()) found.push(...pages(path + '/'));
    else if (entry.name.endsWith('.html')) found.push(path);
  }
  return found.sort();
}

/*
 * The inline executable scripts of one built page, found with this file's OWN
 * regex and hashed with this file's own call to `createHash`.
 *
 * DELIBERATELY NOT `scripts/page-scripts.mjs` AND `scripts/csp-hash.mjs`, which is
 * what wrote the policy. A check that recomputes the expectation with the very
 * code under test agrees with that code however wrong it is; the point here is
 * a second opinion about which bytes the browser will hash. `<script>` inside
 * an HTML comment is skipped for the same reason the generator skips it — that
 * misreading is exactly what this is meant to be able to catch.
 */
function inlineHashes(html: string): string[] {
  const without = html.replace(/<!--[\s\S]*?-->/g, '');
  const found: string[] = [];
  for (const m of without.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attributes = m[1] as string;
    const content = m[2] as string;
    if (/\bsrc\s*=/i.test(attributes)) continue;
    const type = (attributes.match(/\btype\s*=\s*["']([^"']*)["']/i)?.[1] ?? '').toLowerCase();
    // Only what a browser executes. `application/json` is data; CSP ignores it.
    if (!['', 'module', 'text/javascript', 'application/javascript'].includes(type)) continue;
    found.push(`'sha256-${createHash('sha256').update(content, 'utf8').digest('base64')}'`);
  }
  return found;
}

const CSP = headersForPath(RULES, '/').get('Content-Security-Policy') ?? '';

/** Sorted, without repeats — so two sets can be compared as arrays and read. */
function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

/*
 * The `'sha256-…'` tokens of ONE directive, found by splitting the policy the
 * way a browser does rather than by searching the whole string. A hash sitting
 * in `style-src`, or in `script-src-elem`, is a different rule with different
 * consequences, and must not be mistaken for one of these.
 */
function scriptSrcHashes(policy: string): string[] {
  const directive = policy
    .split(';')
    .map((d) => d.trim())
    .find((d) => d === 'script-src' || d.startsWith('script-src '));
  return [...(directive ?? '').matchAll(/'sha256-[A-Za-z0-9+/=]+'/g)].map((m) => m[0]);
}

/** Every `sha256-` token anywhere in a text, quoted or not, valid or not. */
function shaTokens(text: string): string[] {
  return [...text.matchAll(/sha256-[A-Za-z0-9+/=]*/g)].map((m) => m[0]);
}

/*
 * Every path into this repository that a text mentions in backticks.
 *
 * A token counts as a path when it is a bare `a/b/c` — no spaces, no quotes, no
 * scheme, no angle brackets — and either contains a `/` or ends in a source
 * extension. That deliberately keeps out `img-src`, `Cache-Control`, `blob:`,
 * `/admin/` (a URL, not a file) and `text/calendar; charset=utf-8`, and lets in
 * `astro.config.mjs` at the root. The list is PRINTED by the test below, so a
 * token that quietly stopped being recognised is visible in a run rather than
 * inferred from a green.
 */
export function mentionedPaths(text: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(/`([^`]+)`/g)) {
    const token = m[1] as string;
    if (!/^[A-Za-z0-9_.@-]+(?:\/[A-Za-z0-9_.@-]+)*$/.test(token)) continue;
    if (!token.includes('/') && !SOURCE_EXTENSIONS.test(token)) continue;
    found.push(token);
  }
  return sortedUnique(found);
}

const SOURCE_EXTENSIONS = /\.(mjs|js|ts|md|ya?ml|json|astro|css|html|ics|txt)$/;

/*
 * The other half of that scope, and the reason the first half is a CHOICE.
 *
 * Looking only inside backticks is right: outside them this file is full of
 * things shaped like paths that are not paths - the route patterns it exists to
 * declare, and the URLs in its own `curl` examples. A resolver that took those
 * would fail on `/program.ics`, which is a rule, not a file.
 *
 * But a backtick-only resolver is complete only if the file really does put
 * every path in backticks, and for two rounds it did not: the refusal table read
 * `start.mjs already tells a volunteer what they need` with no backticks, so
 * the guard could not see it and the round-1 report claimed it had been fixed
 * when it had not. Nothing was broken, because the file existed - which is the
 * whole problem with that class: it rots silently.
 *
 * So the convention is enforced rather than stated. A COMMENT line that names a
 * file-shaped token outside backticks fails. Route lines are exempt because they
 * are not prose, and a line carrying a URL is exempt because the token belongs
 * to the URL - both structural, neither a list of names somebody has to maintain.
 */
export function pathsOutsideBackticks(text: string): string[] {
  const found: string[] = [];
  const pattern = /[A-Za-z0-9_@.-]+\.(?:mjs|js|ts|md|ya?ml|json|astro|css|html|ics|txt)\b/g;
  for (const line of text.split('\n')) {
    if (!line.startsWith('#')) continue; // a route line declares rules, not paths
    if (line.includes('://')) continue; // the token belongs to a URL on this line
    const withoutBackticks = line.replace(/`[^`\n]*`/g, (m) => ' '.repeat(m.length));
    for (const m of withoutBackticks.matchAll(pattern)) found.push(m[0]);
  }
  return sortedUnique(found);
}

/** `public/_headers` as written, not as built. */
const SOURCE = readFileSync(`${ROOT}public/_headers`, 'utf8');

describe('_headers reaches the build', () => {
  it('contains rules', () => {
    expect(RULES.length).toBeGreaterThan(0);
  });

  /*
   * Cloudflare joins the values when a header name appears in two matching
   * rules, rather than letting the more specific one win. `Cache-Control` in
   * two rules would produce `public, max-age=3600, no-store` — neither policy.
   */
  it('no header name appears in two rules', () => {
    const where = new Map<string, string[]>();
    for (const rule of RULES) {
      for (const [name] of rule.headers) {
        where.set(name, [...(where.get(name) ?? []), rule.pattern]);
      }
    }
    const duplicated = [...where].filter(([, patterns]) => patterns.length > 1);
    expect(duplicated, 'Cloudflare would join the values with a comma').toEqual([]);
  });

  // Cloudflare's documented limits. A file over them is not rejected loudly.
  it("respects Cloudflare's limits", () => {
    expect(RULES.length).toBeLessThanOrEqual(100);
    for (const line of BUILT_TEXT.split('\n')) expect(line.length).toBeLessThanOrEqual(2000);
  });
});

describe('the security policy', () => {
  it('covers the whole site', () => {
    expect(RULES.some((r) => r.pattern === '/*')).toBe(true);
    expect(CSP).not.toBe('');
  });

  it.each([
    ['Strict-Transport-Security', 'max-age=31536000; includeSubDomains'],
    ['X-Content-Type-Options', 'nosniff'],
    ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ])('trimite %s pe orice pagină', (name, value) => {
    expect(headersForPath(RULES, '/program/').get(name)).toBe(value);
  });

  it.each(["frame-ancestors 'none'", "object-src 'none'", "base-uri 'none'", "default-src 'self'"])(
    'politica include %s',
    (directive) => {
      expect(CSP).toContain(directive);
    },
  );

  /*
   * THE CHECK THIS FILE EXISTS FOR.
   *
   * `script-src 'self'` alone is well-formed, ships without complaint, and
   * stops the homepage's inline script from ever running — with no visible
   * symptom, because rendering without that script is the designed fallback.
   * So the assertion is not "a hash is present" but "the hash of the script
   * that is actually in the page is present", recomputed here from `dist/`.
   */
  /*
   * On the HEADER lines only. `public/_headers` explains the placeholder by
   * name in a comment, and `csp-hash.mjs` deliberately leaves comments alone —
   * substituting there once rewrote the explanation into a sentence about a
   * hash. What must not survive is a `{{` in a value a browser reads.
   */
  it('no longer contains any placeholder on a header line', () => {
    const headers = BUILT_TEXT.split('\n').filter((l) => !l.trimStart().startsWith('#'));
    expect(headers.filter((l) => l.includes('{{'))).toEqual([]);
  });

  /*
   * EQUALITY, NOT CONTAINMENT, AND THAT IS THE WHOLE POINT OF THIS ASSERTION.
   *
   * "Every hash the build computed appears in `script-src`" is a subset
   * relation, and it is silent about the other direction. Measured on this very
   * file: paste an invented `'sha256-3MO6h9CZ…'` beside the placeholder in
   * `public/_headers` and the build, this suite and the browser pass all went
   * green — while the policy shipped to every page `/*` covers, `/admin/`
   * included, whitelisting whatever inline script happens to hash to it.
   *
   * `toEqual` over both sets closes it, and also catches a hash left behind by
   * a merge or by a script that was deleted.
   */
  it('script-src names exactly the hashes of the built inline scripts, not one more', () => {
    const perPage = pages().flatMap((p) => inlineHashes(readFileSync(DIST + p, 'utf8')).map((h) => [p, h]));
    // A guard that reads files must prove it read something: with no inline
    // script anywhere, two empty sets would agree while proving nothing.
    expect(perPage.length, 'no built page has an inline script').toBeGreaterThan(0);
    const built = sortedUnique(perPage.map(([, h]) => h as string));
    const inPolicy = sortedUnique(scriptSrcHashes(CSP));
    // Print what was measured, not only the verdict. Straight to stdout:
    // vitest's default reporter swallows `console.log` from a passing test.
    process.stdout.write(
      `\nScripturi inline construite:\n${perPage.map(([p, h]) => `  ${p} -> ${h}`).join('\n')}\n` +
        `script-src numește ${inPolicy.length}: ${inPolicy.join(' ')}\n`,
    );
    expect(inPolicy, 'the hashes in script-src are not exactly those of the built scripts').toEqual(
      built,
    );
  });

  it("script-src does not allow 'unsafe-inline'", () => {
    const scriptSrc = CSP.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src'));
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).not.toContain('unsafe-inline');
  });
});

/*
 * THE DETECTORS ABOVE, PROVED ABLE TO FIRE.
 *
 * Both assertions in this file that matter are of the form "X is absent": no
 * hash in the source, nothing extra in the policy. This repository does not
 * accept that claim without a positive control — an absence is also what a
 * detector that stopped matching reports.
 *
 * The invented hash is the one measured slipping through the old subset check.
 */
describe('the hash detectors really do fire', () => {
  const INVENTED = "'sha256-3MO6h9CZoU1BDqVrXhF8G7RbqZZTQmJfN3uAn9GJXEo='";

  it('sees a hash slipped into script-src', () => {
    expect(scriptSrcHashes(`default-src 'self'; script-src 'self' ${INVENTED}; img-src 'self'`)).toEqual([
      INVENTED,
    ]);
  });

  it('does not take hashes from other directives', () => {
    expect(scriptSrcHashes(`script-src 'self'; style-src ${INVENTED}`)).toEqual([]);
  });

  // `script-src-elem` starts with the same fourteen characters and is a
  // different directive; a prefix test would have counted its hashes as ours.
  it('does not confuse script-src-elem with script-src', () => {
    expect(scriptSrcHashes(`script-src-elem ${INVENTED}`)).toEqual([]);
  });

  it('sees a hand-written hash in a header line', () => {
    expect(shaTokens(`  Content-Security-Policy: script-src 'self' ${INVENTED} ${PLACEHOLDER}`)).toHaveLength(1);
  });

  it('does not fire on text with no hash', () => {
    expect(shaTokens(`script-src 'self' ${PLACEHOLDER}`)).toEqual([]);
  });
});

describe('public/_headers, the source file', () => {
  /*
   * THE HASH IS FORBIDDEN AT THE SOURCE, not only checked at the destination.
   *
   * `AGENTS.md` says in so many words "do not hand-write a hash there", and
   * until this test nothing enforced it. A hand-written hash here survives every
   * rebuild — `csp-hash.mjs` only substitutes the placeholder, it does not clean
   * the line — so catching it in `dist/` catches it once per build, while
   * catching it here catches it where someone typed it.
   */
  it('contains no hand-written hash', () => {
    expect(shaTokens(SOURCE), 'the hashes are computed at build time, not written here').toEqual([]);
  });

  it(`carries ${PLACEHOLDER} on a header line`, () => {
    const headers = SOURCE.split('\n').filter((l) => !l.trimStart().startsWith('#'));
    expect(headers.filter((l) => l.includes(PLACEHOLDER)).length, `${PLACEHOLDER} appears only in comments`).toBeGreaterThan(0);
  });
});

/*
 * EVERY PATH THIS FILE NAMES MUST RESOLVE.
 *
 * `public/_headers` is instruction as much as configuration: its comments are
 * what someone reads on the first real sign-in, when the console is full of
 * refusals and they need to know where the expected list lives. It shipped
 * pointing at `scripts/csp-browser.mjs`, which has never existed — and a rule
 * for a path that does not exist looks exactly like a rule that works.
 */
describe('the references inside public/_headers', () => {
  const PATHS = mentionedPaths(SOURCE);

  it('really does find paths to check', () => {
    process.stdout.write(`\npublic/_headers menționează ${PATHS.length} cale(i):\n${PATHS.map((c) => `  ${c}`).join('\n')}\n`);
    expect(PATHS.length, `the path detector found ${PATHS.length} — nothing below would be checked`).toBeGreaterThan(3);
    // Named explicitly so a regex that stopped recognising a shape fails here
    // rather than quietly shrinking the list the cases below iterate.
    expect(PATHS).toContain('scripts/csp-hash.mjs');
    expect(PATHS).toContain('src/pages/program.ics.ts');
    expect(PATHS).toContain('docs/handover.md');
  });

  it('the detector recognises a path that does not exist, and does not mistake the rest for a path', () => {
    expect(mentionedPaths('lista e în `scripts/csp-browser.mjs`, nu în `img-src` sau `/admin/`')).toEqual([
      'scripts/csp-browser.mjs',
    ]);
    expect(existsSync(`${ROOT}scripts/csp-browser.mjs`)).toBe(false);
  });

  /*
   * Fiindcă rezolvarea se uită numai între apostrofuri inverse, singurul lucru
   * care face „toate căile de aici se rezolvă" o afirmație întreagă este
   * convenția că toate căile de aici sunt scrise între apostrofuri inverse.
   * Convenția se verifică, nu se promite.
   */
  it('names no path outside backticks', () => {
    const bareTokens = pathsOutsideBackticks(SOURCE);
    expect(bareTokens, `scrie-le între apostrofuri inverse, altfel rezolvarea nu le vede: ${bareTokens.join(', ')}`).toEqual([]);
  });

  it('the outside-backticks path detector really does fire, and leaves routes and URLs alone', () => {
    expect(pathsOutsideBackticks('#   start.mjs deja îi spune voluntarului')).toEqual(['start.mjs']);
    expect(pathsOutsideBackticks('#   `public/admin/start.mjs` deja îi spune')).toEqual([]);
    // O rută nu e un fișier, iar un token dintr-un URL îi aparține URL-ului.
    expect(pathsOutsideBackticks('/program.ics')).toEqual([]);
    expect(pathsOutsideBackticks('#   curl -sI https://x.pages.dev/program.ics')).toEqual([]);
  });

  it.each(PATHS)('`%s` există', (path) => {
    expect(existsSync(ROOT + path), `public/_headers points at ${path}, which does not exist`).toBe(true);
  });

  /*
   * EXISTING IS NOT ENOUGH FOR THE HANDOVER. `.gitignore` excludes
   * `.superpowers/`, and this file used to point there for "the exact
   * commands" — a path that resolves on the machine that wrote it and in no
   * clone at all. A pointer to an untracked file is the same failure one level
   * up, so the pointer's target is asserted to be in the index.
   */
  it('docs/handover.md is tracked by git, not merely present on disk', () => {
    const tracked = execFileSync('git', ['ls-files', '--', 'docs/handover.md'], {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim();
    expect(tracked, 'docs/handover.md is not tracked — a clone would not get it').toBe('docs/handover.md');
  });
});

describe('the calendar feed', () => {
  /*
   * LOAD-BEARING. A static build discards the `Content-Type` the endpoint sets,
   * so this rule is the only thing that decides what a subscriber's calendar
   * client receives. The rule is asserted to RESOLVE — the file it names is in
   * the build — because a rule for a path that does not exist looks exactly
   * like a rule that works.
   */
  it('gives /program.ics the type text/calendar', () => {
    expect(existsSync(DIST + 'program.ics'), 'the rule has a subject that does not exist').toBe(true);
    expect(headersForPath(RULES, '/program.ics').get('Content-Type')).toBe('text/calendar; charset=utf-8');
  });

  it('keeps it cached for an hour', () => {
    expect(headersForPath(RULES, '/program.ics').get('Cache-Control')).toBe('public, max-age=3600');
  });

  it('does not give the pages the text/calendar type too', () => {
    expect(headersForPath(RULES, '/').get('Content-Type')).toBeUndefined();
  });
});

describe('administrarea', () => {
  it('is not indexed', () => {
    expect(existsSync(DIST + 'admin/index.html'), 'the rule has a subject that does not exist').toBe(true);
    expect(headersForPath(RULES, '/admin/').get('X-Robots-Tag')).toBe('noindex');
  });

  /*
   * `/admin/` is the page an editor's GitHub credential passes through, so it
   * gets the site's policy rather than an exception. A rule that only added
   * `X-Robots-Tag` while quietly losing the CSP would look identical in the
   * file and be the one page without a policy.
   */
  it('gets the same security policy as the rest of the site', () => {
    expect(headersForPath(RULES, '/admin/').get('Content-Security-Policy')).toBe(CSP);
  });
});
