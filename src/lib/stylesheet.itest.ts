import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { raportContrast } from './contrast';
import { PALETA, ROLURI_TEXT, ROLURI_TEXT_PE_OXBLOOD } from './tokens';

/*
 * Colour guards, asserted against `dist/` — the bytes a visitor receives.
 *
 * These ran against the source until three reviews in a row walked through
 * them. Every escape was the same mistake: the guard asserted over a region it
 * had picked (one :root block, one directory, one brace depth) instead of over
 * what the browser resolves. A second :root, a token redeclared outside :root,
 * native CSS nesting and a stylesheet outside src/styles/ are four doors into
 * one room. Reading the built output closes all four, because there is no
 * region left to pick: whatever reaches the visitor is what gets checked.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS CANNOT DO — read before extending it.
 *
 * It asserts that every text colour is measurably safe on the surface *its own
 * block declares*. It CANNOT see a background inherited from an ancestor.
 * `.hero { background: var(--oxblood) }` with `.hero h1 { color: var(--ink) }`
 * is 1.39:1 and passes here, because knowing that requires resolving which
 * ancestor supplied the background — a cascade computation, not a parse. Do
 * not try to add it; a regex that appears to do it will be wrong in ways that
 * are worse than not doing it.
 *
 * That remainder is covered by Task 13, which runs axe against the built pages
 * in CI. axe computes real contrast with the full cascade. The division is
 * deliberate: a static scan catches the class cheaply on every save, a real
 * engine catches what only a layout can answer.
 * ---------------------------------------------------------------------------
 */

const DIST = fileURLToPath(new URL('../../dist/', import.meta.url));

function fisiereDist(extensie: string): string[] {
  const gasite: string[] = [];
  const mergi = (relativ: string): void => {
    for (const intrare of readdirSync(DIST + relativ, { withFileTypes: true })) {
      const cale = relativ + intrare.name;
      if (intrare.isDirectory()) mergi(cale + '/');
      else if (intrare.name.endsWith(extensie)) gasite.push(cale);
    }
  };
  if (existsSync(DIST)) mergi('');
  return gasite.sort();
}

