import { describe, expect, it } from 'vitest';
import { stripEmptyAnchors } from './markdown-links';

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
