import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CEDILLAS, hasCommaBelow, cedillasIn, uPlus } from './cedilla';
import { ALLOWED_EXTENSIONS } from '../../migration/media.mjs';

/*
 * WHAT THIS PROVES: no file this repository tracks contains a Turkish cedilla
 * where Romanian wants a comma below - in an input, not only in the output.
 *
 * `CLAUDE.md` states this as non-negotiable and explains what it buys: the four
 * forbidden characters "are named by number and never printed as glyphs anywhere
 * in this repository, including here: a file that spelled them out could not be
 * swept for them, and nothing in it could be copied without carrying one."
 *
 * THE RULE WAS FALSE WHEN IT WAS WRITTEN, and stayed false for the whole of
 * Phase 1. Two tracked files printed all four as glyphs - `date-ro.test.ts`,
 * whose guard was a character class of them, and the plan document, in the very
 * paragraph forbidding them. Twenty-one occurrences. So a full codepoint scan of
 * the sources returned hits a reader had to learn to ignore, which is the
 * habit the rule exists to prevent, and the repo-wide sweep it was written to
 * enable could not be run at all. This file is that sweep.
 *
 * WHY THE SOURCES AND NOT ONLY `dist/`. `diacritics.itest.ts` reads the built
 * output, which is the right subject for "what does a parishioner see": it is
 * where a `feast:` a volunteer typed becomes text on a page. It cannot see an
 * input that never reaches a page - and a corrupted EXPECTATION in a test is
 * exactly that. A guard whose expected value carried a cedilla would agree,
 * silently and forever, with a source that carried one too. Neither sweep
 * subsumes the other.
 *
 * WHY ONLY THIS QUESTION HERE. `diacritics.itest.ts` also asks the stronger one -
 * is every non-ASCII character one this project expects - against a list of
 * twenty-eight, of which the output's measured inventory uses twenty-five. That works over
 * `dist/`, whose whole vocabulary is Romanian copy
 * plus a handful of typographic marks. It does not transfer: the tracked sources
 * carry over thirty distinct non-ASCII characters between English prose, Romanian
 * comments, box-drawing in documents and deliberate astral test fixtures, and an
 * allowlist that large is a list nobody reads. Stated as a gap rather than
 * pretended away: a stray look-alike from another alphabet in a SOURCE file is
 * not caught here. One was introduced and caught by measurement while this very
 * file was being written - a Cyrillic U+0435 in an identifier - which is the
 * evidence for the gap rather than an argument against the sweep.
 *
 * THE SUBJECT COMES FROM git, not from a list written here, and that is the one
 * place this guard follows the artifact instead of holding it to a fixed
 * expectation. That is deliberate and it is the same exception `a11y.mjs` makes
 * for breakpoints: the property being checked IS that the sweep covers whatever
 * the repository now contains, so a list of paths would be the thing that
 * decayed. What is held fixed is the set of forbidden characters, which lives in
 * `./cedilla` as numbers.
 */

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/**
 * Every file the repository tracks, as paths relative to the root.
 *
 * `git ls-files`, so what is swept is what is committed. Untracked and ignored
 * files are outside on purpose and both halves matter: `public/admin/` holds the
 * vendored Sveltia bundle, whose own i18n tables legitimately contain Turkish,
 * and `.superpowers/` is scratch - the SDD ledger and raw review diffs, which
 * quote the corrupted characters as evidence and must be able to. Neither ships,
 * and neither is ours.
 */
function trackedFiles(): string[] {
  return execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' })
    .split('\0')
    .filter((path) => path !== '');
}

/*
 * The tracked files that are BYTES rather than text, as a PREDICATE.
 *
 * It was a list holding one exact path, `public/favicon.ico`, because naming
 * files one by one is how an exemption stays visible. Task 6 commits the
 * migrated images - 7 files today, around a hundred once the pages follow -
 * and a hundred JPEGs cannot be named one by one. So the rule is now: the
 * favicon, or a path under the migrated-image directory whose extension is on
 * the allow-list `migration/media.mjs` already owns. **The list is imported
 * from there, never copied here**: a second copy is how two answers come to
 * disagree about what sharp can write.
 *
 * A PREFIX RULE ON ITS OWN IS A PURE WEAKENING, SO IT DOES NOT SHIP ALONE.
 * "A file under `src/assets/content/`" would excuse a PHP payload renamed to
 * `.jpg` for as long as it sat there, and the old list would not have. What
 * replaces the name-by-name property is stronger than naming: `binaries.itest.ts`
 * decodes every file under that prefix through sharp and fails by name on any
 * that does not decode. A name list is defeated by renaming a payload to
 * `.jpg`; a decoder is not. The positive control below proves both arms of the
 * predicate still fire, and `binaries.itest.ts` asserts the extension half
 * against every real file, so the prefix cannot quietly become dead.
 */
