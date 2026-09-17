import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';

describe('contrastRatio', () => {
  it('gives 21 for black on white', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
  });

  it('gives 1 for a colour against itself', () => {
    expect(contrastRatio('#6B1F26', '#6B1F26')).toBeCloseTo(1, 5);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#6B1F26', '#FAF6EE'))
      .toBeCloseTo(contrastRatio('#FAF6EE', '#6B1F26'), 5);
  });

  it('accepts short hex', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 1);
  });

  it('confirms that the ornamental gold fails the test', () => {
    expect(contrastRatio('#B08B3E', '#FAF6EE')).toBeLessThan(3);
  });
});
