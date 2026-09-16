/*
 * What counts as "a script the browser executes", in the one place that decides
 * it.
 *
 * TWO GUARDS DEPEND ON THIS ANSWER AND MUST NOT DISAGREE.
 *
 *   - `check-budget.mjs` weighs every executed script against spec 13's JS
 *     budget. A script it fails to recognise is weight a visitor downloads that
 *     nothing measured.
 *   - `csp-hash.mjs` puts a SHA-256 of every INLINE executed script into
 *     `script-src`. A script it fails to recognise is a script the deployed
 *     site refuses to run - with no error page, no failing test and, on this
 *     site, no visible symptom at all, because running without JavaScript is
 *     the designed fallback.
 *
 * The two failures point in opposite directions and the same misclassification
 * causes both, which is why the classification lives here and not twice.
 *
 * ANYTHING UNRECOGNISED IS AN ERROR, NEVER A SKIP. A `<script>` shape neither
 * list has seen is precisely what a budget must not wave through and what a
 * policy must not lock out. `clasifica` returns `necunoscut` and both callers
 * stop the build.
 */

/** Script types the browser EXECUTES. `type` absent or empty means classic JS. */
export const TIPURI_EXECUTATE = new Set(['', 'module', 'text/javascript', 'application/javascript']);

/**
 * Script types the browser merely READS. CSP does not police these - they are
 * data, so they get no hash - and a visitor runs none of them.
 */
export const TIPURI_DATE = new Set(['application/json', 'application/ld+json', 'importmap', 'speculationrules']);

/** One attribute's value out of a tag's attribute text, or null. */
export function ATRIBUT(attrs, nume) {
  return attrs.match(new RegExp(`\\b${nume}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1] ?? null;
}

/** `executat`, `date`, or `necunoscut` for a `<script>`'s attribute text. */
export function clasifica(atribute) {
  const tip = (ATRIBUT(atribute, 'type') ?? '').trim().toLowerCase();
  if (TIPURI_DATE.has(tip)) return 'date';
  if (TIPURI_EXECUTATE.has(tip)) return 'executat';
  return 'necunoscut';
}

/**
 * Every `<script>` element in a built page, in document order, as
 * `{ atribute, continut, src, fel }`.
 *
 * A regex rather than a parser, and that is a bounded choice: the input is
 * Astro's own output, not arbitrary HTML from the web. The one shape that would
 * fool it - the string `</script>` inside a script - cannot occur, because
 * `index.astro` escapes `<` to a unicode escape before it writes the JSON
 * island for exactly this reason.
 *
 * ---------------------------------------------------------------------------
 * COMMENTS ARE CONSUMED FIRST, AND THAT IS NOT TIDINESS. `<script\b[^>]*>` on
 * its own matches the literal text `<script>` INSIDE AN HTML COMMENT, and
 * `public/admin/index.html` contains one - a comment explaining that a
 * `<script>` is deliberately all the page is. Measured: without this branch,
 * `admin/index.html` reports a 758-byte inline script that does not exist, made
 * of the comment plus the real tag, and the real tag's `src` disappears with it.
 * That misreading hands `csp-hash.mjs` a hash for nothing and would hide a genuine
 * inline script on any page whose comments mention the word.
 *
 * One alternation rather than stripping comments beforehand, so it works in
 * both directions: a comment that mentions `<script>` is eaten as a comment,
 * and a script containing the characters `<!--` is eaten as a script, because
 * whichever starts first wins the leftmost match.
 * ---------------------------------------------------------------------------
 */
export function scripturi(html) {
  const TIPAR = /<!--[\s\S]*?-->|<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  return [...html.matchAll(TIPAR)]
    .filter((m) => m[1] !== undefined)
    .map((m) => ({
      atribute: m[1],
      continut: m[2],
      src: ATRIBUT(m[1], 'src'),
      fel: clasifica(m[1]),
    }));
}
