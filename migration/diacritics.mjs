// The four forbidden codepoints are written by NUMBER in exactly one tracked
// file, `src/lib/cedilla.ts`, and `src/lib/diacritics-sources.test.ts` fails any
// other file that spells them - so they are imported here rather than retyped.
// The `.ts` extension is written out because this is plain ESM: Node 22 strips
// the types on the way in, and there is no bundler resolving extensions for the
// migration scripts the way there is for `src/`.
import { CEDILLAS, COMMA_BELOW } from '../src/lib/cedilla.ts';

/**
 * Wrong encoding to right encoding, by NUMBER on both sides.
 *
 * Neither the forbidden characters nor their replacements are written as
 * glyphs anywhere in this file. A source file that spelled the forbidden four
 * out could not be swept for them by `src/lib/diacritics-sources.test.ts`, and a
 * corrupted expectation would then agree with a corrupted source - which is
 * exactly the failure this project has already paid for once.
 *
 * The four cedilla forms are the same LETTERS as Romanian's comma-below ones,
 * encoded the way a Turkish keyboard layout or an old font substitution leaves
 * them. `a` with tilde and `A` with tilde are not Romanian letters at all;
 * they are what a Portuguese-ish fallback produced where the breve belonged.
 */
export const REPLACEMENTS = new Map([
  // The four are zipped from the two exported arrays rather than typed out as
  // pairs: `src/lib/cedilla.ts` is the one file allowed to write the numbers, and
  // a hand-written table here would be a second copy to keep in step AND a
  // chance to pair the capital with the wrong small letter. The arrays are
  // declared in matching order, which is the property this relies on.
  ...CEDILLAS.map((c, i) => [c, COMMA_BELOW[i]]),
  // `A`/`a` with tilde are not among the swept four, so they are written here.
  [0x00c3, 0x0102],
  [0x00e3, 0x0103],
]);

/** The non-breaking space, which WordPress scatters through pasted text. */
const NBSP = 0x00a0;

/**
 * Invisible characters deleted outright rather than replaced.
 *
 * Five occurrences, all measured in the 2026-08-27 dump, and every one of them
 * residue rather than writing. Three soft hyphens (U+00AD) sitting MID-WORD,
 * where a word processor's hyphenation left them: in `rugăciune`, in `lângă`
 * and in `face`. One bidi isolate pair (U+2068 FIRST STRONG ISOLATE, U+2069 POP
 * DIRECTIONAL ISOLATE) wrapping a person's name - markup from whatever editor
 * produced the paragraph, not something anybody typed.
 *
 * DELETED, NOT SUBSTITUTED, and the soft hyphen is where that matters. It is
 * not a hyphen: `rugăciune` is one word, and putting a real hyphen in its place
 * would invent a spelling nobody used. Removing it RESTORES the word. That is
 * what separates these from the parish's guillemets and German umlauts, which
 * this file deliberately leaves alone - converting those would restyle writing
 * a person chose, where this closes up a break a machine inserted.
 *
 * WHY THEY GO AT ALL, given that nobody can see them: they corrupt search,
 * screen readers and any word matching, while changing nothing a reader sees -
 * which is the cedilla's shape exactly. No screenshot or careful read finds
 * one. All five were found by dumping the corpus's codepoint inventory, which
 * is the only thing that can, and that is the tool to reach for when this list
 * next needs revisiting.
 */
export const TO_DELETE = new Set([0x00ad, 0x2068, 0x2069]);

/**
 * Normalises one string.
 *
 * WHAT THIS DOES NOT DO, and must not start doing: add missing diacritics.
 * Plenty of this content is written without them - `si` for the word spelled
 * with U+0219, `anuntati` for the one with U+021B. Guessing would mean a
 * script rewriting the parish's own words in a language it cannot read, and
 * getting it wrong somewhere nobody would notice for years. Those are left
 * exactly as written, for a person to fix in the CMS or leave alone.
 *
 * Three things happen here and they are different operations: a character is
 * re-encoded (`REPLACEMENTS`), folded to a plain space (`NBSP`), or
 * dropped entirely (`TO_DELETE`). Dropping comes first so that a deleted
 * character cannot also be looked up.
 */
export function normalize(text) {
  let result = '';
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if (TO_DELETE.has(c)) continue;
    if (c === NBSP) { result += ' '; continue; }
    const replacement = REPLACEMENTS.get(c);
    result += replacement === undefined ? ch : String.fromCodePoint(replacement);
  }
  return result;
}

/**
 * Every non-ASCII codepoint in the text, with its count.
 *
 * Print what was measured, not only the verdict: the migration prints this
 * before and after so a later reader can check a number rather than trust a
 * sentence. It is also the stronger question - not "does this contain the four
 * forbidden characters" but "is every NON-ASCII character in here one this
 * project expects".
 *
 * WHAT IT CANNOT SEE, said rather than left to be discovered. The filter is
 * `c > 127`, so an ASCII control - U+000B, U+000C, U+007F - is invisible to it.
 * Those are Group A's class exactly: invisible residue from the same word
 * processor that left the soft hyphens. So "no invisible characters remain",
 * concluded from this function, only ever means "no non-ASCII ones", and a
 * report that says otherwise is overclaiming.
 *
 * Measured on the 2026-08-27 corpus rather than assumed: zero ASCII controls in
 * all 232,298 characters, counting everything below 0x20 except tab, newline
 * and carriage return, plus 0x7F. Tab appears 6,562 times and newline 914,
 * which is why the filter is not simply widened - doing that would bury every
 * report under ordinary whitespace. If a control ever does turn up, it needs
 * its own count, not a looser floor here.
 */
export function codepointReport(text) {
  const mapping = new Map();
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if (c > 127) mapping.set(c, (mapping.get(c) ?? 0) + 1);
  }
  return mapping;
}
