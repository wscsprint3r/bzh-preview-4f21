import { describe, expect, it } from 'vitest';
import { normalizeHeadingLevels } from './markdown-headings';

describe('normalizeHeadingLevels', () => {
  it('shifts an article body up so its shallowest heading is an h2', () => {
    expect(normalizeHeadingLevels('<h3 id="a">Unu</h3><h4>Doi</h4><h3>Unu</h3>')).toBe(
      '<h2 id="a">Unu</h2><h3>Doi</h3><h2>Unu</h2>',
    );
  });

  it('leaves a body that already starts at h2 alone, byte for byte', () => {
    const html = '<h2>Unu</h2><h3>Doi</h3><h2>Unu</h2>';
    expect(normalizeHeadingLevels(html)).toBe(html);
  });

  it('shifts a body that opens at h4 up to h2, not down', () => {
    expect(normalizeHeadingLevels('<h4>Unu</h4><h4>Doi</h4>')).toBe('<h2>Unu</h2><h2>Doi</h2>');
  });

  it('shifts a body that opens at h1 down, so it does not compete with the page h1', () => {
    expect(normalizeHeadingLevels('<h1>Unu</h1><h2>Doi</h2>')).toBe(
      '<h2>Unu</h2><h3>Doi</h3>',
    );
  });

  it('clamps at h6 rather than producing an h7', () => {
    expect(normalizeHeadingLevels('<h1>Unu</h1><h6>Doi</h6>')).toBe('<h2>Unu</h2><h6>Doi</h6>');
  });

  it('does nothing to a body with no heading', () => {
    const html = '<p>Unu</p><pre><code>Doi</code></pre>';
    expect(normalizeHeadingLevels(html)).toBe(html);
  });

  /*
   * The one migrated article that contains a fenced code block (an indented
   * WordPress list) is exactly where a naive transform could do damage. In
   * rendered HTML the block's text is escaped, so there is no raw `<h3` to
   * match - this asserts that rather than trusting it.
   */
  it('does not touch heading-shaped text inside a code block', () => {
    const html = '<h3>Titlu</h3><pre><code>&lt;h3&gt;nu e un titlu&lt;/h3&gt;</code></pre>';
    expect(normalizeHeadingLevels(html)).toBe(
      '<h2>Titlu</h2><pre><code>&lt;h3&gt;nu e un titlu&lt;/h3&gt;</code></pre>',
    );
  });

  it('does not mistake hr, head or html for a heading', () => {
    const html = '<head></head><hr><h3>Titlu</h3>';
    expect(normalizeHeadingLevels(html)).toBe('<head></head><hr><h2>Titlu</h2>');
  });

  it('keeps attributes on both the opening and the closing shift', () => {
    expect(normalizeHeadingLevels('<h3 class="x" data-y="z">Unu</h3>')).toBe(
      '<h2 class="x" data-y="z">Unu</h2>',
    );
  });
});