const CONTENT_PREFIX = 'src/assets/content/';

/** Whether this tracked path is bytes rather than text, and so not swept. */
function isBinary(path: string): boolean {
  if (path === 'public/favicon.ico') return true;
  if (!path.startsWith(CONTENT_PREFIX)) return false;
  const extension = path.split('.').pop()?.toLowerCase() ?? '';
  return (ALLOWED_EXTENSIONS as readonly string[]).includes(extension);
}

/** Whether a file's bytes are text: valid UTF-8 and no NUL. */
function isText(path: string): boolean {
  const bytes = readFileSync(ROOT + path);
  if (bytes.includes(0)) return false;
  const text = bytes.toString('utf8');
  return Buffer.byteLength(text, 'utf8') === bytes.length;
}

const TRACKED = trackedFiles();
const BINARIES = TRACKED.filter(isBinary);
const TO_SWEEP = TRACKED.filter((path) => !isBinary(path));

describe('the sweep really does have something to sweep', () => {
  // A guard that reads files must prove it read something. Without these, a
  // `git ls-files` that returned nothing would make every case below pass
  // vacuously - the shape this project has paid for more than once.
  it('git really does return tracked files', () => {
    expect(TRACKED.length).toBeGreaterThan(50);
  });

  it("covers the sources, the tests, the documents and the CMS's files", () => {
    // Named explicitly: "sweeps everything" would be true even of a list that had
    // dropped exactly the kind of file a cedilla ends up in.
    for (const path of [
      'src/lib/date-ro.ts',
      'src/lib/date-ro.test.ts',
      'src/pages/index.astro',
      'src/content/services/2026-09-14.yml',
      'public/admin/config.yml',
      'public/_headers',
      'docs/superpowers/plans/2026-09-15-phase-1-schedule-and-cms.md',
      'AGENTS.md',
    ]) {
      expect(TO_SWEEP, path).toContain(path);
    }
  });

  it('leaves out no tracked file that nobody has named as binary', () => {
    const notText = TO_SWEEP.filter((path) => !isText(path));
    expect(
      notText,
      `tracked files that do not read as text: ${notText.join(', ')}. ` +
        'If they are images, their extension belongs in ALLOWED_EXTENSIONS in ' +
        'migration/media.mjs; if not, find out why they do not decode.',
    ).toEqual([]);
  });

  it('the binary predicate fires on the named file and on the migrated images', () => {
    // BOTH ARMS, each against a file that really is tracked. The old case here
    // checked that every named exemption still existed; with a predicate the
    // equivalent question is whether each arm still matches anything, because
    // an arm that stopped matching would silently widen the sweep.
    expect(TRACKED, 'public/favicon.ico').toContain('public/favicon.ico');
    expect(isBinary('public/favicon.ico')).toBe(true);
    const migrated = TRACKED.filter((path) => path.startsWith(CONTENT_PREFIX));
    expect(
      migrated.length,
      'no tracked file under src/assets/content/ - the prefix arm matches nothing',
    ).toBeGreaterThan(0);
    // And the extension half is what decides under the prefix: a file there
    // whose extension is off the allow-list stays in the sweep and fails above.
    expect(migrated.filter((path) => !isBinary(path)), 'off the allow-list').toEqual([]);
    // Negative control: the predicate does not match everything.
    expect(isBinary('src/lib/week.ts')).toBe(false);
    expect(isBinary('src/assets/content/logo.svg')).toBe(false);
  });

  it('the sources really do contain comma below', () => {
    // Otherwise "no cedilla" would be true of a corpus that just happened to be ASCII —
    // the same shape as a missing `dist/`.
    const allText = TO_SWEEP.map((path) => readFileSync(ROOT + path, 'utf8')).join('');
    expect(hasCommaBelow(allText)).toBe(true);
  });
});

describe('the detector fires on each of the four', () => {
  // Positive control, built from numbers just like the set being searched for: a guard that
  // cannot fire verifies nothing.
  it.each(CEDILLAS)('catches %i', (cp) => {
    const bad = `Înăl${String.fromCodePoint(cp)}area`;
    expect(cedillasIn(bad)).toHaveLength(1);
    expect(cedillasIn(bad)[0]).toContain(uPlus(cp));
  });
});

describe('no Turkish cedilla in the tracked files', () => {
  it('none of them', () => {
    const found = TO_SWEEP.flatMap((path) =>
      cedillasIn(readFileSync(ROOT + path, 'utf8')).map((where) => `${path}: ${where}`),
    );
    // Printed, not only checked, because the number is what a later reader
    // checks against if a comment contradicts it. `console.log` is not visible on
    // the green run; `process.stdout.write` passes through the reporter in both cases.
    process.stdout.write(
      `\nSwept for cedillas: ${TO_SWEEP.length} tracked file(s) ` +
        `(of ${TRACKED.length}; ${BINARIES.length} excluded as binary by the predicate) — ${found.length} occurrence(s).\n`,
    );
    expect(
      found,
      `the four forbidden characters, written as glyphs in tracked files:\n${found.join('\n')}\n` +
        'Write them as code — String.fromCodePoint(0x…) in code, U+015F in prose. ' +
        'A file that writes them out can no longer be swept for them.',
    ).toEqual([]);
  });
});

