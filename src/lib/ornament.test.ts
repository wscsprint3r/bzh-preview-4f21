import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * tokens.test.ts proves the ornamental golds are not *listed* as text roles.
 * It cannot prove nobody used one as a `color` anyway — that lives in CSS, not
 * in the token table. This file closes that gap.
 *
 * Scope: the stylesheet, the layouts and the components. Every rule in those
 * paints on --parchment or --raised, where --gold measures 2.95:1 / 3.13:1 and
 * --gold-lt 2.18:1 / 2.32:1 — both fail WCAG AA at every size. `src/pages/` is
 * deliberately out of scope because a page may own a dark panel, and on
 * --oxblood --gold-lt measures 4.82:1 and is legitimate; deciding that needs
 * the ground, which a text scan cannot see.
 *
 * The scan is deliberately over-approximate: it reads whole files, so an
 * inline style= attribute is covered too, at the price of a possible false
 * positive from a stray `color:` in prose. A false positive is loud; a false
 * negative would be silent.
 */

const RADACINA = fileURLToPath(new URL('../../', import.meta.url));

// Directories, not a file list: the guard grows with the codebase on purpose.
// A new component that wants gold text should have to answer this question,
// not slip past a list nobody remembered to update.
const DIRECTOARE: [string, RegExp][] = [
  ['src/styles', /\.css$/],
  ['src/layouts', /\.astro$/],
  ['src/components', /\.astro$/],
];

function fisiereScanate(): string[] {
  const gasite: string[] = [];
  for (const [dir, extensie] of DIRECTOARE) {
    for (const nume of readdirSync(RADACINA + dir)) {
      if (extensie.test(nume)) gasite.push(dir + '/' + nume);
    }
  }
  return gasite.sort();
}

/**
 * A readdir that quietly returned nothing would make every case below vacuous.
 * That is not hypothetical: the first version of this guard read the files with
 * import.meta.glob(..., { query: '?raw' }), and Vite handed back an EMPTY
 * STRING for the .css file while the .astro files came through intact. It passed,
 * and it was inert on the one file that matters most.
 */
const OBLIGATORII = [
  'src/components/SiteFooter.astro',
  'src/components/SiteHeader.astro',
  'src/layouts/Base.astro',
  'src/styles/global.css',
];

/**
 * The single sanctioned use of ornamental gold as a CSS `color`: the cross
 * glyph in the site header. It is aria-hidden="true" and carries no
 * information, so WCAG 1.4.3 exempts it as pure decoration, and the palette
 * names the cross glyph among the ornament roles beside hairlines and borders.
 * Anything else fails — including a *second* gold colour in this same file,
 * because the value below is an exact list, not a permission.
 */
const EXCEPTII: Record<string, string[]> = {
  'src/components/SiteHeader.astro': ['color: var(--gold-lt)'],
};

const AUR_ORNAMENTAL = ['var(--gold)', 'var(--gold-lt)'];

function faraComentarii(sursa: string): string {
  return sursa.replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/** Every declaration that paints *text* with an ornament-only gold. */
export function auriDeText(sursa: string): string[] {
  // The leading class is what keeps `background-color` and `border-color` out:
  // in those the token `color` is preceded by a hyphen, not by a brace, a
  // semicolon or a quote. The quotes are in it so that an inline style="..."
  // attribute is covered too — the positive control below found that gap.
  const re = /(?:^|[;{"'])\s*(-webkit-text-fill-color|color)\s*:\s*([^;}"']+)/g;
  const gasite: string[] = [];
  let m: RegExpExecArray | null;
  const curat = faraComentarii(sursa);
  while ((m = re.exec(curat)) !== null) {
    const proprietate = m[1] as string;
    const valoare = (m[2] as string).replace(/\s+/g, ' ').trim();
    const compact = valoare.split(' ').join('');
    // `var(--gold-text)` does not contain `var(--gold)`: the closing paren is
    // part of the needle, which is the whole point of matching it this way.
    if (AUR_ORNAMENTAL.some((aur) => compact.includes(aur))) {
      gasite.push(`${proprietate}: ${valoare}`);
    }
  }
  return gasite;
}

describe('auriDeText', () => {
  // Control pozitiv. Without this the guard below could be silently inert —
  // a regex mangled on its way to disk would report "no violations" forever.
  const FIXTURI: [string, string[]][] = [
    ['.x { color: var(--gold); }', ['color: var(--gold)']],
    ['.x{color:var(--gold-lt)}', ['color: var(--gold-lt)']],
    ['.x { color : var(--gold) ; }', ['color: var(--gold)']],
    ['<p style="color: var(--gold-lt)">', ['color: var(--gold-lt)']],
    ['.x { color: var(--gold-text); }', []],
    ['.x { border-color: var(--gold-lt); }', []],
    ['.x { background-color: var(--gold); }', []],
    ['.x { border-bottom: 1.5px solid var(--gold-lt); }', []],
    ['.x { box-shadow: inset 0 2px 0 var(--gold-lt); }', []],
    ['.x { color: var(--oxblood); border-top: 1px solid var(--gold); }', []],
    ['/* color: var(--gold) */ .x { color: var(--ink); }', []],
  ];

  it.each(FIXTURI)('%s', (sursa, asteptat) => {
    expect(auriDeText(sursa)).toEqual(asteptat);
  });
});

describe('aurul ornamental nu colorează text', () => {
  it('chiar scanează fișierele pe care pretinde că le acoperă', () => {
    expect(fisiereScanate()).toEqual(expect.arrayContaining(OBLIGATORII));
  });

  it.each(fisiereScanate())('%s', (fisier) => {
    const sursa = readFileSync(RADACINA + fisier, 'utf8');
    expect(sursa.length).toBeGreaterThan(0);
    expect(auriDeText(sursa)).toEqual(EXCEPTII[fisier] ?? []);
  });
});
