import { describe, expect, it } from 'vitest';
import { DE_STERS, INLOCUIRI, normalizeaza, raportCodepoints } from './diacritice.mjs';
import { CEDILE, VIRGULA_DEDESUBT, uPlus } from '../src/lib/cedile.ts';

// Built from numbers, never written as glyphs: a test file that spelled these
// out could not be swept for them, and `src/lib/diacritice-surse.test.ts`
// sweeps every tracked file.
const [S_MARE_CEDILA, S_CEDILA, T_MARE_CEDILA, T_CEDILA] = CEDILE.map((c) => String.fromCodePoint(c));
const [S_MARE_VIRGULA, S_VIRGULA, T_MARE_VIRGULA, T_VIRGULA] =
  VIRGULA_DEDESUBT.map((c) => String.fromCodePoint(c));
const A_TILDA = String.fromCodePoint(0x00e3);
const A_BREVE = String.fromCodePoint(0x0103);

// The five invisible characters measured in the corpus, by number.
//
// Written out HERE rather than imported from `diacritice.mjs`, on purpose: this
// list is the fixed end. A test that took its subject from the set under test
// would go vacuous exactly when that set lost an entry - which is not a
// hypothetical, it is what the property test below did before its positive
// control was added, measured.
const CRATIMA_MOALE = 0x00ad;
const INVIZIBILE = [CRATIMA_MOALE, 0x2068, 0x2069];
const SPATIU_NESEPARABIL = 0x00a0;

// Group B: the visible characters ruled untouchable - legitimate Romanian and
// German typography that `normalizeaza` must carry through unchanged. Written
// out here by number for the same reason as `INVIZIBILE`: an expected set taken
// from the module under test only ever restates what that module already does.
//
// Guillemets are Romanian's own quotation pair; the umlauts are German names
// and words the parish writes. Counts measured in the corpus, 2026-09-16.
const GRUPA_B = [
  0x00ab, // « x33
  0x00bb, // » x33
  0x201c, // opening double quote, x21
  0x2019, // typographic apostrophe, x4
  0x00dc, // U with umlaut, x4
  0x00e4, // a with umlaut, x2
  0x00f6, // o with umlaut, x2
];

// The two combining marks the pairs differ by, for the correspondence check.
const CEDILA_COMBINATA = 0x0327;
const VIRGULA_COMBINATA = 0x0326;

