import type { ArticleEntry } from './articles';
import { articleSlug } from './articles';

/**
 * The RSS 2.0 feed's body, built by hand.
 *
 * HAND-BUILT, AND NOT WITH `@astrojs/rss`, for the same reason `ics.ts` is
 * hand-built: this feed has three fields that must be deterministic and one
 * that must not exist. `@astrojs/rss` adds a `lastBuildDate` from the build
 * clock, which would make every build of unchanged content produce a different
 * file and turn `dist/` diffs into noise - the same defect the `articles.ts`
 * id tiebreak prevents in the page order. Nothing here reads the clock:
 * `pubDate` comes from the post's stored `YYYY-MM-DD`, at UTC midnight.
 *
 * WHAT IS NOT IN THIS FILE. The endpoint `src/pages/rss.xml.ts` owns the
 * collection and the `Content-Type`; this file owns the bytes. That split is
 * `program.ics.ts` + `ics.ts` again, and it is what lets the escaping and the
 * ordering be unit-tested without booting Astro.
 */

/**
 * The five characters XML cannot carry literally in text or an attribute.
 *
 * `&` MUST BE REPLACED FIRST, or the `&` of `&amp;` would itself be escaped
 * into `&amp;amp;`. A volunteer's title is free text and this is the only
 * place it is written into a file that is parsed rather than read: an
 * unescaped `&` makes the whole feed invalid, and a reader shows the
 * subscriber an error instead of the parish's news.
 */
export function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/**
 * RSS 2.0 `pubDate`, RFC 822, from the stored `YYYY-MM-DD`.
 *
 * UTC midnight, so the string is a function of the date alone. The date was
 * already validated by `articleSchema` (`dateParts` rejects a day that does
 * not exist), which is why this can build a `Date` from it without a second
 * check.
 */
export function rssDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toUTCString();
}

/*
 * User-facing copy, Romanian, so it carries the comma-below letters. The
 * channel title repeats the parish's name because a reader shows it as the
 * feed's name in a list where the site's own `<title>` is not visible.
 */
export const RSS_CHANNEL_TITLE = 'Parohia Sfântul Nicolae Zürich — Noutăți';
export const RSS_CHANNEL_DESCRIPTION =
  'Știrile și anunțurile Parohiei Ortodoxe Române Sfântul Nicolae din Zürich.';

/**
 * The whole feed, items newest first.
 *
 * `entries` arrives already filtered and sorted by `publishedArticles`, which
 * is the only place `published` is read. `site` is `Astro.site`, so every
 * link is absolute: a relative link in a feed resolves against whatever host
 * the reader happens to use, which is how a subscriber ends up somewhere other
 * than the parish's site.
 *
 * NO `lastBuildDate`, deliberately - see the note at the top. A reader is
 * entitled to see when the newest item was published, and `pubDate` gives it.
 */
export function generateRss(entries: ArticleEntry[], site: URL): string {
  const items = entries.map((entry) => {
    const { title, date, summary } = entry.data;
    const url = new URL(`/noutati/${articleSlug(entry.id)}/`, site).href;
    const lines = [
      '    <item>',
      `      <title>${escapeXml(title)}</title>`,
      `      <link>${escapeXml(url)}</link>`,
      `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
      `      <pubDate>${rssDate(date)}</pubDate>`,
    ];
    // A summary is optional in the schema and absent on the migrated corpus.
    // Omitting the element rather than writing an empty one: RSS 2.0 requires
    // title OR description, and an empty `<description/>` reads as an item
    // whose text was lost.
    if (summary !== undefined && summary.length > 0) {
      lines.push(`      <description>${escapeXml(summary)}</description>`);
    }
    lines.push('    </item>');
    return lines.join('\n');
  });

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<rss version="2.0">',
    '  <channel>',
    `    <title>${escapeXml(RSS_CHANNEL_TITLE)}</title>`,
    `    <link>${escapeXml(new URL('/', site).href)}</link>`,
    `    <description>${escapeXml(RSS_CHANNEL_DESCRIPTION)}</description>`,
    '    <language>ro</language>',
    ...items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}
