import { describe, expect, it } from 'vitest';
import { isDated, fileName, IMPORT_STAMPS } from './articles.mjs';

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
