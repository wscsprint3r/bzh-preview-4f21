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
 * their slugs. The real arithmetic is 11 pages + 45 posts + the two fixed rows
 * below, minus the one post row superseded under the page-wins collision rule
 * documented on `redirectRows`, plus one row per migrated PDF = 144 rows.
 * The document rows come from `extractDocuments`, which owns both the old path
 * as the old site served it and the new `/documente/<slug>.pdf`; a PDF's old
 * path cannot collide with a page or a post, because neither ever ends `.pdf`.
 *
 * SORTED BY OLD PATH, LF endings, no BOM: the file is byte-identical across
 * runs, which the repeatability check reads as a `diff` exit code rather than
 * as a quiet absence of output.
 */

/** Where the file lands, relative to the repository root. */
const URL_MAP = 'docs/url-map.csv';

/**
 * The two rows that are neither one of the eleven pages nor a post.
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
 *
 * PAGE ROWS WIN OVER POST ROWS ON THE ONE OLD PATH THEY SHARE, and the rule is
 * first-writer-wins over a build order of pages, then the two fixed rows, then
 * posts. Measured 2026-09-18: the dump has page 23997 and stamped post 26901
 * both named `scoala-parohiala`, so both would emit `/scoala-parohiala/`. The
 * post is one of the 32 held back (`published: false`), so its destination
 * `/noutati/scoala-parohiala/` has no page to land on - a redirect to a 404,
 * the exact failure this map exists to avoid - while `/comunitate/scoala/` is
 * live and is what the old site's own menu linked. One old URL gets one row.
 *
 * A ROW WHOSE TWO PATHS ARE EQUAL NEEDS NO RULE. `/servicii-liturgice/` is both
 * the old slug and the new route, so Phase 4 emits nothing for it: the old URL
 * already serves the page. The row stays, because the map is the contract of
 * every old path that keeps working, and 144 is its count.
 *
 * DOCUMENT ROWS ARRIVE LAST and are passed in rather than read here: the old
 * path is the legacy absolute path (`/revista/doxologia_18_2019.pdf`) or the
 * uploads path as the site served it (`/wp-content/uploads/2025/03/….pdf`),
 * and only `extractDocuments` knows both ends. They are ordinary rows to this
 * function; the precedence rule above does not apply to them because nothing
 * else claims a `.pdf` path.
 */
export function redirectRows(pages, postSlugs, documents = []) {
  const rows = [
    ...pages.map((page) => [`/${page.slug}/`, `/${page.path}/`]),
    ...FIXED_REDIRECTS,
    ...postSlugs.map((slug) => [`/${slug}/`, `/noutati/${slug}/`]),
    ...documents.map(({ from, to }) => [from, to]),
  ];
  const seen = new Set();
  return rows.filter(([oldPath]) => {
    if (seen.has(oldPath)) return false;
    seen.add(oldPath);
    return true;
  });
}

/**
 * Writes the CSV and returns the number of redirect rows.
 *
 * `documents` is what `extractDocuments` returned as `redirects`: one
 * `{ from, to }` per migrated PDF, appended to the pages, the two fixed rows
 * and the posts. The container must already be running - `run.mjs` starts it
 * once for every extractor and this step - so importing this module starts
 * nothing.
 */
export async function writeUrlMap(documents = []) {
  const posts = await query(
    "SELECT post_name FROM wpoi_posts WHERE post_type='post' AND post_status='publish'",
  );
  // Plain code-unit comparison, never `localeCompare`: the sort must not depend
  // on the machine's locale, or two machines would write two orders. The new
  // path is the tiebreak so the order is total even if a duplicate ever
  // survives the precedence rule above - the file must not depend on the
  // engine's sort stability for its bytes.
  const rows = redirectRows(PAGES, posts.map(([slug]) => slug), documents).sort((a, b) => {
    if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
    return a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0;
  });
  const csv =
    [
      '# Phase 4 consumes this file: each row becomes one _redirects rule.',
      '# One row per old path: a page row wins over a post row, because a held-back',
      '# post has no page to land on and a redirect to a 404 is the failure to avoid.',
      '# A row whose two paths are equal needs no rule: the old URL already serves the page.',
      'vechi,nou',
      ...rows.map(([oldPath, newPath]) => `${oldPath},${newPath}`),
    ].join('\n') + '\n';
  await mkdir(dirname(URL_MAP), { recursive: true });
  await writeFile(URL_MAP, csv);
  process.stdout.write(`\nRedirects emitted: ${rows.length}.\n`);
  return rows.length;
}
