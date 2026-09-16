import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * WHAT THIS PROVES: nothing the site actually ships contains a Turkish cedilla
 * where Romanian wants a comma below. Romanian's are Ș/ș U+0218/U+0219 and Ț/ț
 * U+021A/U+021B; the cedilla forms at U+015E/U+015F and U+0162/U+0163 are a
 * different language's letters and are a defect here, not a variant spelling.
 *
 * The forbidden four are named by CODEPOINT throughout this file and never
 * shown as glyphs - the convention `date-ro.ts` already sets, and here it is
 * doubly necessary. A file that spelled them out could not itself be scanned
 * for them: every sweep of `src/` would light up on this one and be waved
 * through, which is exactly how the character nobody can see survives. It also
 * means nothing in this file can be copy-pasted into real copy and carry a
 * cedilla with it. The comma-below characters above ARE written out, because
 * they are the correct ones and a reader should see what right looks like.
 *
 * WHY IT READS `dist` RATHER THAN `src`. Four lib tests carry a codepoint guard
 * over their own tables, and until this file existed **no `.astro` file was
 * covered by anything** - every page, every component, every `aria-label`. A
 * per-module guard also cannot see the one source the parish actually edits:
 * a volunteer typing U+0163 instead of U+021B into a `praznic:` field puts a
 * cedilla on the page without touching a line of code - and it renders as a
 * perfectly formed glyph, because the shipped fonts carry all four cedilla
 * forms. The built output is the only place
 * where component markup, page copy, `.ics` text, client JavaScript and
 * volunteer-entered content are all visible at once, so it is the only place a
 * single guard can cover them all - including whatever Tasks 10-13 add, with
 * nobody remembering to copy a pattern.
 *
 * The characters are built from NUMBERS, never written as escapes. A guard
 * spelled with a backslash-u sequence is decoded into the literal character on
 * the way to disk here (see CLAUDE.md), so a guard hunting for U+015F would end
 * up containing U+015F - and a corrupted expectation agrees with a corrupted
 * source. Nothing in this file may be rewritten as a literal.
 *
 * WHAT IT DOES NOT PROVE: that the Romanian is *correct*. `ș` in the wrong word
 * is still `ș`. Only reading the text does that, which is why the report for
 * each task prints its non-ASCII lines. This catches the corruption a human
 * cannot see, not the mistakes a human can.
 */

const DIST = fileURLToPath(new URL('../../dist/', import.meta.url));

/** Turkish cedilla forms: capital/small S, capital/small T. */
const CEDILE = [0x015e, 0x015f, 0x0162, 0x0163];
/** The Romanian comma-below forms they are mistaken for. */
const VIRGULA_DEDESUBT = [0x0218, 0x0219, 0x021a, 0x021b];

