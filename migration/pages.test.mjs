import { describe, expect, it } from 'vitest';
import {
  PAGES,
  assertImageLinkCount,
  assertImageTagCount,
  assertPageTitles,
  assertPagesFound,
  linkImagesIn,
  rewriteLinkedImages,
  stripAccountBlocks,
} from './pages.mjs';
import { redirectRows } from './url-map.mjs';
import { docRedirects } from './doc-convert.mjs';
import { pageSchema } from '../src/lib/content-schema.ts';
import { imagesIn } from './html-md.mjs';

describe('the eleven pages', () => {
  it('are exactly eleven', () => {
    expect(PAGES).toHaveLength(11);
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
    expect(new Set(PAGES.map((p) => p.path)).size).toBe(11);
    expect(new Set(PAGES.map((p) => p.slug)).size).toBe(11);
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
// The cursuri gallery: eleven empty anchors whose href is the full-size
// upload, with no thumbnail inside them. `stripEmptyAnchors` deletes them at
// render time because an anchor with no content has no accessible name, so the
// migration gives each one a name and the migrated file. Measured 2026-09-19
// over the nine pages: 11 anchors with an uploads-image href, all on
// `cursuri-de-pictura`, all empty, all carrying `data-elementor-lightbox-title`.
// ---------------------------------------------------------------------------

const GALLERY_HREF = 'https://www.bor-zh.ch/wp-content/uploads/2024/05/a.jpg';

describe('the linked gallery images', () => {
  it('collects an empty anchor with its lightbox title as the name', () => {
    const html =
      `<p><a href="${GALLERY_HREF}" data-elementor-open-lightbox="yes" ` +
      'data-elementor-lightbox-title="Curs Pictura 2"></a></p>';
    expect(linkImagesIn(html)).toEqual([{ href: GALLERY_HREF, name: 'Curs Pictura 2' }]);
  });

  it('falls back to the file name when the anchor carries no title', () => {
    expect(linkImagesIn(`<a href="${GALLERY_HREF}"></a>`)).toEqual([
      { href: GALLERY_HREF, name: 'a' },
    ]);
  });

  it('collapses whitespace in the title, so a newline cannot reach the link text', () => {
    const html = `<a href="${GALLERY_HREF}" data-elementor-lightbox-title="Curs\n  Pictura"></a>`;
    expect(linkImagesIn(html)).toEqual([{ href: GALLERY_HREF, name: 'Curs Pictura' }]);
  });

  it('POSITIVE CONTROL: ignores an anchor whose href is not an uploads image', () => {
    // The two ways an href is not one: it is not an image, and it is not ours.
    expect(linkImagesIn('<a href="https://www.bor-zh.ch/istoric/"></a>')).toEqual([]);
    expect(linkImagesIn('<a href="https://example.com/a.jpg"></a>')).toEqual([]);
    expect(linkImagesIn('<a href="https://www.bor-zh.ch/files/a.pdf"></a>')).toEqual([]);
  });

  it('ignores an anchor that carries visible text', () => {
    expect(linkImagesIn(`<a href="${GALLERY_HREF}">Vezi imaginea</a>`)).toEqual([]);
  });

  it('collects an anchor whose content is an image: an <img> is not visible text', () => {
    // The tag-stripped definition, pinned. The rewrite below cannot name this
    // shape (Turndown writes `[![](thumb)](full)`), so `assertImageLinkCount`
    // stops the run on it rather than letting it keep an old-host href.
    const html =
      `<a href="${GALLERY_HREF}"><img src="${GALLERY_HREF.replace('.jpg', '-300x200.jpg')}" ` +
      'alt=""></a>';
    expect(linkImagesIn(html)).toEqual([{ href: GALLERY_HREF, name: 'a' }]);
  });
});

describe('rewriting the linked gallery images', () => {
  const MAPPING = new Map([[GALLERY_HREF, 'src/assets/content/2024/05/a.jpg']]);

  it('turns an empty markdown anchor into a named link at the migrated path', () => {
    // The name matters as much as the href: `stripEmptyAnchors` removes an
    // anchor with no content, so a rewrite without a name would put the page
    // back where it started.
    expect(rewriteLinkedImages(`[](${GALLERY_HREF})`, [{ href: GALLERY_HREF, name: 'Curs Pictura 2' }], MAPPING))
      .toEqual({ markdown: '[Curs Pictura 2](../../assets/content/2024/05/a.jpg)', rewritten: 1 });
  });

  it('counts every anchor it rewrote, and separates adjacent links', () => {
    // THE SEPARATOR IS NOT COSMETIC. The source's eleven anchors sit next to
    // each other with nothing between them, so Turndown wrote the links glued
    // together; rendered, the link texts run together as one unbreakable
    // string, and axe's color-contrast rule returns an `incomplete` for two of
    // them ("partially obscured by another element") - measured, and it is a
    // red browser pass. One space between them is the fix.
    const second = GALLERY_HREF.replace('a.jpg', 'b.jpg');
    const mapping = new Map([
      [GALLERY_HREF, 'src/assets/content/2024/05/a.jpg'],
      [second, 'src/assets/content/2024/05/b.jpg'],
    ]);
    const result = rewriteLinkedImages(
      `[](${GALLERY_HREF})[](${second})`,
      [
        { href: GALLERY_HREF, name: 'prima' },
        { href: second, name: 'a doua' },
      ],
      mapping,
    );
    expect(result.rewritten).toBe(2);
    expect(result.markdown).toBe(
      '[prima](../../assets/content/2024/05/a.jpg) ' +
        '[a doua](../../assets/content/2024/05/b.jpg)',
    );
  });

  it('escapes markdown syntax in the name, so a title cannot become link structure', () => {
    // The name is text off the compromised server; unescaped, a `]` closes the
    // link early and whatever follows becomes markup.
    const result = rewriteLinkedImages(
      `[](${GALLERY_HREF})`,
      [{ href: GALLERY_HREF, name: 'x](https://evil.example)' }],
      MAPPING,
    );
    expect(result.markdown).toBe(
      '[x\\](https://evil.example)](../../assets/content/2024/05/a.jpg)',
    );
  });

  it('POSITIVE CONTROL: an href with no migrated file is a named error', () => {
    expect(() => rewriteLinkedImages(`[](${GALLERY_HREF})`, [{ href: GALLERY_HREF, name: 'x' }], new Map()))
      .toThrow(/a\.jpg/);
  });
});

describe('the image-link guard', () => {
  const HTML = `<a href="${GALLERY_HREF}"></a>`;

  it('passes when the image-anchor count equals the number rewritten', () => {
    expect(() => assertImageLinkCount('un-post', HTML, 1)).not.toThrow();
  });

  it('POSITIVE CONTROL: stops the run when an image anchor was not rewritten', () => {
    // The shape this catches: an anchor `linkImagesIn` did not collect or the
    // markdown rewrite did not find, which would keep an old-host href.
    expect(() => assertImageLinkCount('un-post', HTML, 0)).toThrow(/un-post.*1.*0/s);
  });
});

// ---------------------------------------------------------------------------
// The account paragraphs. `contact` and `doneaza` each print one IBAN in one
// paragraph of their WordPress body; Task 10 renders accounts from
// `settings.accounts`, and two copies of an IBAN is the duplication this
// project has already paid for. `servicii-liturgice` is NOT stripped: its
// account is not one the generated blocks render, so its prose stays as it is.
// Measured 2026-09-19 over the three: contact one paragraph, doneaza one,
// servicii-liturgice zero - its bank details sit between `<br>`s rather than
// in a `<p>`, which is exactly why an undeclared page must come back untouched
// rather than be judged against a count it cannot satisfy.
// ---------------------------------------------------------------------------

describe('the account blocks', () => {
  const WITH_IBAN =
    '<p>Înainte de slujbă</p>' +
    '<p>Donații în contul: <b>CH00 0000 0000 0000 0000 0</b></p>' +
    '<p>După slujbă</p>';

  it('removes the paragraph carrying an IBAN and keeps the directions around it', () => {
    const out = stripAccountBlocks(WITH_IBAN, 'contact');
    expect(out).not.toContain('CH00');
    expect(out).toContain('Înainte de slujbă');
    expect(out).toContain('După slujbă');
  });

  it('leaves an undeclared page untouched, IBAN and all', () => {
    // servicii-liturgice carries its own account and is deliberately not
    // stripped. This is the positive control for the declaration itself: a
    // function that stripped every page would pass the case above and fail
    // here.
    expect(stripAccountBlocks(WITH_IBAN, 'servicii-liturgice')).toBe(WITH_IBAN);
  });

  it('POSITIVE CONTROL: stops the run when a declared page has no IBAN paragraph', () => {
    // The "a guard must find its subject" rule: a strip that silently removed
    // nothing would let the IBAN ship in the prose beside the generated block.
    expect(() => stripAccountBlocks('<p>Fără cont aici</p>', 'contact'))
      .toThrow(/contact\.md.*removed 0/s);
  });

  it('POSITIVE CONTROL: stops the run when a declared page has two IBAN paragraphs', () => {
    const two = `${WITH_IBAN}<p>Alt cont: <b>CH11 0021 5215 3048 5502 K</b></p>`;
    expect(() => stripAccountBlocks(two, 'doneaza'))
      .toThrow(/doneaza\.md.*removed 2/s);
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

  it('has no duplicate old path, and totals 57 for the real corpus shape', () => {
    // 11 pages + 45 posts + `/program-liturgic/` + `/feed/`, minus the one post
    // row the page collision absorbs. The plan's 56 predates the collision and
    // the two Phase 3 pages (`contact`, `doneaza`) that Task 9 added.
    const rows = redirectRows(PAGES, POST_SLUGS);
    expect(rows).toHaveLength(57);
    expect(new Set(rows.map(([oldPath]) => oldPath)).size).toBe(57);
  });

  it('keeps a document row, and totals pages + fixed + posts + documents', () => {
    // The 87 migrated PDFs add one row each and collide with nothing: an old
    // `.pdf` path is not a page slug and not a post slug. The count here is
    // the same arithmetic the real corpus gets, with one document standing in
    // for the 87.
    const documents = [
      { from: '/revista/doxologia_18_2019.pdf', to: '/documente/doxologia-18-2019.pdf' },
    ];
    const rows = redirectRows(PAGES, POST_SLUGS, documents);
    expect(rows).toHaveLength(58);
    expect(rows).toContainEqual([
      '/revista/doxologia_18_2019.pdf',
      '/documente/doxologia-18-2019.pdf',
    ]);
    expect(new Set(rows.map(([oldPath]) => oldPath)).size).toBe(58);
  });

  it('adds one row per converted .doc, and the real count is 65 for the test corpus', () => {
    const converted = docRedirects();
    expect(converted).toHaveLength(8);
    const rows = redirectRows(PAGES, POST_SLUGS, [], converted);
    expect(rows).toHaveLength(65);
    expect(new Set(rows.map(([oldPath]) => oldPath)).size).toBe(65);
    expect(rows).toContainEqual([
      '/wp-content/uploads/2024/05/Ueber_die_Taufe.doc',
      '/documente/ueber-die-taufe.pdf',
    ]);
  });
});
