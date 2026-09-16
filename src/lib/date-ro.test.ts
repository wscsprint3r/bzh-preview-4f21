import { describe, expect, it } from 'vitest';
import { CEDILE, areVirgulaDedesubt, cedileIn, uPlus } from './cedile';
import {
  NUME_LUNI,
  NUME_ZILE,
  formatIntervalSaptamana,
  numeLuna,
  numeZi,
  partiData,
  ziuaDinLuna,
} from './date-ro';

describe('vocabular', () => {
  it('are șapte zile începând cu luni', () => {
    expect(NUME_ZILE).toEqual([
      'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă', 'Duminică',
    ]);
  });

  it('are douăsprezece luni', () => {
    expect(NUME_LUNI).toHaveLength(12);
    // Assert all twelve by value. Checking only the length and one entry let
    // `august` -> `aușust` and `martie` -> `marție` through the whole suite.
    // Every month name is pure ASCII, so any non-ASCII character here is wrong.
    expect(NUME_LUNI).toEqual([
      'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
      'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
    ]);
  });

  it('scrie zilele cu exact codepoint-urile corecte', () => {
    // Written as escapes deliberately: the day names are where every diacritic
    // in this module lives, and a look-alike glyph in the expectation would
    // silently agree with a corrupted table.
    expect(NUME_ZILE).toEqual([
      'Luni',
      'Mar\u021Bi',                 // U+021B t-comma-below, never U+0163
      'Miercuri',
      'Joi',
      'Vineri',
      'S\u00E2mb\u0103t\u0103',      // U+00E2 circumflex, U+0103 breve - plain ASCII t
      'Duminic\u0103',
    ]);
  });

  it('foloseste virgula dedesubt, nu sedila', () => {
    /*
     * Ultima gardă din proiect care scria chiar cele patru caractere interzise.
     * Era o clasă de caractere cu ele înăuntru, pe disc, într-un fișier urmărit —
     * adică exact ce spune `CLAUDE.md` că nu are voie să existe, fiindcă un fișier
     * care le scrie nu mai poate fi măturat pentru ele. Surorile ei le construiau
     * din numere; aceasta era supraviețuitoarea decodării la scriere pe care o
     * documentează `CLAUDE.md`, și a rămas așa două runde.
     *
     * Acum întreabă detectorul unic din `./cedile`, care le ține pe toate patru ca
     * numere. Titlul testului este ASCII curat dinadins: un titlu cu diacritice ar
     * fi fost încă un loc în care o sedilă ar fi trecut drept corectură.
     */
    const tot = [...NUME_ZILE, ...NUME_LUNI].join('');
    expect(cedileIn(tot)).toEqual([]);
    // Și dovada că garda are ce prinde: tabelele chiar conțin virgulă dedesubt,
    // altfel „nicio sedilă” ar fi adevărat despre un corpus întâmplător ASCII.
    expect(areVirgulaDedesubt(tot)).toBe(true);
  });

  it('detectorul chiar se declanșează pe fiecare dintre cele patru', () => {
    // Control pozitiv, construit din numere: o gardă care nu poate să se
    // declanșeze nu verifică nimic.
    for (const cp of CEDILE) {
      expect(cedileIn(`Mar${String.fromCodePoint(cp)}i`), uPlus(cp)).toHaveLength(1);
    }
  });
});

describe('numeZi', () => {
  it('recunoaște o luni', () => {
    expect(numeZi('2026-09-14')).toBe('Luni');
  });

  it('recunoaște o duminică', () => {
    expect(numeZi('2026-09-20')).toBe('Duminică');
  });

  it('funcționează peste granița de an', () => {
    expect(numeZi('2026-01-01')).toBe('Joi');
  });
});

describe('numeLuna și ziuaDinLuna', () => {
  it('întoarce luna cu literă mică', () => {
    expect(numeLuna('2026-09-20')).toBe('septembrie');
  });

  it('întoarce ziua ca număr', () => {
    expect(ziuaDinLuna('2026-09-07')).toBe(7);
  });
});

describe('formatIntervalSaptamana', () => {
  it('comprimă o săptămână din aceeași lună', () => {
    expect(formatIntervalSaptamana('2026-09-14', '2026-09-20'))
      .toBe('14 – 20 septembrie 2026');
  });

  it('scrie ambele luni când săptămâna le traversează', () => {
    expect(formatIntervalSaptamana('2026-09-28', '2026-10-04'))
      .toBe('28 septembrie – 4 octombrie 2026');
  });

  it('scrie ambii ani când săptămâna traversează anul', () => {
    expect(formatIntervalSaptamana('2025-12-29', '2026-01-04'))
      .toBe('29 decembrie 2025 – 4 ianuarie 2026');
  });
});

describe('partiData', () => {
  it('desface o dată validă', () => {
    expect(partiData('2026-09-14')).toEqual({ an: 2026, luna: 9, zi: 14 });
  });

  it('respinge un format greșit', () => {
    expect(() => partiData('2026-9-14')).toThrow(/invalidă/);
  });

  it('respinge luna 00', () => {
    expect(() => partiData('2026-00-01')).toThrow(/inexistentă/);
  });

  it('respinge luna 13', () => {
    expect(() => partiData('2026-13-01')).toThrow(/inexistentă/);
  });

  it('respinge 30 februarie', () => {
    expect(() => partiData('2026-02-30')).toThrow(/inexistentă/);
  });

  it('respinge ziua 32', () => {
    expect(() => partiData('2026-01-32')).toThrow(/inexistentă/);
  });

  it('respinge 29 februarie într-un an obișnuit', () => {
    expect(() => partiData('2026-02-29')).toThrow(/inexistentă/);
  });

  it('acceptă 29 februarie într-un an bisect', () => {
    expect(partiData('2028-02-29')).toEqual({ an: 2028, luna: 2, zi: 29 });
    expect(numeZi('2028-02-29')).toBe('Marți');
  });

  it('respinge un an sub 100, pe care Date.UTC l-ar muta în 1900+', () => {
    expect(() => partiData('0026-01-01')).toThrow(/inexistentă/);
  });
});

describe('validarea se aplică și funcțiilor publice', () => {
  it('numeLuna nu mai întoarce undefined pentru luna 13', () => {
    expect(() => numeLuna('2026-13-01')).toThrow(/inexistentă/);
  });

  it('numeZi nu mai raportează o zi pentru 30 februarie', () => {
    expect(() => numeZi('2026-02-30')).toThrow(/inexistentă/);
  });

  it('formatIntervalSaptamana respinge o dată inexistentă', () => {
    expect(() => formatIntervalSaptamana('2026-09-14', '2026-09-31'))
      .toThrow(/inexistentă/);
  });
});
