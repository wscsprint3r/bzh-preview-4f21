import { describe, expect, it } from 'vitest';
import { TO_DELETE, REPLACEMENTS, normalize, codepointReport } from './diacritics.mjs';
import { CEDILLAS, COMMA_BELOW, uPlus } from '../src/lib/cedilla.ts';

// Built from numbers, never written as glyphs: a test file that spelled these
// out could not be swept for them, and `src/lib/diacritics-sources.test.ts`
// sweeps every tracked file.
const [CAPITAL_S_CEDILLA, S_CEDILLA, CAPITAL_T_CEDILLA, T_CEDILLA] = CEDILLAS.map((c) => String.fromCodePoint(c));
const [CAPITAL_S_COMMA, S_COMMA, CAPITAL_T_COMMA, T_COMMA] =
  COMMA_BELOW.map((c) => String.fromCodePoint(c));
const A_TILDE = String.fromCodePoint(0x00e3);
const A_BREVE = String.fromCodePoint(0x0103);

// The five invisible characters measured in the corpus, by number.
//
// Written out HERE rather than imported from `diacritics.mjs`, on purpose: this
// list is the fixed end. A test that took its subject from the set under test
// would go vacuous exactly when that set lost an entry - which is not a
// hypothetical, it is what the property test below did before its positive
// control was added, measured.
const SOFT_HYPHEN = 0x00ad;
const INVISIBLES = [SOFT_HYPHEN, 0x2068, 0x2069];
const NBSP = 0x00a0;

// Group B: the visible characters ruled untouchable - legitimate Romanian and
// German typography that `normalize` must carry through unchanged. Written
// out here by number for the same reason as `INVISIBLES`: an expected set taken
// from the module under test only ever restates what that module already does.
//
// Guillemets are Romanian's own quotation pair; the umlauts are German names
// and words the parish writes. Counts measured in the corpus, 2026-09-16.
const GROUP_B = [
  0x00ab, // « x33
  0x00bb, // » x33
  0x201c, // opening double quote, x21
  0x2019, // typographic apostrophe, x4
  0x00dc, // U with umlaut, x4
  0x00e4, // a with umlaut, x2
  0x00f6, // o with umlaut, x2
];

// The two combining marks the pairs differ by, for the correspondence check.
const COMBINING_CEDILLA = 0x0327;
const COMBINING_COMMA_BELOW = 0x0326;

/*
 * THE PREMISE `REPLACEMENTS` RESTS ON, WHICH NOTHING CHECKED.
 *
 * `REPLACEMENTS` is a zip of `CEDILLAS` and `COMMA_BELOW` on the stated grounds
 * that the two are declared in matching order. Nothing in the repository
 * asserted that. Every other pairing assertion in this file has the shape
 * `normalize(CEDILLAS[i]) === COMMA_BELOW[i]`, which restates the map's
 * own definition - so permuting `COMMA_BELOW` in `cedilla.ts`, pairing a
 * capital with a small letter, would ship GREEN through the whole suite. That
 * is the corrupted-expectation-agreeing-with-corrupted-source shape again, one
 * remove further out than a wrong entry in the map itself: the map would be a
 * faithful zip of a table that had become wrong.
 *
 * So this asks Unicode rather than this repository. It decomposes both
 * characters (NFD) and compares the pieces. Comparing the BASE character
 * settles same-letter and same-case in one go, because `S` and `s` are
 * different base characters - and case is precisely what a transposition would
 * get wrong.
 */
