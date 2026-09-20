/**
 * `/sitemap-index.xml`, emitted ONLY when `INDEXABLE` is true.
 *
 * `getStaticPaths` returning an empty array is what makes the file absent in a
 * pre-cutover build: a static endpoint with no path is never rendered, so
 * `dist/sitemap-index.xml` does not exist and nothing can serve it. The flag
 * flips in the same change that moves DNS (handover B6), and
 * `scripts/indexable-check.mjs` builds the flipped site in a scratch directory
 * so both states are asserted without touching this one.
 */
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { publishedArticles } from '../lib/articles';
import { INDEXABLE } from '../lib/site';
import { generateSitemap, sitemapPaths } from '../lib/sitemap';

export function getStaticPaths() {
  return INDEXABLE ? [{ params: { index: 'index' } }] : [];
}

export const GET: APIRoute = async ({ site }) => {
  if (site === undefined) {
    throw new Error('Astro.site is not configured, so the sitemap cannot write absolute URLs.');
  }
  const paths = sitemapPaths({
    pages: await getCollection('pages'),
    articles: publishedArticles(await getCollection('articles')),
    albums: await getCollection('galerii'),
    events: await getCollection('events'),
  });
  return new Response(generateSitemap(paths, site), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};