/*
 * What `_headers` means, in the one place that decides it.
 *
 * Cloudflare Pages parses this file out of the build output and never serves
 * it, so nothing you can request from the deployed site shows you what it said.
 * That makes it the one artefact of this project with no natural feedback loop:
 * a mistake in it is invisible everywhere except in the response headers of
 * some other URL, which only `curl -sI` against the deployed host can show.
 *
 * Two things read it here, and they must agree, which is why the parsing is
 * neither of theirs:
 *
 *   - `scripts/a11y.mjs` serves the built site with these headers applied and
 *     loads it in a real browser, so the policy is exercised before anyone
 *     deploys it.
 *   - `src/lib/headers.itest.ts` asserts the shipped file's contents.
 *
 * THE SUBSET IMPLEMENTED IS THE SUBSET THE FILE USES: a path with `*`
 * wildcards, then indented `Name: Value` lines, with `#` comments. A pattern
 * this parser does not understand STOPS rather than being skipped - a rule
 * silently not applied is a policy silently not tested.
 */

/**
 * One rule: a path pattern and the headers it sets.
 *
 * Typed with JSDoc rather than left to inference, because `tsconfig.json`
 * type-checks `**\/*` and `src/lib/headers.itest.ts` imports this file. Without
 * the annotations `headers` infers as `never[]` from its empty initialiser and
 * the test fails to compile - `astro check` and `tsc --noEmit` both say so.
 *
 * @typedef {{ pattern: string, headers: [string, string][] }} HeaderRule
 */

/**
 * Parses a `_headers` file into its rules.
 *
 * @param {string} text
 * @returns {HeaderRule[]}
 */
export function parseHeaders(text) {
  /** @type {HeaderRule[]} */
  const rules = [];
  /** @type {HeaderRule | null} */
  let current = null;
  for (const [i, line] of text.split('\n').entries()) {
    const lineNumber = i + 1;
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    if (/^\S/.test(line)) {
      const pattern = line.trim();
      if (!pattern.startsWith('/')) {
        throw new Error(`_headers:${lineNumber}: pattern not accepted here: ${pattern}`);
      }
      if (pattern.includes(':')) {
        throw new Error(
          `_headers:${lineNumber}: patterns with a :placeholder are not covered by the local check: ${pattern}`,
        );
      }
      current = { pattern, headers: [] };
      rules.push(current);
      continue;
    }
    const match = line.match(/^\s+([A-Za-z0-9-]+)\s*:\s*(.*)$/);
    if (!match) {
      throw new Error(`_headers:${lineNumber}: unintelligible header line: ${JSON.stringify(line)}`);
    }
    if (current === null) throw new Error(`_headers:${lineNumber}: a header with no rule above it`);
    current.headers.push([match[1], match[2].trim()]);
  }
  if (rules.length === 0) throw new Error('_headers contains no rule at all.');
  return rules;
}

/**
 * A Cloudflare path pattern as a regular expression over the request path.
 *
 * @param {string} pattern
 * @returns {RegExp}
 */
function patternRegex(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

/**
 * The headers every matching rule gives one request path.
 *
 * Duplicate header names across matching rules are JOINED WITH A COMMA, which
 * is what Cloudflare documents doing rather than letting the more specific rule
 * win. Two `Cache-Control` rules therefore produce `public, max-age=3600,
 * no-store`, which is neither policy. `public/_headers` is written so that no
 * header name appears twice; `headers.itest.ts` asserts it, and this reproduces
 * the join anyway so that a future duplicate shows up in the browser pass too.
 *
 * @param {HeaderRule[]} rules
 * @param {string} path
 * @returns {Map<string, string>}
 */
export function headersForPath(rules, path) {
  /** @type {Map<string, string>} */
  const result = new Map();
  for (const rule of rules) {
    if (!patternRegex(rule.pattern).test(path)) continue;
    for (const [name, value] of rule.headers) {
      result.set(name, result.has(name) ? `${result.get(name)}, ${value}` : value);
    }
  }
  return result;
}
