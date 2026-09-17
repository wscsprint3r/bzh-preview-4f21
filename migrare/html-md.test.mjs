import { describe, expect, it } from 'vitest';
import { dezbracaPreambul, imaginiDin, laMarkdown } from './html-md.mjs';
import { CEDILE, VIRGULA_DEDESUBT } from '../src/lib/cedile.ts';

const PREAMBUL_REAL =
  '<p>Layouts: Popup</p>\t\t\n\t\tParohia noastra &gt; <u><b>Istoric</b></u>\t\t\n\t\t\t';

describe('dezbracarea preambulului', () => {
  it('scoate linia Layouts si firimiturile de navigare', () => {
    const dupa = dezbracaPreambul(`${PREAMBUL_REAL}<h2>Titlu</h2><p>Text.</p>`);
    expect(dupa).not.toContain('Layouts: Popup');
    expect(dupa).not.toContain('Parohia noastra');
    expect(dupa.trim().startsWith('<h2>')).toBe(true);
  });

  it('nu face nimic pe un articol, care nu are preambul', () => {
    // The strip must be a no-op here. A version that ate everything before
    // the first heading, instead of recognising the preamble by what it
    // actually says, would ALSO pass a fixture that starts with a heading -
    // there is nothing before it to eat, so a wrong strip and a right one
    // are indistinguishable there. This fixture puts a real paragraph
    // BEFORE the heading, so that mutant is forced to eat it: measured, the
    // mutant `html.replace(/^[\s\S]*?(?=<h[1-6])/i, '')` failed this test
    // (it ate the paragraph) and passed every other test in this file -
    // see task-3-report.md's fix-round section for the run.
    const articol =
      '<p>Sfanta Liturghie se va oficia duminica dimineata.</p><h3>Hramul parohiei</h3><p>Programul va fi:</p>';
    expect(dezbracaPreambul(articol)).toBe(articol);
  });

  it('nu scoate un paragraf doar fiindca este primul', () => {
    const html = '<p>Un paragraf adevarat, primul.</p><p>Al doilea.</p>';
    expect(dezbracaPreambul(html)).toBe(html);
  });

  it('nu scoate o firimitura "Layouts" care apare in mijlocul documentului', () => {
    // Pins the `^` anchor on the Layouts regex specifically. Every test
    // above either has the marker at the true start or has no marker at
    // all, so a version of `dezbracaPreambul` with that anchor removed
    // passes all of them too - measured, it does. Only a marker placed
    // AFTER real content can tell an anchored strip from an unanchored one.
    const html = '<h2>Titlu</h2><p>Text real.</p><p>Layouts: Popup</p>';
    expect(dezbracaPreambul(html)).toBe(html);
  });

  it('nu scoate o firimitura de navigare care apare in mijlocul documentului', () => {
    // Same pin, for the breadcrumb regex's anchor.
    const html = '<h2>Titlu</h2><p>Text real.</p><p>Sectiune &gt; <u><b>Alta</b></u></p>';
    expect(dezbracaPreambul(html)).toBe(html);
  });
});

