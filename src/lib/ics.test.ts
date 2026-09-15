import { describe, expect, it } from 'vitest';
import type { ZiSlujba } from './schema';
import { NUME_SLUJBE } from './schema';
import { genereazaIcs } from './ics';

function zi(data: string, slujbe: Array<[string, string]>, extra: Partial<ZiSlujba> = {}): ZiSlujba {
  return {
    data,
    praznic_mare: false,
    zi_de_post: false,
    anulat: false,
    slujbe: slujbe.map(([ora, slujba]) => ({ ora, slujba: slujba as never })),
    ...extra,
  } as ZiSlujba;
}

const opts = { dtstamp: '20260915T060000Z', locatie: 'Wehntalerstrasse 451, 8046 Zürich' };

const ics = (zile: ZiSlujba[]) => genereazaIcs(zile, opts);

describe('structura documentului', () => {
  it('se deschide și se închide corect', () => {
    const out = ics([zi('2026-09-20', [['10:00', 'Sfânta Liturghie']])]);
    expect(out.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(out.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('folosește terminatori de linie CRLF', () => {
    const out = ics([zi('2026-09-20', [['10:00', 'Sfânta Liturghie']])]);
    expect(out.split('\n').every((l) => l === '' || l.endsWith('\r'))).toBe(true);
  });

  it('include fusul orar Europe/Zurich', () => {
    const out = ics([zi('2026-09-20', [['10:00', 'Sfânta Liturghie']])]);
    expect(out).toContain('BEGIN:VTIMEZONE');
    expect(out).toContain('TZID:Europe/Zurich');
  });

  it('emite un VEVENT pentru fiecare slujbă', () => {
    const out = ics([zi('2026-09-14', [['07:30', 'Utrenia'], ['08:30', 'Sfânta Liturghie']])]);
    expect(out.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });

  it('scrie zilele în ordine cronologică, oricum ar veni', () => {
    // Fără asta, o sortare care nu sortează trece neobservată: feed-ul rămâne
    // valid, doar că ordinea lui depinde de ordinea fișierelor pe disc.
    const out = ics([
      zi('2026-09-20', [['10:00', 'Sfânta Liturghie']]),
      zi('2026-09-14', [['07:30', 'Utrenia']]),
      zi('2026-09-16', [['18:30', 'Acatist']]),
    ]);
    const zileInFeed = [...out.matchAll(/DTSTART;TZID=Europe\/Zurich:(\d{8})/g)]
      .map((m) => m[1]);
    expect(zileInFeed).toEqual(['20260914', '20260916', '20260920']);
  });
});

/**
 * O săptămână întreagă de parohie, cu toate formele pe care le ia programul:
 * perechi la aceeași oră, o zi anulată care își păstrează orele, o slujbă care
 * trece de miezul nopții și cel mai lung nume din NUME_SLUJBE.
 *
 * Există ca fixtură pentru invarianți: un test pe exemple confirmă ce te-ai
 * gândit să verifici, unul pe invariant prinde ce nu te-ai gândit.
 */
const saptamana = (): ZiSlujba[] => [
  zi('2026-09-14', [['07:30', 'Utrenia'], ['08:30', 'Sfânta Liturghie']], {
    praznic: 'Înălțarea Sfintei Cruci', praznic_mare: true, zi_de_post: true,
  }),
  zi('2026-09-16', [['17:00', 'Spovedanie'], ['18:30', 'Acatist']]),
  zi('2026-09-18', [['18:00', 'Liturghia Darurilor mai înainte sfințite']]),
  // Spovedanie în timpul Vecerniei: două slujbe la aceeași oră.
  zi('2026-09-19', [['17:00', 'Spovedanie'], ['17:00', 'Vecernie']]),
  // Trei slujbe, dintre care două simultane, urmate de una mai târzie.
  zi('2026-09-20', [['08:45', 'Utrenia'], ['10:00', 'Sfânta Liturghie'], ['10:00', 'Botez']], {
    praznic: 'Duminica după Înălțarea Sfintei Cruci',
  }),
  // Trece de miezul nopții: 23:00 + 90 de minute.
  zi('2026-09-21', [['23:00', 'Priveghere']]),
  // Anulată, dar își păstrează orele - steagul e adevărul, nu lista.
  zi('2026-09-23', [['18:30', 'Acatist']], { anulat: true }),
];

/** Perechile (DTSTART, DTEND) ale evenimentelor, în ordinea din feed. */
function intervale(out: string): Array<[string, string]> {
  // DTSTART; cu punct și virgulă: cele din VTIMEZONE se scriu DTSTART: și nu
  // sunt evenimente.
  const linii = out.split('\r\n');
  const inceput = linii.filter((l) => l.startsWith('DTSTART;')).map((l) => l.split(':')[1]);
  const sfarsit = linii.filter((l) => l.startsWith('DTEND;')).map((l) => l.split(':')[1]);
  expect(inceput).toHaveLength(sfarsit.length);
  return inceput.map((s, i) => [s, sfarsit[i]]);
}

describe('ora de început și de sfârșit', () => {
  it('scrie DTSTART cu fusul orar local', () => {
    const out = ics([zi('2026-09-20', [['10:00', 'Sfânta Liturghie']])]);
    expect(out).toContain('DTSTART;TZID=Europe/Zurich:20260920T100000');
  });

  it('completează ora cu zero la început', () => {
    const out = ics([zi('2026-09-14', [['7:30', 'Utrenia']])]);
    expect(out).toContain('DTSTART;TZID=Europe/Zurich:20260914T073000');
  });

  it('termină o slujbă când începe următoarea din aceeași zi', () => {
    const out = ics([zi('2026-09-16', [['17:00', 'Spovedanie'], ['18:30', 'Acatist']])]);
    expect(out).toContain('DTEND;TZID=Europe/Zurich:20260916T183000');
  });

  it('dă ultimei slujbe din zi durata implicită de 90 de minute', () => {
    const out = ics([zi('2026-09-20', [['10:00', 'Sfânta Liturghie']])]);
    expect(out).toContain('DTEND;TZID=Europe/Zurich:20260920T113000');
  });


  it('DTEND este strict după DTSTART pentru fiecare eveniment din săptămână', () => {
    // Invariantul, nu un exemplu. RFC 5545 §3.6.1 cere DTEND strict mai târziu;
    // un eveniment de durată zero se desenează altfel în fiecare client - adică
    // poate deloc, ceea ce pentru o parohie înseamnă o slujbă care pare că nu
    // are loc. „Următoarea după index” îl producea pentru prima dintr-o pereche
    // la aceeași oră, iar feed-ul rămânea verde.
    const zile = saptamana();
    const perechi = intervale(ics(zile));
    // Fără asta invariantul ar trece și pe un feed gol.
    expect(perechi).toHaveLength(zile.reduce((n, z) => n + z.slujbe.length, 0));
    for (const [inceput, sfarsit] of perechi) {
      expect(sfarsit > inceput, inceput + ' -> ' + sfarsit).toBe(true);
    }
  });

  it('nu pierde niciuna dintre două slujbe care încep la aceeași oră', () => {
    // Perechea concretă din spatele invariantului de mai sus: ambele primesc
    // durata implicită, adică spovedanie care ține cât Vecernia.
    const out = ics([zi('2026-09-19', [['17:00', 'Spovedanie'], ['17:00', 'Vecernie']])]);
    expect(intervale(out)).toEqual([
      ['20260919T170000', '20260919T183000'],
      ['20260919T170000', '20260919T183000'],
    ]);
  });
});

describe('UID', () => {
  it('derivă UID din dată, oră și numele slujbei, nu din poziție', () => {
    const out = ics([zi('2026-09-14', [['07:30', 'Utrenia']])]);
    expect(out).toContain('UID:20260914T0730-utrenia@bor-zh.ch');
  });

  it('păstrează UID-urile stabile când se inserează o slujbă mai devreme', () => {
    const inainte = ics([zi('2026-09-14', [['08:30', 'Sfânta Liturghie']])]);
    const dupa = ics([zi('2026-09-14', [['07:30', 'Utrenia'], ['08:30', 'Sfânta Liturghie']])]);
    expect(inainte).toContain('UID:20260914T0830-sfanta-liturghie@bor-zh.ch');
    expect(dupa).toContain('UID:20260914T0830-sfanta-liturghie@bor-zh.ch');
  });

  it('dă UID-uri distincte la două slujbe care încep la aceeași oră', () => {
    // Spovedanie în timpul Vecerniei — o seară obișnuită de parohie.
    const out = ics([zi('2026-09-19', [['17:00', 'Spovedanie'], ['17:00', 'Vecernie']])]);
    const uids = [...out.matchAll(/UID:(\S+)/g)].map((m) => m[1]);
    expect(uids).toHaveLength(2);
    expect(new Set(uids).size).toBe(2);
  });

  it('pliază diacriticele în slug, nu le șterge', () => {
    const a = ics([zi('2026-09-20', [['10:00', 'Sfânta Liturghie']])]);
    expect(a).toContain('-sfanta-liturghie@bor-zh.ch');
  });

  it('niciun nume de slujbă nu produce un UID care se împăturește', () => {
    // Asserted against NUME_SLUJBE, not against today's longest name, so adding
    // a longer service in future fails here instead of quietly folding a UID.
    for (const nume of NUME_SLUJBE) {
      const out = ics([zi('2026-09-20', [['10:00', nume]], {
        slujbe: [{ ora: '10:00', slujba: nume, detaliu: nume === 'Altceva' ? 'Cerc biblic' : undefined }],
      })]);
      for (const linie of out.split('\r\n')) {
        if (linie.startsWith('UID:')) {
          expect(new TextEncoder().encode(linie).length).toBeLessThanOrEqual(75);
        }
      }
      expect(out).not.toMatch(/UID:[^\r\n]*\r\n /);
    }
  });
});

describe('conținut', () => {
  it('pune numele slujbei în SUMMARY', () => {
    const out = ics([zi('2026-09-20', [['10:00', 'Sfânta Liturghie']])]);
    expect(out).toContain('SUMMARY:Sfânta Liturghie');
  });

  it('adaugă detaliul la SUMMARY', () => {
    const z = zi('2026-09-20', [['10:00', 'Sfânta Liturghie']]);
    z.slujbe[0].detaliu = 'și Parastas';
    expect(ics([z])).toContain('SUMMARY:Sfânta Liturghie și Parastas');
  });

  it('nu scrie niciodată cuvântul „Altceva" în SUMMARY', () => {
    const z = zi('2026-09-20', [['19:00', 'Altceva']]);
    z.slujbe[0].detaliu = 'Cerc de studiu biblic';
    const out = ics([z]);
    expect(out).toContain('SUMMARY:Cerc de studiu biblic');
    expect(out).not.toContain('Altceva');
  });

  it('pune praznicul în DESCRIPTION', () => {
    const z = zi('2026-09-14', [['08:30', 'Sfânta Liturghie']], {
      praznic: 'Înălțarea Sfintei Cruci',
      zi_de_post: true,
    });
    const out = ics([z]);
    expect(out).toContain('Înălțarea Sfintei Cruci');
    expect(out).toContain('zi de post');
  });

  it('marchează zilele anulate în loc să le omită', () => {
    const z = zi('2026-09-16', [['18:30', 'Acatist']], { anulat: true });
    expect(ics([z])).toContain('STATUS:CANCELLED');
  });
});

describe('escaping și folding', () => {
  it('escapează virgule, punct-virgule și backslash', () => {
    const z = zi('2026-09-20', [['10:00', 'Altceva']], { praznic: 'Unu, doi; trei\\patru' });
    const out = ics([z]);
    expect(out).toContain('Unu\\, doi\\; trei\\\\patru');
  });

  it('transformă newline-urile în \\n literal', () => {
    const z = zi('2026-09-20', [['10:00', 'Altceva']], { note: 'rândul unu\nrândul doi' });
    expect(ics([z])).toContain('rândul unu\\nrândul doi');
  });

  it('nu depășește 75 de octeți pe linie, nici cu diacritice', () => {
    const z = zi('2026-09-14', [['08:30', 'Sfânta Liturghie']], {
      praznic: 'Înălțarea Sfintei Cruci și pomenirea tuturor sfinților părinți români '
        + 'care au strălucit în credință de-a lungul veacurilor în Țara Românească',
    });
    const linii = ics([z]).split('\r\n');
    for (const linie of linii) {
      expect(new TextEncoder().encode(linie).length).toBeLessThanOrEqual(75);
    }
  });

  it('continuă liniile împăturite cu un spațiu', () => {
    const z = zi('2026-09-14', [['08:30', 'Sfânta Liturghie']], {
      praznic: 'x'.repeat(200),
    });
    const linii = ics([z]).split('\r\n');
    const continuari = linii.filter((l) => l.startsWith(' '));
    expect(continuari.length).toBeGreaterThan(0);
  });

  it('nu rupe un caracter multi-octet în două linii', () => {
    const z = zi('2026-09-14', [['08:30', 'Sfânta Liturghie']], {
      praznic: 'ă'.repeat(120),
    });
    const out = ics([z]);
    // If a fold split a 2-byte character, re-joining would not round-trip.
    const dezimpaturit = out.replace(/\r\n /g, '');
    expect(dezimpaturit).toContain('ă'.repeat(120));
  });

  it('împăturește corect și caracterele de trei și patru octeți', () => {
    // Testele de mai sus folosesc doar ă (doi octeți). Un editor poate lipi o
    // liniuță lungă (trei octeți) sau un emoji (patru octeți, pereche surogat
    // în JS), iar acolo se rupe o împăturire care numără caractere.
    for (const ch of ['—', '日', '𝄞', '😀']) {
      const out = ics([zi('2026-09-14', [['08:30', 'Utrenia']], { praznic: ch.repeat(80) })]);
      for (const linie of out.split('\r\n')) {
        expect(new TextEncoder().encode(linie).length).toBeLessThanOrEqual(75);
      }
      expect(out.replace(/\r\n /g, '')).toContain(ch.repeat(80));
    }
  });

  it('nicio combinație de text nu sparge împăturirea sau escaparea', () => {
    // Fuzz determinist (sămânță fixă): octeți de 1-4, plus exact caracterele pe
    // care escapeaza le tratează special, fiindcă un backslash chiar înaintea
    // unui punct și virgulă este cazul în care o desfacere naivă greșește.
    const POOL = [...'abc XY,;\\', 'ă', 'â', 'ș', 'ț', '·', '—', '日', '𝄞', '😀'];
    const seed = { s: 42 };
    const rnd = (n: number) => {
      let out = '';
      for (let i = 0; i < n; i++) {
        seed.s = (seed.s * 1103515245 + 12345) & 0x7fffffff;
        out += POOL[seed.s % POOL.length];
      }
      return out;
    };

    for (let iter = 0; iter < 300; iter++) {
      seed.s = (seed.s * 1103515245 + 12345) & 0x7fffffff;
      const praznic = rnd(seed.s % 400);
      const out = ics([zi('2026-09-14', [['08:30', 'Utrenia']], { praznic })]);

      for (const linie of out.split('\r\n')) {
        expect(new TextEncoder().encode(linie).length).toBeLessThanOrEqual(75);
      }
      if (praznic.length === 0) continue;

      const linie = out.replace(/\r\n /g, '').split('\r\n')
        .find((l) => l.startsWith('DESCRIPTION:'));
      const deEscapat = linie!.slice('DESCRIPTION:'.length)
        .replace(/\\n/g, '\n')
        .replace(/\\,/g, ',')
        .replace(/\\;/g, ';')
        .replace(/\\\\/g, '\\');
      expect(deEscapat, 'iterația ' + iter).toBe(praznic);
    }
  });
});

describe('diacriticele feed-ului', () => {
  it('folosește virgulă dedesubt, nu sedilă', () => {
    // Tot ce ajunge într-un SUMMARY trece prin etichetaSlujba, așa că scanăm
    // feed-ul generat pentru întreaga listă de slujbe, nu doar literalele pe
    // care le scrie chiar acest modul.
    const tot = ics([
      zi(
        '2026-09-14',
        NUME_SLUJBE.map((s, i): [string, string] => [`${String(i + 6).padStart(2, '0')}:00`, s]),
        { praznic: 'Înălțarea Sfintei Cruci', note: 'Se citește Acatistul' },
      ),
    ]);
    // Sedilele turcești, scrise ca escape-uri pentru ca garda să nu poată fi
    // înfrântă lipind chiar caracterele pe care le respinge:
    // U+015F, U+0163 și majusculele lor U+015E, U+0162.
    expect(tot).not.toMatch(/[\u015F\u0163\u015E\u0162]/);
    // Și dovada că garda are ce prinde, nu că trece fiindcă feed-ul scanat
    // s-a dovedit a fi ASCII.
    expect(tot).toMatch(/\u021B/); // ț, din „Liturghia Darurilor … sfințite”
    expect(tot).toMatch(/\u0219/); // ș, din nota zilei
    // Singurul literal cu diacritice pe care îl scrie acest modul, afirmat pe
    // codepoint, nu din ochi.
    expect(tot).toContain(
      'X-WR-CALNAME:Program liturgic \u2014 Sf\u00E2ntul Nicolae Z\u00FCrich',
    );
  });
});