describe('the zip premise: the two tables really do correspond', () => {
  it.each(CEDILLAS.map((cp, i) => [i, cp, COMMA_BELOW[i]]))(
    'perechea %i este aceeasi litera, doar cu alt semn',
    (_i, cedilla, comma) => {
      const decomposedCedilla = [...String.fromCodePoint(cedilla).normalize('NFD')];
      const decomposedComma = [...String.fromCodePoint(comma).normalize('NFD')];
      // Each is exactly a base letter plus one combining mark. Asserted, not
      // assumed: a character that decomposed to something else would make the
      // comparisons below compare the wrong pieces.
      expect(decomposedCedilla, uPlus(cedilla)).toHaveLength(2);
      expect(decomposedComma, uPlus(comma)).toHaveLength(2);
      // Same base character: same letter AND same case.
      expect(decomposedComma[0], `${uPlus(cedilla)} vs ${uPlus(comma)}`).toBe(
        decomposedCedilla[0],
      );
      // And the mark is the only thing that differs: cedilla to comma below.
      expect(decomposedCedilla[1].codePointAt(0), uPlus(cedilla)).toBe(COMBINING_CEDILLA);
      expect(decomposedComma[1].codePointAt(0), uPlus(comma)).toBe(COMBINING_COMMA_BELOW);
    },
  );

  it('tablourile au aceeasi lungime, altfel zipul ar lasa perechi nedefinite', () => {
    // A `CEDILLAS` entry with no partner zips to `[cp, undefined]`, and
    // `REPLACEMENTS.get(cp)` then returns `undefined`, which `normalize` reads
    // as "leave it alone" - a forbidden character passing through in silence.
    expect(COMMA_BELOW).toHaveLength(CEDILLAS.length);
  });
});

