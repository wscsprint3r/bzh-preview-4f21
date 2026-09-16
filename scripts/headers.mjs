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
 * the annotations `antete` infers as `never[]` from its empty initialiser and
 * the test fails to compile - `astro check` and `tsc --noEmit` both say so.
 *
 * @typedef {{ tipar: string, antete: [string, string][] }} RegulaAntet
 */

/**
 * Parses a `_headers` file into its rules.
 *
 * @param {string} text
 * @returns {RegulaAntet[]}
 */
export function parseazaHeaders(text) {
  /** @type {RegulaAntet[]} */
  const reguli = [];
  /** @type {RegulaAntet | null} */
  let curenta = null;
  for (const [i, linie] of text.split('\n').entries()) {
    const nr = i + 1;
    if (linie.trim() === '' || linie.trimStart().startsWith('#')) continue;
    if (/^\S/.test(linie)) {
      const tipar = linie.trim();
      if (!tipar.startsWith('/')) {
        throw new Error(`_headers:${nr}: tipar neacceptat aici: ${tipar}`);
      }
      if (tipar.includes(':')) {
        throw new Error(
          `_headers:${nr}: tiparele cu :placeholder nu sunt acoperite de verificarea locală: ${tipar}`,
        );
      }
      curenta = { tipar, antete: [] };
      reguli.push(curenta);
      continue;
    }
    const potrivire = linie.match(/^\s+([A-Za-z0-9-]+)\s*:\s*(.*)$/);
    if (!potrivire) {
      throw new Error(`_headers:${nr}: linie de antet neinteligibilă: ${JSON.stringify(linie)}`);
    }
    if (curenta === null) throw new Error(`_headers:${nr}: antet fără nicio regulă deasupra lui`);
    curenta.antete.push([potrivire[1], potrivire[2].trim()]);
  }
  if (reguli.length === 0) throw new Error('_headers nu conține nicio regulă.');
  return reguli;
}

/**
 * A Cloudflare path pattern as a regular expression over the request path.
 *
 * @param {string} tipar
 * @returns {RegExp}
 */
function tiparRegex(tipar) {
  const escapat = tipar.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escapat}$`);
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
 * @param {RegulaAntet[]} reguli
 * @param {string} cale
 * @returns {Map<string, string>}
 */
export function anteteleRutei(reguli, cale) {
  /** @type {Map<string, string>} */
  const rezultat = new Map();
  for (const regula of reguli) {
    if (!tiparRegex(regula.tipar).test(cale)) continue;
    for (const [nume, valoare] of regula.antete) {
      rezultat.set(nume, rezultat.has(nume) ? `${rezultat.get(nume)}, ${valoare}` : valoare);
    }
  }
  return rezultat;
}
