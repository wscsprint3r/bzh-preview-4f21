import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { query } from './db.mjs';
import { PAGES } from './pages.mjs';

/**
 * `docs/url-map.csv` - every old URL that must keep working, one row each.
 *
 * PHASE 4 CONSUMES THIS FILE. It turns each row into one `_redirects` rule,
 * and the header comment inside the file says so, because a CSV nobody
 * consumes looks exactly like a CSV somebody forgot to wire up. This phase
 * only emits it.
 *
 * THE 32 UNPUBLISHED POSTS ARE IN THE MAP ON PURPOSE. Their old URLs exist and
 * will be linked from elsewhere for years; a redirect to a page that does not
 * exist yet is better than a 404, and it is why the unpublished posts keep
 * their slugs. 56 rows = 9 pages + 45 posts + the two fixed rows below.
 *
 * SORTED BY OLD PATH, LF endings, no BOM: the file is byte-identical across
 * runs, which the repeatability check reads as a `diff` exit code rather than
 * as a quiet absence of output.
 */

/** Where the file lands, relative to the repository root. */
const URL_MAP = 'docs/url-map.csv';

/**
 * The two rows that are neither one of the nine pages nor a post.
 *
 * `/program-liturgic/` is the live site's name for the weekly programme page;
 * the new route is `/program/`. `/feed/` is the WordPress RSS feed; the new
 * feed is `/rss.xml`.
 */
const FIXED_REDIRECTS = [
  ['/program-liturgic/', '/program/'],
  ['/feed/', '/rss.xml'],
];

/**
 * The rows of the map, before sorting - and the pure part of this module.
 *
 * Takes the page table and the dump's post slugs rather than querying, so the
 * shape can be exercised without Docker; `writeUrlMap` is the thin I/O edge.
 */
export function redirectRows(pages, postSlugs) {
  return [
    ...pages.map((page) => [`/${page.slug}/`, `/${page.path}/`]),
    ...postSlugs.map((slug) => [`/${slug}/`, `/noutati/${slug}/`]),
    ...FIXED_REDIRECTS,
  ];
}

/**
 * Writes the CSV and returns the number of redirect rows.
 *
 * The container must already be running - `run.mjs` starts it once for both
 * extractors and this step - so importing this module starts nothing.
 */
export async function writeUrlMap() {
  const posts = await query(
    "SELECT post_name FROM wpoi_posts WHERE post_type='post' AND post_status='publish'",
  );
  // Plain code-unit comparison, never `localeCompare`: the sort must not depend
  // on the machine's locale, or two machines would write two orders.
  const rows = redirectRows(PAGES, posts.map(([slug]) => slug)).sort((a, b) =>
    a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0,
  );
  const csv =
    [
      '# Phase 4 consumes this file: each row becomes one _redirects rule.',
      'vechi,nou',
      ...rows.map(([oldPath, newPath]) => `${oldPath},${newPath}`),
    ].join('\n') + '\n';
  await mkdir(dirname(URL_MAP), { recursive: true });
  await writeFile(URL_MAP, csv);
  process.stdout.write(`\nRedirects emitted: ${rows.length}.\n`);
  return rows.length;
}