/*
 * THE PREMISE `INLOCUIRI` RESTS ON, WHICH NOTHING CHECKED.
 *
 * `INLOCUIRI` is a zip of `CEDILE` and `VIRGULA_DEDESUBT` on the stated grounds
 * that the two are declared in matching order. Nothing in the repository
 * asserted that. Every other pairing assertion in this file has the shape
 * `normalizeaza(CEDILE[i]) === VIRGULA_DEDESUBT[i]`, which restates the map's
 * own definition - so permuting `VIRGULA_DEDESUBT` in `cedile.ts`, pairing a
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
describe('premisa zipului: cele doua tablouri chiar se corespund', () => {
  it.each(CEDILE.map((cp, i) => [i, cp, VIRGULA_DEDESUBT[i]]))(
    'perechea %i este aceeasi litera, doar cu alt semn',
    (_i, cedila, virgula) => {
      const descompusaCedila = [...String.fromCodePoint(cedila).normalize('NFD')];
      const descompusaVirgula = [...String.fromCodePoint(virgula).normalize('NFD')];
      // Each is exactly a base letter plus one combining mark. Asserted, not
      // assumed: a character that decomposed to something else would make the
      // comparisons below compare the wrong pieces.
      expect(descompusaCedila, uPlus(cedila)).toHaveLength(2);
      expect(descompusaVirgula, uPlus(virgula)).toHaveLength(2);
      // Same base character: same letter AND same case.
      expect(descompusaVirgula[0], `${uPlus(cedila)} vs ${uPlus(virgula)}`).toBe(
        descompusaCedila[0],
      );
      // And the mark is the only thing that differs: cedilla to comma below.
      expect(descompusaCedila[1].codePointAt(0), uPlus(cedila)).toBe(CEDILA_COMBINATA);
      expect(descompusaVirgula[1].codePointAt(0), uPlus(virgula)).toBe(VIRGULA_COMBINATA);
    },
  );

  it('tablourile au aceeasi lungime, altfel zipul ar lasa perechi nedefinite', () => {
    // A `CEDILE` entry with no partner zips to `[cp, undefined]`, and
    // `INLOCUIRI.get(cp)` then returns `undefined`, which `normalizeaza` reads
    // as "leave it alone" - a forbidden character passing through in silence.
    expect(VIRGULA_DEDESUBT).toHaveLength(CEDILE.length);
  });
});

describe('normalizarea diacriticelor', () => {
  it('schimba toate cele patru forme cu sedila', () => {
    expect(normalizeaza(S_CEDILA)).toBe(S_VIRGULA);
    expect(normalizeaza(T_CEDILA)).toBe(T_VIRGULA);
    expect(normalizeaza(S_MARE_CEDILA)).toBe(S_MARE_VIRGULA);
    expect(normalizeaza(T_MARE_CEDILA)).toBe(T_MARE_VIRGULA);
  });

  it('schimba a cu tilda, care nu este o litera romaneasca', () => {
    expect(normalizeaza(A_TILDA)).toBe(A_BREVE);
    expect(normalizeaza(String.fromCodePoint(0x00c3))).toBe(String.fromCodePoint(0x0102));
  });

  it('nu atinge literele corecte', () => {
    const corecte = S_VIRGULA + T_VIRGULA + A_BREVE + 'aiu' + String.fromCodePoint(0x00e2);
    expect(normalizeaza(corecte)).toBe(corecte);
  });

  it('pastreaza u cu umlaut, fiindca scrie Zurich', () => {
    const u = String.fromCodePoint(0x00fc);
    expect(normalizeaza(`Z${u}rich`)).toBe(`Z${u}rich`);
  });

  it('inlocuieste spatiul neseparabil cu spatiu obisnuit', () => {
    expect(normalizeaza(`a${String.fromCodePoint(0x00a0)}b`)).toBe('a b');
  });

  it('sterge caracterele invizibile, iar literele din jur se lipesc', () => {
    for (const c of INVIZIBILE) {
      expect(normalizeaza(`a${String.fromCodePoint(c)}b`), uPlus(c)).toBe('ab');
      expect(DE_STERS.has(c), uPlus(c)).toBe(true);
    }
  });

  it('reface cuvantul rupt de cratima moale, fara sa inventeze o cratima', () => {
    // Measured in the corpus: the word broken mid-word by a soft hyphen. A
    // soft hyphen is not a hyphen - the word is a single one, and writing a
    // real hyphen in its place would invent a spelling nobody used.
    const rupt = `rug${A_BREVE}ciu${String.fromCodePoint(CRATIMA_MOALE)}ne`;
    expect(normalizeaza(rupt)).toBe(`rug${A_BREVE}ciune`);
    expect(normalizeaza(rupt)).not.toContain('-');
  });

  it('nu lasa niciun caracter invizibil in urma, pentru tot setul', () => {
    // Property over the whole exported set, so a character added to `DE_STERS`
    // later is covered without anybody remembering to add a case. `INVIZIBILE`
    // is the positive control: without it, emptying `DE_STERS` would empty
    // `toate` and make the assertion below true of a string with nothing in it.
    const toate = [...DE_STERS].map((c) => String.fromCodePoint(c)).join('');
    for (const c of INVIZIBILE) {
      expect(toate.includes(String.fromCodePoint(c)), uPlus(c)).toBe(true);
    }
    expect(normalizeaza(`x${toate}y`)).toBe('xy');
  });

  it('lasa neatinsa tipografia romaneasca si germana', () => {
    // Nothing else guards these. The `dist/` sweep fires on characters it does
    // not EXPECT and never on characters that have gone MISSING, so an entry
    // added to `DE_STERS` or `INLOCUIRI` later that swallowed a guillemet would
    // be caught by nothing at all - in the one module every migration task runs
    // the parish's prose through. This is the deletion nobody would see.
    for (const c of GRUPA_B) {
      const ch = String.fromCodePoint(c);
      expect(normalizeaza(ch), uPlus(c)).toBe(ch);
      expect(normalizeaza(`ab${ch}cd`), uPlus(c)).toBe(`ab${ch}cd`);
      expect(DE_STERS.has(c), `${uPlus(c)} nu are ce cauta in DE_STERS`).toBe(false);
      expect(INLOCUIRI.has(c), `${uPlus(c)} nu are ce cauta in INLOCUIRI`).toBe(false);
    }
    // And all seven together, the way they turn up in a real paragraph.
    const toate = GRUPA_B.map((c) => String.fromCodePoint(c)).join('');
    expect(normalizeaza(toate)).toBe(toate);
  });

  it('NU adauga diacritice lipsa - asta este treaba unui om', () => {
    // "si" stays "si". A script that guessed here would rewrite the parish's
    // words on its own authority, in a language it cannot read.
    expect(normalizeaza('si')).toBe('si');
    expect(normalizeaza('anuntati')).toBe('anuntati');
  });

  it('nu lasa niciun codepoint interzis in urma, pentru orice intrare', () => {
    // The property, not an example. Every forbidden codepoint, in one string.
    const toate = [...INLOCUIRI.keys()].map((c) => String.fromCodePoint(c)).join('');
    // Positive control, and not a formality: the input is built FROM the table
    // under test, so a mapping dropped from `INLOCUIRI` drops out of `toate`
    // too and the absence check below passes on a string that never contained
    // the character. Measured - with the cedilla rows deleted, every assertion
    // after this line still passed. `CEDILE` comes from `src/lib/cedile.ts`,
    // which this task's defect cannot edit, so it is the fixed end to hold the
    // table against.
    for (const interzis of CEDILE) {
      expect(toate.includes(String.fromCodePoint(interzis)), uPlus(interzis)).toBe(true);
    }
    const dupa = normalizeaza(toate);
    for (const interzis of CEDILE) {
      expect(dupa.includes(String.fromCodePoint(interzis))).toBe(false);
    }
  });

  it('raportul numara ce a gasit, ca sa poata fi citit intr-o rulare', () => {
    const r = raportCodepoints(S_CEDILA + S_CEDILA + T_CEDILA);
    expect(r.get(CEDILE[1])).toBe(2);
    expect(r.get(CEDILE[3])).toBe(1);
  });

  it('este idempotenta prin structura, nu doar pe un exemplu', () => {
    // `f(f(x)) === f(x)` is satisfied by the identity function too, so the
    // example at the end cannot tell a working normaliser from one that does
    // nothing. The structural property can, and it is the real reason this
    // holds: `normalizeaza` is idempotent exactly when nothing it PRODUCES is
    // something it would go on to transform. Transformed: every key of
    // `INLOCUIRI`, the non-breaking space, every member of `DE_STERS`.
    // Produced: every value of `INLOCUIRI`, and the plain space.
    const transformate = new Set([...INLOCUIRI.keys(), SPATIU_NESEPARABIL, ...DE_STERS]);
    const produse = new Set([...INLOCUIRI.values(), 0x20]);
    const ambele = [...produse].filter((c) => transformate.has(c)).map(uPlus);
    expect(
      ambele,
      `normalizeaza produce caractere pe care le-ar transforma din nou: ${ambele.join(', ')}`,
    ).toEqual([]);
    // Positive control: both sets have something in them, so the empty
    // intersection above is empty for the right reason rather than because
    // there was nothing there to meet.
    expect(transformate.size).toBeGreaterThan(DE_STERS.size);
    expect(produse.size).toBeGreaterThan(1);

    const intrare =
      S_CEDILA + T_CEDILA + A_TILDA + String.fromCodePoint(CRATIMA_MOALE) + 'text';
    expect(normalizeaza(normalizeaza(intrare))).toBe(normalizeaza(intrare));
  });
});
