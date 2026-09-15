import { describe, expect, it } from 'vitest';
import { raportContrast } from './contrast';

describe('raportContrast', () => {
  it('dă 21 pentru negru pe alb', () => {
    expect(raportContrast('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
  });

  it('dă 1 pentru o culoare cu ea însăși', () => {
    expect(raportContrast('#6B1F26', '#6B1F26')).toBeCloseTo(1, 5);
  });

  it('este simetric', () => {
    expect(raportContrast('#6B1F26', '#FAF6EE'))
      .toBeCloseTo(raportContrast('#FAF6EE', '#6B1F26'), 5);
  });

  it('acceptă hex scurt', () => {
    expect(raportContrast('#000', '#fff')).toBeCloseTo(21, 1);
  });

  it('confirmă că aurul ornamental pică testul', () => {
    expect(raportContrast('#B08B3E', '#FAF6EE')).toBeLessThan(3);
  });
});
