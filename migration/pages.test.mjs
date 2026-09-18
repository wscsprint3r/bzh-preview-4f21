import { describe, expect, it } from 'vitest';
import { PAGES, assertImageTagCount, assertPageTitles, assertPagesFound } from './pages.mjs';
import { redirectRows } from './url-map.mjs';
import { pageSchema } from '../src/lib/content-schema.ts';
import { imagesIn } from './html-md.mjs';

describe('the nine pages', () => {
  it('are exactly nine', () => {
    expect(PAGES).toHaveLength(9);
  });

  it('every path passes the schema, so every route will build', () => {
    // The route is built as `/${path}/`. Validating here rather than at build
    // time means a bad path fails in the migration, where somebody is looking,
    // instead of producing a 404 page that reads correctly.
    for (const p of PAGES) {
      expect(() => pageSchema.parse({ title: p.title, path: p.path, order: p.order }))
        .not.toThrow();
    }
  });

  it('has no two pages on the same path or the same slug', () => {
    expect(new Set(PAGES.map((p) => p.path)).size).toBe(9);
    expect(new Set(PAGES.map((p) => p.slug)).size).toBe(9);
  });

  it('the order is in tens, so one can be inserted between two others', () => {
    for (const p of PAGES) expect(p.order % 10).toBe(0);
    const orders = PAGES.map((p) => p.order);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  });
});

// ---------------------------------------------------------------------------
// The three runtime guards, extracted so they can be shown to fire without
// Docker. Until this block existed the missing-page throw, the title-drift
// throw and the <img>-count assertion sat inside `extractPages`, behind a real
// database, where no test could reach them - the same arrangement Task 6 had
// to fix for its own guards.
// ---------------------------------------------------------------------------

describe('the missing-page guard', () => {
  it('passes when every slug in the table has a row', () => {
    const bySlug = new Map(PAGES.map((p) => [p.slug, { content: '' }]));
    expect(() => assertPagesFound(PAGES, bySlug)).not.toThrow();
  });

  it('POSITIVE CONTROL: names every slug the dump does not have', () => {
    const bySlug = new Map(
      PAGES.filter((p) => p.slug !== 'studii').map((p) => [p.slug, { content: '' }]),
    );
    expect(() => assertPagesFound(PAGES, bySlug)).toThrow(/studii/);
  });
});

describe('the page title guard', () => {
  it('passes when the database title equals the table title', () => {
    const titles = new Map(PAGES.map((p) => [p.slug, p.title]));
    expect(() => assertPageTitles(PAGES, titles)).not.toThrow();
  });

  it('POSITIVE CONTROL: stops the run when the dump title has drifted', () => {
    // A title silently differing from the table is exactly what the codepoint
    // sweep cannot see: the wrong title is a valid string of valid letters.
    const titles = new Map(PAGES.map((p) => [p.slug, p.title]));
    titles.set('istoric', 'Istoria parohiei');
    expect(() => assertPageTitles(PAGES, titles)).toThrow(/istoric.*Istoria parohiei/s);
  });
});

describe('the image tag guard', () => {
  it('passes when every <img> yielded a readable src', () => {
    const html = '<p><img src="a.jpg"></p><p><img src="b.jpg"></p>';
    expect(() => assertImageTagCount('un-post', html, imagesIn(html))).not.toThrow();
  });

  it('POSITIVE CONTROL: stops the run when an <img> carries no readable src', () => {
    // A lazy-load `data-src` with no `src` is a real WordPress shape and a
    // documented limit of `imagesIn`; this assertion is what turns it into a
    // stopped run instead of a silently missing picture.
    const html = '<img src="a.jpg"><img data-src="lazy.jpg">';
    expect(() => assertImageTagCount('un-post', html, imagesIn(html))).toThrow(/un-post.*2.*1/s);
  });
});

// ---------------------------------------------------------------------------
// The URL map's one collision, ruled 2026-09-18: `/scoala-parohiala/` is both
// a page and a held-back post in the dump, and the PAGE wins. The post row
// would land on `/noutati/scoala-parohiala/`, which has no page while the post
// stays `published: false` - a redirect to a 404 is the failure the URL map
// exists to avoid - and the old site's own menu pointed at the school page.
// ---------------------------------------------------------------------------

describe('the URL map', () => {
  /** 45 post slugs of which one collides with a page, as the real dump does. */
  const POST_SLUGS = [
    ...Array.from({ length: 44 }, (_, i) => `un-post-${String(i).padStart(2, '0')}`),
    'scoala-parohiala',
  ];

  it('resolves the page/post collision to the page, and drops the post row', () => {
    const rows = redirectRows(PAGES, ['scoala-parohiala']);
    expect(rows.filter(([oldPath]) => oldPath === '/scoala-parohiala/'))
      .toEqual([['/scoala-parohiala/', '/comunitate/scoala/']]);
  });

  it('has no duplicate old path, and totals 55 for the real corpus shape', () => {
    // 9 pages + 45 posts + `/program-liturgic/` + `/feed/`, minus the one post
    // row the page collision absorbs. The plan's 56 predates the collision.
    const rows = redirectRows(PAGES, POST_SLUGS);
    expect(rows).toHaveLength(55);
    expect(new Set(rows.map(([oldPath]) => oldPath)).size).toBe(55);
  });
});
