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

describe('vocabular', () => {
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
     * Ultima gardă din proiect care scria chiar cele patru caractere interzise.
     * Era o clasă de caractere cu ele înăuntru, pe disc, într-un fișier urmărit —
     * adică exact ce spune `CLAUDE.md` că nu are voie să existe, fiindcă un fișier
     * care le scrie nu mai poate fi măturat pentru ele. Surorile ei le construiau
     * din numere; aceasta era supraviețuitoarea decodării la scriere pe care o
     * documentează `CLAUDE.md`, și a rămas așa două runde.
     *
     * Acum întreabă detectorul unic din `./cedilla`, care le ține pe toate patru ca
     * numere. Titlul testului este ASCII curat dinadins: un titlu cu diacritice ar
     * fi fost încă un loc în care o sedilă ar fi trecut drept corectură.
     */
    const allText = [...DAY_NAMES, ...MONTH_NAMES].join('');
    expect(cedillasIn(allText)).toEqual([]);
    // Și dovada că garda are ce prinde: tabelele chiar conțin virgulă dedesubt,
    // altfel „nicio sedilă” ar fi adevărat despre un corpus întâmplător ASCII.
    expect(hasCommaBelow(allText)).toBe(true);
  });

  it('the detector really does fire on each of the four', () => {
    // Control pozitiv, construit din numere: o gardă care nu poate să se
    // declanșeze nu verifică nimic.
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
    expect(() => dateParts('2026-9-14')).toThrow(/invalidă/);
  });

  it('respinge luna 00', () => {
    expect(() => dateParts('2026-00-01')).toThrow(/inexistentă/);
  });

  it('respinge luna 13', () => {
    expect(() => dateParts('2026-13-01')).toThrow(/inexistentă/);
  });

  it('respinge 30 februarie', () => {
    expect(() => dateParts('2026-02-30')).toThrow(/inexistentă/);
  });

  it('respinge ziua 32', () => {
    expect(() => dateParts('2026-01-32')).toThrow(/inexistentă/);
  });

  it('rejects 29 February in an ordinary year', () => {
    expect(() => dateParts('2026-02-29')).toThrow(/inexistentă/);
  });

  it('accepts 29 February in a leap year', () => {
    expect(dateParts('2028-02-29')).toEqual({ year: 2028, month: 2, day: 29 });
    expect(dayName('2028-02-29')).toBe('Marți');
  });

  it('rejects a year below 100, which Date.UTC would move into the 1900s', () => {
    expect(() => dateParts('0026-01-01')).toThrow(/inexistentă/);
  });
});

describe('the validation applies to the public functions too', () => {
  it('monthName no longer returns undefined for month 13', () => {
    expect(() => monthName('2026-13-01')).toThrow(/inexistentă/);
  });

  it('dayName no longer reports a day for 30 February', () => {
    expect(() => dayName('2026-02-30')).toThrow(/inexistentă/);
  });

  it('formatWeekRange rejects a date that does not exist', () => {
    expect(() => formatWeekRange('2026-09-14', '2026-09-31'))
      .toThrow(/inexistentă/);
  });
});
