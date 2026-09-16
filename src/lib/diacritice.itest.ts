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

/*
 * ===========================================================================
 * THE STRONGER QUESTION: IS EVERY NON-ASCII CHARACTER ONE WE EXPECT?
 *
 * The sweep below the fold asks "is this one of the four wrong characters?".
 * That is a denylist, and a denylist can only list what somebody remembered.
 * Measured, on this project: a commit message here carries a stray U+5DEE, a
 * CJK ideograph, where the word `axe` should be - and every cedilla scan ever
 * run over it answered `clean`, correctly and uselessly.
 *
 * So the same files are asked the inverse question against the list below.
 * It is affordable because the answer is small: the entire non-ASCII inventory
 * of this site's own output is eighteen characters.
 *
 * BUILT FROM NUMBERS, like everything else here. An escape sequence of the form
 * backslash-u-then-four-hex-digits does not survive being written to disk in
 * this repository (see CLAUDE.md), so a list spelled that way would land on disk
 * as the literal characters - and a corrupted entry would then agree with a
 * corrupted file. The glyph in each comment is a reader's aid and is not what is
 * compared; the four forbidden ones appear in neither, by construction.
 *
 * THE DENYLIST STAYS. This check subsumes it - none of the four is in the list -
 * but "Turkish cedilla where Romanian wants a comma below" is a far better
 * sentence to meet at 2 a.m. than "unexpected codepoint U+015F", and it is the
 * one mistake here that a person cannot see.
 *
 * ADDING TO THIS LIST IS A DECISION, and that is the point. A new character in
 * the output fails the build until somebody looks at it and says what it is.
 * ===========================================================================
 */
const PERMISE: ReadonlyArray<readonly [number, string]> = [
  // Romanian. Both cases, including the four capitals — a sentence or a heading
  // starts with one sooner or later, and being absent from today's output is no
  // reason to make that a build failure.
  [0x0102, 'Ă  A cu breve'],
  [0x0103, 'ă  a cu breve'],
  [0x00c2, 'Â  A cu circumflex'],
  [0x00e2, 'â  a cu circumflex'],
  [0x00ce, 'Î  I cu circumflex'],
  [0x00ee, 'î  i cu circumflex'],
  [0x0218, 'Ș  S cu VIRGULĂ dedesubt'],
  [0x0219, 'ș  s cu VIRGULĂ dedesubt'],
  [0x021a, 'Ț  T cu VIRGULĂ dedesubt'],
  [0x021b, 'ț  t cu VIRGULĂ dedesubt'],
  // German. The lowercase only: the u in Zurich is never word-initial here.
  [0x00fc, 'ü  u cu umlaut, din Zürich'],
  // Typography. Every one of these was measured in the output, not assumed.
  [0x00a7, '§  paragraf, din trimiterile la specificație'],
  [0x00b7, '·  punct median, separator în subtitluri'],
  [0x2013, '–  linie de dialog scurtă, în intervale de dată'],
  [0x2014, '—  linie de pauză'],
  [0x201d, '”  ghilimea română de închidere'],
  [0x201e, '„  ghilimea română de deschidere'],
  [0x2020, '†  cruce, marcaj de zi de sărbătoare'],
  [0x2026, '…  puncte de suspensie'],
  [0x2039, '‹  săgeata „săptămâna trecută” din selector'],
  [0x203a, '›  săgeata „săptămâna viitoare” din selector'],
  [0x2192, '→  săgeată, în textul de pornire al CMS-ului'],
];

const PERMISE_CP = new Set(PERMISE.map(([cp]) => cp));

/**
 * Every non-ASCII character in `text` that this project does not expect, each
 * reported with its codepoint by number, its position and its surroundings.
 * Empty means clean.
 */
export function neasteptateIn(text: string): string[] {
  const gasite: string[] = [];
  let i = 0;
  // Iterated by CODEPOINT, not by UTF-16 unit, so an astral character is judged
  // once and reported by its real number rather than as two surrogates.
  for (const caracter of text) {
    const cp = caracter.codePointAt(0) as number;
    if (cp > 0x7f && !PERMISE_CP.has(cp)) {
      const context = text.slice(Math.max(0, i - 40), i + 40).replace(/\s+/g, ' ');
      gasite.push(`${uPlus(cp)} la ${i}: …${context}…`);
    }
    i += caracter.length;
  }
  return gasite;
}

