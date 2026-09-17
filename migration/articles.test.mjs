import { describe, expect, it } from 'vitest';
import {
  IMPORT_STAMPS,
  assertImageReferences,
  assertStampCounts,
  categoryFor,
  fileName,
  isDated,
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
    expect(rewriteImageSources(`![hram](${src})`, [src], mapping))
      .toBe('![hram](../../assets/content/2024/05/hram.jpg)');
  });

  it('does not corrupt a source that is a literal substring of another', () => {
    // The hazard a raw per-source `replaceAll` has: `…/1.jpg` is a substring
    // of `…/11.jpg`, so replacing the shorter first rewrites the longer URL's
    // prefix and the written Markdown points at a file nobody wrote. The
    // single pass, longest alternative first, is what this pins.
    const short = 'https://www.bor-zh.ch/wp-content/uploads/2024/05/1.jpg';
    const long = 'https://www.bor-zh.ch/wp-content/uploads/2024/05/11.jpg';
    const mapping = new Map([
      [short, 'src/assets/content/2024/05/1.jpg'],
      [long, 'src/assets/content/2024/05/11.jpg'],
    ]);
    const body = `![eleven](${long}) and ![one](${short})`;
    expect(rewriteImageSources(body, [short, long], mapping)).toBe(
      '![eleven](../../assets/content/2024/05/11.jpg) and ![one](../../assets/content/2024/05/1.jpg)',
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
    expect(rewriteImageSources(`![one](${url})`, [url, insideDestination], mapping))
      .toBe('![one](../../assets/content/2024/05/one.jpg)');
  });
});
