import { describe, expect, it } from 'vitest';
import type { ArticleEntry } from './articles';
import { escapeXml, generateRss, rssDate } from './rss';

const makeEntry = (id: string, date: string, title: string, summary?: string): ArticleEntry => ({
  id,
  data: {
    title,
    date,
    published: true,
    category: 'Noutati',
    author: 'Parohia',
    ...(summary === undefined ? {} : { summary }),
  },
});

const SITE = new URL('https://www.bor-zh.ch/');

describe('escapeXml', () => {
  it('escapes all five characters XML cannot carry literally', () => {
    expect(escapeXml(`A & B < C > D "E" 'F'`)).toBe(
      'A &amp; B &lt; C &gt; D &quot;E&quot; &apos;F&apos;',
    );
  });

  /*
   * The order matters and it is not visible from the output of the case above:
   * replacing `<` first and `&` last would escape the ampersands of the
   * entities just written, so `&` would come out as `&amp;amp;`. This is the
   * positive control for "& first".
   */
  it('does not double-escape the ampersand', () => {
    expect(escapeXml('&')).toBe('&amp;');
    expect(escapeXml('&amp;')).toBe('&amp;amp;');
  });

  it('leaves text with nothing to escape alone', () => {
    expect(escapeXml('Noutăți · 2025')).toBe('Noutăți · 2025');
  });
});

describe('rssDate', () => {
  // The exact string a reader parses, and a function of the stored date alone.
  it('formats a stored date as RFC 822 UTC midnight', () => {
    expect(rssDate('2025-11-05')).toBe('Wed, 05 Nov 2025 00:00:00 GMT');
  });

  it('does not read the clock: two calls, the same string', () => {
    expect(rssDate('2024-01-01')).toBe(rssDate('2024-01-01'));
  });
});

describe('generateRss', () => {
  const entries = [
    makeEntry('2024-01-01-old', '2024-01-01', 'Vechi'),
    makeEntry('2025-11-05-new', '2025-11-05', 'Nou'),
  ];

  it('writes an XML declaration and an RSS 2.0 root', () => {
    const xml = generateRss(entries, SITE);
    expect(xml.startsWith('<?xml version="1.0" encoding="utf-8"?>')).toBe(true);
    expect(xml).toContain('<rss version="2.0">');
    expect(xml).toContain('</rss>');
  });

  it('names the channel and its language', () => {
    const xml = generateRss(entries, SITE);
    expect(xml).toContain('<title>Parohia Sfântul Nicolae Zürich — Noutăți</title>');
    expect(xml).toContain('<link>https://www.bor-zh.ch/</link>');
    expect(xml).toContain('<language>ro</language>');
  });

  it('carries the entries in the order it was given them', () => {
    const xml = generateRss(entries, SITE);
    // The order is `publishedArticles`'s job; this asserts the feed does not
    // shuffle it on the way out.
    expect(xml.indexOf('Vechi</title>')).toBeLessThan(xml.indexOf('Nou</title>'));
  });

  it('writes absolute links and guids from the site', () => {
    const xml = generateRss(entries, SITE);
    expect(xml).toContain('<link>https://www.bor-zh.ch/noutati/new/</link>');
    expect(xml).toContain('<guid isPermaLink="true">https://www.bor-zh.ch/noutati/old/</guid>');
  });

  it('escapes a title a volunteer could actually type', () => {
    const xml = generateRss([makeEntry('2025-01-01-x', '2025-01-01', 'Pâine & vin')], SITE);
    expect(xml).toContain('<title>Pâine &amp; vin</title>');
    expect(xml).not.toContain('Pâine & vin');
  });

  it('writes a description when the post has a summary, and nothing when it has none', () => {
    const withSummary = generateRss(
      [makeEntry('2025-01-01-x', '2025-01-01', 'Titlu', 'Un <rezumat>')],
      SITE,
    );
    expect(withSummary).toContain('<description>Un &lt;rezumat&gt;</description>');
    const without = generateRss([makeEntry('2025-01-01-x', '2025-01-01', 'Titlu')], SITE);
    // The channel carries a `<description>` of its own, so the absence is
    // asserted from the first item onwards.
    expect(without.slice(without.indexOf('<item>'))).not.toContain('<description>');
  });

  /*
   * THE BUILD CLOCK IS THE DEFECT THIS FILE EXISTS TO KEEP OUT. A
   * `lastBuildDate` from `Date.now()` would make two builds of unchanged
   * content produce different bytes, which is how a `dist/` diff stops being
   * readable and how a "nothing changed" deploy looks changed.
   */
  it('carries no build-clock data', () => {
    const xml = generateRss(entries, SITE);
    expect(xml).not.toContain('lastBuildDate');
    expect(xml).not.toContain('generator');
    expect(xml).toContain('<pubDate>Wed, 05 Nov 2025 00:00:00 GMT</pubDate>');
  });

  it('produces the same bytes for the same input, twice', () => {
    expect(generateRss(entries, SITE)).toBe(generateRss(entries, SITE));
  });
});
