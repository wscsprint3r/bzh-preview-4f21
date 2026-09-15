import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PALETA, cssTokens } from './tokens';

/*
 * Checks that span the token module and the stylesheet, which neither can make
 * on its own.
 *
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
 * The single sanctioned use of ornamental gold as a CSS `color`: the dagger
 * glyph in the site header. It is aria-hidden="true" and carries no
 * information, so WCAG 1.4.3 exempts it as pure decoration, and the palette
 * names that glyph among the ornament roles beside hairlines and borders.
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

describe('global.css folosește chiar valorile din tokens.ts', () => {
  /*
   * The whole point of tokens.test.ts is that --gold-text clears 4.5:1. That
   * only means something if the hex it measures is the hex the browser gets.
   * The two live in different files, so without this check someone could put
   * --gold-text: #B08B3E in the stylesheet and every contrast assertion would
   * keep passing against a value the site no longer ships.
   */
  const linii = cssTokens()
    .split(String.fromCharCode(10))
    .map((l) => l.trim())
    .filter((l) => l.startsWith('--'));

  it('are ceva de verificat', () => {
    expect(linii.length).toBe(Object.keys(PALETA).length);
  });

  it.each(linii)('%s', (linie) => {
    const css = readFileSync(RADACINA + 'src/styles/global.css', 'utf8');
    expect(css).toContain(linie);
  });
});

/*
 * No hex literal outside the token block.
 *
 * The contrast tests can only measure a colour that is a token. A raw hex in a
 * component's <style> is invisible to every guard in this suite, and dropping
 * one in is easier than looking a token up. Task 9's `.hero-verset` was about
 * to ship `#E4D7C4` for exactly that reason.
 *
 * Scope is WIDER than the gold guard above: `src/pages/` is included, and the
 * walk recurses, because Task 8 puts a page at `src/pages/program/index.astro`.
 * A raw hex is wrong on every ground, so unlike the gold question this one does
 * not depend on knowing the surface.
 *
 * In `.astro` files only the `<style>` blocks and `style="…"` attributes are
 * read — those are the CSS the file ships. Frontmatter is left alone so a hex
 * in a comment or a string cannot cause a false failure.
 */

const FISIER_TOKENURI = 'src/styles/global.css';

function fisiereDeStil(): string[] {
  const gasite: string[] = [];
  const mergi = (relativ: string): void => {
    for (const intrare of readdirSync(RADACINA + relativ, { withFileTypes: true })) {
      const cale = relativ + '/' + intrare.name;
      if (intrare.isDirectory()) mergi(cale);
      else if (intrare.name.endsWith('.astro')) gasite.push(cale);
      else if (intrare.name.endsWith('.css') && relativ === 'src/styles') gasite.push(cale);
    }
  };
  mergi('src');
  return gasite.sort();
}

/** The CSS a file actually ships: a whole .css, or an .astro's style blocks. */
export function cssDinFisier(sursa: string, fisier: string): string {
  if (fisier.endsWith('.css')) return sursa;
  const bucati: string[] = [];
  for (const m of sursa.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) bucati.push(m[1] as string);
  for (const m of sursa.matchAll(/\bstyle\s*=\s*"([^"]*)"/g)) bucati.push(`x { ${m[1]} }`);
  return bucati.join('\n');
}

/** Hex literals appearing in a declaration *value*, so `#fade` as a selector is not one. */
export function hexuriInStil(css: string): string[] {
  const gasite: string[] = [];
  for (const m of faraComentarii(css).matchAll(/([-\w]+)\s*:\s*([^;{}]+)/g)) {
    const valoare = (m[2] as string).trim();
    for (const h of valoare.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
      gasite.push(`${m[1] as string}: ${h[0] as string}`);
    }
  }
  return gasite;
}

const BLOC_ROOT = /:root\s*\{[^}]*\}/g;

describe('hexuriInStil', () => {
  // Control pozitiv, same reasoning as above: a guard that cannot fire is a
  // claim nobody is checking.
  const FIXTURI: [string, string[]][] = [
    ['.x { color: #E4D7C4; }', ['color: #E4D7C4']],
    ['.x { color: #fff }', ['color: #fff']],
    ['.x { border: 1px solid #E3D9C6; }', ['border: #E3D9C6']],
    ['.x { background: linear-gradient(90deg, #FFFDF8 0%, transparent 70%); }', ['background: #FFFDF8']],
    ['.x { color: var(--ink); }', []],
    ['.x { color: var(--gold-text); background: var(--raised); }', []],
    // `#fade` is a selector, not a value — the declaration split is what keeps it out.
    ['#fade { color: var(--ink); }', []],
    ['/* #E4D7C4 was here */ .x { color: var(--ink); }', []],
    ['@media (max-width: 34rem) { .x { color: var(--muted); } }', []],
  ];

  it.each(FIXTURI)('%s', (sursa, asteptat) => {
    expect(hexuriInStil(sursa)).toEqual(asteptat);
  });

  it('citește doar <style> și style= dintr-un .astro', () => {
    const astro = '---\nconst c = "#B08B3E";\n---\n<p style="color:#E4D7C4">x</p>\n<style>.y { color: var(--ink); }</style>';
    // the frontmatter hex is invisible; the inline style attribute is not
    expect(hexuriInStil(cssDinFisier(astro, 'a.astro'))).toEqual(['color: #E4D7C4']);
  });
});

describe('nicio culoare hex în afara blocului de tokenuri', () => {
  it('chiar scanează fișierele pe care pretinde că le acoperă', () => {
    const fisiere = fisiereDeStil();
    expect(fisiere).toEqual(expect.arrayContaining([FISIER_TOKENURI, 'src/pages/index.astro']));
  });

  it.each(fisiereDeStil())('%s', (fisier) => {
    const sursa = readFileSync(RADACINA + fisier, 'utf8');
    expect(sursa.length).toBeGreaterThan(0);
    let css = cssDinFisier(sursa, fisier);
    // The token block is the one place a hex literal belongs, and only there.
    if (fisier === FISIER_TOKENURI) css = css.replace(BLOC_ROOT, '');
    else expect(css).not.toMatch(/:root\s*\{/);
    expect(hexuriInStil(css)).toEqual([]);
  });

  it('blocul de tokenuri chiar conține hexuri (altfel excluderea ar fi inertă)', () => {
    const css = readFileSync(RADACINA + FISIER_TOKENURI, 'utf8');
    const bloc = css.match(BLOC_ROOT)?.join('') ?? '';
    expect(hexuriInStil(bloc).length).toBe(Object.keys(PALETA).length);
  });
});
