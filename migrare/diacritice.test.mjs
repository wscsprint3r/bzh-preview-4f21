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
    // Masurat in corpus: `rugaciune` rupt mid-cuvant de o cratima moale. Nu
    // este o cratima obisnuita - cuvantul este unul singur, iar o cratima
    // adevarata ar inventa o scriere pe care nu a folosit-o nimeni.
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

  it('este idempotenta', () => {
    const intrare =
      S_CEDILA + T_CEDILA + A_TILDA + String.fromCodePoint(CRATIMA_MOALE) + 'text';
    expect(normalizeaza(normalizeaza(intrare))).toBe(normalizeaza(intrare));
  });
});