/** How many times each non-ASCII codepoint occurs in `text`. */
export function inventarNonAscii(text: string, acumulator = new Map<number, number>()): Map<number, number> {
  for (const caracter of text) {
    const cp = caracter.codePointAt(0) as number;
    if (cp > 0x7f) acumulator.set(cp, (acumulator.get(cp) ?? 0) + 1);
  }
  return acumulator;
}

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

describe('detectorul de caractere neașteptate', () => {
  /*
   * Control pozitiv, și nu unul inventat: U+5DEE este ideograma CJK care a
   * ajuns chiar în mesajul unui commit al acestui proiect, în locul cuvântului
   * `axe`. Nu e printre cele patru sedile, deci toate scanările de atunci au
   * răspuns „curat”, corect și fără folos. Asta caută lista permisă.
   */
  it('prinde un caracter din afara listei', () => {
    const rau = `regula pe care ${String.fromCodePoint(0x5dee)} a predat-o`;
    expect(neasteptateIn(rau)).toHaveLength(1);
    expect(neasteptateIn(rau)[0]).toContain(uPlus(0x5dee));
    expect(neasteptateIn(rau)[0]).toContain('regula pe care');
  });

  it.each(CEDILE)('prinde și sedila %i, pe care oricum o prinde și cealaltă gardă', (cp) => {
    expect(neasteptateIn(String.fromCodePoint(cp))).toHaveLength(1);
  });

  /*
   * Cele două garzi nu au voie să se contrazică: o sedilă pe lista permisă ar
   * face ca „nicio sedilă" să depindă numai de cealaltă verificare, iar aceasta
   * ar trece peste ea în tăcere.
   */
  it('nicio sedilă nu este pe lista permisă', () => {
    for (const cp of CEDILE) expect(PERMISE_CP.has(cp), uPlus(cp)).toBe(false);
  });

  it('nu se declanșează pe literele românești, pe ü sau pe ASCII', () => {
    const bun =
      [...VIRGULA_DEDESUBT, 0x0102, 0x0103, 0x00c2, 0x00e2, 0x00ce, 0x00ee, 0x00fc]
        .map((cp) => String.fromCodePoint(cp))
        .join('') + ' Sfantul Maslu 08:45';
    expect(neasteptateIn(bun)).toEqual([]);
  });

  it('numără pe coduri, nu pe unități UTF-16', () => {
    // Un caracter din afara planului de bază ocupă două unități; raportat o
    // singură dată și cu numărul lui adevărat, nu ca două surogate.
    const astral = String.fromCodePoint(0x1f600);
    expect(astral.length).toBe(2);
    expect(neasteptateIn(astral)).toHaveLength(1);
    expect(neasteptateIn(astral)[0]).toContain('U+1F600');
  });
});

describe('niciun caracter non-ASCII neașteptat în ieșirea construită', () => {
  it.each(FISIERE)('%s', (fisier) => {
    expect(neasteptateIn(readFileSync(DIST + fisier, 'utf8'))).toEqual([]);
  });

  /*
   * Inventarul se tipărește la fiecare rulare, nu doar la picare: numărul din
   * lista permisă trebuie să poată fi verificat față de o măsurătoare, nu doar
   * față de un verdict verde. Scris direct pe stdout — reporterul implicit al
   * lui vitest nu arată `console.log` din testele care trec.
   */
  it('inventarul măsurat încape în lista permisă', () => {
    const inventar = new Map<number, number>();
    for (const f of FISIERE) inventarNonAscii(readFileSync(DIST + f, 'utf8'), inventar);
    const nume = new Map(PERMISE);
    const linii = [...inventar]
      .sort((a, b) => a[0] - b[0])
      .map(([cp, n]) => `  ${uPlus(cp)} x${String(n).padStart(4)}  ${nume.get(cp) ?? 'NEAȘTEPTAT'}`);
    process.stdout.write(
      `\nInventar non-ASCII peste ${FISIERE.length} fișier(e) din dist/ ` +
        `— ${inventar.size} caracter(e) distinct(e), din ${PERMISE.length} permise:\n${linii.join('\n')}\n`,
    );
    // A guard that reads files must prove it read something.
    expect(inventar.size, 'ieșirea nu conține niciun caracter non-ASCII').toBeGreaterThan(0);
    const neasteptate = [...inventar.keys()].filter((cp) => !PERMISE_CP.has(cp)).map(uPlus);
    expect(neasteptate, `caractere pe care nimeni nu le-a prevăzut: ${neasteptate.join(', ')}`).toEqual([]);
  });
});
