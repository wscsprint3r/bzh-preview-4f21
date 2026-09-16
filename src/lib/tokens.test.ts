import { describe, expect, it } from 'vitest';
import { raportContrast } from './contrast';
import { PALETA, ROLURI_TEXT, ROLURI_TEXT_PE_OXBLOOD, cssTokens } from './tokens';

/*
 * WHAT THIS PROVES: the palette's contrast arithmetic. Every token named as a
 * text role clears 4.5:1 against the surface it is declared for, each role set
 * lists exactly the tokens that do, and the ornamental golds are excluded from
 * the parchment set. Pure computation over values — no CSS, no cascade.
 *
 * WHAT THIS DOES NOT PROVE: that any of it reaches a visitor, or that a colour
 * is used on the surface it was measured against. That is `npm run a11y`.
 */

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

describe('contrast pe fundalul de oxblood', () => {
  it.each(ROLURI_TEXT_PE_OXBLOOD)('%s trece WCAG AA pentru text normal', (rol) => {
    expect(raportContrast(PALETA[rol], PALETA.oxblood)).toBeGreaterThanOrEqual(4.5);
  });
});

/*
 * The two sets are asserted to be COMPLETE, not merely correct. Listing a
 * legible token is easy; the failure mode is a list going stale — a palette
 * nudge that quietly drops a role below 4.5:1, or a new token nobody added.
 * Deriving the expected set from the measurement catches both directions.
 */
function roluriLizibilePe(fundal: string): string[] {
  return Object.keys(PALETA)
    .filter((rol) => rol !== fundal)
    .filter((rol) => raportContrast(PALETA[rol], PALETA[fundal]) >= 4.5)
    .sort();
}

describe('seturile de roluri sunt complete', () => {
  it('ROLURI_TEXT enumeră exact tokenurile lizibile pe pergament', () => {
    expect([...ROLURI_TEXT].sort()).toEqual(roluriLizibilePe('parchment'));
  });

  it('ROLURI_TEXT_PE_OXBLOOD enumeră exact tokenurile lizibile pe oxblood', () => {
    expect([...ROLURI_TEXT_PE_OXBLOOD].sort()).toEqual(roluriLizibilePe('oxblood'));
  });
});
