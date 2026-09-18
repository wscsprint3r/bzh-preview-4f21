/**
 * The news feed, at `/rss.xml`.
 *
 * `migration/url-map.mjs` maps the old site's `/feed/` here, so this route is
 * what a subscriber's reader has been polling since before the WordPress
 * install was compromised - and it is the one surface of the site that is
 * fetched by a machine rather than read by a person. Two consequences:
 *
 * - The bytes are built by `lib/rss.ts`, which is unit-tested, rather than
 *   assembled inline. A malformed feed is invisible on the site and fails in
 *   somebody else's reader.
 * - The filter is `publishedArticles`, the same call `/noutati` and the
 *   homepage use. An unpublished post must not reach a subscriber any more
 *   than it must get a page of its own.
 *
 * The headers are honoured by `astro dev` and `astro preview`. A static build
 * writes the body to `dist/rss.xml` and drops them, so on the deployed site
 * the content type comes from the host's mapping for `.xml` - which is
 * `application/xml` by default. `application/rss+xml` is the type that makes a
 * browser offer the feed as a feed rather than render a tree, so if the
 * deployed content type is ever wrong, that is a `_headers` rule to add, not
 * something this endpoint can fix.
 */
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { publishedArticles } from '../lib/articles';
import { generateRss } from '../lib/rss';

export const GET: APIRoute = async ({ site }) => {
  /*
   * `site` is configured in `astro.config.mjs` and is what makes every link in
   * the feed absolute. Throwing rather than falling back to a relative link:
   * a relative link in a feed is resolved by the READER against its own idea
   * of the host, which sends a subscriber somewhere that is not the parish's
   * site - and nothing in the build would fail.
   */
  if (site === undefined) {
    throw new Error(
      'Astro.site is not configured, so /rss.xml cannot write absolute links. See astro.config.mjs.',
    );
  }

  const entries = publishedArticles(await getCollection('articles'));
  return new Response(generateRss(entries, site), {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  });
};
