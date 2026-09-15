export const PALETA: Record<string, string> = {
  parchment: '#FAF6EE',
  raised: '#FFFDF8',
  rule: '#E3D9C6',
  oxblood: '#6B1F26',
  'oxblood-dk': '#54171D',
  'gold-text': '#8A6A28',
  gold: '#B08B3E',
  'gold-lt': '#C8A45C',
  ink: '#2A211C',
  muted: '#6E5C4E',
  faint: '#7E6C52',
};

/**
 * Tokens allowed for text on the --parchment ground, which is the page itself.
 * `gold` (#B08B3E, 2.95:1) and `gold-lt` (2.18:1) are deliberately absent: on
 * this ground they are ornament only — hairlines, borders, the dagger glyph and
 * the feast-row top rule. The approved mockups used `gold` for service times;
 * tokens.test.ts is what stops that regressing.
 */
export const ROLURI_TEXT = ['oxblood', 'oxblood-dk', 'gold-text', 'ink', 'muted', 'faint'] as const;

/**
 * Tokens legible on the --oxblood ground: Task 9's hero, and any dark panel.
 *
 * THE GOLD ROLES INVERT. Each gold is safe exactly where the other is not:
 *
 *                 on --parchment   on --oxblood
 *   --gold-text       4.67:1          2.26:1    <- fails on dark
 *   --gold-lt         2.18:1          4.82:1    <- fails on light
 *
 * The two sets are disjoint: no token in this palette is legible on both
 * grounds, so picking a text colour without knowing your ground is a coin
 * flip, not a near miss. In particular `a { color: var(--gold-text) }` in
 * global.css is right for the page and WRONG inside a dark panel, where it
 * ships 2.26:1 — worse than the 2.95:1 mockup bug this palette was split to
 * fix. A dark panel that contains a link must override that rule with a token
 * from this set.
 *
 * `rule` belongs here because it measures 8.12:1 on oxblood: it is the token
 * form of the muted light tone a dark panel wants for secondary text.
 */
export const ROLURI_TEXT_PE_OXBLOOD = ['parchment', 'raised', 'rule', 'gold-lt'] as const;

export function cssTokens(): string {
  const linii = Object.entries(PALETA).map(([k, v]) => `  --${k}: ${v};`);
  return `:root {\n${linii.join('\n')}\n}`;
}
