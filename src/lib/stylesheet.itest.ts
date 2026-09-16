import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * WHAT THIS PROVES: colours in the shipped CSS come from tokens, not from hex
 * literals written inline. That is source hygiene, and nothing more.
 *
 * WHAT THIS DOES NOT PROVE: that any of them is legible. It makes no contrast
 * claim of any kind. Contrast is owned by `npm run a11y`, which runs axe-core
 * in a real headless Chrome over the built pages.
 *
 * This file used to assert contrast by parsing `color:` declarations and
 * matching them against the role sets. Four rounds of review took it apart, and
 * the diagnosis was the same each time in a sharper form: `document order,
 * later wins` is not the cascade. Specificity, `@layer`, media context and
 * source order across stylesheets are cascade rules, so any parser asserting
 * over CSS text is re-implementing the cascade and will keep losing to it.
 * Worse, 10 of the 12 colour rules on this site take their ground from an
 * ancestor, which no parse can resolve — so the guard covered 2 of 12 while
 * reading like the project's central safety guarantee. It was deleted rather
 * than fixed a fourth time. Every escape had been proven with a real browser;
 * a real browser is therefore what guards it.
 *
 * Do not add contrast assertions here. Add them to the axe run.
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

/** The CSS one built page ships: linked stylesheets, inline blocks, style attributes. */
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
  for (const m of html.matchAll(/\bstyle=["']([^"']*)["']/g)) bucati.push(`x{${m[1]}}`);
  return bucati.join('\n');
}

/** Hex literals in a declaration value, so `#fade` as a selector is not one. */
export function hexuriInStil(css: string): string[] {
  return [...css.matchAll(/([-\w]+)\s*:\s*([^;{}]+)/g)].flatMap((m) =>
    [...(m[2] as string).matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((h) => `${m[1] as string}: ${h[0] as string}`),
  );
}

/**
 * Token definitions are the one place a colour literal belongs.
 *
 * Matched by SELECTOR, not by a `:root` substring. `/:root\s*\{[^}]*\}/` also
 * matches the tail of `html:root{color:#DEADBE}`, which would strip — and so
 * silently exempt — a block it ought to report. That is the same shape as the
 * specificity escape that ended the colour guard, and leaving it in the code
 * that replaced it would be a poor joke.
 */
const REGULA = /([^{}]*)\{([^{}]*)\}/g;

function esteBlocDeTokenuri(selector: string): boolean {
  return selector.trim() === ':root';
}

export function faraBlocurileDeTokenuri(css: string): string {
  return css.replace(REGULA, (intreg, selector: string) => (esteBlocDeTokenuri(selector) ? ' ' : intreg));
}

export function blocurileDeTokenuri(css: string): string {
  return [...css.matchAll(REGULA)]
    .filter((m) => esteBlocDeTokenuri(m[1] as string))
    .map((m) => m[2] as string)
    .join(';');
}

const PAGINI = fisiereDist('.html');
const FOI = fisiereDist('.css');

describe('ieșirea build-ului există', () => {
  // A guard that reads files must prove it read something. Without this, a
  // missing dist/ makes every case below pass vacuously.
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

describe('hexuriInStil', () => {
  // Control pozitiv: a guard that cannot fire is a claim nobody is checking.
  it.each([
    ['.x { color: #E4D7C4; }', ['color: #E4D7C4']],
    ['.x { color: #fff }', ['color: #fff']],
    ['.x { border: 1px solid #E3D9C6; }', ['border: #E3D9C6']],
    ['.x { background: linear-gradient(90deg, #FFFDF8 0%, transparent 70%); }', ['background: #FFFDF8']],
    ['.x { color: var(--ink); }', []],
    ['#fade { color: var(--ink); }', []],
    ['@media (max-width: 34rem) { .x { color: var(--muted); } }', []],
  ] as [string, string[]][])('%s', (css, asteptat) => {
    expect(hexuriInStil(css)).toEqual(asteptat);
  });
});

describe('blocul de tokenuri este recunoscut după selector', () => {
  it.each([
    [':root { --a: #FAF6EE; }', true],
    [':root{--a:#FAF6EE}', true],
    ['  :root  {--a:#FAF6EE}', true],
    // the escape: a higher-specificity selector merely ENDING in :root
    ['html:root { color: #DEADBE; }', false],
    ['.tema:root { color: #DEADBE; }', false],
    ['body { color: #DEADBE; }', false],
  ] as [string, boolean][])('%s', (css, exceptat) => {
    // exempted blocks vanish from the scan; everything else keeps its literal
    expect(hexuriInStil(faraBlocurileDeTokenuri(css)).length === 0).toBe(exceptat);
  });

  it('html:root nu este tratat ca bloc de tokenuri', () => {
    expect(hexuriInStil(faraBlocurileDeTokenuri('html:root{color:#DEADBE}'))).toEqual(['color: #DEADBE']);
  });
});

describe('culorile vin din tokenuri, nu din literali hex', () => {
  it.each(PAGINI)('%s', (pagina) => {
    const css = cssPagina(readFileSync(DIST + pagina, 'utf8'));
    expect(css.length).toBeGreaterThan(0);
    // The token block must contain literals, or exempting it would be an
    // exemption for nothing rather than an exclusion of the one legal place.
    expect(hexuriInStil(blocurileDeTokenuri(css)).length).toBeGreaterThan(0);
    expect(hexuriInStil(faraBlocurileDeTokenuri(css))).toEqual([]);
  });

  it.each(FOI.length > 0 ? FOI : ['(nicio foaie separată)'])('%s', (foaie) => {
    if (foaie.startsWith('(')) return;
    const css = readFileSync(DIST + foaie, 'utf8');
    expect(css.length).toBeGreaterThan(0);
    expect(hexuriInStil(faraBlocurileDeTokenuri(css))).toEqual([]);
  });
});
