import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { raportContrast } from './contrast';
import { PALETA, ROLURI_TEXT } from './tokens';

/*
 * Checks that span the token module and the stylesheet, which neither can make
 * on its own. tokens.test.ts proves things about `tokens.ts`; the browser reads
 * `global.css` and the component <style> blocks. This file ties the two.
 *
 * Three rules, in the order a colour goes wrong:
 *   1. the :root block must RESOLVE to the palette, not merely mention it;
 *   2. a text colour must be one measurement says is legible on its ground;
 *   3. no hex literal may appear outside the token block at all.
 *
 * Every file case asserts the source is non-empty before asserting anything
 * about its content. The first version of this file read with
 * import.meta.glob(..., { query: '?raw' }), Vite returned an EMPTY STRING for
 * the .css, and the guard passed while inert on the one file that mattered.
 */

const RADACINA = fileURLToPath(new URL('../../', import.meta.url));

/**
 * One walker, used by every guard below. There used to be two — a flat readdir
 * for the colour guard and a recursive one for the hex guard — and they drifted
 * apart exactly as you would expect: a component one directory down was
 * invisible to the colour guard while the hex guard saw it. Two implementations
 * of "find the style files" is how that happens, so now there is one.
 */
function fisiereDin(radacini: readonly string[], extensie: string): string[] {
  const gasite: string[] = [];
  const mergi = (relativ: string): void => {
    for (const intrare of readdirSync(RADACINA + relativ, { withFileTypes: true })) {
      const cale = relativ + '/' + intrare.name;
      if (intrare.isDirectory()) mergi(cale);
      else if (intrare.name.endsWith(extensie)) gasite.push(cale);
    }
  };
  for (const r of radacini) mergi(r);
  return gasite;
}

/**
 * The colour guard skips `src/pages/`: a page may own a dark panel whose
 * background sits on an ancestor element, and a text scan cannot see that.
 * The hex guard does not skip it, because a raw hex is wrong on every ground.
 */
function fisiereCuloare(): string[] {
  return [...fisiereDin(['src/styles'], '.css'), ...fisiereDin(['src/layouts', 'src/components'], '.astro')].sort();
}

function fisiereDeStil(): string[] {
  return [
    ...fisiereDin(['src/styles'], '.css'),
    ...fisiereDin(['src/layouts', 'src/components', 'src/pages'], '.astro'),
  ].sort();
}

function faraComentarii(sursa: string): string {
  return sursa.replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/** The CSS a file ships: a whole .css, or an .astro's style blocks and style= attributes. */
export function cssDinFisier(sursa: string, fisier: string): string {
  if (fisier.endsWith('.css')) return sursa;
  const bucati: string[] = [];
  for (const m of sursa.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) bucati.push(m[1] as string);
  // All three spellings of an inline style Astro accepts. Frontmatter is left
  // alone, so a hex in a comment or a string cannot fail a build.
  for (const m of sursa.matchAll(/\bstyle\s*=\s*"([^"]*)"/g)) bucati.push(`x { ${m[1]} }`);
  for (const m of sursa.matchAll(/\bstyle\s*=\s*'([^']*)'/g)) bucati.push(`x { ${m[1]} }`);
  // The {…} form is a JS expression: a template literal or an object literal.
  // Strip its punctuation so the declarations inside are readable as CSS.
  for (const m of sursa.matchAll(/\bstyle\s*=\s*\{([^}]*)\}/g)) {
    bucati.push(`x { ${(m[1] as string).replace(/[`'"{}]/g, ' ')} }`);
  }
  return bucati.join('\n');
}

/** Rule bodies. Nested at-rules fall out naturally: only the inner blocks match. */
function blocuri(css: string): string[] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => m[2] as string);
}

/** The last declaration of any of `proprietati` in a block, as CSS resolves it. */
function declaratie(bloc: string, proprietati: readonly string[]): string | undefined {
  let valoare: string | undefined;
  for (const d of bloc.split(';')) {
    const i = d.indexOf(':');
    if (i < 0) continue;
    if (proprietati.includes(d.slice(0, i).trim().toLowerCase())) valoare = d.slice(i + 1).trim();
  }
  return valoare;
}

