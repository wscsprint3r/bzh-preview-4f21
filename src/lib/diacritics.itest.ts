import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CEDILLAS, COMMA_BELOW, hasCommaBelow, cedillasIn, uPlus } from './cedilla';

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
 * The detector itself, and the four numbers, live in `./cedilla` - one detector
 * for two sweeps, because `diacritics-sources.test.ts` asks the same question of
 * the TRACKED SOURCES and two copies of a rule is how two answers come to
 * disagree. Everything below that line is about `dist/` and stays here.
 *
 * WHY THIS ONE READS `dist` RATHER THAN `src`. Four lib tests carry a codepoint
 * guard over their own tables, and until this file existed **no `.astro` file was
 * covered by anything** - every page, every component, every `aria-label`. A
 * per-module guard also cannot see the one source the parish actually edits:
 * a volunteer typing U+0163 instead of U+021B into a `feast:` field puts a
 * cedilla on the page without touching a line of code - and it renders as a
 * perfectly formed glyph, because the shipped fonts carry all four cedilla
 * forms. The built output is the only place
 * where component markup, page copy, `.ics` text, client JavaScript and
 * volunteer-entered content are all visible at once, so it is the only place a
 * single guard can cover them all - including whatever Tasks 10-13 add, with
 * nobody remembering to copy a pattern.
 *
 * The source sweep is the other half and neither subsumes the other: this one
 * cannot see an input that never reaches a page - a corrupted EXPECTATION in a
 * test, which would then agree with a corrupted source - and that one cannot see
 * what a volunteer typed into the CMS.
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
const ALLOWED: ReadonlyArray<readonly [number, string]> = [
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

const ALLOWED_CP = new Set(ALLOWED.map(([cp]) => cp));

/**
 * Every non-ASCII character in `text` that this project does not expect, each
 * reported with its codepoint by number, its position and its surroundings.
 * Empty means clean.
 */
export function unexpectedIn(text: string): string[] {
  const found: string[] = [];
  let i = 0;
  // Iterated by CODEPOINT, not by UTF-16 unit, so an astral character is judged
  // once and reported by its real number rather than as two surrogates.
  for (const character of text) {
    const cp = character.codePointAt(0) as number;
    if (cp > 0x7f && !ALLOWED_CP.has(cp)) {
      const context = text.slice(Math.max(0, i - 40), i + 40).replace(/\s+/g, ' ');
      found.push(`${uPlus(cp)} la ${i}: …${context}…`);
    }
    i += character.length;
  }
  return found;
}

/** How many times each non-ASCII codepoint occurs in `text`. */
export function nonAsciiInventory(text: string, accumulator = new Map<number, number>()): Map<number, number> {
  for (const character of text) {
    const cp = character.codePointAt(0) as number;
    if (cp > 0x7f) accumulator.set(cp, (accumulator.get(cp) ?? 0) + 1);
  }
  return accumulator;
}


/*
 * Text-ish output only: a woff2 is bytes, and scanning it would report noise.
 * The list is deliberately wider than `.html` - Task 10 ships a Romanian string
 * inside client JavaScript and Task 11 ships the `.ics`, and both would
 * otherwise sit outside every guard in the project.
 */
const TEXT_EXTENSIONS = [
  '.html', '.js', '.mjs', '.css', '.ics', '.json',
  '.yml', '.yaml', '.txt', '.svg', '.xml', '.webmanifest',
];

/*
 * AND THE FILES THAT HAVE NO EXTENSION AT ALL.
 *
 * `dist/_headers` is ours, it is text, it carries the Content-Security-Policy
 * that this whole task turns on, and its comments are the first thing a new
 * operator reads - which makes it exactly the kind of prose a Romanian sentence
 * reaches. It matched no entry above, so it sat outside BOTH sweeps: not the
 * cedilla one, not the allowlist one. Nothing was wrong with it - it is ASCII
 * today - and that is the point: nothing could have told us if it were not.
 *
 * Listed by exact relative path rather than by "files without a dot", so a
 * binary that happens to arrive without an extension is not scanned as text by
 * accident. The other half of that - that nothing extensionless slips out of
 * the sweep unnoticed - is the case below, which fails on any such file this
 * list does not name.
 */
const NO_EXTENSION = ['_headers'];

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
const CMS_ROOT = dirname(createRequire(import.meta.url).resolve('@sveltia/cms'));

function vendoredPaths(relative = ''): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(join(CMS_ROOT, relative), { withFileTypes: true })) {
    const path = posix.join(relative, entry.name);
    if (entry.isDirectory()) found.push(...vendoredPaths(path));
    else found.push(`admin/${path}`);
  }
  return found;
}

