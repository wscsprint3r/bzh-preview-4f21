/**
 * `docs/url-map.csv`, parsed. One parser, two importers: the build-time
 * `scripts/redirects.mjs` and the migration's short-link map, so the two can
 * never disagree about what the file means.
 *
 * THE FILE IS MACHINE-WRITTEN, so this is deliberately strict about the one
 * shape it can have: `old,new`, comments starting `#`, the `vechi,nou` header.
 * A line that is not two fields stops the caller by name rather than being
 * skipped — a skipped row is an old URL that silently stops working.
 */
export type UrlMapRow = [oldPath: string, newPath: string];

export function parseUrlMap(text: string): UrlMapRow[] {
  const rows: UrlMapRow[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#') || line === 'vechi,nou') continue;
    const at = line.indexOf(',');
    if (at === -1) throw new Error(`url-map.csv row without a comma: ${line}`);
    rows.push([line.slice(0, at), line.slice(at + 1)]);
  }
  return rows;
}