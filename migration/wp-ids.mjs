import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseUrlMap } from '../src/lib/url-map.ts';
import { query } from './db.mjs';

/**
 * `functions/wp-ids.json` — WordPress post/page IDs to their new paths.
 *
 * THE OLD SHORT LINKS ARE `/?p=<id>`, and the IDs exist only in the dump. The
 * URL map carries old paths, not IDs, so this is a second emission from the
 * same database: every published post and page whose slug has a URL-map row
 * gets an entry, and a slug with no row is dropped rather than guessed at.
 *
 * DETERMINISTIC: sorted by numeric id, LF endings, trailing newline. The file
 * is committed, so the maintainer's run is the only one that writes it; a
 * clone reads it. The unknown-id direction is deliberate — the Function falls
 * through to the homepage — so a map that is missing an entry is a stale link
 * that still lands somewhere real, not a 404.
 */
export const WP_IDS_FILE = 'functions/wp-ids.json';

/** The pure half: dump rows + URL-map rows -> sorted `[id, target]` pairs. */
export function shortLinkMap(posts, mapRows) {
  const target = new Map();
  for (const [oldPath, newPath] of mapRows) {
    const match = /^\/(.+)\/$/.exec(oldPath);
    if (match !== null) target.set(match[1], newPath);
  }
  const out = new Map();
  for (const { id, slug } of posts) {
    const to = target.get(slug);
    if (to !== undefined) out.set(String(id), to);
  }
  return [...out.entries()].sort((a, b) => Number(a[0]) - Number(b[0]));
}

/** The I/O edge: query the dump, read the CSV, write the JSON. */
export async function writeShortLinks() {
  const posts = await query(
    "SELECT ID, post_name FROM wpoi_posts " +
      "WHERE post_status='publish' AND post_type IN ('post','page') ORDER BY ID",
  );
  const rows = parseUrlMap(readFileSync('docs/url-map.csv', 'utf8'));
  const map = shortLinkMap(posts.map(([id, slug]) => ({ id, slug })), rows);
  await mkdir(dirname(WP_IDS_FILE), { recursive: true });
  const json = `${JSON.stringify(Object.fromEntries(map), null, 2)}\n`;
  await writeFile(WP_IDS_FILE, json);
  process.stdout.write(`\nShort links emitted: ${map.length}.\n`);
  return map.length;
}
