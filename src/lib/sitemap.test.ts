import { describe, expect, it } from 'vitest';
import { generateSitemap, sitemapPaths } from './sitemap';

describe('the sitemap', () => {
  const pages = [{ data: { path: 'parohia/istoric' } }, { data: { path: 'contact' } }];
  /*
   * THE FIXTURE IS AN ID, NOT A FILE NAME. Astro's glob loader gives an article
   * the id `2024-11-04-hramul-parohiei-2024` - no `.md` - which `dist/noutati/`
   * proves: the built directory for that article is `hramul-parohiei-2024`, and
   * `articleSlug` strips only a date prefix. A fixture written as a file name
   * would assert `/noutati/o-stire.md/`, a URL no route builds.
   */
  const articles = [{ id: '2024-06-08-o-stire' }];

  it('holds the fixed routes, the prose pages and the published articles once each', () => {
    const paths = sitemapPaths({ pages, articles, albums: [], events: [] });
    expect(paths).toContain('/');
    expect(paths).toContain('/parohia/istoric/');
    expect(paths).toContain('/contact/');
    expect(paths).toContain('/noutati/o-stire/');
    expect(new Set(paths).size).toBe(paths.length);
    expect([...paths]).toEqual([...paths].sort());
  });

  it('writes absolute URLs under the site and an XML declaration', () => {
    const xml = generateSitemap(['/a/'], new URL('https://www.bor-zh.ch'));
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<loc>https://www.bor-zh.ch/a/</loc>');
    expect(xml).toContain('</urlset>');
  });
});