/*
 * The apex→www redirect, the one rule `_redirects` cannot carry.
 *
 * Cloudflare's `_redirects` reference defines a source as a file path and marks
 * domain-level redirects unsupported, so the
 * `https://bor-zh.ch/* https://www.bor-zh.ch/:splat 301` rule this replaces was
 * inert — parsed in principle and never matched, with nothing in this
 * repository able to see that. A Pages Function sees the request's hostname,
 * which is the thing the rule needed.
 *
 * THE DECISION IS `apexRedirectTarget` in `src/lib/apex.ts`: pure, unit-tested,
 * exact-hostname rather than suffix, and it carries the path and the query
 * string to www. This file is the thin edge no run here can reach, like
 * `functions/index.ts`.
 *
 * IT RUNS FOR EVERY ROOT-LEVEL ROUTE, including `/api/contact` and `/?p=<id>`.
 * For `www.bor-zh.ch` and `*.pages.dev` the target is null and the request
 * passes through untouched (`next()`), so the contact Function and the
 * short-link Function behave exactly as they would with no middleware at all.
 * On the apex, even those paths redirect to www first, which is the canonical
 * host the specification names.
 */
import { apexRedirectTarget } from '../src/lib/apex';

export const onRequest = async ({
  request,
  next,
}: {
  request: Request;
  next: () => Promise<Response>;
}): Promise<Response> => {
  const target = apexRedirectTarget(new URL(request.url));
  if (target === null) return next();
  return Response.redirect(target, 301);
};