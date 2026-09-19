import { describe, expect, it } from 'vitest';
import {
  IMPORT_STAMPS,
  assertImageReferences,
  assertStampCounts,
  categoryFor,
  fileName,
  isDated,
  rewriteDocumentLinks,
  rewriteImageSources,
} from './articles.mjs';

describe('the import dates', () => {
  it('names exactly the two measured stamps', () => {
    expect(IMPORT_STAMPS).toEqual(['2024-05-21', '2024-06-08']);
  });

  it('treats a stamp as undated and everything else as dated', () => {
    expect(isDated('2024-06-08')).toBe(false);
    expect(isDated('2024-05-21')).toBe(false);
    expect(isDated('2025-11-05')).toBe(true);
    expect(isDated('2024-06-09')).toBe(true);
  });
});

describe('the file name', () => {
  it('puts the date in front, so the folder order is the chronological order', () => {
    expect(fileName('hramul-parohiei-2024', '2024-11-04'))
      .toBe('2024-11-04-hramul-parohiei-2024.md');
  });

  it('is deterministic', () => {
    expect(fileName('a', '2024-01-01')).toBe(fileName('a', '2024-01-01'));
  });

  it('does not produce the same name for two articles on the same day', () => {
    expect(fileName('a', '2024-06-08')).not.toBe(fileName('b', '2024-06-08'));
  });
});

// ---------------------------------------------------------------------------
// The three runtime guards. Until this block existed none of them was reached
// by any test: they sat inside `extractArticles`, behind a real database, so a
// mutation that inverted a throw or deleted the whole guard left the suite
// green. They are the 45/13 contract and the silent-missing-image gate, so
// each was extracted into a pure helper and each is tested in both directions
// here - a passing case and a positive control showing it can fire.
// ---------------------------------------------------------------------------

describe('the stamp count guard', () => {
  it('passes when each stamp covers the number measured on 2026-09-17', () => {
    const counted = new Map([
      ['2024-05-21', 11],
      ['2024-06-08', 21],
    ]);
    expect(() => assertStampCounts(counted)).not.toThrow();
  });

  it('POSITIVE CONTROL: stops the run when a stamp covers a different number', () => {
    const counted = new Map([
      ['2024-05-21', 10],
      ['2024-06-08', 21],
    ]);
    expect(() => assertStampCounts(counted)).toThrow(/2024-05-21.*10.*11/s);
  });

  it('POSITIVE CONTROL: stops the run when a stamp is absent entirely', () => {
    // `counted.get` returns undefined, which is not the measured count either.
    // This is what a dump with neither stamp would produce.
    expect(() => assertStampCounts(new Map())).toThrow(/2024-05-21.*undefined/s);
  });
});

describe('the category mapper', () => {
  it('maps the two real terms to the site categories', () => {
    expect(categoryFor('un-post', ['Noutati'])).toBe('Noutati');
    expect(categoryFor('un-post', ['Catehismul Bisericii Ortodoxe'])).toBe('Cateheza');
  });

  it('POSITIVE CONTROL: refuses a post with no category', () => {
    expect(() => categoryFor('un-post', [])).toThrow(/un-post/);
  });

  it('POSITIVE CONTROL: refuses a post with more than one category', () => {
    expect(() => categoryFor('un-post', ['Noutati', 'Cateheza'])).toThrow(/un-post/);
  });

  it('POSITIVE CONTROL: refuses a term that maps to neither, never falls back to Noutati', () => {
    // A silent fallback is the failure this arm exists for: the post would
    // appear under Noutati and nothing would ever say it was the wrong place.
    expect(() => categoryFor('un-post', ['Anunturi'])).toThrow(/Anunturi/);
  });
});

describe('the unmapped-image gate', () => {
  it('passes when every reference has a destination', () => {
    const mapping = new Map([['https://x/a.jpg', 'src/assets/content/2024/05/a.jpg']]);
    expect(() => assertImageReferences('un-post', ['https://x/a.jpg'], mapping)).not.toThrow();
  });

  it('POSITIVE CONTROL: stops the run naming the post and the reference', () => {
    const mapping = new Map([['https://x/a.jpg', 'src/assets/content/2024/05/a.jpg']]);
    expect(() =>
      assertImageReferences('un-post', ['https://x/a.jpg', 'https://x/dead.jpg'], mapping),
    ).toThrow(/un-post.*dead\.jpg/s);
  });
});

