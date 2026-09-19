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
 * of this site's own output is twenty-six distinct characters, measured on the
 * Task 9 build, and the list holds twenty-eight - the two extras are letters
 * that no page happens to use today (the capital Â and the capital Ț), and
 * keeping them legal is what stops a heading that starts with one from being a
 * build failure the day it appears. The capital Ă stopped being an extra when
 * `/contact` arrived: the priest's name is ROMICĂ-NICOLAE ENOIU.
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
  [0x0102, 'Ă  A with breve'],
  [0x0103, 'ă  a with breve'],
  [0x00c2, 'Â  A with circumflex'],
  [0x00e2, 'â  a with circumflex'],
  [0x00ce, 'Î  I with circumflex'],
  [0x00ee, 'î  i with circumflex'],
  [0x0218, 'Ș  S with COMMA BELOW'],
  [0x0219, 'ș  s with COMMA BELOW'],
  [0x021a, 'Ț  T with COMMA BELOW'],
  [0x021b, 'ț  t with COMMA BELOW'],
  // German. The study texts on /resurse/studii/ carry the language, not only
  // Zürich's lowercase ü: measured on the Task 9 build, ä once, ö twice and
  // the capital Ü three times, each opening a German heading.
  [0x00dc, 'Ü  U with umlaut, opening a German study heading'],
  [0x00e4, 'ä  a with umlaut, in the German study texts'],
  [0x00f6, 'ö  o with umlaut, in the German study texts'],
  [0x00fc, 'ü  u with umlaut, from Zürich'],
  // Typography. Every one of these was measured in the output, not assumed.
  [0x00a7, '§  paragraph, from the spec references'],
  [0x00b7, '·  middle dot, separator in subtitles'],
  // The guillemets arrived with the migrated articles: the psalm and tropar
  // quotations in two posts open with U+00AB and close with U+00BB, which is
  // legitimate Romanian religious typography rather than a corrupted quote.
  [0x00ab, '«  left guillemet, opening a psalm quotation'],
  [0x00bb, '»  right guillemet, closing a psalm quotation'],
  [0x2013, '–  short dialogue dash, in date ranges'],
  [0x2014, '—  pause dash'],
  // The English opening quote in the 26 April 2025 adormiti post, paired with
  // the Romanian U+201D closing one. Asymmetric, and it is the parish's own
  // text from the old site: normalising it would be editing their words.
  [0x201c, '“  English opening quotation mark, in one migrated post'],
  [0x201d, '”  Romanian closing quotation mark'],
  [0x201e, '„  Romanian opening quotation mark'],
  [0x2020, '†  cross, feast-day marker'],
  [0x2026, '…  ellipsis'],
  [0x2039, '‹  the „previous week” arrow in the picker'],
  [0x203a, '›  the „next week” arrow in the picker'],
  [0x2192, '→  arrow, in the CMS start-up text'],
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
      found.push(`${uPlus(cp)} at ${i}: …${context}…`);
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
 *
 * `dist/_redirects` joined it in Phase 4, the first file to do so. It is text,
 * it is ours, and it is generated by `scripts/redirects.mjs` from
 * `docs/url-map.csv` at `astro:build:done` - so a path in the CSV is what
 * would carry a character into it. It was ASCII on the day it arrived, and
 * that is exactly the state `_headers` was in when the hole was found: nothing
 * could have told us if it were not.
 */
const NO_EXTENSION = ['_headers', '_redirects'];

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
 * `admin/index.html`, `admin/config.yml` and `admin/start.mjs` are NOT in the
 * package, so they cannot end up here however this list grows - they are ours.
 * `config.yml` holds the field labels a volunteer reads and `start.mjs` holds
 * the sentence they get when the CMS fails to start, which makes both of them
 * exactly the kind of file a cedilla would reach unseen. The tests under `what
 * the sweep takes in and what it leaves out` check both halves of that sentence rather
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
  // Positive control: a guard that cannot fire verifies nothing.
  // The strings are built from codes, exactly like the set being searched for.
  it.each(CEDILLAS)('catches %i', (cp) => {
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
    // The three diacritics that are NOT comma below and that nobody is
    // allowed to "correct": a-breve, a-circumflex, i-circumflex.
    const others = `${String.fromCodePoint(0x0103)}${String.fromCodePoint(0x00e2)}${String.fromCodePoint(0x00ee)} Sfantul Maslu`;
    expect(cedillasIn(others)).toEqual([]);
    expect(hasCommaBelow(others)).toBe(false);
  });

  it('reports every occurrence, not only the first', () => {
    // Built from CEDILLAS, not from two numbers written here a second time. `cedilla.ts`
    // is the only place in the repository that writes the four numbers, and
    // `diacritics-sources.test.ts` sweeps the repository so it stays that way.
    const [firstCedilla, secondCedilla] = CEDILLAS;
    const two = `${String.fromCodePoint(firstCedilla)}i ${String.fromCodePoint(secondCedilla)}i`;
    expect(cedillasIn(two)).toHaveLength(2);
    expect(cedillasIn(two)[0]).toContain(uPlus(firstCedilla));
    expect(cedillasIn(two)[1]).toContain(uPlus(secondCedilla));
  });
});