/** The palette token a value names, if it is exactly one. */
function tokenPaleta(valoare: string): string | undefined {
  const m = valoare.match(/^var\(\s*--([-\w]+)\s*\)$/);
  const nume = m?.[1];
  return nume !== undefined && nume in PALETA ? nume : undefined;
}

/** These take a colour that has already been checked wherever it came from. */
const SIGURE_PRIN_CONSTRUCTIE = ['inherit', 'currentcolor'];

/**
 * Every text colour that is not provably legible.
 *
 * This is an ALLOWLIST derived from measurement, not a denylist of known-bad
 * colours. A denylist of `--gold` and `--gold-lt` was the previous shape, and it
 * let through `var(--rule)` at 1.30:1 and `rgb(176,139,62)` — a hairline token
 * and a raw function nobody had thought to list. A colour is permitted only if:
 *
 *   - the block states its own background, and the pair measures >= 4.5:1; or
 *   - it is a token in ROLURI_TEXT, the set that clears 4.5:1 on the light
 *     grounds these files paint on.
 *
 * Anything else fails and is named: a gold, a hairline, a raw rgb(), a hex, a
 * bare keyword, or a token invented next week.
 */
export function culoriDeTextNepermise(css: string): string[] {
  const probleme: string[] = [];
  for (const bloc of blocuri(faraComentarii(css))) {
    const valoare = declaratie(bloc, ['color', '-webkit-text-fill-color']);
    if (valoare === undefined) continue;
    if (SIGURE_PRIN_CONSTRUCTIE.includes(valoare.toLowerCase())) continue;

    const rol = tokenPaleta(valoare);
    const fundal = tokenPaleta(declaratie(bloc, ['background', 'background-color']) ?? '');

    // The block declares its own ground, so measure it rather than consult a list.
    if (rol !== undefined && fundal !== undefined) {
      const raport = raportContrast(PALETA[rol] as string, PALETA[fundal] as string);
      if (raport >= 4.5) continue;
      probleme.push(`color: ${valoare} pe --${fundal} (${raport.toFixed(2)}:1)`);
      continue;
    }

    if (rol !== undefined && (ROLURI_TEXT as readonly string[]).includes(rol)) continue;
    probleme.push(`color: ${valoare}`);
  }
  return probleme;
}

/**
 * The one sanctioned text colour outside those rules: the dagger in the site
 * header. It is aria-hidden="true" and carries no information, so WCAG 1.4.3
 * exempts it as pure decoration, and the palette names that glyph among the
 * ornament roles beside hairlines and borders. The value is an exact list, not
 * a permission — a second unapproved colour in this same file still fails.
 */
const EXCEPTII: Record<string, string[]> = {
  'src/components/SiteHeader.astro': ['color: var(--gold-lt)'],
};

// ---------------------------------------------------------------------------

describe('culoriDeTextNepermise', () => {
  // Control pozitiv. A guard that cannot fire is a claim nobody is checking.
  const FIXTURI: [string, string[]][] = [
    // the colours a denylist of the two golds used to miss
    ['.x { color: var(--rule); }', ['color: var(--rule)']],
    ['.x { color: rgb(176,139,62); }', ['color: rgb(176,139,62)']],
    ['.x { color: #B08B3E; }', ['color: #B08B3E']],
    ['.x { color: red; }', ['color: red']],
    ['.x { color: var(--masura); }', ['color: var(--masura)']],
    // the two it always caught
    ['.x { color: var(--gold); }', ['color: var(--gold)']],
    ['.x{color:var(--gold-lt)}', ['color: var(--gold-lt)']],
    // permitted: a role from the light-ground set
    ['.x { color: var(--gold-text); }', []],
    ['.x { color: var(--ink); }', []],
    ['.x { color: inherit; }', []],
    // permitted: the block states its ground and the pair measures out
    ['.x { background: var(--oxblood); color: var(--parchment); }', []],
    // refused: the block states its ground and the pair does not
    ['.x { background: var(--parchment); color: var(--gold-lt); }', ['color: var(--gold-lt) pe --parchment (2.18:1)']],
    // not text
    ['.x { border-color: var(--gold-lt); }', []],
    ['.x { background-color: var(--gold); }', []],
    ['.x { border-bottom: 1.5px solid var(--gold-lt); }', []],
    ['.x { box-shadow: inset 0 2px 0 var(--gold-lt); }', []],
    ['/* color: var(--gold) */ .x { color: var(--ink); }', []],
    ['@media (max-width: 34rem) { .x { color: var(--rule); } }', ['color: var(--rule)']],
  ];

  it.each(FIXTURI)('%s', (sursa, asteptat) => {
    expect(culoriDeTextNepermise(sursa)).toEqual(asteptat);
  });

  it.each([
    ['<p style="color: var(--rule)">', ['color: var(--rule)']],
    ["<p style='color: var(--gold)'>", ['color: var(--gold)']],
    ['<p style={`color: rgb(1,2,3)`}>', ['color: rgb(1,2,3)']],
  ] as [string, string[]][])('inline %s', (markup, asteptat) => {
    expect(culoriDeTextNepermise(cssDinFisier(markup, 'a.astro'))).toEqual(asteptat);
  });
});