describe('rewriting image sources', () => {
  it('rewrites a reference to its markdown-relative path', () => {
    const src = 'https://www.bor-zh.ch/wp-content/uploads/2024/05/hram.jpg';
    const mapping = new Map([[src, 'src/assets/content/2024/05/hram.jpg']]);
    expect(rewriteImageSources('un-post', `![hram](${src})`, [src], mapping))
      .toBe('![hram](../../assets/content/2024/05/hram.jpg)');
  });

  it('does not corrupt a source whose full URL is a prefix of another', () => {
    // The hazard a raw per-source `replaceAll` has: one full URL is a literal
    // PREFIX of another, so replacing the shorter first rewrites the longer
    // URL's prefix and the written Markdown points at a file nobody wrote.
    // The assertion after the fixture is what proves this case carries that
    // relation: an earlier version used `…/1.jpg` and `…/11.jpg`, whose FULL
    // URLs do not contain one another, so it passed with the ordering fix
    // reverted and proved nothing.
    const short = 'https://www.bor-zh.ch/wp-content/uploads/2024/05/a.jpg';
    const long = 'https://www.bor-zh.ch/wp-content/uploads/2024/05/a.jpg-300x200.jpg';
    expect(long.includes(short)).toBe(true);
    // BOTH map to `a.jpg`, which is what `migrateImages` does with a
    // `-WxH`-suffixed reference: it strips the suffix and migrates the
    // original, so the two references share one destination. The shared
    // destination is also what makes the corruption visible - a shorter-first
    // replacement leaves `…/a.jpg-300x200.jpg` behind, a path nobody wrote,
    // and the longer pass then finds nothing left to fix.
    const mapping = new Map([
      [short, 'src/assets/content/2024/05/a.jpg'],
      [long, 'src/assets/content/2024/05/a.jpg'],
    ]);
    // Passed shortest-first on purpose: the function's own ordering is what
    // has to make the longer win at that position.
    const body = `![short](${short}) and ![long](${long})`;
    expect(rewriteImageSources('un-post', body, [short, long], mapping)).toBe(
      '![short](../../assets/content/2024/05/a.jpg) and ' +
        '![long](../../assets/content/2024/05/a.jpg)',
    );
  });

  it('is a single pass: replacement text is never rescanned', () => {
    // A destination that contains another source string. Sequential
    // replacements would rewrite the destination a second time; one pass
    // cannot, because it never sees its own output.
    const url = 'https://x/one.jpg';
    const insideDestination = 'assets/content/2024/05/one.jpg';
    const mapping = new Map([
      [url, 'src/assets/content/2024/05/one.jpg'],
      [insideDestination, 'src/assets/content/2024/05/two.jpg'],
    ]);
    expect(rewriteImageSources('un-post', `![one](${url})`, [url, insideDestination], mapping))
      .toBe('![one](../../assets/content/2024/05/one.jpg)');
  });

  it('POSITIVE CONTROL: an unmapped source is a named error, not a TypeError', () => {
    // The sole call site asserts references first, so this is unreachable in
    // the extraction path today - it is defence for the pages-corpus reuse,
    // where a missing destination must not become the string "undefined" in a
    // page or a bare `Cannot read properties of undefined`.
    const src = 'https://www.bor-zh.ch/wp-content/uploads/2024/05/dead.jpg';
    let caught;
    try {
      rewriteImageSources('un-post', `![dead](${src})`, [src], new Map());
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(TypeError);
    expect(caught?.message).toMatch(/un-post.*dead\.jpg/s);
  });
});

// ---------------------------------------------------------------------------
// The old-host file links. The document map is the old path -> the file this
// run's document extraction writes; a PDF-shaped URL the map does not carry
// stops the run rather than keeping a link to a host that stops serving it.
// ---------------------------------------------------------------------------

describe('rewriting the old-host document links', () => {
  it('rewrites a mapped PDF to its absolute /documente/ path', () => {
    // Absolute, not markdown-relative: a document is a download and the route
    // depth of the page that links it must not matter.
    const map = new Map([['/revista/doxologia_18_2019.pdf', '/documente/doxologia-18-2019.pdf']]);
    expect(
      rewriteDocumentLinks(
        '[Revista](https://www.bor-zh.ch/revista/doxologia_18_2019.pdf)',
        map,
      ),
    ).toBe('[Revista](/documente/doxologia-18-2019.pdf)');
  });

  it('rewrites every occurrence, a bare URL included', () => {
    const map = new Map([['/files/SfLiturgie.pdf', '/documente/sfliturgie.pdf']]);
    const body =
      'a [x](https://www.bor-zh.ch/files/SfLiturgie.pdf) b ' +
      'https://www.bor-zh.ch/files/SfLiturgie.pdf c';
    expect(rewriteDocumentLinks(body, map)).toBe(
      'a [x](/documente/sfliturgie.pdf) b /documente/sfliturgie.pdf c',
    );
  });

  it('looks through a query string to the path, so a decorated link still maps', () => {
    // WordPress links carry `?download=1` shapes; without cutting the query,
    // the map lookup misses and a PDF-shaped link falls out of the guard.
    const map = new Map([['/files/SfLiturgie.pdf', '/documente/sfliturgie.pdf']]);
    expect(
      rewriteDocumentLinks('[x](https://www.bor-zh.ch/files/SfLiturgie.pdf?download=1)', map),
    ).toBe('[x](/documente/sfliturgie.pdf)');
  });

  it('leaves a non-PDF old-host page link alone', () => {
    // Phase 4 owns the page redirects; this function is only about files the
    // document extraction wrote.
    const url = 'https://www.bor-zh.ch/scrisoarea-pastorala-a-mitropolitului-iosif/';
    expect(rewriteDocumentLinks(`[x](${url})`, new Map())).toBe(`[x](${url})`);
  });

  it('leaves an old-host image link alone', () => {
    // `rewriteImageSources` owns every uploads image, and it has already run by
    // the time this function sees the body.
    const url = 'https://www.bor-zh.ch/wp-content/uploads/2024/05/a.jpg';
    expect(rewriteDocumentLinks(`![x](${url})`, new Map())).toBe(`![x](${url})`);
  });

  it('POSITIVE CONTROL: an unmapped PDF-shaped link stops the run naming it', () => {
    // The failure this exists for: the old host stops serving the file, the
    // page keeps the link, and nothing else notices.
    const url = 'https://www.bor-zh.ch/revista/unmapped.pdf';
    expect(() => rewriteDocumentLinks(`[x](${url})`, new Map())).toThrow(/unmapped\.pdf/);
  });

  it('POSITIVE CONTROL: the PDF test looks through a query string too', () => {
    const url = 'https://www.bor-zh.ch/revista/unmapped.pdf?download=1';
    expect(() => rewriteDocumentLinks(`[x](${url})`, new Map())).toThrow(/unmapped\.pdf/);
  });
});
