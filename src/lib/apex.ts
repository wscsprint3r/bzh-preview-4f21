/**
 * The apex→www redirect decision, pure so the Function that runs it is a thin
 * edge no test in this repository can reach.
 *
 * WHY THIS IS A PAGES FUNCTION AND NOT A `_redirects` RULE. Cloudflare's
 * `_redirects` reference defines a source as a file path and marks domain-level
 * redirects unsupported — the `https://bor-zh.ch/* https://www.bor-zh.ch/:splat`
 * shape is the reference's own example of what does not work. A Pages Function
 * sees the request's hostname, so the decision can live here and be tested
 * without a deployment; a zone-level Redirect Rule is the alternative.
 *
 * EXACT HOSTNAME, NOT A SUFFIX. `url.hostname` is compared with `===`, so
 * `old.bor-zh.ch` is not caught by accident and `bor-zh.ch.evil.example` — a
 * hostname that merely ends in the right letters — is not mistaken for the
 * parish's. The path and the query string are copied verbatim; the scheme is
 * always https, because that is what the canonical host serves.
 */
export function apexRedirectTarget(
  url: URL,
  apex = 'bor-zh.ch',
  www = 'www.bor-zh.ch',
): string | null {
  if (url.hostname !== apex) return null;
  return `https://${www}${url.pathname}${url.search}`;
}