const VENDORED = new Set(vendoredPaths());

function isTextPath(path: string, name: string): boolean {
  return TEXT_EXTENSIONS.some((e) => name.endsWith(e)) || NO_EXTENSION.includes(path);
}

function textFiles(): string[] {
  const found: string[] = [];
  const walk = (relative: string): void => {
    for (const entry of readdirSync(DIST + relative, { withFileTypes: true })) {
      const path = relative + entry.name;
      if (entry.isDirectory()) walk(path + '/');
      else if (isTextPath(path, entry.name) && !VENDORED.has(path)) found.push(path);
    }
  };
  if (existsSync(DIST)) walk('');
  return found.sort();
}

/** Every file in the build whose name carries no extension at all. */
function extensionlessFiles(): string[] {
  const found: string[] = [];
  const walk = (relative: string): void => {
    for (const entry of readdirSync(DIST + relative, { withFileTypes: true })) {
      const path = relative + entry.name;
      if (entry.isDirectory()) walk(path + '/');
      else if (!entry.name.includes('.') && !VENDORED.has(path)) found.push(path);
    }
  };
  if (existsSync(DIST)) walk('');
  return found.sort();
}

const FILES = textFiles();
const PAGES = FILES.filter((f) => f.endsWith('.html'));

describe('the build output exists', () => {
  // A guard that reads files must prove it read something. Without these two,
  // a missing or empty `dist/` would make every case below pass vacuously -
  // the guard would be loudest exactly when it had checked nothing.
  it('dist/ exists', () => {
    expect(existsSync(DIST)).toBe(true);
  });

  it('dist/ contains pages', () => {
    expect(PAGES.length).toBeGreaterThan(0);
  });

  it('every scanned file has content', () => {
    for (const f of FILES) expect(readFileSync(DIST + f, 'utf8').length).toBeGreaterThan(0);
  });
});

describe('the cedilla detector', () => {
  // Control pozitiv: o gardă care nu poate să se declanșeze nu verifică nimic.
  // Șirurile se construiesc din coduri, exact ca setul căutat.
  it.each(CEDILLAS)('prinde %i', (cp) => {
    const bad = `Înăl${String.fromCodePoint(cp)}area`;
    expect(cedillasIn(bad)).toHaveLength(1);
    expect(cedillasIn(bad)[0]).toContain(uPlus(cp));
  });

  it('does not fire on comma below', () => {
    const good = COMMA_BELOW.map((cp) => String.fromCodePoint(cp)).join('');
    expect(cedillasIn(good)).toEqual([]);
    expect(hasCommaBelow(good)).toBe(true);
  });

  it('does not fire on ă, â, î or on ASCII', () => {
    // Cele trei diacritice care NU sunt virgulă dedesubt și pe care nimeni nu
    // are voie să le „corecteze": a-breve, a-circumflex, i-circumflex.
    const others = `${String.fromCodePoint(0x0103)}${String.fromCodePoint(0x00e2)}${String.fromCodePoint(0x00ee)} Sfantul Maslu`;
    expect(cedillasIn(others)).toEqual([]);
    expect(hasCommaBelow(others)).toBe(false);
  });

  it('reports every occurrence, not only the first', () => {
    // Construit din CEDILLAS, nu din două numere scrise încă o dată aici. `cedilla.ts`
    // este singurul loc din depozit care scrie cele patru numere, iar
    // `diacritics-sources.test.ts` mătură depozitul ca să rămână așa.
    const [firstCedilla, secondCedilla] = CEDILLAS;
    const two = `${String.fromCodePoint(firstCedilla)}i ${String.fromCodePoint(secondCedilla)}i`;
    expect(cedillasIn(two)).toHaveLength(2);
    expect(cedillasIn(two)[0]).toContain(uPlus(firstCedilla));
    expect(cedillasIn(two)[1]).toContain(uPlus(secondCedilla));
  });
});

