import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';
import { PALETTE, TEXT_ROLES, TEXT_ROLES_ON_OXBLOOD, cssTokens } from './tokens';

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
  it('uses the values from the spec', () => {
    expect(PALETTE.parchment).toBe('#FAF6EE');
    expect(PALETTE.oxblood).toBe('#6B1F26');
    expect(PALETTE['gold-text']).toBe('#8A6A28');
    expect(PALETTE.gold).toBe('#B08B3E');
  });
});

describe('contrast on the parchment ground', () => {
  it.each(TEXT_ROLES)('%s trece WCAG AA pentru text normal', (role) => {
    expect(contrastRatio(PALETTE[role], PALETTE.parchment)).toBeGreaterThanOrEqual(4.5);
  });

  it('the ornamental gold is not listed as a text role', () => {
    expect(TEXT_ROLES).not.toContain('gold');
    expect(TEXT_ROLES).not.toContain('gold-lt');
  });
});

describe('cssTokens', () => {
  it('emits every colour as a custom property', () => {
    const css = cssTokens();
    expect(css).toContain('--parchment: #FAF6EE;');
    expect(css).toContain('--gold-text: #8A6A28;');
    expect(css.startsWith(':root {')).toBe(true);
  });
});

describe('contrast on the oxblood ground', () => {
  it.each(TEXT_ROLES_ON_OXBLOOD)('%s trece WCAG AA pentru text normal', (role) => {
    expect(contrastRatio(PALETTE[role], PALETTE.oxblood)).toBeGreaterThanOrEqual(4.5);
  });
});

/*
 * The two sets are asserted to be COMPLETE, not merely correct. Listing a
 * legible token is easy; the failure mode is a list going stale — a palette
 * nudge that quietly drops a role below 4.5:1, or a new token nobody added.
 * Deriving the expected set from the measurement catches both directions.
 */
function rolesLegibleOn(ground: string): string[] {
  return Object.keys(PALETTE)
    .filter((role) => role !== ground)
    .filter((role) => contrastRatio(PALETTE[role], PALETTE[ground]) >= 4.5)
    .sort();
}

describe('the role sets are complete', () => {
  it('TEXT_ROLES lists exactly the tokens legible on parchment', () => {
    expect([...TEXT_ROLES].sort()).toEqual(rolesLegibleOn('parchment'));
  });

  it('TEXT_ROLES_ON_OXBLOOD lists exactly the tokens legible on oxblood', () => {
    expect([...TEXT_ROLES_ON_OXBLOOD].sort()).toEqual(rolesLegibleOn('oxblood'));
  });
});
