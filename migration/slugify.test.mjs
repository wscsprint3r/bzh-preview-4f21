import { describe, expect, it } from 'vitest';
import { documentSlug, slugify } from './slugify.mjs';

describe('slugify', () => {
  it('transliterates the Romanian letters explicitly', () => {
    expect(slugify('Pastorala Pogorârea Duhului Sfânt 2025')).toBe('pastorala-pogorarea-duhului-sfant-2025');
    expect(slugify('Duminica Ortodoxiei')).toBe('duminica-ortodoxiei');
    expect(slugify('Școala parohială')).toBe('scoala-parohiala');
  });

  it('maps each of the six letters, in both cases', () => {
    // The six, written out, because a single missed codepoint in the map is a
    // silent `-` in a filename rather than an error: the map is keyed by
    // codepoint and the comma-below forms do not decompose under NFD.
    expect(slugify('șțăâîȘȚĂÂÎ')).toBe('staaistaai');
  });

  it('strips accents that NFD can decompose', () => {
    expect(slugify('Zürich')).toBe('zurich');
  });

  it('collapses runs and trims the edges', () => {
    expect(slugify('  9 001 2022  PASTORALA   INVIEREA  ')).toBe('9-001-2022-pastorala-invierea');
  });

  it('is deterministic across runs', () => {
    expect(slugify('Doxologia_18_2019')).toBe(slugify('Doxologia_18_2019'));
  });
});

describe('documentSlug', () => {
  it('strips the extension and the directory', () => {
    expect(documentSlug('pastorala/PASTORALA INVIEREA DOMNULUI RO 2019.pdf'))
      .toBe('pastorala-invierea-domnului-ro-2019');
  });

  it('resolves a collision by prefixing the tree it came from', () => {
    expect(documentSlug('files/Pastorala 2020.pdf', 'files')).toBe('files-pastorala-2020');
  });

  it('strips a .PDF extension written in capitals too', () => {
    expect(documentSlug('revista/DOXOLOGIA_1_2011.PDF')).toBe('doxologia-1-2011');
  });
});