describe('what the sweep takes in and what it leaves out', () => {
  /*
   * Excepția chiar se declanșează. Fără asta, „bundle-ul este exceptat" ar putea
   * fi adevărat fiindcă tiparul nu se mai potrivește cu nimic, iar sedilele din
   * el ar pica sweep-ul la următorul build.
   */
  it('leaves out the vendored files, which really are in dist/', () => {
    const inDist = [...VENDORED].filter((c) => existsSync(DIST + c));
    expect(inDist.length, 'niciun fișier vendorizat în dist/').toBeGreaterThan(0);
    for (const path of inDist) expect(FILES, path).not.toContain(path);
  });

  /*
   * Și cealaltă jumătate, care este chiar rostul excluderii pe cale: fișierele
   * noastre din `admin/` rămân măturate. `config.yml` este formularul pe care îl
   * citește un voluntar, deci este exact genul de fișier în care o sedilă ar
   * ajunge nevăzută.
   */
  it.each(['admin/index.html', 'admin/config.yml', 'admin/pornire.mjs'])('mătură %s', (path) => {
    expect(existsSync(DIST + path), `${path} lipsește din dist/`).toBe(true);
    expect(FILES).toContain(path);
  });

  /*
   * `_headers` nu are extensie, deci nu l-a prins nicio listă de extensii și a
   * stat în afara ambelor măturări. Este al nostru, este text, poartă politica
   * de securitate, iar comentariile lui sunt primul lucru pe care îl citește
   * cineva care pune situl în funcțiune.
   */
  it('sweeps _headers, which has no extension', () => {
    expect(existsSync(DIST + '_headers'), '_headers lipsește din dist/').toBe(true);
    expect(FILES).toContain('_headers');
  });

  /*
   * Și cealaltă jumătate, ca lista de mai sus să nu rămână în urma build-ului:
   * orice fișier fără extensie pe care nimeni nu l-a numit pică, exact ca un
   * caracter non-ASCII pe care nimeni nu l-a prevăzut.
   */
  it('no extensionless file is left unswept', () => {
    const extensionless = extensionlessFiles();
    expect(extensionless.length, 'niciun fișier fără extensie în dist/ — cazul de mai sus nu ar dovedi nimic').toBeGreaterThan(0);
    const unswept = extensionless.filter((c) => !FILES.includes(c));
    expect(
      unswept,
      `fișiere fără extensie în dist/ pe care nu le citește nimeni: ${unswept.join(', ')}. ` +
        'Dacă sunt text, pune-le în FARA_EXTENSIE; dacă nu, scrie aici de ce.',
    ).toEqual([]);
  });
});

describe('no Turkish cedilla in the built output', () => {
  it.each(FILES)('%s', (file) => {
    expect(cedillasIn(readFileSync(DIST + file, 'utf8'))).toEqual([]);
  });

  /*
   * And the proof that the pass above is about Romanian text rather than about
   * a corpus that happens to be ASCII. If the site ever stopped containing a
   * single ș or ț, "no cedilla" would still be true and would still mean
   * nothing - which is the same failure shape as a missing `dist/`.
   */
  it('the output really does contain comma below', () => {
    const allText = FILES.map((f) => readFileSync(DIST + f, 'utf8')).join('');
    expect(hasCommaBelow(allText)).toBe(true);
  });

  it('the built pages contain comma below, not only the rest of the output', () => {
    const pageText = PAGES.map((p) => readFileSync(DIST + p, 'utf8')).join('');
    expect(hasCommaBelow(pageText)).toBe(true);
  });
});

