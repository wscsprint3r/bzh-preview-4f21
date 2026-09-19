import { describe, expect, it } from 'vitest';
import { resolveContentAssetLinks, stripEmptyAnchors } from './markdown-links';

describe('stripEmptyAnchors', () => {
  it('removes the shape the migrated gallery wrote', () => {
    expect(stripEmptyAnchors('<p><a href="https://example.com/full.jpg"></a></p>')).toBe('<p></p>');
  });

  it('removes several in a row, the way the page carries them', () => {
    expect(
      stripEmptyAnchors('<a href="https://example.com/1.jpg"></a><a href="https://example.com/2.jpg"></a>'),
    ).toBe('');
  });

  it('removes a whitespace-only anchor', () => {
    expect(stripEmptyAnchors('<a href="/x">  \n </a>')).toBe('');
  });

  it('keeps an anchor with text', () => {
    const html = '<a href="/x">Citește mai mult</a>';
    expect(stripEmptyAnchors(html)).toBe(html);
  });

  it('keeps an anchor whose only content is an image', () => {
    const html = '<a href="/full.jpg"><img src="/thumb.jpg" alt="Icoană"></a>';
    expect(stripEmptyAnchors(html)).toBe(html);
  });

  /*
   * The boundary of the rule, stated: an element inside the anchor is content
   * even when it reads as empty, so this function leaves it alone. Whether an
   * image with `alt=""` is decorative or undescribed is a different question
   * with a different repair, and this one must not answer it by deletion.
   */
  it('keeps an anchor whose only content is an image with empty alt', () => {
    const html = '<a href="/full.jpg"><img src="/thumb.jpg" alt=""></a>';
    expect(stripEmptyAnchors(html)).toBe(html);
  });

  it('keeps an anchor whose only content is an entity', () => {
    const html = '<a href="/x">&nbsp;</a>';
    expect(stripEmptyAnchors(html)).toBe(html);
  });

  it('keeps an anchor with an element inside even when the element is empty', () => {
    const html = '<a href="/x"><span></span></a>';
    expect(stripEmptyAnchors(html)).toBe(html);
  });

  /*
   * The attribute case that a naive `<a\b[^>]*>` gets wrong: a `>` inside a
   * quoted value. It would cut the tag in half, match nothing, and leave the
   * empty anchor on the page with the guard green.
   */
  it('removes an empty anchor whose attributes contain a quoted >', () => {
    expect(stripEmptyAnchors('<a title="a > b" href="/x"></a>')).toBe('');
  });

  it('does not touch elements that merely start with an a', () => {
    const html = '<abbr title="Sfânt">Sf.</abbr><address>Zürich</address>';
    expect(stripEmptyAnchors(html)).toBe(html);
  });

  it('leaves a body with no anchor byte for byte', () => {
    const html = '<h2>Istoric</h2><p>Text.</p>';
    expect(stripEmptyAnchors(html)).toBe(html);
  });

  it('is not fooled by an anchor tag inside a code block', () => {
    // Rendered HTML escapes the block's markup, so there is no real tag to
    // match; the escaped text must survive.
    const html = '<pre><code>&lt;a href="x"&gt;&lt;/a&gt;</code></pre>';
    expect(stripEmptyAnchors(html)).toBe(html);
  });
});

/*
 * The render-time half of the migration's gallery-link rewrite. The migration
 * writes `[name](../../assets/content/…)`, which Markdown resolves relative to
 * the `.md` file; Astro's pipeline rewrites markdown IMAGES, not link nodes, so
 * without this transform the href ships verbatim and resolves to
 * `/assets/content/…`, which the host does not serve. The built output is what
 * `build-output.itest.ts` proves; these cases pin the rewrite, the fail-loud
 * arm and the shapes the rule must not touch.
 */
describe('resolveContentAssetLinks', () => {
  const NAME = '299423305_1614472635615639_144441808512976432_n';
  const ASSET = `../../assets/content/2024/05/${NAME}.jpg`;

  it('rewrites the measured gallery shape to an emitted asset URL', () => {
    const out = resolveContentAssetLinks(`<a href="${ASSET}">${NAME}</a>`);
    const href = /href="([^"]+)"/.exec(out)?.[1];
    expect(href, 'the anchor lost its href').toBeDefined();
    expect(href).not.toBe(ASSET);
    expect(href?.startsWith('/'), `${href} is not root-relative`).toBe(true);
    expect(out).toContain(`>${NAME}</a>`);
  });

  it('rewrites a one-level relative path the same way', () => {
    const oneLevel = `../assets/content/2024/05/${NAME}.jpg`;
    expect(resolveContentAssetLinks(`<a href="${oneLevel}">x</a>`)).toBe(
      resolveContentAssetLinks(`<a href="${ASSET}">x</a>`),
    );
  });

  it('resolves a percent-encoded destination to the same URL', () => {
    const encoded = ASSET.replace('432_n.jpg', '432_%6E.jpg');
    expect(resolveContentAssetLinks(`<a href="${encoded}">x</a>`)).toBe(
      resolveContentAssetLinks(`<a href="${ASSET}">x</a>`),
    );
  });

  it('throws, naming the file, when the asset is not in the repository', () => {
    expect(() =>
      resolveContentAssetLinks('<a href="../../assets/content/2024/05/nu-exista.jpg">x</a>'),
    ).toThrow(/nu-exista\.jpg/);
  });

  it('leaves every href that is not a migrated content asset byte for byte', () => {
    const untouched = [
      'https://www.bor-zh.ch/wp-content/uploads/2024/05/a.jpg',
      '/documente/doxologia-4-2012.pdf',
      'mailto:ruxandralacatus@yahoo.com',
      '/src/assets/content/2024/05/a.jpg',
      'https://example.com/../../assets/content/2024/05/a.jpg',
      '#content',
    ];
    for (const href of untouched) {
      const html = `<a href="${href}">x</a>`;
      expect(resolveContentAssetLinks(html), href).toBe(html);
    }
  });

  it("keeps the anchor's other attributes and its content", () => {
    const out = resolveContentAssetLinks(`<a title="a > b" href="${ASSET}">nume</a>`);
    expect(out).toContain('title="a > b"');
    expect(out).toContain('>nume</a>');
  });

  it('leaves an anchor with no href alone', () => {
    const html = '<a name="top">sus</a>';
    expect(resolveContentAssetLinks(html)).toBe(html);
  });

  it('is safe after stripEmptyAnchors: an empty anchor is removed, not made fatal', () => {
    const html =
      '<a href="../../assets/content/2024/05/nu-exista.jpg"></a>' + `<a href="${ASSET}">nume</a>`;
    const out = resolveContentAssetLinks(stripEmptyAnchors(html));
    expect(out).not.toContain('nu-exista');
    expect(out).toContain('>nume</a>');
  });
});
