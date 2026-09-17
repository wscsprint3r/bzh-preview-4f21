import { describe, expect, it } from 'vitest';
import { stripPreamble, imagesIn, toMarkdown } from './html-md.mjs';
import { CEDILLAS, COMMA_BELOW } from '../src/lib/cedilla.ts';

const REAL_PREAMBLE =
  '<p>Layouts: Popup</p>\t\t\n\t\tParohia noastra &gt; <u><b>Istoric</b></u>\t\t\n\t\t\t';

describe('dezbracarea preambulului', () => {
  it('removes the Layouts line and the breadcrumbs', () => {
    const after = stripPreamble(`${REAL_PREAMBLE}<h2>Titlu</h2><p>Text.</p>`);
    expect(after).not.toContain('Layouts: Popup');
    expect(after).not.toContain('Parohia noastra');
    expect(after.trim().startsWith('<h2>')).toBe(true);
  });

  it('does nothing to a post, which has no preamble', () => {
    // The strip must be a no-op here. A version that ate everything before
    // the first heading, instead of recognising the preamble by what it
    // actually says, would ALSO pass a fixture that starts with a heading -
    // there is nothing before it to eat, so a wrong strip and a right one
    // are indistinguishable there. This fixture puts a real paragraph
    // BEFORE the heading, so that mutant is forced to eat it: measured, the
    // mutant `html.replace(/^[\s\S]*?(?=<h[1-6])/i, '')` failed this test
    // (it ate the paragraph) and passed every other test in this file -
    // see task-3-report.md's fix-round section for the run.
    const article =
      '<p>Sfanta Liturghie se va oficia duminica dimineata.</p><h3>Hramul parohiei</h3><p>Programul va fi:</p>';
    expect(stripPreamble(article)).toBe(article);
  });

  it('does not remove a paragraph just because it is the first', () => {
    const html = '<p>Un paragraf adevarat, primul.</p><p>Al doilea.</p>';
    expect(stripPreamble(html)).toBe(html);
  });

  it('does not remove a "Layouts" breadcrumb that appears in the middle of the document', () => {
    // Pins the `^` anchor on the Layouts regex specifically. Every test
    // above either has the marker at the true start or has no marker at
    // all, so a version of `stripPreamble` with that anchor removed
    // passes all of them too - measured, it does. Only a marker placed
    // AFTER real content can tell an anchored strip from an unanchored one.
    const html = '<h2>Titlu</h2><p>Text real.</p><p>Layouts: Popup</p>';
    expect(stripPreamble(html)).toBe(html);
  });

  it('does not remove a breadcrumb that appears in the middle of the document', () => {
    // Same pin, for the breadcrumb regex's anchor.
    const html = '<h2>Titlu</h2><p>Text real.</p><p>Sectiune &gt; <u><b>Alta</b></u></p>';
    expect(stripPreamble(html)).toBe(html);
  });
});

