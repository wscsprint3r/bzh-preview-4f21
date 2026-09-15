import { describe, expect, it } from 'vitest';
import { raportContrast } from './contrast';
import { PALETA, ROLURI_TEXT, cssTokens } from './tokens';

describe('paleta', () => {
  it('folosește valorile din specificație', () => {
    expect(PALETA.parchment).toBe('#FAF6EE');
    expect(PALETA.oxblood).toBe('#6B1F26');
    expect(PALETA['gold-text']).toBe('#8A6A28');
    expect(PALETA.gold).toBe('#B08B3E');
  });
});

describe('contrast pe fundalul de pergament', () => {
  it.each(ROLURI_TEXT)('%s trece WCAG AA pentru text normal', (rol) => {
    expect(raportContrast(PALETA[rol], PALETA.parchment)).toBeGreaterThanOrEqual(4.5);
  });

  it('aurul ornamental nu este trecut ca rol de text', () => {
    expect(ROLURI_TEXT).not.toContain('gold');
    expect(ROLURI_TEXT).not.toContain('gold-lt');
  });
});

describe('cssTokens', () => {
  it('emite fiecare culoare ca proprietate personalizată', () => {
    const css = cssTokens();
    expect(css).toContain('--parchment: #FAF6EE;');
    expect(css).toContain('--gold-text: #8A6A28;');
    expect(css.startsWith(':root {')).toBe(true);
  });
});