function uPlus(cp: number): string {
  return `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
}

/**
 * Every cedilla in `text`, each reported with enough context to find it. Empty
 * means clean.
 */
export function cedileIn(text: string): string[] {
  const gasite: string[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const cp = text.codePointAt(i);
    if (cp !== undefined && CEDILE.includes(cp)) {
      const context = text.slice(Math.max(0, i - 40), i + 40).replace(/\s+/g, ' ');
      gasite.push(`${uPlus(cp)} la ${i}: …${context}…`);
    }
  }
  return gasite;
}

/** Whether `text` contains any Romanian comma-below character at all. */
export function areVirgulaDedesubt(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const cp = text.codePointAt(i);
    if (cp !== undefined && VIRGULA_DEDESUBT.includes(cp)) return true;
  }
  return false;
}

/*
 * Text-ish output only: a woff2 is bytes, and scanning it would report noise.
 * The list is deliberately wider than `.html` - Task 10 ships a Romanian string
 * inside client JavaScript and Task 11 ships the `.ics`, and both would
 * otherwise sit outside every guard in the project.
 */
const EXTENSII_TEXT = [
  '.html', '.js', '.mjs', '.css', '.ics', '.json',
  '.yml', '.yaml', '.txt', '.svg', '.xml', '.webmanifest',
];

/*
 * The Sveltia CMS bundle is a few hundred KB of third-party code carrying its
 * own i18n tables - it contains a transliteration map that turns U+0163 into
 * `t`, which is Turkish text doing its job rather than our defect - so it is
 * outside this sweep.
 *
 * EXCLUDED BY PATH, AND THE PATHS COME FROM THE PACKAGE. The list used to be a
 * single filename, `sveltia-cms.mjs`, written here by hand. That was right on
 * the day it was written and stopped being right as soon as `copy-cms.mjs`
 * started vendoring the lazily-imported chunks beside it: a second vendored file
 * appeared, nothing excluded it, and the sweep passed only because React happens
 * to contain no Turkish. Reading the installed package instead means an upgrade
 * that adds a chunk is excluded without anyone remembering to.
 *
 * It is a SUPERSET of what `copy-cms.mjs` actually copies (that script skips
 * `.map` files and the classic-script build), and the extra entries name files
 * that are not in `dist/` at all. That is the safe direction: a path listed here
 * and never built excuses nothing, while a vendored path missing from here stays
 * in the sweep and fails loudly.
 *
 * `admin/index.html`, `admin/config.yml` and `admin/pornire.mjs` are NOT in the
 * package, so they cannot end up here however this list grows - they are ours.
 * `config.yml` holds the field labels a volunteer reads and `pornire.mjs` holds
 * the sentence they get when the CMS fails to start, which makes both of them
 * exactly the kind of file a cedilla would reach unseen. The tests under `ce
 * intră și ce nu intră în măturare` check both halves of that sentence rather
 * than leaving it as a promise in a comment.
 */
const RADACINA_CMS = dirname(createRequire(import.meta.url).resolve('@sveltia/cms'));

function caiVendorizate(relativ = ''): string[] {
  const gasite: string[] = [];
  for (const intrare of readdirSync(join(RADACINA_CMS, relativ), { withFileTypes: true })) {
    const cale = posix.join(relativ, intrare.name);
    if (intrare.isDirectory()) gasite.push(...caiVendorizate(cale));
    else gasite.push(`admin/${cale}`);
  }
  return gasite;
}

const VENDORIZATE = new Set(caiVendorizate());

function fisiereText(): string[] {
  const gasite: string[] = [];
  const mergi = (relativ: string): void => {
    for (const intrare of readdirSync(DIST + relativ, { withFileTypes: true })) {
      const cale = relativ + intrare.name;
      if (intrare.isDirectory()) mergi(cale + '/');
      else if (EXTENSII_TEXT.some((e) => intrare.name.endsWith(e)) && !VENDORIZATE.has(cale)) {
        gasite.push(cale);
      }
    }
  };
  if (existsSync(DIST)) mergi('');
  return gasite.sort();
}

const FISIERE = fisiereText();
const PAGINI = FISIERE.filter((f) => f.endsWith('.html'));

describe('ieșirea build-ului există', () => {
  // A guard that reads files must prove it read something. Without these two,
  // a missing or empty `dist/` would make every case below pass vacuously -
  // the guard would be loudest exactly when it had checked nothing.
  it('dist/ există', () => {
    expect(existsSync(DIST)).toBe(true);
  });

  it('dist/ conține pagini', () => {
    expect(PAGINI.length).toBeGreaterThan(0);
  });

  it('fiecare fișier scanat are conținut', () => {
    for (const f of FISIERE) expect(readFileSync(DIST + f, 'utf8').length).toBeGreaterThan(0);
  });
});

describe('detectorul de sedile', () => {
  // Control pozitiv: o gardă care nu poate să se declanșeze nu verifică nimic.
  // Șirurile se construiesc din coduri, exact ca setul căutat.
  it.each(CEDILE)('prinde %i', (cp) => {
    const rau = `Înăl${String.fromCodePoint(cp)}area`;
    expect(cedileIn(rau)).toHaveLength(1);
    expect(cedileIn(rau)[0]).toContain(uPlus(cp));
  });

  it('nu se declanșează pe virgulă dedesubt', () => {
    const bun = VIRGULA_DEDESUBT.map((cp) => String.fromCodePoint(cp)).join('');
    expect(cedileIn(bun)).toEqual([]);
    expect(areVirgulaDedesubt(bun)).toBe(true);
  });

  it('nu se declanșează pe ă, â, î sau pe ASCII', () => {
    // Cele trei diacritice care NU sunt virgulă dedesubt și pe care nimeni nu
    // are voie să le „corecteze": a-breve, a-circumflex, i-circumflex.
    const altele = `${String.fromCodePoint(0x0103)}${String.fromCodePoint(0x00e2)}${String.fromCodePoint(0x00ee)} Sfantul Maslu`;
    expect(cedileIn(altele)).toEqual([]);
    expect(areVirgulaDedesubt(altele)).toBe(false);
  });

  it('raportează fiecare apariție, nu doar prima', () => {
    const doua = `${String.fromCodePoint(0x015f)}i ${String.fromCodePoint(0x0163)}i`;
    expect(cedileIn(doua)).toHaveLength(2);
  });
});

describe('ce intră și ce nu intră în măturare', () => {
  /*
   * Excepția chiar se declanșează. Fără asta, „bundle-ul este exceptat" ar putea
   * fi adevărat fiindcă tiparul nu se mai potrivește cu nimic, iar sedilele din
   * el ar pica sweep-ul la următorul build.
   */
  it('lasă afară fișierele vendorizate, care chiar sunt în dist/', () => {
    const inDist = [...VENDORIZATE].filter((c) => existsSync(DIST + c));
    expect(inDist.length, 'niciun fișier vendorizat în dist/').toBeGreaterThan(0);
    for (const cale of inDist) expect(FISIERE, cale).not.toContain(cale);
  });

  /*
   * Și cealaltă jumătate, care este chiar rostul excluderii pe cale: fișierele
   * noastre din `admin/` rămân măturate. `config.yml` este formularul pe care îl
   * citește un voluntar, deci este exact genul de fișier în care o sedilă ar
   * ajunge nevăzută.
   */
  it.each(['admin/index.html', 'admin/config.yml', 'admin/pornire.mjs'])('mătură %s', (cale) => {
    expect(existsSync(DIST + cale), `${cale} lipsește din dist/`).toBe(true);
    expect(FISIERE).toContain(cale);
  });
});

describe('nicio sedilă turcească în ieșirea construită', () => {
  it.each(FISIERE)('%s', (fisier) => {
    expect(cedileIn(readFileSync(DIST + fisier, 'utf8'))).toEqual([]);
  });

  /*
   * And the proof that the pass above is about Romanian text rather than about
   * a corpus that happens to be ASCII. If the site ever stopped containing a
   * single ș or ț, "no cedilla" would still be true and would still mean
   * nothing - which is the same failure shape as a missing `dist/`.
   */
  it('ieșirea chiar conține virgulă dedesubt', () => {
    const tot = FISIERE.map((f) => readFileSync(DIST + f, 'utf8')).join('');
    expect(areVirgulaDedesubt(tot)).toBe(true);
  });

  it('paginile construite conțin virgulă dedesubt, nu doar restul ieșirii', () => {
    const paginiText = PAGINI.map((p) => readFileSync(DIST + p, 'utf8')).join('');
    expect(areVirgulaDedesubt(paginiText)).toBe(true);
  });
});
