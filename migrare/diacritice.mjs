// The four forbidden codepoints are written by NUMBER in exactly one tracked
// file, `src/lib/cedile.ts`, and `src/lib/diacritice-surse.test.ts` fails any
// other file that spells them - so they are imported here rather than retyped.
// The `.ts` extension is written out because this is plain ESM: Node 22 strips
// the types on the way in, and there is no bundler resolving extensions for the
// migration scripts the way there is for `src/`.
import { CEDILE, VIRGULA_DEDESUBT } from '../src/lib/cedile.ts';

/**
 * Wrong encoding to right encoding, by NUMBER on both sides.
 *
 * Neither the forbidden characters nor their replacements are written as
 * glyphs anywhere in this file. A source file that spelled the forbidden four
 * out could not be swept for them by `src/lib/diacritice-surse.test.ts`, and a
 * corrupted expectation would then agree with a corrupted source - which is
 * exactly the failure this project has already paid for once.
 *
 * The four cedilla forms are the same LETTERS as Romanian's comma-below ones,
 * encoded the way a Turkish keyboard layout or an old font substitution leaves
 * them. `a` with tilde and `A` with tilde are not Romanian letters at all;
 * they are what a Portuguese-ish fallback produced where the breve belonged.
 */
export const INLOCUIRI = new Map([
  // The four are zipped from the two exported arrays rather than typed out as
  // pairs: `src/lib/cedile.ts` is the one file allowed to write the numbers, and
  // a hand-written table here would be a second copy to keep in step AND a
  // chance to pair the capital with the wrong small letter. The arrays are
  // declared in matching order, which is the property this relies on.
  ...CEDILE.map((c, i) => [c, VIRGULA_DEDESUBT[i]]),
  // `A`/`a` with tilde are not among the swept four, so they are written here.
  [0x00c3, 0x0102],
  [0x00e3, 0x0103],
]);

/** The non-breaking space, which WordPress scatters through pasted text. */
const SPATIU_NESEPARABIL = 0x00a0;

/**
 * Normalises one string.
 *
 * WHAT THIS DOES NOT DO, and must not start doing: add missing diacritics.
 * Plenty of this content is written without them - `si` for the word spelled
 * with U+0219, `anuntati` for the one with U+021B. Guessing would mean a
 * script rewriting the parish's own words in a language it cannot read, and
 * getting it wrong somewhere nobody would notice for years. Those are left
 * exactly as written, for a person to fix in the CMS or leave alone.
 */
export function normalizeaza(text) {
  let rezultat = '';
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if (c === SPATIU_NESEPARABIL) { rezultat += ' '; continue; }
    const inlocuitor = INLOCUIRI.get(c);
    rezultat += inlocuitor === undefined ? ch : String.fromCodePoint(inlocuitor);
  }
  return rezultat;
}

/**
 * Every non-ASCII codepoint in the text, with its count.
 *
 * Print what was measured, not only the verdict: the migration prints this
 * before and after so a later reader can check a number rather than trust a
 * sentence. It is also the stronger question - not "does this contain the four
 * forbidden characters" but "is every character in here one this project
 * expects".
 */
export function raportCodepoints(text) {
  const harta = new Map();
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if (c > 127) harta.set(c, (harta.get(c) ?? 0) + 1);
  }
  return harta;
}
