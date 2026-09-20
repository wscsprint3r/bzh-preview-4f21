/**
 * `/robots.txt`, emitted ONLY when `INDEXABLE` is true.
 *
 * NO `Disallow`, EVER — `src/lib/site.ts` explains why in full: disallowing a
 * path stops a crawler fetching it, so it never reads the `noindex` the page
 * was sent to obey. The file exists for one line: the sitemap's address.
 */
import type { APIRoute } from 'astro';
import { INDEXABLE } from '../lib/site';

export function getStaticPaths() {
  return INDEXABLE ? [{ params: { robots: 'robots' } }] : [];
}

export const GET: APIRoute = ({ site }) => {
  if (site === undefined) throw new Error('Astro.site is not configured.');
  return new Response(`User-agent: *\nSitemap: ${new URL('/sitemap-index.xml', site)}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};