describe('what the sweep takes in and what it leaves out', () => {
  /*
   * The exception really does fire. Without this, "the bundle is exempted" could
   * be true because the pattern no longer matches anything, and the cedillas in
   * it would fail the sweep on the next build.
   */
  it('leaves out the vendored files, which really are in dist/', () => {
    const inDist = [...VENDORED].filter((c) => existsSync(DIST + c));
    expect(inDist.length, 'no vendored file in dist/').toBeGreaterThan(0);
    for (const path of inDist) expect(FILES, path).not.toContain(path);
  });

  /*
   * And the other half, which is the whole point of excluding by path: our own
   * files under `admin/` stay swept. `config.yml` is the form a volunteer
   * reads, so it is exactly the kind of file a cedilla could
   * reach unseen.
   */
  it.each(['admin/index.html', 'admin/config.yml', 'admin/start.mjs'])('sweeps %s', (path) => {
    expect(existsSync(DIST + path), `${path} is missing from dist/`).toBe(true);
    expect(FILES).toContain(path);
  });

  /*
   * `_headers` has no extension, so no extension list caught it and it
   * sat outside both sweeps. It is ours, it is text, it carries the security
   * policy, and its comments are the first thing read by
   * whoever brings the site up.
   */
  it('sweeps _headers, which has no extension', () => {
    expect(existsSync(DIST + '_headers'), '_headers is missing from dist/').toBe(true);
    expect(FILES).toContain('_headers');
  });

  /*
   * The second extensionless file, and the same argument: generated at
   * `astro:build:done`, ours, text, and unreadable by any extension list.
   */
  it('sweeps _redirects, which has no extension', () => {
    expect(existsSync(DIST + '_redirects'), '_redirects is missing from dist/').toBe(true);
    expect(FILES).toContain('_redirects');
  });

  /*
   * And the other half, so the list above cannot fall behind the build:
   * any extensionless file that nobody has named fails, exactly like a
   * non-ASCII character that nobody expected.
   */
  it('no extensionless file is left unswept', () => {
    const extensionless = extensionlessFiles();
    expect(extensionless.length, 'no extensionless file in dist/ — the case above would prove nothing').toBeGreaterThan(0);
    const unswept = extensionless.filter((c) => !FILES.includes(c));
    expect(
      unswept,
      `extensionless files in dist/ that nobody reads: ${unswept.join(', ')}. ` +
        'If they are text, put them in NO_EXTENSION; if not, write why here.',
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
   * Positive control, and not a made-up one: U+5DEE is the CJK ideograph that
   * actually ended up in a commit message of this project, in place of the word
   * `axe`. It is not among the four cedillas, so every scan back then
   * answered "clean", correctly and uselessly. This is what the allowed list catches.
   */
  it('catches a character outside the list', () => {
    const bad = `regula pe care ${String.fromCodePoint(0x5dee)} a predat-o`;
    expect(unexpectedIn(bad)).toHaveLength(1);
    expect(unexpectedIn(bad)[0]).toContain(uPlus(0x5dee));
    expect(unexpectedIn(bad)[0]).toContain('regula pe care');
  });

  it.each(CEDILLAS)('also catches cedilla %i, which the other guard catches anyway', (cp) => {
    expect(unexpectedIn(String.fromCodePoint(cp))).toHaveLength(1);
  });

  /*
   * The two guards are not allowed to contradict each other: a cedilla on the
   * allowed list would make "no cedilla" depend only on the other check, and that
   * one would pass over it silently.
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
    // A character outside the basic plane occupies two units; reported
    // once and with its real number, not as two surrogates.
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
   * The inventory is printed on every run, not only on failure: the number in
   * the allowed list must be checkable against a measurement, not just
   * against a green verdict. Written directly to stdout — vitest's default
   * reporter does not show `console.log` from tests that pass.
   */
  it('the measured inventory fits inside the allowed list', () => {
    const inventory = new Map<number, number>();
    for (const f of FILES) nonAsciiInventory(readFileSync(DIST + f, 'utf8'), inventory);
    const name = new Map(ALLOWED);
    const lines = [...inventory]
      .sort((a, b) => a[0] - b[0])
      .map(([cp, n]) => `  ${uPlus(cp)} x${String(n).padStart(4)}  ${name.get(cp) ?? 'UNEXPECTED'}`);
    process.stdout.write(
      `\nNon-ASCII inventory over ${FILES.length} file(s) in dist/ ` +
        `— ${inventory.size} distinct character(s), of ${ALLOWED.length} allowed:\n${lines.join('\n')}\n`,
    );
    // A guard that reads files must prove it read something.
    expect(inventory.size, 'the output contains no non-ASCII character at all').toBeGreaterThan(0);
    const unexpected = [...inventory.keys()].filter((cp) => !ALLOWED_CP.has(cp)).map(uPlus);
    expect(unexpected, `characters nobody expected: ${unexpected.join(', ')}`).toEqual([]);
  });
});
