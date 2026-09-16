/**
 * The one detector for "Turkish cedilla where Romanian wants a comma below",
 * and the one place the four forbidden codepoints are named.
 *
 * Romanian's letters are S/s U+0218/U+0219 and T/t U+021A/U+021B. The cedilla
 * forms at U+015E/U+015F and U+0162/U+0163 are a different language's letters
 * and are a defect here, not a variant spelling - and the shipped fonts contain
 * all four, so a corrupted character draws as a perfectly formed glyph. No
 * screenshot, dev server or careful look can tell you anything about this class
 * of bug. Only the codepoints can.
 *
 * THE FORBIDDEN FOUR ARE NAMED BY NUMBER HERE AND NEVER SHOWN AS GLYPHS, and in
 * this file that is not a style rule but the thing that makes the sweeps
 * possible at all. A file that spelled them out could not itself be swept: every
 * scan of the repository would light up on it and be waved through, which is
 * exactly how the character nobody can see survives. It also means nothing here
 * can be copied into real copy and carry a cedilla with it. The comma-below
 * characters ARE written out in the comment above, because they are the correct
 * ones and a reader should see what right looks like.
 *
 * BUILT FROM NUMBERS, NEVER FROM ESCAPES. An escape sequence of the form
 * backslash-u-then-four-hex-digits does not survive being written to disk in
 * this repository (see `CLAUDE.md`): the heredoc and the file-writing tools both
 * decode it silently, so a guard written as a character class of the four would
 * land on disk CONTAINING those four characters - still functionally correct,
 * and with the "correct by construction" property it existed for gone. That is
 * how the one in `date-ro.test.ts` got there. Nothing in this file may be
 * rewritten as a literal or as an escape.
 *
 * TWO SWEEPS USE THIS, AND THEY ASK DIFFERENT QUESTIONS OF DIFFERENT THINGS:
 *
 *   - `diacritice.itest.ts` reads `dist/`, the built output, which is where a
 *     `praznic:` field a volunteer typed becomes text a parishioner sees. It
 *     asks this question AND the stronger one - is every non-ASCII character in
 *     the output one this project expects - because there the vocabulary is
 *     small enough to enumerate and a stray character reaches a reader.
 *   - `diacritice-surse.test.ts` reads every TRACKED file, which is where a
 *     corrupted expectation would sit agreeing with a corrupted source. It asks
 *     only this question, because "every non-ASCII character in the sources" is
 *     a much larger and much more judgemental list - and because this is the
 *     rule `CLAUDE.md` states as non-negotiable about the repository itself.
 */

/** Turkish cedilla forms: capital/small S, capital/small T. */
export const CEDILE = [0x015e, 0x015f, 0x0162, 0x0163] as const;

/** The Romanian comma-below forms they are mistaken for. */
export const VIRGULA_DEDESUBT = [0x0218, 0x0219, 0x021a, 0x021b] as const;

/** A codepoint as `U+XXXX`, which is how every message here names one. */
export function uPlus(cp: number): string {
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
    if (cp !== undefined && (CEDILE as readonly number[]).includes(cp)) {
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
    if (cp !== undefined && (VIRGULA_DEDESUBT as readonly number[]).includes(cp)) return true;
  }
  return false;
}
