import { describe, expect, it } from 'vitest';
import {
  NUME_LUNI,
  NUME_ZILE,
  formatIntervalSaptamana,
  numeLuna,
  numeZi,
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
    expect(NUME_LUNI[8]).toBe('septembrie');
  });

  it('folosește virgulă dedesubt, nu sedilă', () => {
    const tot = [...NUME_ZILE, ...NUME_LUNI].join('');
    expect(tot).not.toMatch(/[şţŞŢ]/);
    expect(tot).toMatch(/ț/);
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