describe('nicio culoare de text nedovedită', () => {
  it('chiar scanează fișierele pe care pretinde că le acoperă', () => {
    expect(fisiereCuloare()).toEqual(
      expect.arrayContaining(['src/styles/global.css', 'src/layouts/Base.astro', 'src/components/SiteHeader.astro']),
    );
  });

  it.each(fisiereCuloare())('%s', (fisier) => {
    const sursa = readFileSync(RADACINA + fisier, 'utf8');
    expect(sursa.length).toBeGreaterThan(0);
    expect(culoriDeTextNepermise(cssDinFisier(sursa, fisier))).toEqual(EXCEPTII[fisier] ?? []);
  });
});

// ---------------------------------------------------------------------------

const FISIER_TOKENURI = 'src/styles/global.css';
const BLOC_ROOT = /:root\s*\{[^}]*\}/g;

/** Non-colour tokens: they share :root with the palette but are not in PALETA. */
const TOKENURI_TIPOGRAFIE: Record<string, string> = {
  display: "'Cormorant Garamond', Georgia, serif",
  body: "'Spectral', Georgia, serif",
  gutter: 'clamp(1rem, 4vw, 2.25rem)',
  masura: '68ch',
};

/** Raw declarations of the :root block, last-wins exactly as the cascade does. */
export function tokenuriBrute(css: string): Map<string, string> {
  const bloc = faraComentarii(css).match(/:root\s*\{([^}]*)\}/);
  if (bloc === null) throw new Error('global.css nu conține un bloc :root');
  const brute = new Map<string, string>();
  for (const d of (bloc[1] as string).split(';')) {
    const i = d.indexOf(':');
    if (i < 0) continue;
    const nume = d.slice(0, i).trim();
    if (nume.startsWith('--')) brute.set(nume.slice(2), d.slice(i + 1).trim());
  }
  return brute;
}

/** Follows var() aliases, including fallbacks, to a final value. */
export function rezolva(nume: string, brute: Map<string, string>, lant: readonly string[] = []): string {
  if (lant.includes(nume)) throw new Error(`ciclu de tokenuri: ${[...lant, nume].join(' -> ')}`);
  const brut = brute.get(nume);
  if (brut === undefined) throw new Error(`token nedefinit: --${nume}`);
  return brut.replace(/var\(\s*--([-\w]+)\s*(?:,([^)]*))?\)/g, (_, ref: string, rezerva?: string) =>
    brute.has(ref) ? rezolva(ref, brute, [...lant, nume]) : (rezerva ?? '').trim(),
  );
}