/*
 * ===========================================================================
 * "THE FOUR NUMBERS LIVE IN ONE PLACE" - A SENTENCE UNTIL THIS BLOCK.
 *
 * `CLAUDE.md` states it as part of the rule it calls non-negotiable: the four
 * forbidden codepoints "are named by number" and "the four numbers and the
 * detector live in one place, `src/lib/cedilla.ts`". It was false in three files
 * at once - `diacritics.itest.ts` carried two of them in a fixture, and
 * `CLAUDE.md` itself carried one in the example showing how to build a character
 * from a number. All three were legitimate uses. That is the point: nobody wrote
 * a second copy on purpose, which is why a sentence was never going to hold it.
 *
 * WHAT IT COSTS when it is false is small and specific, and it is the same thing
 * the glyph rule protects: somebody sweeping the repository for the hex spelling
 * of one of them, to see where the forbidden set is defined, finds three files,
 * has to judge each, and learns to wave hits through - which is the habit both
 * rules exist to prevent.
 *
 * SCOPE, SAID RATHER THAN IMPLIED. This looks for the HEXADECIMAL spellings,
 * which is how every codepoint in this repository is written, and it is built
 * from `CEDILLAS` so this file names none of them. A decimal spelling would not be
 * caught: measured, the four decimal values appear zero times in tracked files
 * today, and a scan for them would collide with ordinary byte counts in reports -
 * a check that cries wolf is a check somebody relaxes. `U+015F` IN PROSE IS NOT A
 * COPY and is deliberately not swept: naming the characters by number in words is
 * exactly what the rule asks for.
 * ===========================================================================
 */

/** Where the four numbers are allowed to be written. */
const CODEPOINTS_FILE = 'src/lib/cedilla.ts';

/**
 * Every hexadecimal spelling of the four codepoints in `text`, with its offset.
 *
 * Built from `CEDILLAS`, like everything else here, so this file can be swept by
 * its own rule. `0x` then any number of leading zeros then the hex digits, so
 * the spelling with a leading zero and the one without are both found.
 */
export function hexNumbersIn(text: string): string[] {
  const found: string[] = [];
  for (const cp of CEDILLAS) {
    const pattern = new RegExp(`0x0*${cp.toString(16)}\\b`, 'gi');
    for (const m of text.matchAll(pattern)) found.push(`${uPlus(cp)} as ${m[0]} at ${m.index}`);
  }
  return found.sort();
}

describe('the four numbers are written in one file only', () => {
  it('the detector really does fire, on each of the four', () => {
    // Positive control, built from numbers just like the set being searched for.
    for (const cp of CEDILLAS) {
      const bad = `const X = [0x${cp.toString(16)}];`;
      expect(hexNumbersIn(bad), uPlus(cp)).toHaveLength(1);
    }
    // And the other direction: comma below is not one of them.
    expect(hexNumbersIn('String.fromCodePoint(0x0219)')).toEqual([]);
    // `U+015F` in prose is not a copy of the number and is not swept.
    expect(hexNumbersIn(`${uPlus(CEDILLAS[0])} in prose`)).toEqual([]);
  });

  it('the codepoints file really does contain them — otherwise the rule would be about nothing', () => {
    expect(TO_SWEEP, CODEPOINTS_FILE).toContain(CODEPOINTS_FILE);
    const inCodepointsFile = hexNumbersIn(readFileSync(ROOT + CODEPOINTS_FILE, 'utf8'));
    expect(inCodepointsFile.length, `${CODEPOINTS_FILE} no longer writes the four numbers`).toBe(CEDILLAS.length);
  });

  it('no other tracked file writes them any more', () => {
    const found = TO_SWEEP.filter((path) => path !== CODEPOINTS_FILE).flatMap((path) =>
      hexNumbersIn(readFileSync(ROOT + path, 'utf8')).map((where) => `${path}: ${where}`),
    );
    process.stdout.write(
      `\nThe four numbers, written in hexadecimal: ${CODEPOINTS_FILE} has all ${CEDILLAS.length}; ` +
        `the other ${TO_SWEEP.length - 1} tracked files — ${found.length} occurrence(s).\n`,
    );
    expect(
      found,
      `the four numbers, written outside ${CODEPOINTS_FILE}:\n${found.join('\n')}\n` +
        'Import them from ./cedilla. A second copy makes a sweep for their number return ' +
        'more files, and teaches the reader to skip past the results.',
    ).toEqual([]);
  });
});
