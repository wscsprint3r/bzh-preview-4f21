/*
 * Puts the hash of every KNOWN inline script into the Content-Security-Policy
 * that ships, at `astro:build:done`, and refuses a build whose inline scripts
 * are not the ones `EXPECTED_INLINE` names.
 *
 * ---------------------------------------------------------------------------
 * WHY THE POLICY CANNOT SIMPLY BE WRITTEN BY HAND.
 *
 * Task 10's week picker is about 3 KB, which is under Vite's inline threshold,
 * so Astro writes it INTO the homepage as `<script type="module">...</script>`
 * rather than emitting a file. `script-src 'self'` does not cover an inline
 * script: Chrome refuses it outright, and the refusal has NO VISIBLE SYMPTOM on
 * this site, because rendering without that script is the designed fallback.
 * Every week shows, the picker bar stays hidden, and the next-service card
 * keeps the value the build stamped on it - so the page looks correct while
 * announcing a service that finished hours ago.
 *
 * The alternatives and why they lost:
 *
 *   - `'unsafe-inline'`: re-admits every injected `<script>` the directive
 *     exists to stop, to solve a problem one hash solves exactly.
 *   - Emitting the script as a file: costs a request on every visit and throws
 *     away the measurement Task 10 made; `check-budget.mjs` fails on it by
 *     design.
 *   - Astro's own `security.csp`: emits a per-page `<meta http-equiv>`, which
 *     cannot carry `frame-ancestors` and never touches `public/admin/index.html`
 *     - the one page an editor's GitHub credential passes through.
 *
 * So `public/_headers` carries a placeholder and this fills it in.
 * ---------------------------------------------------------------------------
 *
 * IT FAILS THE BUILD RATHER THAN DOING NOTHING. A substitution that quietly
 * finds nothing to substitute leaves `script-src 'self'` on the deployed site,
 * which is the exact defect this file exists to prevent - so a missing
 * `dist/_headers`, a missing placeholder and an unrecognised `<script>` all
 * stop the build. It also refuses any inline script that is not the one
 * `EXPECTED_INLINE` names: hashing everything the build produced allow-listed
 * an injected `<script>`, so the directive signed the very attack it exists to
 * stop. `src/lib/headers.itest.ts` then asserts the shipped file from the
 * other side: a real hash, no placeholder left.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pageScripts } from './page-scripts.mjs';

/** The token in `public/_headers` that this file replaces. */
export const PLACEHOLDER = '{{script-hashes}}';

/*
 * THE INLINE SCRIPTS THIS SITE IS SUPPOSED TO HAVE, and the one lever that
 * keeps `script-src` from becoming a rubber stamp.
 *
 * Hashing every inline script the build produced is backwards for a directive
 * whose purpose is refusing injected scripts: a `<script>` written into an
 * article body reached `dist/` and its hash was added to the policy, so the
 * policy allow-listed the injection. Measured on this project: appending
 * `<script>window.__pwned=1</script>` to a post's markdown put that script in
 * the built page and its SHA-256 in `script-src`. The set is tiny and fixed -
 * four today: the homepage week picker, Task 10's copy script emitted once on
 * each of the two account pages, and the contact form's handler on `/contact` -
 * so it is declared here and anything else stops the build.
 *
 * `marker` is a string literal the script keeps through minification
 * (`data-picker-label` is the element the picker writes into, `data-copy` is
 * the attribute the copy buttons and their script share, `data-contact-form` is
 * the attribute the form handler's first line queries for), so an entry names
 * the script without pinning its changing bytes. The two copy entries share
 * their bytes - one source string, emitted on two routes - and are matched by
 * PAGE and marker together, so a build that lost only one page's copy still
 * fails rather than letting the identical other copy stand in for it. The two
 * `/contact/` entries need the same treatment for the same reason: they share a
 * route and differ only by marker, so the page half alone would let either one
 * stand in for the other. A new island is a deliberate addition to this list;
 * content that injects a script is refused.
 */
export const EXPECTED_INLINE = [
  { page: 'index.html', marker: 'data-picker-label' },
  { page: 'contact/index.html', marker: 'data-copy' },
  { page: 'contact/index.html', marker: 'data-contact-form' },
  { page: 'doneaza/index.html', marker: 'data-copy' },
];

/**
 * Why each script in `found` is not the one `EXPECTED_INLINE` expects, as
 * human-readable lines. Empty means the build produced exactly the known set.
 */
export function unexpectedInlineScripts(found, expected = EXPECTED_INLINE) {
  const problems = [];
  const remaining = [...found];
  for (const want of expected) {
    const at = remaining.findIndex((s) => s.page === want.page && s.content.includes(want.marker));
    if (at === -1) {
      problems.push(`no inline script on ${want.page} containing "${want.marker}"`);
    } else {
      remaining.splice(at, 1);
    }
  }
  for (const s of remaining) {
    problems.push(`${s.page}: unexpected inline script of ${s.bytes} bytes (${s.hash})`);
  }
  return problems;
}