describe('conversia la Markdown', () => {
  it('pastreaza titlurile, paragrafele si listele', () => {
    const md = laMarkdown('<h2>Titlu</h2><p>Text.</p><ul><li>Unu</li><li>Doi</li></ul>');
    expect(md).toContain('## Titlu');
    expect(md).toContain('Text.');
    expect(md).toContain('-   Unu');
  });

  it('normalizeaza diacriticele pe drum', () => {
    const cedila = String.fromCodePoint(CEDILE[1]);
    const virgula = String.fromCodePoint(VIRGULA_DEDESUBT[1]);
    expect(laMarkdown(`<p>Mo${cedila}ii</p>`)).toContain(`Mo${virgula}ii`);
  });

  it('nu lasa HTML brut in urma', () => {
    expect(laMarkdown('<p>a</p>')).not.toContain('<p>');
  });

  it('nu lasa tabulatoare din markupul Elementor - garantia lui Turndown, nu a curataSpatii', () => {
    // This is true, and worth guaranteeing regardless of which layer
    // provides it - but the guarantor is Turndown's own whitespace
    // collapse (every text-node run of tabs/spaces/newlines becomes one
    // space; measured in its source), not a bespoke step here. Replacing
    // `curataSpatii` with the identity function leaves this test green,
    // which is the correct verdict for THIS test - it is not the one that
    // pins `curataSpatii`. See the two tests below for the ones that do.
    expect(laMarkdown('<p>a</p>\t\t\n\t\t<p>b</p>')).not.toMatch(/\t/);
  });

  // The ruling this task adds to the brief: normalisation must run AFTER
  // Turndown, never before. `&nbsp;` is plain ASCII text in `post_content` -
  // to Task 2's `normalizeaza` it is five ordinary characters, not the
  // non-breaking space it means. Only Turndown's HTML parser decodes the
  // entity into the actual character U+00A0. Normalising first and
  // converting second would let every entity in the corpus turn into exactly
  // the character normalisation had just removed: measured in the
  // 2026-08-27 dump at 14,961 `&nbsp;` plus 6 `&#160;`, 14,967 in total,
  // against the 459 literal non-breaking spaces `normalizeaza` removes - a
  // 32x regression, invisible to a reader because U+00A0 renders as an
  // ordinary space.
  it('nu lasa spatiul neseparabil din &nbsp; sa treaca in Markdown', () => {
    const spatiuNeseparabil = String.fromCodePoint(0x00a0);
    expect(laMarkdown('<p>a&nbsp;b</p>')).not.toContain(spatiuNeseparabil);
  });

  it('nu lasa spatiul neseparabil din &#160; (forma numerica) sa treaca in Markdown', () => {
    const spatiuNeseparabil = String.fromCodePoint(0x00a0);
    expect(laMarkdown('<p>a&#160;b</p>')).not.toContain(spatiuNeseparabil);
  });

  it('pastreaza intreruperile <br> ca linii separate intr-o adresa, nu le uneste', () => {
    // Turndown emits `<br>` as two trailing spaces then a newline -
    // CommonMark's hard-line-break syntax. An earlier version of
    // `curataSpatii` stripped `[ ]{2,}\n` unconditionally, which deletes
    // exactly that marker: measured against the real corpus, 44 of these
    // across 13 documents, including `page:contact`'s address. This is the
    // regression test for that.
    const md = laMarkdown('<p>Adresa<br>Strada 1<br>8046 Zurich</p>');
    expect(md).toBe('Adresa  \nStrada 1  \n8046 Zurich');
  });

  it('curata randul gol ramas dupa un <li> cu paragraf imbricat, fara sa atinga elementele', () => {
    // Pins what `curataSpatii` actually does, since replacing it with the
    // identity function passed every other test in this file (measured).
    // WordPress's block-editor list shape is `<li><p>...</p></li>`, and
    // Turndown leaves a line of nothing but four spaces between items -
    // reproduced here on a minimal fixture shaped like the real
    // `cursuri-de-pictura` markup that first showed it.
    const md = laMarkdown('<ul><li><p>Unu</p></li><li><p>Doi</p></li></ul>');
    expect(md).toBe('-   Unu\n\n-   Doi');
  });

  it('elimina spatiul de la inceputul documentului ramas dupa un &nbsp; initial', () => {
    // Turndown strips one real leading space from the very start of a
    // document, but its check is for the literal ASCII space character - a
    // leading `&nbsp;` is not that character and survives Turndown
    // untouched, becoming an ordinary space only afterwards, when
    // `normalizeaza` runs on Turndown's output. `.trim()` is what catches
    // it; measured as a no-op on all 71 real documents, so this is defence
    // for content this corpus does not currently contain.
    expect(laMarkdown('<p>&nbsp;Text</p>')).toBe('Text');
  });

  it('pastreaza un <table> ca HTML brut, fiindca Turndown nu are regula pentru tabele', () => {
    // Measured: exactly one <table> in the migration scope, in
    // `praznicul-nasterii-domnului-hristos` (10 cells). Left to Turndown's
    // default handling, every cell becomes a separate paragraph and the
    // row/column association is gone - `turndown.keep(['table'])` avoids
    // that, and Astro's Markdown renderer passes the raw HTML through.
    const html = '<table><tr><td>A</td><td>B</td></tr></table>';
    const md = laMarkdown(html);
    expect(md).toContain('<table>');
    expect(md).toContain('<td>A</td>');
    expect(md).toContain('<td>B</td>');
  });

  it('elimina <script> si <style>, nu le transcrie ca text vizibil', () => {
    // This content comes off a server compromised twice: the correct
    // default is to drop these rather than surface their contents as
    // prose. 0 <script> and 2 <style> occur in the migration scope, both
    // outside this phase's nine pages - but the config applies regardless.
    const md = laMarkdown('<p>Text.</p><script>alert(1)</script><style>.x{color:red}</style>');
    expect(md).toBe('Text.');
  });

  it('anunta, numind documentul, cand pastreaza un table sau elimina script/style', () => {
    const scrise = [];
    const original = process.stdout.write;
    process.stdout.write = (bucata) => {
      scrise.push(bucata);
      return true;
    };
    try {
      laMarkdown('<table><tr><td>A</td></tr></table>', 'pagina-de-proba');
    } finally {
      process.stdout.write = original;
    }
    expect(scrise.join('')).toContain('pagina-de-proba');
  });
});

describe('imaginile din HTML', () => {
  it('le da in ordinea documentului', () => {
    const html = '<img src="/a.jpg"><p>x</p><img src="/b.png" width="10">';
    expect(imaginiDin(html)).toEqual(['/a.jpg', '/b.png']);
  });

  it('da o lista goala cand nu sunt imagini, nu arunca', () => {
    expect(imaginiDin('<p>x</p>')).toEqual([]);
  });

  // Cunoscute si nefixate intentionat: masurate pe cele 71 de documente ale
  // domeniului de migrare, cu 116 <img> in total, `imaginiDin` a gasit
  // exact 116 src-uri - 0 discrepante, si `srcset` (106 aparitii) nu este
  // niciodata confundat cu `src`. Testele de mai jos documenteaza cele doua
  // limite cunoscute, fara sa le corecteze - nici una nu apare in domeniu.
  it('nu gaseste o imagine care are doar data-src, fara src (limitare cunoscuta)', () => {
    expect(imaginiDin('<img data-src="/lazy.jpg">')).toEqual([]);
  });

  it('nu gaseste un src neghilimetat (limitare cunoscuta)', () => {
    expect(imaginiDin('<img src=/unquoted.jpg>')).toEqual([]);
  });
});