describe('the unexpected-character detector', () => {
  /*
   * Control pozitiv, și nu unul inventat: U+5DEE este ideograma CJK care a
   * ajuns chiar în mesajul unui commit al acestui proiect, în locul cuvântului
   * `axe`. Nu e printre cele patru sedile, deci toate scanările de atunci au
   * răspuns „curat”, corect și fără folos. Asta caută lista permisă.
   */
  it('catches a character outside the list', () => {
    const bad = `regula pe care ${String.fromCodePoint(0x5dee)} a predat-o`;
    expect(unexpectedIn(bad)).toHaveLength(1);
    expect(unexpectedIn(bad)[0]).toContain(uPlus(0x5dee));
    expect(unexpectedIn(bad)[0]).toContain('regula pe care');
  });

  it.each(CEDILLAS)('prinde și sedila %i, pe care oricum o prinde și cealaltă gardă', (cp) => {
    expect(unexpectedIn(String.fromCodePoint(cp))).toHaveLength(1);
  });

  /*
   * Cele două garzi nu au voie să se contrazică: o sedilă pe lista permisă ar
   * face ca „nicio sedilă" să depindă numai de cealaltă verificare, iar aceasta
   * ar trece peste ea în tăcere.
   */
  it('no cedilla is on the allowed list', () => {
    for (const cp of CEDILLAS) expect(ALLOWED_CP.has(cp), uPlus(cp)).toBe(false);
  });

  it('does not fire on the Romanian letters, on ü or on ASCII', () => {
    const good =
      [...COMMA_BELOW, 0x0102, 0x0103, 0x00c2, 0x00e2, 0x00ce, 0x00ee, 0x00fc]
        .map((cp) => String.fromCodePoint(cp))
        .join('') + ' Sfantul Maslu 08:45';
    expect(unexpectedIn(good)).toEqual([]);
  });

  it('counts by codepoint, not by UTF-16 unit', () => {
    // Un caracter din afara planului de bază ocupă două unități; raportat o
    // singură dată și cu numărul lui adevărat, nu ca două surogate.
    const astral = String.fromCodePoint(0x1f600);
    expect(astral.length).toBe(2);
    expect(unexpectedIn(astral)).toHaveLength(1);
    expect(unexpectedIn(astral)[0]).toContain('U+1F600');
  });
});

describe('no unexpected non-ASCII character in the built output', () => {
  it.each(FILES)('%s', (file) => {
    expect(unexpectedIn(readFileSync(DIST + file, 'utf8'))).toEqual([]);
  });

  /*
   * Inventarul se tipărește la fiecare rulare, nu doar la picare: numărul din
   * lista permisă trebuie să poată fi verificat față de o măsurătoare, nu doar
   * față de un verdict verde. Scris direct pe stdout — reporterul implicit al
   * lui vitest nu arată `console.log` din testele care trec.
   */
  it('the measured inventory fits inside the allowed list', () => {
    const inventory = new Map<number, number>();
    for (const f of FILES) nonAsciiInventory(readFileSync(DIST + f, 'utf8'), inventory);
    const name = new Map(ALLOWED);
    const lines = [...inventory]
      .sort((a, b) => a[0] - b[0])
      .map(([cp, n]) => `  ${uPlus(cp)} x${String(n).padStart(4)}  ${name.get(cp) ?? 'NEAȘTEPTAT'}`);
    process.stdout.write(
      `\nInventar non-ASCII peste ${FILES.length} fișier(e) din dist/ ` +
        `— ${inventory.size} caracter(e) distinct(e), din ${ALLOWED.length} permise:\n${lines.join('\n')}\n`,
    );
    // A guard that reads files must prove it read something.
    expect(inventory.size, 'ieșirea nu conține niciun caracter non-ASCII').toBeGreaterThan(0);
    const unexpected = [...inventory.keys()].filter((cp) => !ALLOWED_CP.has(cp)).map(uPlus);
    expect(unexpected, `caractere pe care nimeni nu le-a prevăzut: ${unexpected.join(', ')}`).toEqual([]);
  });
});
