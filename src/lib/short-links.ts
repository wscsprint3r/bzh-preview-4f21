/**
 * `/?p=<id>` — the WordPress short link form, resolved against the map the
 * migration emits from the dump.
 *
 * WHY THIS IS A PAGES FUNCTION AND NOT A REDIRECT. `_redirects` matches paths;
 * a query string is not part of the path, so no `_redirects` rule can see
 * `?p=`. The old site handed these URLs out for years (every `?p=` link anyone
 * ever pasted), and the IDs survive only in the dump — which is why the map is
 * emitted now rather than after the old host is gone.
 *
 * FAIL OPEN, DELIBERATELY. An id that is not in the map is not an error: the
 * request continues to the homepage, exactly as it does on the new site today.
 * The alternative — a 404 or a guess — is worse for a visitor with a stale
 * link. `Object.hasOwn` rather than `in`, so `__proto__` and friends cannot
 * resolve to anything.
 *
 * A MAP VALUE THAT IS NOT A SINGLE-SLASH PATH IS REFUSED, NOT TRUSTED.
 * `startsWith('/')` reads as "local" and is not: `//evil.example/x` starts
 * with a slash and is a protocol-relative URL, which `Response.redirect`
 * resolves against the request's scheme — an off-site redirect from a
 * commited data file. The migration emits these values and nothing else can
 * write them, but the runtime must not depend on that; `isLocalTarget` is the
 * one place the shape is decided, and the committed map is asserted against
 * it in the test rather than against the weaker sentence unqualified.
 */
export const LOCAL_TARGET = /^\/(?!\/)/;

/** True when a map value can only ever address a path on this site. */
export function isLocalTarget(target: string): boolean {
  return LOCAL_TARGET.test(target);
}

export function shortLinkTarget(p: string | null, ids: Record<string, string>): string | null {
  if (p === null || !/^\d+$/.test(p)) return null;
  if (!Object.hasOwn(ids, p)) return null;
  return isLocalTarget(ids[p]) ? ids[p] : null;
}