/** Every `.html` in a directory tree, as paths relative to it. */
function htmlPages(root, relative = '') {
  const found = [];
  for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
    const path = relative === '' ? entry.name : `${relative}/${entry.name}`;
    if (entry.isDirectory()) found.push(...htmlPages(root, path));
    else if (entry.name.endsWith('.html')) found.push(path);
  }
  return found.sort();
}

/**
 * The CSP source expression for one inline script, e.g. `'sha256-AEAz...='`.
 *
 * Hashed as UTF-8 over the text BETWEEN the tags, which is what the algorithm
 * in CSP 3 section 6.6.3.4 specifies and what Chrome was measured computing:
 * the hash below is byte-identical to the one Chrome named in its own refusal
 * message for this very script.
 */
export function hashScript(content) {
  return `'sha256-${createHash('sha256').update(content, 'utf8').digest('base64')}'`;
}

/**
 * Rewrites `<dir>/_headers` in place, substituting the hashes of every inline
 * executable script in `<dir>`. Returns what it measured, so the caller can
 * print it rather than print a verdict.
 */
export function writeHeaders(dir, log = console.log) {
  const file = join(dir, '_headers');
  if (!existsSync(file)) {
    throw new Error(
      `${file} is missing. Astro copies public/_headers into dist/ — if the source file has ` +
        'disappeared, the site publishes with no security header at all.',
    );
  }

  const found = [];
  for (const page of htmlPages(dir)) {
    for (const s of pageScripts(readFileSync(join(dir, page), 'utf8'))) {
      if (s.kind === 'unknown') {
        throw new Error(
          `${page}: <script${s.attributes}> is neither known code nor known data.\n` +
            'Add it to EXECUTED_TYPES or to DATA_TYPES in scripts/page-scripts.mjs. ' +
            'A script the policy does not recognise is a script the published site refuses.',
        );
      }
      if (s.kind !== 'executed' || s.src !== null) continue;
      found.push({
        page,
        content: s.content,
        bytes: Buffer.byteLength(s.content),
        hash: hashScript(s.content),
      });
    }
  }

  const unexpected = unexpectedInlineScripts(found);
  if (unexpected.length > 0) {
    throw new Error(
      'the inline scripts of this build are not the ones EXPECTED_INLINE in scripts/csp-hash.mjs names:\n' +
        unexpected.map((p) => `  ${p}`).join('\n') +
        '\nA new island belongs there, deliberately. Content that injected a <script> must not be: ' +
        'hashing it into script-src allow-lists exactly what the directive exists to refuse.',
    );
  }

  // Sorted and deduplicated, so two builds of the same output produce the same
  // file: an ordering that followed the walk would make the diff of `_headers`
  // depend on the filesystem.
  const unique = [...new Set(found.map((g) => g.hash))].sort();

  /*
   * SUBSTITUTED ONLY ON HEADER LINES, NEVER IN COMMENTS. `public/_headers`
   * explains the placeholder by name, so a whole-file `replaceAll` rewrote the
   * explanation into a sentence about a hash — found by reading the output.
   * Requiring the token on a header line also means a file that mentions it
   * only in prose fails below instead of shipping `script-src 'self'`, which is
   * the defect this whole file exists to prevent.
   */
  const isComment = (line) => line.trimStart().startsWith('#');
  const lines = readFileSync(file, 'utf8').split('\n');
  if (!lines.some((l) => !isComment(l) && l.includes(PLACEHOLDER))) {
    throw new Error(
      `${file} contains ${PLACEHOLDER} on no header line.\n` +
        "Without it, script-src is left with 'self' alone and the browser refuses the homepage's " +
        'inline script — with no visible trace, because the page without JavaScript looks correct. ' +
        'See the note about script-src in public/_headers.',
    );
  }
  writeFileSync(
    file,
    lines.map((l) => (isComment(l) ? l : l.replaceAll(PLACEHOLDER, unique.join(' ')))).join('\n'),
  );

  // Print what was measured, not only that something was.
  if (found.length === 0) {
    log(
      "CSP: no inline script in the build — script-src is left with 'self' alone, which is right " +
        'ONLY if the script is emitted as a file. check-budget.mjs decides whether that is in order.',
    );
  } else {
    for (const g of found) log(`CSP: ${g.page} inline script of ${g.bytes} bytes -> ${g.hash}`);
  }
  return { found, unique };
}

/** The Astro integration that runs it. Wired in `astro.config.mjs`. */
export const cspHashes = {
  name: 'csp-hashes',
  hooks: {
    'astro:build:done': ({ dir, logger }) => {
      // `fileURLToPath`, not `dir.pathname`: a project path containing a space
      // arrives percent-encoded in `pathname` and every `readdirSync` below
      // would then miss the build entirely.
      writeHeaders(fileURLToPath(dir), (message) => logger.info(message));
    },
  },
};
