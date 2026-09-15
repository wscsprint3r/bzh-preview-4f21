import { describe, expect, it } from 'vitest';
import { indiceZi } from './date-ro';
import {
  adaugaZile,
  aziLaZurich,
  cheieSaptamana,
  inceputSaptamana,
  oraLaZurich,
  sfarsitSaptamana,
} from './week';

describe('adaugaZile', () => {
  it('adună în interiorul lunii', () => {
    expect(adaugaZile('2026-09-14', 6)).toBe('2026-09-20');
  });

  it('trece peste granița de lună', () => {
    expect(adaugaZile('2026-09-28', 6)).toBe('2026-10-04');
  });

  it('trece peste granița de an', () => {
    expect(adaugaZile('2025-12-29', 6)).toBe('2026-01-04');
  });

  it('scade cu numere negative', () => {
    expect(adaugaZile('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('respectă anii bisecți', () => {
    expect(adaugaZile('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('nu este afectată de trecerea la ora de vară', () => {
    // 2026-03-29 is the European DST switch. A naive local-time
    // implementation adding 24h in milliseconds lands back on the 29th.
    expect(adaugaZile('2026-03-28', 1)).toBe('2026-03-29');
    expect(adaugaZile('2026-03-29', 1)).toBe('2026-03-30');
  });

  it('nu este afectată de trecerea la ora de iarnă', () => {
    expect(adaugaZile('2026-10-25', 1)).toBe('2026-10-26');
  });
});

describe('inceputSaptamana și sfarsitSaptamana', () => {
  it('o luni este propriul început de săptămână', () => {
    expect(inceputSaptamana('2026-09-14')).toBe('2026-09-14');
  });

  it('o duminică aparține săptămânii care începe luni', () => {
    expect(inceputSaptamana('2026-09-20')).toBe('2026-09-14');
    expect(sfarsitSaptamana('2026-09-20')).toBe('2026-09-20');
  });

  it('o miercuri se ancorează corect', () => {
    expect(inceputSaptamana('2026-09-16')).toBe('2026-09-14');
    expect(sfarsitSaptamana('2026-09-16')).toBe('2026-09-20');
  });
});

describe('cheieSaptamana', () => {
  it('numerotează o săptămână obișnuită', () => {
    expect(cheieSaptamana('2026-09-14')).toBe('2026-W38');
    expect(cheieSaptamana('2026-09-20')).toBe('2026-W38');
  });

  it('atribuie zilele de la finalul lui decembrie anului ISO următor', () => {
    // 2026-01-01 is a Thursday, so ISO week 1 of 2026 starts Mon 2025-12-29.
    expect(cheieSaptamana('2025-12-29')).toBe('2026-W01');
    expect(cheieSaptamana('2026-01-04')).toBe('2026-W01');
  });

  it('atribuie 1 ianuarie anului ISO precedent când cade la finalul săptămânii', () => {
    // 2027-01-01 is a Friday, so it belongs to the week starting Mon 2026-12-28,
    // which is ISO week 53 of 2026.
    expect(cheieSaptamana('2027-01-01')).toBe('2026-W53');
  });

  it('completează cu zero săptămânile cu o cifră', () => {
    expect(cheieSaptamana('2026-02-02')).toBe('2026-W06');
  });
});

describe('aziLaZurich', () => {
  it('întoarce data din Zürich, nu din UTC', () => {
    // 22:30 UTC on 14 Sept is already 00:30 on 15 Sept in Zürich (CEST, UTC+2).
    const acum = new Date('2026-09-14T22:30:00Z');
    expect(aziLaZurich(acum)).toBe('2026-09-15');
  });

  it('întoarce data curentă în formatul așteptat', () => {
    expect(aziLaZurich()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('oraLaZurich', () => {
  it('convertește UTC în ora locală de vară', () => {
    expect(oraLaZurich(new Date('2026-09-14T08:30:00Z'))).toBe('10:30');
  });

  it('convertește UTC în ora locală de iarnă', () => {
    expect(oraLaZurich(new Date('2026-12-14T08:30:00Z'))).toBe('09:30');
  });

  it('scrie miezul nopții ca 00:xx, nu 24:xx', () => {
    // 22:30 UTC is 00:30 the next day in Zürich (CEST). Some ICU builds format
    // this as "24:30" under hour12:false - which would break time comparison.
    expect(oraLaZurich(new Date('2026-09-14T22:30:00Z'))).toBe('00:30');
  });
});

describe('validarea datelor', () => {
  // laUtc parses through partiData from ./date-ro; there is no second parser in
  // this module. Without these tests someone could "simplify" laUtc back to a
  // bare regex and 30 February would sail through into a liturgical schedule.
  it('respinge o zi care nu există', () => {
    expect(() => adaugaZile('2026-02-30', 1)).toThrow(/inexistentă/);
  });

  it('respinge luna 13', () => {
    expect(() => inceputSaptamana('2026-13-01')).toThrow(/inexistentă/);
  });

  it('respinge un format greșit', () => {
    expect(() => cheieSaptamana('2026-9-14')).toThrow(/invalidă/);
  });
});

describe('contractul luni-duminică', () => {
  // formatIntervalSaptamana(luni, duminica) does not check its argument order;
  // it trusts that inceputSaptamana is always the Monday and sfarsitSaptamana
  // always the Sunday of the same week, so callers can pass them positionally.
  it('ancorează fiecare zi a săptămânii la aceeași luni și aceeași duminică', () => {
    const saptamana = [
      '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17',
      '2026-09-18', '2026-09-19', '2026-09-20',
    ];
    for (const zi of saptamana) {
      expect(inceputSaptamana(zi)).toBe('2026-09-14');
      expect(sfarsitSaptamana(zi)).toBe('2026-09-20');
      expect(indiceZi(inceputSaptamana(zi))).toBe(0); // luni
      expect(indiceZi(sfarsitSaptamana(zi))).toBe(6); // duminică
    }
  });

  it('ancorează și săptămâna care traversează anul', () => {
    // 1 January 2026 is a Thursday, so its week starts Mon 29 December 2025.
    // Going back across the year boundary is the case a within-month negative
    // step does not exercise.
    expect(inceputSaptamana('2026-01-01')).toBe('2025-12-29');
    expect(sfarsitSaptamana('2026-01-01')).toBe('2026-01-04');
    expect(indiceZi(inceputSaptamana('2026-01-01'))).toBe(0);
    expect(indiceZi(sfarsitSaptamana('2026-01-01'))).toBe(6);
  });
});
