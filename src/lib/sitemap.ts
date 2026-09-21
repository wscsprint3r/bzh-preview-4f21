import { articleSlug } from './articles';
import { eventSlug } from './events';

/**
 * The sitemap's URL set and its XML, pure so the shapes are testable without a
 * build. The route that calls this is emitted only when `INDEXABLE` is true
 * (`src/lib/site.ts` explains the flag): before the cutover this site is served
 * from a hostname that will stop existing, and a sitemap naming
 * `https://www.bor-zh.ch/…` would point every crawler at the compromised
 * WordPress install. Absent pre-cutover is the designed state, not a gap.
 *
 * NO `lastmod` UNTIL SOMETHING CAN VOUCH FOR IT. An article's date is a
 * publication date, not a modification date, and a sitemap that claims a page
 * changed when it did not teaches crawlers to distrust the field.
 */
export const FIXED_PATHS = [
  '/',
  '/program/',
  '/noutati/',
  '/evenimente/',
  '/galerie/',
  '/pastorale/',
  '/contact/',
  '/doneaza/',
];

export interface SitemapSources {
  pages: Array<{ data: { path: string } }>;
  articles: Array<{ id: string }>;
  albums: Array<{ id: string }>;
  events: Array<{ id: string }>;
}

export function sitemapPaths({ pages, articles, albums, events }: SitemapSources): string[] {
  const paths = new Set(FIXED_PATHS);
  for (const page of pages) paths.add(`/${page.data.path}/`);
  for (const article of articles) paths.add(`/noutati/${articleSlug(article.id)}/`);
  for (const album of albums) paths.add(`/galerie/${album.id}/`);
  for (const event of events) paths.add(`/evenimente/${eventSlug(event.id)}/`);
  return [...paths].sort();
}

export function generateSitemap(paths: string[], site: URL): string {
  const urls = paths.map((path) => `  <url><loc>${new URL(path, site).toString()}</loc></url>`);
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.join('\n') +
    '\n</urlset>\n'
  );
}