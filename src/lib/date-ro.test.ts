import { describe, expect, it } from 'vitest';
import { CEDILLAS, hasCommaBelow, cedillasIn, uPlus } from './cedilla';
import {
  MONTH_NAMES,
  DAY_NAMES,
  formatWeekRange,
  monthName,
  dayName,
  dateParts,
  dayOfMonth,
} from './date-ro';

describe('vocabulary', () => {
  it('has seven days starting with Monday', () => {
    expect(DAY_NAMES).toEqual([
      'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă', 'Duminică',
    ]);
  });

  it('has twelve months', () => {
    expect(MONTH_NAMES).toHaveLength(12);
    // Assert all twelve by value. Checking only the length and one entry let
    // `august` -> `aușust` and `martie` -> `marție` through the whole suite.
    // Every month name is pure ASCII, so any non-ASCII character here is wrong.
    expect(MONTH_NAMES).toEqual([
      'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
      'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
    ]);
  });

  it('writes the days with exactly the correct codepoints', () => {
    // Written as escapes deliberately: the day names are where every diacritic
    // in this module lives, and a look-alike glyph in the expectation would
    // silently agree with a corrupted table.
    expect(DAY_NAMES).toEqual([
      'Luni',
      'Mar\u021Bi',                 // U+021B t-comma-below, never U+0163
      'Miercuri',
      'Joi',
      'Vineri',
      'S\u00E2mb\u0103t\u0103',      // U+00E2 circumflex, U+0103 breve - plain ASCII t
      'Duminic\u0103',
    ]);
  });

  it('uses comma below, not cedilla', () => {
    /*
     * The last guard in the project that still wrote out the four forbidden characters
     * themselves. It was a character class with them inside, on disk, in a tracked file —
     * exactly what `CLAUDE.md` says is not allowed to exist, because a file that writes
     * them can no longer be swept for them. Its sibling guards built theirs from numbers;
     * this one was the survivor of the decoded-escape hazard that `CLAUDE.md` documents,
     * and it stayed that way for two rounds.
     *
     * Now it asks the single detector in `./cedilla`, which holds all four as numbers.
     * The test's title is deliberately plain ASCII: a title with diacritics would have
     * been one more place where a cedilla could pass for a correction.
     */
    const allText = [...DAY_NAMES, ...MONTH_NAMES].join('');
    expect(cedillasIn(allText)).toEqual([]);
    // And the proof that the guard has something to catch: the tables really do
    // contain comma-below, otherwise "no cedilla" would be true of a corpus that
    // happened to be ASCII by accident.
    expect(hasCommaBelow(allText)).toBe(true);
  });

  it('the detector really does fire on each of the four', () => {
    // Positive control, built from numbers: a guard that cannot fire
    // proves nothing.
    for (const cp of CEDILLAS) {
      expect(cedillasIn(`Mar${String.fromCodePoint(cp)}i`), uPlus(cp)).toHaveLength(1);
    }
  });
});

describe('dayName', () => {
  it('recognises a Monday', () => {
    expect(dayName('2026-09-14')).toBe('Luni');
  });

  it('recognises a Sunday', () => {
    expect(dayName('2026-09-20')).toBe('Duminică');
  });

  it('works across the year boundary', () => {
    expect(dayName('2026-01-01')).toBe('Joi');
  });
});

describe('monthName and dayOfMonth', () => {
  it('returns the month in lower case', () => {
    expect(monthName('2026-09-20')).toBe('septembrie');
  });

  it('returns the day as a number', () => {
    expect(dayOfMonth('2026-09-07')).toBe(7);
  });
});

describe('formatWeekRange', () => {
  it('compresses a week inside one month', () => {
    expect(formatWeekRange('2026-09-14', '2026-09-20'))
      .toBe('14 – 20 septembrie 2026');
  });

  it('writes both months when the week crosses them', () => {
    expect(formatWeekRange('2026-09-28', '2026-10-04'))
      .toBe('28 septembrie – 4 octombrie 2026');
  });

  it('writes both years when the week crosses the year', () => {
    expect(formatWeekRange('2025-12-29', '2026-01-04'))
      .toBe('29 decembrie 2025 – 4 ianuarie 2026');
  });
});

describe('dateParts', () => {
  it('splits a valid date', () => {
    expect(dateParts('2026-09-14')).toEqual({ year: 2026, month: 9, day: 14 });
  });

  it('rejects a wrong format', () => {
    expect(() => dateParts('2026-9-14')).toThrow(/Invalid date/);
  });

  it('rejects month 00', () => {
    expect(() => dateParts('2026-00-01')).toThrow(/Nonexistent date/);
  });

  it('rejects month 13', () => {
    expect(() => dateParts('2026-13-01')).toThrow(/Nonexistent date/);
  });

  it('rejects 30 February', () => {
    expect(() => dateParts('2026-02-30')).toThrow(/Nonexistent date/);
  });

  it('rejects day 32', () => {
    expect(() => dateParts('2026-01-32')).toThrow(/Nonexistent date/);
  });

  it('rejects 29 February in an ordinary year', () => {
    expect(() => dateParts('2026-02-29')).toThrow(/Nonexistent date/);
  });

  it('accepts 29 February in a leap year', () => {
    expect(dateParts('2028-02-29')).toEqual({ year: 2028, month: 2, day: 29 });
    expect(dayName('2028-02-29')).toBe('Marți');
  });

  it('rejects a year below 100, which Date.UTC would move into the 1900s', () => {
    expect(() => dateParts('0026-01-01')).toThrow(/Nonexistent date/);
  });
});

describe('the validation applies to the public functions too', () => {
  it('monthName no longer returns undefined for month 13', () => {
    expect(() => monthName('2026-13-01')).toThrow(/Nonexistent date/);
  });

  it('dayName no longer reports a day for 30 February', () => {
    expect(() => dayName('2026-02-30')).toThrow(/Nonexistent date/);
  });

  it('formatWeekRange rejects a date that does not exist', () => {
    expect(() => formatWeekRange('2026-09-14', '2026-09-31'))
      .toThrow(/Nonexistent date/);
  });
});