describe('normalizarea diacriticelor', () => {
  it('changes all four cedilla forms', () => {
    expect(normalize(S_CEDILLA)).toBe(S_COMMA);
    expect(normalize(T_CEDILLA)).toBe(T_COMMA);
    expect(normalize(CAPITAL_S_CEDILLA)).toBe(CAPITAL_S_COMMA);
    expect(normalize(CAPITAL_T_CEDILLA)).toBe(CAPITAL_T_COMMA);
  });

  it('changes a with tilde, which is not a Romanian letter', () => {
    expect(normalize(A_TILDE)).toBe(A_BREVE);
    expect(normalize(String.fromCodePoint(0x00c3))).toBe(String.fromCodePoint(0x0102));
  });

  it('does not touch the correct letters', () => {
    const correct = S_COMMA + T_COMMA + A_BREVE + 'aiu' + String.fromCodePoint(0x00e2);
    expect(normalize(correct)).toBe(correct);
  });

  it('keeps u with umlaut, because it spells Zurich', () => {
    const u = String.fromCodePoint(0x00fc);
    expect(normalize(`Z${u}rich`)).toBe(`Z${u}rich`);
  });

  it('replaces the non-breaking space with an ordinary space', () => {
    expect(normalize(`a${String.fromCodePoint(0x00a0)}b`)).toBe('a b');
  });

  it('deletes the invisible characters, and the letters around them join up', () => {
    for (const c of INVISIBLES) {
      expect(normalize(`a${String.fromCodePoint(c)}b`), uPlus(c)).toBe('ab');
      expect(TO_DELETE.has(c), uPlus(c)).toBe(true);
    }
  });

  it('rejoins the word broken by a soft hyphen, without inventing a hyphen', () => {
    // Measured in the corpus: the word broken mid-word by a soft hyphen. A
    // soft hyphen is not a hyphen - the word is a single one, and writing a
    // real hyphen in its place would invent a spelling nobody used.
    const brokenWord = `rug${A_BREVE}ciu${String.fromCodePoint(SOFT_HYPHEN)}ne`;
    expect(normalize(brokenWord)).toBe(`rug${A_BREVE}ciune`);
    expect(normalize(brokenWord)).not.toContain('-');
  });

  it('leaves no invisible character behind, for the whole set', () => {
    // Property over the whole exported set, so a character added to `TO_DELETE`
    // later is covered without anybody remembering to add a case. `INVISIBLES`
    // is the positive control: without it, emptying `TO_DELETE` would empty
    // `all` and make the assertion below true of a string with nothing in it.
    const all = [...TO_DELETE].map((c) => String.fromCodePoint(c)).join('');
    for (const c of INVISIBLES) {
      expect(all.includes(String.fromCodePoint(c)), uPlus(c)).toBe(true);
    }
    expect(normalize(`x${all}y`)).toBe('xy');
  });

  it('leaves Romanian and German typography untouched', () => {
    // Nothing else guards these. The `dist/` sweep fires on characters it does
    // not EXPECT and never on characters that have gone MISSING, so an entry
    // added to `TO_DELETE` or `REPLACEMENTS` later that swallowed a guillemet would
    // be caught by nothing at all - in the one module every migration task runs
    // the parish's prose through. This is the deletion nobody would see.
    for (const c of GROUP_B) {
      const ch = String.fromCodePoint(c);
      expect(normalize(ch), uPlus(c)).toBe(ch);
      expect(normalize(`ab${ch}cd`), uPlus(c)).toBe(`ab${ch}cd`);
      expect(TO_DELETE.has(c), `${uPlus(c)} nu are ce cauta in DE_STERS`).toBe(false);
      expect(REPLACEMENTS.has(c), `${uPlus(c)} nu are ce cauta in INLOCUIRI`).toBe(false);
    }
    // And all seven together, the way they turn up in a real paragraph.
    const all = GROUP_B.map((c) => String.fromCodePoint(c)).join('');
    expect(normalize(all)).toBe(all);
  });

  it("does NOT add missing diacritics - that is a human being's job", () => {
    // "si" stays "si". A script that guessed here would rewrite the parish's
    // words on its own authority, in a language it cannot read.
    expect(normalize('si')).toBe('si');
    expect(normalize('anuntati')).toBe('anuntati');
  });

  it('leaves no forbidden codepoint behind, for any input', () => {
    // The property, not an example. Every forbidden codepoint, in one string.
    const all = [...REPLACEMENTS.keys()].map((c) => String.fromCodePoint(c)).join('');
    // Positive control, and not a formality: the input is built FROM the table
    // under test, so a mapping dropped from `REPLACEMENTS` drops out of `all`
    // too and the absence check below passes on a string that never contained
    // the character. Measured - with the cedilla rows deleted, every assertion
    // after this line still passed. `CEDILLAS` comes from `src/lib/cedilla.ts`,
    // which this task's defect cannot edit, so it is the fixed end to hold the
    // table against.
    for (const forbidden of CEDILLAS) {
      expect(all.includes(String.fromCodePoint(forbidden)), uPlus(forbidden)).toBe(true);
    }
    const after = normalize(all);
    for (const forbidden of CEDILLAS) {
      expect(after.includes(String.fromCodePoint(forbidden))).toBe(false);
    }
  });

  it('the report counts what it found, so it can be read in one run', () => {
    const r = codepointReport(S_CEDILLA + S_CEDILLA + T_CEDILLA);
    expect(r.get(CEDILLAS[1])).toBe(2);
    expect(r.get(CEDILLAS[3])).toBe(1);
  });

  it('is idempotent by construction, not just on one example', () => {
    // `f(f(x)) === f(x)` is satisfied by the identity function too, so the
    // example at the end cannot tell a working normaliser from one that does
    // nothing. The structural property can, and it is the real reason this
    // holds: `normalize` is idempotent exactly when nothing it PRODUCES is
    // something it would go on to transform. Transformed: every key of
    // `REPLACEMENTS`, the non-breaking space, every member of `TO_DELETE`.
    // Produced: every value of `REPLACEMENTS`, and the plain space.
    const transformed = new Set([...REPLACEMENTS.keys(), NBSP, ...TO_DELETE]);
    const produced = new Set([...REPLACEMENTS.values(), 0x20]);
    const both = [...produced].filter((c) => transformed.has(c)).map(uPlus);
    expect(
      both,
      `normalizeaza produce caractere pe care le-ar transforma din nou: ${both.join(', ')}`,
    ).toEqual([]);
    // Positive control: both sets have something in them, so the empty
    // intersection above is empty for the right reason rather than because
    // there was nothing there to meet.
    expect(transformed.size).toBeGreaterThan(TO_DELETE.size);
    expect(produced.size).toBeGreaterThan(1);

    const input =
      S_CEDILLA + T_CEDILLA + A_TILDE + String.fromCodePoint(SOFT_HYPHEN) + 'text';
    expect(normalize(normalize(input))).toBe(normalize(input));
  });
});