/** CSS of one built page, in cascade order: linked stylesheets, then inline blocks. */
function cssPagina(html: string): string {
  const bucati: string[] = [];
  for (const m of html.matchAll(/<link\b[^>]*rel=["']?stylesheet["']?[^>]*>/g)) {
    const href = m[0].match(/href=["']([^"']+)["']/)?.[1];
    if (href !== undefined && href.startsWith('/')) {
      const cale = DIST + href.slice(1);
      if (existsSync(cale)) bucati.push(readFileSync(cale, 'utf8'));
    }
  }
  for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) bucati.push(m[1] as string);
  // Inline style attributes are CSS the visitor gets too.
  for (const m of html.matchAll(/\bstyle=["']([^"']*)["']/g)) bucati.push(`x{${m[1]}}`);
  return bucati.join('\n');
}

/**
 * Declarations directly inside each block, depth-correct and LOSSLESS: every
 * character lands in exactly one bucket. The previous regex, `([^{}]+)\{([^{}]*)\}`,
 * silently skipped any block whose body contained a brace — which is precisely
 * what native CSS nesting produces, and was one of the five escapes.
 */
export function blocuriDeclaratii(css: string): string[] {
  const rezultat: string[] = [];
  const stiva: string[] = [''];
  for (const ch of css) {
    if (ch === '{') stiva.push('');
    else if (ch === '}') {
      rezultat.push(stiva.pop() ?? '');
      if (stiva.length === 0) stiva.push('');
    } else stiva[stiva.length - 1] += ch;
  }
  return rezultat;
}

function declaratie(bloc: string, proprietati: readonly string[]): string | undefined {
  let valoare: string | undefined;
  for (const d of bloc.split(';')) {
    const i = d.indexOf(':');
    if (i < 0) continue;
    if (proprietati.includes(d.slice(0, i).trim().toLowerCase())) valoare = d.slice(i + 1).trim();
  }
  return valoare;
}

const PROPRIETATI_TEXT = ['color', '-webkit-text-fill-color'];

/** Independent of any block structure, so nesting cannot hide one. */
export function valoriDeText(css: string): string[] {
  return [...css.matchAll(/(?:^|[;{}"'\s])(?:-webkit-text-fill-color|color)\s*:\s*([^;}]+)/g)].map((m) =>
    (m[1] as string).trim(),
  );
}

function tokenPaleta(valoare: string): string | undefined {
  const nume = valoare.match(/^var\(\s*--([-\w]+)\s*\)$/)?.[1];
  return nume !== undefined && nume in PALETA ? nume : undefined;
}

/** Tokens measured legible on at least one surface this site paints. */
const ROLURI_MASURATE: readonly string[] = [...ROLURI_TEXT, ...ROLURI_TEXT_PE_OXBLOOD];

/** These take a colour already checked wherever it came from. */
const SIGURE_PRIN_CONSTRUCTIE = ['inherit', 'currentcolor'];

/**
 * A text colour passes only if it is a palette token in a measured role set.
 * Derived, never enumerated: a denylist can only list what someone remembered,
 * and this project has been bitten three times by that gap. A raw rgb(), a hex,
 * a bare keyword, a non-colour token, `--gold` at 2.95:1 / 3.57:1 which is in
 * no set at all, and a token invented next week each fail without anyone
 * having predicted them.
 */
export function culoriDeTextNemasurate(css: string): string[] {
  return valoriDeText(css).filter((valoare) => {
    if (SIGURE_PRIN_CONSTRUCTIE.includes(valoare.toLowerCase())) return false;
    const rol = tokenPaleta(valoare);
    return rol === undefined || !ROLURI_MASURATE.includes(rol);
  });
}

/** Where a block states its own background, the pair is measured exactly. */
export function perechiNelizibile(css: string): string[] {
  const probleme: string[] = [];
  for (const bloc of blocuriDeclaratii(css)) {
    const valoare = declaratie(bloc, PROPRIETATI_TEXT);
    if (valoare === undefined) continue;
    const rol = tokenPaleta(valoare);
    const fundal = tokenPaleta(declaratie(bloc, ['background', 'background-color']) ?? '');
    if (rol === undefined || fundal === undefined) continue;
    const raport = raportContrast(PALETA[rol] as string, PALETA[fundal] as string);
    if (raport < 4.5) probleme.push(`color: ${valoare} pe --${fundal} (${raport.toFixed(2)}:1)`);
  }
  return probleme;
}

export function tokenuriRoot(css: string): Map<string, string> {
  const brute = new Map<string, string>();
  // Every :root in document order, later declarations winning, as the cascade does.
  for (const bloc of css.matchAll(/:root\s*\{([^}]*)\}/g)) {
    for (const d of (bloc[1] as string).split(';')) {
      const i = d.indexOf(':');
      if (i < 0) continue;
      const nume = d.slice(0, i).trim();
      if (nume.startsWith('--')) brute.set(nume.slice(2), d.slice(i + 1).trim());
    }
  }
  return brute;
}

export function rezolva(nume: string, brute: Map<string, string>, lant: readonly string[] = []): string {
  if (lant.includes(nume)) throw new Error(`ciclu de tokenuri: ${[...lant, nume].join(' -> ')}`);
  const brut = brute.get(nume);
  if (brut === undefined) throw new Error(`token nedefinit: --${nume}`);
  return brut.replace(/var\(\s*--([-\w]+)\s*(?:,([^)]*))?\)/g, (_, ref: string, rezerva?: string) =>
    brute.has(ref) ? rezolva(ref, brute, [...lant, nume]) : (rezerva ?? '').trim(),
  );
}

/**
 * Palette tokens redeclared outside :root. A browser honours
 * `body { --gold-text: var(--gold) }` for everything inside body, while a
 * scan of :root alone sees a palette that still matches perfectly. Structure-
 * free: the :root blocks are removed and whatever palette declarations remain
 * are, by definition, somewhere else.
 */
export function tokenuriInafaraRoot(css: string): string[] {
  return [...css.replace(/:root\s*\{[^}]*\}/g, '').matchAll(/--([-\w]+)\s*:/g)]
    .map((m) => m[1] as string)
    .filter((nume) => nume in PALETA);
}

const ESTE_HEX = /^#[0-9a-fA-F]{3,8}$/;
const TOKENURI_NECULOARE = ['body', 'display', 'gutter', 'masura'];

/** Hex literals in a declaration value, so `#fade` as a selector is not one. */
export function hexuriInStil(css: string): string[] {
  return [...css.matchAll(/([-\w]+)\s*:\s*([^;{}]+)/g)].flatMap((m) =>
    [...(m[2] as string).matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((h) => `${m[1] as string}: ${h[0] as string}`),
  );
}

// ---------------------------------------------------------------------------

const PAGINI = fisiereDist('.html');
const FOI = fisiereDist('.css');

describe('ieșirea build-ului există', () => {
  // A guard that reads a file must prove it read something. Without this, a
  // missing or empty dist/ makes every case below pass vacuously — which is
  // exactly how the first version of this guard shipped inert.
  it('dist/ conține pagini', () => {
    expect(existsSync(DIST)).toBe(true);
    expect(PAGINI.length).toBeGreaterThan(0);
  });

  it.each(PAGINI)('%s are CSS', (pagina) => {
    const html = readFileSync(DIST + pagina, 'utf8');
    expect(html.length).toBeGreaterThan(0);
    expect(cssPagina(html).length).toBeGreaterThan(0);
  });
});

describe('unitățile de scanare', () => {
  it('blocuriDeclaratii nu pierde o regulă imbricată', () => {
    // The old regex returned only the inner block here. This is the fixture
    // that proves the replacement is lossless.
    const blocuri = blocuriDeclaratii('.a{color:var(--ink);.b{color:var(--gold)}}');
    const culori = blocuri.map((b) => declaratie(b, PROPRIETATI_TEXT)).filter((v) => v !== undefined);
    expect(culori.sort()).toEqual(['var(--gold)', 'var(--ink)']);
  });

  it.each([
    ['a{color:var(--gold)}', ['var(--gold)']],
    ['a{color:rgb(176,139,62)}', ['rgb(176,139,62)']],
    ['a{color:#B08B3E}', ['#B08B3E']],
    ['a{color:red}', ['red']],
    ['a{color:var(--masura)}', ['var(--masura)']],
    ['a{color:var(--ink)}', []],
    ['a{color:var(--rule)}', []],
    ['a{color:inherit}', []],
    ['a{background-color:var(--gold)}', []],
    ['a{border-color:var(--gold)}', []],
    ['a{border-bottom:1px solid var(--gold)}', []],
    ['.a{color:var(--ink);.b{color:var(--gold)}}', ['var(--gold)']],
  ] as [string, string[]][])('culoriDeTextNemasurate %s', (css, asteptat) => {
    expect(culoriDeTextNemasurate(css)).toEqual(asteptat);
  });

  it.each([
    ['body{--gold-text:var(--gold)}', ['gold-text']],
    ['.x{--ink:#fff}', ['ink']],
    [':root{--gold-text:#8A6A28}', []],
    ['a{color:var(--gold-text)}', []],
    ['.x{--spatiu:1rem}', []],
  ] as [string, string[]][])('tokenuriInafaraRoot %s', (css, asteptat) => {
    expect(tokenuriInafaraRoot(css)).toEqual(asteptat);
  });

  it.each([
    ['a{background:var(--oxblood);color:var(--parchment)}', []],
    ['a{background:var(--parchment);color:var(--gold-lt)}', ['color: var(--gold-lt) pe --parchment (2.18:1)']],
    ['a{background:var(--oxblood);color:var(--ink)}', ['color: var(--ink) pe --oxblood (1.39:1)']],
  ] as [string, string[]][])('perechiNelizibile %s', (css, asteptat) => {
    expect(perechiNelizibile(css)).toEqual(asteptat);
  });

  it('rezolva urmărește aliasuri, rezerve, ultima declarație și cicluri', () => {
    expect(rezolva('b', tokenuriRoot(':root{--a:#111111;--b:var(--a)}'))).toBe('#111111');
    expect(rezolva('c', tokenuriRoot(':root{--c:var(--absent,#222222)}'))).toBe('#222222');
    expect(rezolva('a', tokenuriRoot(':root{--a:#111111;--a:#333333}'))).toBe('#333333');
    // a SECOND :root later in the document wins, as it does in a browser
    expect(rezolva('a', tokenuriRoot(':root{--a:#111111}.x{}:root{--a:#444444}'))).toBe('#444444');
    expect(() => rezolva('x', tokenuriRoot(':root{--x:var(--y);--y:var(--x)}'))).toThrow(/ciclu/);
  });
});

describe.each(PAGINI)('%s', (pagina) => {
  const css = (): string => cssPagina(readFileSync(DIST + pagina, 'utf8'));

  it('tokenurile rezolvate sunt exact paleta', () => {
    const brute = tokenuriRoot(css());
    expect(brute.size).toBeGreaterThan(0);
    const culori: Record<string, string> = {};
    const altele: string[] = [];
    for (const nume of brute.keys()) {
      const valoare = rezolva(nume, brute);
      if (ESTE_HEX.test(valoare)) culori[nume] = valoare.toUpperCase();
      else altele.push(nume);
    }
    expect(culori).toEqual(PALETA);
    expect(altele.sort()).toEqual(TOKENURI_NECULOARE);
  });

  it('niciun token de paletă nu este redeclarat în afara :root', () => {
    expect(tokenuriInafaraRoot(css())).toEqual([]);
  });

  it('fiecare culoare de text este într-un rol măsurat', () => {
    expect(culoriDeTextNemasurate(css())).toEqual([]);
  });

  it('perechile text/fundal declarate în același bloc sunt lizibile', () => {
    expect(perechiNelizibile(css())).toEqual([]);
  });

  it('niciun hex în afara blocului de tokenuri', () => {
    expect(hexuriInStil(css().replace(/:root\s*\{[^}]*\}/g, ''))).toEqual([]);
  });
});

describe('foi de stil separate', () => {
  it.each(FOI.length > 0 ? FOI : ['(niciuna)'])('%s', (foaie) => {
    if (foaie === '(niciuna)') return;
    const css = readFileSync(DIST + foaie, 'utf8');
    expect(css.length).toBeGreaterThan(0);
    expect(culoriDeTextNemasurate(css)).toEqual([]);
    expect(perechiNelizibile(css)).toEqual([]);
  });
});
