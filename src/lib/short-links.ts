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
 */
export function shortLinkTarget(p: string | null, ids: Record<string, string>): string | null {
  if (p === null || !/^\d+$/.test(p)) return null;
  return Object.hasOwn(ids, p) ? ids[p] : null;
}
