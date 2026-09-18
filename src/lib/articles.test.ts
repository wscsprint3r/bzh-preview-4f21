import { describe, expect, it } from 'vitest';
import { articleSlug, publishedArticles } from './articles';

const makeEntry = (id: string, date: string, published: boolean) => ({
  id,
  data: { title: id, date, published, category: 'Noutati' as const, author: 'Parohia' },
});

describe('publishedArticles', () => {
  it('leaves out everything that is not published', () => {
    const r = publishedArticles([makeEntry('a', '2025-01-01', true), makeEntry('b', '2025-02-01', false)]);
    expect(r.map((x) => x.id)).toEqual(['a']);
  });

  it('gives them newest to oldest', () => {
    const r = publishedArticles([
      makeEntry('old', '2024-01-01', true),
      makeEntry('new', '2025-11-05', true),
      makeEntry('middle', '2025-03-03', true),
    ]);
    expect(r.map((x) => x.id)).toEqual(['new', 'middle', 'old']);
  });

  it('stably orders two articles from the same day, by id', () => {
    // Without a tiebreak the build output changes between runs for no reason,
    // which makes every diff of `dist/` untrustworthy.
    const r = publishedArticles([makeEntry('b', '2025-01-01', true), makeEntry('a', '2025-01-01', true)]);
    expect(r.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('gives an empty list without throwing when there is no article', () => {
    expect(publishedArticles([])).toEqual([]);
  });

  it('is not a vacuous pass: 32 unpublished and 13 published split correctly', () => {
    // The shape of the real corpus, asserted as a property rather than trusted.
    const mixed = [
      ...Array.from({ length: 13 }, (_, i) => makeEntry(`p${i}`, `2025-01-${String(i + 1).padStart(2, '0')}`, true)),
      ...Array.from({ length: 32 }, (_, i) => makeEntry(`n${i}`, '2024-06-08', false)),
    ];
    expect(publishedArticles(mixed)).toHaveLength(13);
  });
});

describe('articleSlug', () => {
  it('strips the date prefix the migration writes into the filename', () => {
    expect(articleSlug('2024-11-04-hramul-parohiei-2024')).toBe('hramul-parohiei-2024');
  });

  it('strips only the one prefix, not a date that appears later in the slug', () => {
    expect(articleSlug('2024-01-01-2025-02-02-post')).toBe('2025-02-02-post');
  });

  it('leaves an id that carries no date prefix unchanged', () => {
    expect(articleSlug('an-article')).toBe('an-article');
  });

  it('leaves a bare date unchanged, because the migration never writes one', () => {
    expect(articleSlug('2024-11-04')).toBe('2024-11-04');
  });
});
