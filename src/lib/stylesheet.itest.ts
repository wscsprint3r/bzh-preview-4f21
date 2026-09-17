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

function distFiles(extension: string): string[] {
  const found: string[] = [];
  const walk = (relative: string): void => {
    for (const entry of readdirSync(DIST + relative, { withFileTypes: true })) {
      const path = relative + entry.name;
      if (entry.isDirectory()) walk(path + '/');
      else if (entry.name.endsWith(extension)) found.push(path);
    }
  };
  if (existsSync(DIST)) walk('');
  return found.sort();
}

/** The CSS one built page ships: linked stylesheets, inline blocks, style attributes. */
function pageCss(html: string): string {
  const pieces: string[] = [];
  for (const m of html.matchAll(/<link\b[^>]*rel=["']?stylesheet["']?[^>]*>/g)) {
    const href = m[0].match(/href=["']([^"']+)["']/)?.[1];
    if (href !== undefined && href.startsWith('/')) {
      const path = DIST + href.slice(1);
      if (existsSync(path)) pieces.push(readFileSync(path, 'utf8'));
    }
  }
  for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) pieces.push(m[1] as string);
  for (const m of html.matchAll(/\bstyle=["']([^"']*)["']/g)) pieces.push(`x{${m[1]}}`);
  return pieces.join('\n');
}

/** Hex literals in a declaration value, so `#fade` as a selector is not one. */
export function hexesInDeclarations(css: string): string[] {
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
const RULE = /([^{}]*)\{([^{}]*)\}/g;

function isTokenBlock(selector: string): boolean {
  return selector.trim() === ':root';
}

export function withoutTokenBlocks(css: string): string {
  return css.replace(RULE, (whole, selector: string) => (isTokenBlock(selector) ? ' ' : whole));
}

export function tokenBlocks(css: string): string {
  return [...css.matchAll(RULE)]
    .filter((m) => isTokenBlock(m[1] as string))
    .map((m) => m[2] as string)
    .join(';');
}

const PAGES = distFiles('.html');
const STYLESHEETS = distFiles('.css');

/*
 * THE ONE PAGE ON THIS SITE THAT SHIPS NO CSS, and the only one allowed to.
 *
 * `public/admin/index.html` is the host page for Sveltia CMS: a `<script>` tag,
 * a `<noscript>` and nothing else, by design. Everything visible on it is drawn
 * by the CMS bundle at run time, so it carries no stylesheet and no token
 * block, and the two rules below - every page ships CSS, every colour in it
 * comes from a token - are false of it in a way that is not a defect.
 *
 * EXEMPTED BY EXACT PATH, not by folder. `admin/` also holds `config.yml`, and
 * a rule reading "anything under admin/" would be an open invitation to put the
 * next unstyled page there too. One file, named, with a reason - and
 * `the exempted page exists` below fails if that file ever stops existing, so the
 * exemption cannot outlive the thing it excuses.
 *
 * It is NOT exempt from `diacritics.itest.ts`: the Romanian in this page and in
 * `config.yml` is read by a volunteer, and that guard covers both on purpose.
 */
const NO_CSS = 'admin/index.html';
const PAGES_WITH_CSS = PAGES.filter((p) => p !== NO_CSS);

describe('the build output exists', () => {
  // A guard that reads files must prove it read something. Without this, a
  // missing dist/ makes every case below pass vacuously.
  it('dist/ contains pages', () => {
    expect(existsSync(DIST)).toBe(true);
    expect(PAGES.length).toBeGreaterThan(0);
    // And the exemption must not have eaten the whole set.
    expect(PAGES_WITH_CSS.length).toBeGreaterThan(0);
  });

  it('the exempted page exists', () => {
    // An exemption for a file that no longer exists excuses nothing: it stays
    // in the code looking like a rule, ready to excuse something else under the same name.
    expect(PAGES, `${NO_CSS} no longer exists, so the exception is pointless`).toContain(NO_CSS);
  });

  it.each(PAGES_WITH_CSS)('%s are CSS', (page) => {
    const html = readFileSync(DIST + page, 'utf8');
    expect(html.length).toBeGreaterThan(0);
    expect(pageCss(html).length).toBeGreaterThan(0);
  });
});

describe('hexesInDeclarations', () => {
  // Positive control: a guard that cannot fire is a claim nobody is checking.
  it.each([
    ['.x { color: #E4D7C4; }', ['color: #E4D7C4']],
    ['.x { color: #fff }', ['color: #fff']],
    ['.x { border: 1px solid #E3D9C6; }', ['border: #E3D9C6']],
    ['.x { background: linear-gradient(90deg, #FFFDF8 0%, transparent 70%); }', ['background: #FFFDF8']],
    ['.x { color: var(--ink); }', []],
    ['#fade { color: var(--ink); }', []],
    ['@media (max-width: 34rem) { .x { color: var(--muted); } }', []],
  ] as [string, string[]][])('%s', (css, expected) => {
    expect(hexesInDeclarations(css)).toEqual(expected);
  });
});

describe('the token block is recognised by its selector', () => {
  it.each([
    [':root { --a: #FAF6EE; }', true],
    [':root{--a:#FAF6EE}', true],
    ['  :root  {--a:#FAF6EE}', true],
    // the escape: a higher-specificity selector merely ENDING in :root
    ['html:root { color: #DEADBE; }', false],
    ['.tema:root { color: #DEADBE; }', false],
    ['body { color: #DEADBE; }', false],
  ] as [string, boolean][])('%s', (css, exempted) => {
    // exempted blocks vanish from the scan; everything else keeps its literal
    expect(hexesInDeclarations(withoutTokenBlocks(css)).length === 0).toBe(exempted);
  });

  it('html:root is not treated as a token block', () => {
    expect(hexesInDeclarations(withoutTokenBlocks('html:root{color:#DEADBE}'))).toEqual(['color: #DEADBE']);
  });
});

describe('the colours come from tokens, not from hex literals', () => {
  it.each(PAGES_WITH_CSS)('%s', (page) => {
    const css = pageCss(readFileSync(DIST + page, 'utf8'));
    expect(css.length).toBeGreaterThan(0);
    // The token block must contain literals, or exempting it would be an
    // exemption for nothing rather than an exclusion of the one legal place.
    expect(hexesInDeclarations(tokenBlocks(css)).length).toBeGreaterThan(0);
    expect(hexesInDeclarations(withoutTokenBlocks(css))).toEqual([]);
  });

  it.each(STYLESHEETS.length > 0 ? STYLESHEETS : ['(nicio foaie separată)'])('%s', (stylesheet) => {
    if (stylesheet.startsWith('(')) return;
    const css = readFileSync(DIST + stylesheet, 'utf8');
    expect(css.length).toBeGreaterThan(0);
    expect(hexesInDeclarations(withoutTokenBlocks(css))).toEqual([]);
  });
});