describe('conversion to Markdown', () => {
  it('keeps the headings, the paragraphs and the lists', () => {
    const md = toMarkdown('<h2>Titlu</h2><p>Text.</p><ul><li>Unu</li><li>Doi</li></ul>');
    expect(md).toContain('## Titlu');
    expect(md).toContain('Text.');
    expect(md).toContain('-   Unu');
  });

  it('normalises the diacritics on the way', () => {
    const cedilla = String.fromCodePoint(CEDILLAS[1]);
    const comma = String.fromCodePoint(COMMA_BELOW[1]);
    expect(toMarkdown(`<p>Mo${cedilla}ii</p>`)).toContain(`Mo${comma}ii`);
  });

  it('leaves no raw HTML behind', () => {
    expect(toMarkdown('<p>a</p>')).not.toContain('<p>');
  });

  it("leaves no tabs from Elementor's markup - Turndown's guarantee, not cleanWhitespace's", () => {
    // This is true, and worth guaranteeing regardless of which layer
    // provides it - but the guarantor is Turndown's own whitespace
    // collapse (every text-node run of tabs/spaces/newlines becomes one
    // space; measured in its source), not a bespoke step here. Replacing
    // `cleanWhitespace` with the identity function leaves this test green,
    // which is the correct verdict for THIS test - it is not the one that
    // pins `cleanWhitespace`. See the two tests below for the ones that do.
    expect(toMarkdown('<p>a</p>\t\t\n\t\t<p>b</p>')).not.toMatch(/\t/);
  });

  // The ruling this task adds to the brief: normalisation must run AFTER
  // Turndown, never before - see `toMarkdown`'s docblock in html-md.mjs for
  // the full reasoning and the measured entity counts. Kept to one line here
  // on purpose: the two copies of that paragraph used to say the same ten
  // lines, which is the duplication this project keeps paying for.
  it('does not let the non-breaking space from &nbsp; through into Markdown', () => {
    const nbsp = String.fromCodePoint(0x00a0);
    expect(toMarkdown('<p>a&nbsp;b</p>')).not.toContain(nbsp);
  });

  it('does not let the non-breaking space from &#160; (numeric form) through into Markdown', () => {
    const nbsp = String.fromCodePoint(0x00a0);
    expect(toMarkdown('<p>a&#160;b</p>')).not.toContain(nbsp);
  });

  it('keeps <br> breaks as separate lines in an address, does not join them', () => {
    // Turndown emits `<br>` as two trailing spaces then a newline -
    // CommonMark's hard-line-break syntax. An earlier version of
    // `cleanWhitespace` stripped `[ ]{2,}\n` unconditionally, which deletes
    // exactly that marker: measured against the real corpus, 44 of these
    // across 13 documents, including `page:contact`'s address. This is the
    // regression test for that.
    const md = toMarkdown('<p>Adresa<br>Strada 1<br>8046 Zurich</p>');
    expect(md).toBe('Adresa  \nStrada 1  \n8046 Zurich');
  });

  it('cleans the blank line left after a <li> with a nested paragraph, without touching the items', () => {
    // Pins what `cleanWhitespace` actually does, since replacing it with the
    // identity function passed every other test in this file (measured).
    // WordPress's block-editor list shape is `<li><p>...</p></li>`, and
    // Turndown leaves a line of nothing but four spaces between items -
    // reproduced here on a minimal fixture shaped like the real
    // `cursuri-de-pictura` markup that first showed it.
    const md = toMarkdown('<ul><li><p>Unu</p></li><li><p>Doi</p></li></ul>');
    expect(md).toBe('-   Unu\n\n-   Doi');
  });

  it('removes the leading space left at the start of the document by an initial &nbsp;', () => {
    // Turndown strips one real leading space from the very start of a
    // document, but its check is for the literal ASCII space character - a
    // leading `&nbsp;` is not that character and survives Turndown
    // untouched, becoming an ordinary space only afterwards, when
    // `normalize` runs on Turndown's output. `.trim()` is what catches
    // it; measured as a no-op on all 71 real documents, so this is defence
    // for content this corpus does not currently contain.
    expect(toMarkdown('<p>&nbsp;Text</p>')).toBe('Text');
  });

  it('keeps a <table> as raw HTML, because Turndown has no rule for tables', () => {
    // Measured: exactly one <table> in the migration scope, in
    // `praznicul-nasterii-domnului-hristos` (10 cells). Left to Turndown's
    // default handling, every cell becomes a separate paragraph and the
    // row/column association is gone - `turndown.keep(['table'])` avoids
    // that, and Astro's Markdown renderer passes the raw HTML through.
    const html = '<table><tr><td>A</td><td>B</td></tr></table>';
    const md = toMarkdown(html);
    expect(md).toContain('<table>');
    expect(md).toContain('<td>A</td>');
    expect(md).toContain('<td>B</td>');
  });

  it('removes <script> and <style>, does not transcribe them as visible text', () => {
    // This content comes off a server compromised twice: the correct
    // default is to drop these rather than surface their contents as
    // prose. 0 <script> and 2 <style> occur in the migration scope, both
    // outside this phase's nine pages - but the config applies regardless.
    const md = toMarkdown('<p>Text.</p><script>alert(1)</script><style>.x{color:red}</style>');
    expect(md).toBe('Text.');
  });

  it('announces, naming the document, when it keeps a table or removes script/style', () => {
    const written = [];
    const original = process.stdout.write;
    process.stdout.write = (piece) => {
      written.push(piece);
      return true;
    };
    try {
      toMarkdown('<table><tr><td>A</td></tr></table>', 'pagina-de-proba');
    } finally {
      process.stdout.write = original;
    }
    expect(written.join('')).toContain('pagina-de-proba');
  });
});

describe('the images in the HTML', () => {
  it('gives them in document order', () => {
    const html = '<img src="/a.jpg"><p>x</p><img src="/b.png" width="10">';
    expect(imagesIn(html)).toEqual(['/a.jpg', '/b.png']);
  });

  it('gives an empty list when there are no images, does not throw', () => {
    expect(imagesIn('<p>x</p>')).toEqual([]);
  });

  it('keeps the duplicates, does not drop them', () => {
    // Pins the "duplicates included" claim in the docblock: a de-duping
    // implementation (a Set, say) would pass every other test in this file
    // and fail only this one - measured, it does.
    expect(imagesIn('<img src="/a.jpg"><img src="/a.jpg">')).toEqual(['/a.jpg', '/a.jpg']);
  });

  it('gives an empty list on an empty string, does not throw', () => {
    expect(imagesIn('')).toEqual([]);
  });

  it('gives an empty list for an <img> with no src, does not throw', () => {
    expect(imagesIn('<img alt="fara sursa">')).toEqual([]);
  });

  // Cunoscute si nefixate intentionat: masurate pe cele 71 de documente ale
  // domeniului de migrare, cu 116 <img> in total, `imagesIn` a gasit
  // exact 116 src-uri - 0 discrepante, si `srcset` (106 aparitii) nu este
  // niciodata confundat cu `src`. Testele de mai jos documenteaza cele doua
  // limite cunoscute, fara sa le corecteze - nici una nu apare in domeniu.
  it('does not find an image that has only data-src, without src (known limitation)', () => {
    expect(imagesIn('<img data-src="/lazy.jpg">')).toEqual([]);
  });

  it('does not find an unquoted src (known limitation)', () => {
    expect(imagesIn('<img src=/unquoted.jpg>')).toEqual([]);
  });
});
