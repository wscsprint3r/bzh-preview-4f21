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
    // The strip must be a no-op here. A version that ate a leading paragraph
    // would remove real content from 45 posts and nothing would fail.
    const articol = '<h3>Hramul parohiei</h3><p>Programul va fi:</p>';
    expect(dezbracaPreambul(articol)).toBe(articol);
  });

  it('nu scoate un paragraf doar fiindca este primul', () => {
    const html = '<p>Un paragraf adevarat, primul.</p><p>Al doilea.</p>';
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

  it('nu lasa randuri de tabulatoare goale din markupul Elementor', () => {
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
});

describe('imaginile din HTML', () => {
  it('le da in ordinea documentului', () => {
    const html = '<img src="/a.jpg"><p>x</p><img src="/b.png" width="10">';
    expect(imaginiDin(html)).toEqual(['/a.jpg', '/b.png']);
  });

  it('da o lista goala cand nu sunt imagini, nu arunca', () => {
    expect(imaginiDin('<p>x</p>')).toEqual([]);
  });
});
