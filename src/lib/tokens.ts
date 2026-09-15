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
 * Tokens allowed for text. `gold` (#B08B3E, 2.95:1) and `gold-lt` are
 * deliberately absent: they are ornament only — hairlines, borders, the cross
 * glyph and the feast-row top rule. The approved mockups used `gold` for service
 * times; tokens.test.ts is what stops that regressing.
 */
export const ROLURI_TEXT = ['oxblood', 'oxblood-dk', 'gold-text', 'ink', 'muted', 'faint'] as const;

export function cssTokens(): string {
  const linii = Object.entries(PALETA).map(([k, v]) => `  --${k}: ${v};`);
  return `:root {\n${linii.join('\n')}\n}`;
}
