import { describe, expect, it } from 'vitest';
import { indiceZi } from './date-ro';
import {
  adaugaZile,
  acumLaZurich,
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

  it('așază anul, luna și ziua în ordinea ISO, nu în ordinea localei', () => {
    // Ziua este 15, deci mai mare decât orice număr de lună: o inversare
    // zi/lună ar fi vizibilă aici, iar un regex de formă nu ar prinde-o.
    // Pe o construcție small-icu care nu are en-CA, format() ar da
    // "09/15/2026" (en-US) sau "15.09.2026" (de-CH). De aceea funcția
    // asamblează din formatToParts, căutând fiecare câmp după tip.
    const azi = aziLaZurich(new Date('2026-09-15T10:00:00Z'));
    expect(azi).toBe('2026-09-15');
    expect(azi.split('-')).toEqual(['2026', '09', '15']);
  });

  it('folosește cifre latine', () => {
    // Locala de rezervă decide și sistemul de numerotație: fără
    // numberingSystem 'latn', ar-EG ar scrie aceeași dată cu cifre
    // arabo-indiene, pe care nicio comparație de mai jos nu le-ar supraviețui.
    expect(aziLaZurich(new Date('2026-09-15T10:00:00Z'))).toMatch(/^[0-9-]+$/);
  });
});

describe('oraLaZurich', () => {
  it('convertește UTC în ora locală de vară', () => {
    expect(oraLaZurich(new Date('2026-09-14T08:30:00Z'))).toBe('10:30');
  });

  it('convertește UTC în ora locală de iarnă', () => {
    expect(oraLaZurich(new Date('2026-12-14T08:30:00Z'))).toBe('09:30');
  });

  it('separă ora de minut cu două puncte, în această ordine', () => {
    // 14:05 - minutul sub 10 face vizibilă o inversare oră/minut, iar
    // separatorul este el însuși dependent de locală: da-DK scrie "14.05".
    const ora = oraLaZurich(new Date('2026-09-15T12:05:00Z'));
    expect(ora).toBe('14:05');
    expect(ora.split(':')).toEqual(['14', '05']);
  });

  it('folosește cifre latine', () => {
    expect(oraLaZurich(new Date('2026-09-15T12:05:00Z'))).toMatch(/^[0-9:]+$/);
  });

  it('scrie miezul nopții ca 00:xx, nu 24:xx', () => {
    // 22:30 UTC is 00:30 the next day in Zürich (CEST). Some ICU builds format
    // this as "24:30" under hour12:false - which would break time comparison.
    expect(oraLaZurich(new Date('2026-09-14T22:30:00Z'))).toBe('00:30');
  });
});

describe('validarea datelor', () => {
  // laUtc parses through partiData from ./date-ro; there is no second parser in
  // this module.
  //
  // Only the first test guards laUtc itself. adaugaZile is the one export that
  // reaches laUtc without going through indiceZi, so if someone "simplified"
  // laUtc back to a bare regex, that test is the only one here that would fail
  // - and 30 February would otherwise sail through into a liturgical schedule.
  // The other two enter through indiceZi, which calls partiData before laUtc is
  // ever reached; they document the validation on those paths, and would keep
  // passing against a bare-regex laUtc. Do not read them as a second guard.
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

describe('independența de locala de rezervă', () => {
  // The shape tests above run on a full-ICU machine, where en-CA and en-GB
  // always resolve - so they can never see the failure they are meant to
  // guard. A small-icu build drops the requested locale and falls back to the
  // default one. Forcing that fallback is the only way to test it here, and
  // this is the test that fails against a format()-based implementation.
  function cuLocalaFortata<T>(locala: string, f: () => T): T {
    const Original = Intl.DateTimeFormat;
    const tinta = Intl as unknown as { DateTimeFormat: unknown };
    tinta.DateTimeFormat = function (
      _cerut?: unknown,
      optiuni?: Intl.DateTimeFormatOptions,
    ) {
      return new Original(locala, optiuni);
    };
    try {
      return f();
    } finally {
      tinta.DateTimeFormat = Original;
    }
  }

  const instant = new Date('2026-09-15T12:05:00Z');

  // en-US reorders to 09/15/2026, de-CH to 15.09.2026, da-DK writes the time
  // as 14.05, and ar-EG uses Arabic-Indic digits for both.
  for (const locala of ['en-US', 'de-CH', 'ja-JP', 'da-DK', 'ar-EG']) {
    it(`întoarce ISO chiar dacă Intl cade pe ${locala}`, () => {
      expect(cuLocalaFortata(locala, () => aziLaZurich(instant))).toBe('2026-09-15');
      expect(cuLocalaFortata(locala, () => oraLaZurich(instant))).toBe('14:05');
    });
  }

  it('restaurează Intl.DateTimeFormat după fiecare test', () => {
    expect(aziLaZurich(instant)).toBe('2026-09-15');
  });
});

describe('acumLaZurich', () => {
  it('dă data și ora aceluiași moment', () => {
    expect(acumLaZurich(new Date('2026-09-15T12:05:00Z'))).toEqual({
      azi: '2026-09-15',
      ora: '14:05',
    });
  });

  it('trece miezul nopții ca o pereche', () => {
    // 23:59:59.999 la Zürich, apoi o milisecundă mai târziu.
    expect(acumLaZurich(new Date('2026-09-20T21:59:59.999Z'))).toEqual({
      azi: '2026-09-20',
      ora: '23:59',
    });
    expect(acumLaZurich(new Date('2026-09-20T22:00:00.000Z'))).toEqual({
      azi: '2026-09-21',
      ora: '00:00',
    });
  });

  it('perechea imposibilă pe care o înlocuiește chiar era posibilă', () => {
    // Bugul, scris pe față: nicio funcție nu greșește, perechea greșește.
    // aziLaZurich citește ceasul înaintea miezului nopții, oraLaZurich după.
    expect(aziLaZurich(new Date('2026-09-20T21:59:59.999Z'))).toBe('2026-09-20');
    expect(oraLaZurich(new Date('2026-09-20T22:00:00.000Z'))).toBe('00:00');
    // „2026-09-20 la 00:00" e un moment trecut cu aproape o zi, iar
    // urmatoareaSlujba îl ia drept acum.
  });

  it('citește ceasul exact o dată', () => {
    /*
     * Garda propriu-zisă, și singura formă în care se poate scrie. Testele de
     * mai sus primesc un `Date` și dovedesc doar că funcția îl folosește pe
     * acela; nu pot vedea o a doua citire, fiindcă nu există un al doilea
     * moment. Aici ceasul întoarce un alt moment la fiecare citire, așa că
     * despărțirea perechii la loc schimbă și numărul, și rezultatul.
     */
    const Original = globalThis.Date;
    const momente = ['2026-09-20T21:59:59.999Z', '2026-09-20T22:00:00.000Z'];
    let citiri = 0;
    globalThis.Date = new Proxy(Original, {
      construct(tinta, argumente) {
        if (argumente.length > 0) return new tinta(...(argumente as [string]));
        const m = momente[Math.min(citiri, momente.length - 1)];
        citiri += 1;
        return new tinta(m);
      },
    });
    try {
      expect(acumLaZurich()).toEqual({ azi: '2026-09-20', ora: '23:59' });
      expect(citiri).toBe(1);
    } finally {
      globalThis.Date = Original;
    }
  });
});