describe('blocul :root se rezolvă la paletă', () => {
  /*
   * toEqual on the RESOLVED map, not toContain on each line. Containment was
   * the previous shape and it asserted presence rather than resolution:
   * appending `--gold-text: var(--gold);` left every asserted line present,
   * introduced no hex, was not a `color:` declaration, and shipped every link
   * on the site at 2.95:1 with the whole suite green. Equality on resolved
   * values closes aliasing, duplication, omission and addition at once.
   */
  it('rezolvarea urmărește aliasurile, rezervele și prinde ciclurile', () => {
    const b = tokenuriBrute(':root { --a: #111111; --b: var(--a); --c: var(--absent, #222222); }');
    expect(rezolva('b', b)).toBe('#111111');
    expect(rezolva('c', b)).toBe('#222222');
    const ciclu = tokenuriBrute(':root { --x: var(--y); --y: var(--x); }');
    expect(() => rezolva('x', ciclu)).toThrow(/ciclu/);
  });

  it('ultima declarație câștigă, ca în cascadă', () => {
    const b = tokenuriBrute(':root { --a: #111111; --a: #333333; }');
    expect(rezolva('a', b)).toBe('#333333');
  });

  it('valorile rezolvate sunt exact PALETA plus tokenurile tipografice', () => {
    const brute = tokenuriBrute(readFileSync(RADACINA + FISIER_TOKENURI, 'utf8'));
    const rezolvat: Record<string, string> = {};
    for (const nume of brute.keys()) rezolvat[nume] = rezolva(nume, brute);
    expect(rezolvat).toEqual({ ...PALETA, ...TOKENURI_TIPOGRAFIE });
  });
});

// ---------------------------------------------------------------------------

/** Hex literals in a declaration *value*, so `#fade` as a selector is not one. */
export function hexuriInStil(css: string): string[] {
  const gasite: string[] = [];
  for (const m of faraComentarii(css).matchAll(/([-\w]+)\s*:\s*([^;{}]+)/g)) {
    for (const h of (m[2] as string).trim().matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
      gasite.push(`${m[1] as string}: ${h[0] as string}`);
    }
  }
  return gasite;
}

describe('hexuriInStil', () => {
  const FIXTURI: [string, string[]][] = [
    ['.x { color: #E4D7C4; }', ['color: #E4D7C4']],
    ['.x { color: #fff }', ['color: #fff']],
    ['.x { border: 1px solid #E3D9C6; }', ['border: #E3D9C6']],
    ['.x { background: linear-gradient(90deg, #FFFDF8 0%, transparent 70%); }', ['background: #FFFDF8']],
    ['.x { color: var(--ink); }', []],
    ['#fade { color: var(--ink); }', []],
    ['/* #E4D7C4 was here */ .x { color: var(--ink); }', []],
    ['@media (max-width: 34rem) { .x { color: var(--muted); } }', []],
  ];

  it.each(FIXTURI)('%s', (sursa, asteptat) => {
    expect(hexuriInStil(sursa)).toEqual(asteptat);
  });

  it('citește doar <style> și style= dintr-un .astro', () => {
    const astro = '---\nconst c = "#B08B3E";\n---\n<p style="color:#E4D7C4">x</p>\n<style>.y { color: var(--ink); }</style>';
    expect(hexuriInStil(cssDinFisier(astro, 'a.astro'))).toEqual(['color: #E4D7C4']);
  });
});

describe('nicio culoare hex în afara blocului de tokenuri', () => {
  it('chiar scanează fișierele pe care pretinde că le acoperă', () => {
    expect(fisiereDeStil()).toEqual(expect.arrayContaining([FISIER_TOKENURI, 'src/pages/index.astro']));
  });

  it.each(fisiereDeStil())('%s', (fisier) => {
    const sursa = readFileSync(RADACINA + fisier, 'utf8');
    expect(sursa.length).toBeGreaterThan(0);
    let css = cssDinFisier(sursa, fisier);
    if (fisier === FISIER_TOKENURI) css = css.replace(BLOC_ROOT, '');
    else expect(css).not.toMatch(/:root\s*\{/);
    expect(hexuriInStil(css)).toEqual([]);
  });

  it('blocul de tokenuri chiar conține hexuri (altfel excluderea ar fi inertă)', () => {
    const css = readFileSync(RADACINA + FISIER_TOKENURI, 'utf8');
    expect(hexuriInStil(css.match(BLOC_ROOT)?.join('') ?? '').length).toBe(Object.keys(PALETA).length);
  });
});
