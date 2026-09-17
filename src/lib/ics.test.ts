import { describe, expect, it } from 'vitest';
import type { ServiceDay } from './schema';
import { SERVICE_NAMES } from './schema';
import { FIXTURE_DAYS } from './fixtures';
import { servicesInOrder } from './schedule';
import { generateIcs } from './ics';

function day(date: string, services: Array<[string, string]>, extra: Partial<ServiceDay> = {}): ServiceDay {
  return {
    date,
    great_feast: false,
    fast_day: false,
    cancelled: false,
    services: services.map(([time, service]) => ({ time, service: service as never })),
    ...extra,
  } as ServiceDay;
}

const opts = { dtstamp: '20260915T060000Z', location: 'Wehntalerstrasse 451, 8046 Zürich' };

const ics = (days: ServiceDay[]) => generateIcs(days, opts);

describe('structura documentului', () => {
  it('opens and closes correctly', () => {
    const out = ics([day('2026-09-20', [['10:00', 'Sfânta Liturghie']])]);
    expect(out.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(out.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('uses CRLF line terminators', () => {
    const out = ics([day('2026-09-20', [['10:00', 'Sfânta Liturghie']])]);
    expect(out.split('\n').every((l) => l === '' || l.endsWith('\r'))).toBe(true);
  });

  it('include fusul orar Europe/Zurich', () => {
    const out = ics([day('2026-09-20', [['10:00', 'Sfânta Liturghie']])]);
    expect(out).toContain('BEGIN:VTIMEZONE');
    expect(out).toContain('TZID:Europe/Zurich');
  });

  it('emits one VEVENT per service', () => {
    const out = ics([day('2026-09-14', [['07:30', 'Utrenia'], ['08:30', 'Sfânta Liturghie']])]);
    expect(out.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });

  it('writes the days in chronological order, however they arrive', () => {
    // Fără asta, o sortare care nu sortează trece neobservată: feed-ul rămâne
    // valid, doar că ordinea lui depinde de ordinea fișierelor pe disc.
    const out = ics([
      day('2026-09-20', [['10:00', 'Sfânta Liturghie']]),
      day('2026-09-14', [['07:30', 'Utrenia']]),
      day('2026-09-16', [['18:30', 'Acatist']]),
    ]);
    const feedDays = [...out.matchAll(/DTSTART;TZID=Europe\/Zurich:(\d{8})/g)]
      .map((m) => m[1]);
    expect(feedDays).toEqual(['20260914', '20260916', '20260920']);
  });
});

/**
 * O săptămână întreagă de parohie, cu toate formele pe care le ia programul:
 * perechi la aceeași oră, o zi anulată care își păstrează orele, o slujbă care
 * trece de miezul nopții și cel mai lung nume din SERVICE_NAMES.
 *
 * Există ca fixtură pentru invarianți: un test pe exemple confirmă ce te-ai
 * gândit să verifici, unul pe invariant prinde ce nu te-ai gândit.
 */
const week = (): ServiceDay[] => [
  day('2026-09-14', [['07:30', 'Utrenia'], ['08:30', 'Sfânta Liturghie']], {
    feast: 'Înălțarea Sfintei Cruci', great_feast: true, fast_day: true,
  }),
  day('2026-09-16', [['17:00', 'Spovedanie'], ['18:30', 'Acatist']]),
  day('2026-09-18', [['18:00', 'Liturghia Darurilor mai înainte sfințite']]),
  // Spovedanie în timpul Vecerniei: două slujbe la aceeași oră.
  day('2026-09-19', [['17:00', 'Spovedanie'], ['17:00', 'Vecernie']]),
  // Trei slujbe, dintre care două simultane, urmate de una mai târzie.
  day('2026-09-20', [['08:45', 'Utrenia'], ['10:00', 'Sfânta Liturghie'], ['10:00', 'Botez']], {
    feast: 'Duminica după Înălțarea Sfintei Cruci',
  }),
  // Trece de miezul nopții: 23:00 + 90 de minute.
  day('2026-09-21', [['23:00', 'Priveghere']]),
  // Anulată, dar își păstrează orele - steagul e adevărul, nu lista.
  day('2026-09-23', [['18:30', 'Acatist']], { cancelled: true }),
];

/** Perechile (DTSTART, DTEND) ale evenimentelor, în ordinea din feed. */
function intervals(out: string): Array<[string, string]> {
  // DTSTART; cu punct și virgulă: cele din VTIMEZONE se scriu DTSTART: și nu
  // sunt evenimente.
  const lines = out.split('\r\n');
  const startTimes = lines.filter((l) => l.startsWith('DTSTART;')).map((l) => l.split(':')[1]);
  const end = lines.filter((l) => l.startsWith('DTEND;')).map((l) => l.split(':')[1]);
  expect(startTimes).toHaveLength(end.length);
  return startTimes.map((s, i) => [s, end[i]]);
}

/** Blocurile VEVENT ale feed-ului, ca text, fără antet și fără VTIMEZONE. */
function events(out: string): string[] {
  return out.split('BEGIN:VEVENT').slice(1).map((b) => b.split('END:VEVENT')[0]);
}

/**
 * Decalajul real al Zürichului la un moment dat, în minute, luat din baza de
 * date de fusuri a lui Node - nu dintr-o constantă scrisă de noi. Asta e ce
 * face din testul de mai jos o verificare, nu o repetare a codului.
 */
function actualZurichOffset(when: Date): number {
  const name = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Zurich', timeZoneName: 'longOffset', year: 'numeric',
  }).formatToParts(when).find((p) => p.type === 'timeZoneName')!.value;
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  if (!m) return 0;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

/** Ora locală a Zürichului la un moment dat, ca HH:MM. */
function actualZurichTime(when: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(when);
}

describe('the start and end times', () => {
  it('writes DTSTART with the local timezone', () => {
    const out = ics([day('2026-09-20', [['10:00', 'Sfânta Liturghie']])]);
    expect(out).toContain('DTSTART;TZID=Europe/Zurich:20260920T100000');
  });

  it('zero-pads the time', () => {
    const out = ics([day('2026-09-14', [['7:30', 'Utrenia']])]);
    expect(out).toContain('DTSTART;TZID=Europe/Zurich:20260914T073000');
  });

  it('ends a service when the next one that day begins', () => {
    const out = ics([day('2026-09-16', [['17:00', 'Spovedanie'], ['18:30', 'Acatist']])]);
    expect(out).toContain('DTEND;TZID=Europe/Zurich:20260916T183000');
  });

  it('gives the last service of the day the default duration of 90 minutes', () => {
    const out = ics([day('2026-09-20', [['10:00', 'Sfânta Liturghie']])]);
    expect(out).toContain('DTEND;TZID=Europe/Zurich:20260920T113000');
  });


  it('DTEND is strictly after DTSTART for every event in the week', () => {
    // Invariantul, nu un exemplu. RFC 5545 §3.6.1 cere DTEND strict mai târziu;
    // un eveniment de durată zero se desenează altfel în fiecare client - adică
    // poate deloc, ceea ce pentru o parohie înseamnă o slujbă care pare că nu
    // are loc. „Următoarea după index” îl producea pentru prima dintr-o pereche
    // la aceeași oră, iar feed-ul rămânea verde.
    const days = week();
    const pairs = intervals(ics(days));
    // Fără asta invariantul ar trece și pe un feed gol.
    expect(pairs).toHaveLength(days.reduce((n, z) => n + z.services.length, 0));
    for (const [startTimes, end] of pairs) {
      expect(end > startTimes, startTimes + ' -> ' + end).toBe(true);
    }
  });

  it('loses neither of two services that start at the same time', () => {
    // Perechea concretă din spatele invariantului de mai sus: ambele primesc
    // durata implicită, adică spovedanie care ține cât Vecernia.
    const out = ics([day('2026-09-19', [['17:00', 'Spovedanie'], ['17:00', 'Vecernie']])]);
    expect(intervals(out)).toEqual([
      ['20260919T170000', '20260919T183000'],
      ['20260919T170000', '20260919T183000'],
    ]);
  });
});

/*
 * SORTAREA SLUJBELOR DINTR-O ZI, care până acum era un no-op sub propriile teste.
 *
 * `ics.ts` trece fiecare zi prin `servicesInOrder`. Ștergerea acelui apel lăsa tot
 * fișierul acesta verde: fiecare exemplu de mai sus scrie slujbele deja în ordine,
 * iar invariantul „DTEND strict după DTSTART" rămâne adevărat și pe un feed în care
 * o slujbă de la 17:00 se termină la 19:00 peste una de la 18:00. `daySchema` nici nu
 * sortează `services`, nici nu le cere sortate — ordinea din YAML este ordinea în care
 * a scris voluntarul, iar cine adaugă întâi slujba de seară produce exact asta.
 *
 * `fixtures.ts` conține deja ziua de care era nevoie (2026-09-16: 18:30, 17:00, 17:00)
 * și feed-ul nu o folosea niciodată. Se verifică proprietatea, nu un exemplu: orele de
 * început ale unei zile sunt nedescrescătoare, și un feed construit dintr-o zi
 * neordonată este identic cu unul construit din aceeași zi ordonată de mână.
 */
describe("the order of a day's services", () => {
  const unorderedDay = FIXTURE_DAYS.find((z) => z.date === '2026-09-16')!;

  /** Orele de început ale evenimentelor, ca HHMM, în ordinea din feed. */
  const feedTimes = (out: string) => intervals(out).map(([startTimes]) => startTimes.slice(9, 13));

  it('control: the fixture really is unordered', () => {
    // Fără asta, tot ce urmează ar putea trece fiindcă nu are ce sorta.
    expect(unorderedDay.services.map((s) => s.time)).toEqual(['18:30', '17:00', '17:00']);
  });

  it("writes a day's times in non-decreasing order, however they are written in the YAML", () => {
    const times = feedTimes(ics([unorderedDay]));
    expect(times).toHaveLength(unorderedDay.services.length);
    expect(times).toEqual([...times].sort());
  });

  it('the feed of an unordered day is identical to that of the same day ordered', () => {
    const handSorted = { ...unorderedDay, services: servicesInOrder(unorderedDay.services) };
    expect(ics([unorderedDay])).toBe(ics([handSorted]));
  });

  it('an unordered day gets no overlapping durations', () => {
    /*
     * Contraexemplul, cu trei ore distincte, fiindcă perechea de la aceeași oră din
     * fixtură ascunde jumătate din efect: fără sortare, slujba de la 17:00 primește
     * DTEND 19:00 — adică ține peste cea de la 18:00 — iar cea de la 18:00 se termină
     * la 19:30, după începutul celei de la 19:00. Un abonat vede trei slujbe care se
     * calcă una pe alta.
     */
    const out = ics([day('2026-09-16', [['17:00', 'Spovedanie'], ['19:00', 'Acatist'], ['18:00', 'Vecernie']])]);
    expect(intervals(out)).toEqual([
      ['20260916T170000', '20260916T180000'],
      ['20260916T180000', '20260916T190000'],
      ['20260916T190000', '20260916T203000'],
    ]);
  });

  it('does not modify the day it was handed', () => {
    const beforeFeed = unorderedDay.services.map((s) => s.time);
    ics([unorderedDay]);
    expect(unorderedDay.services.map((s) => s.time)).toEqual(beforeFeed);
  });
});

describe('UID', () => {
  it('derives the UID from date, time and service name, not from position', () => {
    const out = ics([day('2026-09-14', [['07:30', 'Utrenia']])]);
    expect(out).toContain('UID:20260914T0730-utrenia@bor-zh.ch');
  });

  it('keeps the UIDs stable when an earlier service is inserted', () => {
    const compareDates = ics([day('2026-09-14', [['08:30', 'Sfânta Liturghie']])]);
    const after = ics([day('2026-09-14', [['07:30', 'Utrenia'], ['08:30', 'Sfânta Liturghie']])]);
    expect(compareDates).toContain('UID:20260914T0830-sfanta-liturghie@bor-zh.ch');
    expect(after).toContain('UID:20260914T0830-sfanta-liturghie@bor-zh.ch');
  });

  it('gives distinct UIDs to two services starting at the same time', () => {
    // Spovedanie în timpul Vecerniei — o seară obișnuită de parohie.
    const out = ics([day('2026-09-19', [['17:00', 'Spovedanie'], ['17:00', 'Vecernie']])]);
    const uids = [...out.matchAll(/UID:(\S+)/g)].map((m) => m[1]);
    expect(uids).toHaveLength(2);
    expect(new Set(uids).size).toBe(2);
  });

  it('folds the diacritics in the slug, does not delete them', () => {
    const a = ics([day('2026-09-20', [['10:00', 'Sfânta Liturghie']])]);
    expect(a).toContain('-sfanta-liturghie@bor-zh.ch');
  });

  it('no service name produces a UID that folds', () => {
    // Asserted against SERVICE_NAMES, not against today's longest name, so adding
    // a longer service in future fails here instead of quietly folding a UID.
    for (const name of SERVICE_NAMES) {
      const out = ics([day('2026-09-20', [['10:00', name]], {
        services: [{ time: '10:00', service: name, detail: name === 'Altceva' ? 'Cerc biblic' : undefined }],
      })]);
      for (const line of out.split('\r\n')) {
        if (line.startsWith('UID:')) {
          expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
        }
      }
      expect(out).not.toMatch(/UID:[^\r\n]*\r\n /);
    }
  });
});

describe('content', () => {
  it('puts the service name in SUMMARY', () => {
    const out = ics([day('2026-09-20', [['10:00', 'Sfânta Liturghie']])]);
    expect(out).toContain('SUMMARY:Sfânta Liturghie');
  });

  it('appends the detail to SUMMARY', () => {
    const z = day('2026-09-20', [['10:00', 'Sfânta Liturghie']]);
    z.services[0].detail = 'și Parastas';
    expect(ics([z])).toContain('SUMMARY:Sfânta Liturghie și Parastas');
  });

  it('never writes the word „Altceva" into SUMMARY', () => {
    const z = day('2026-09-20', [['19:00', 'Altceva']]);
    z.services[0].detail = 'Cerc de studiu biblic';
    const out = ics([z]);
    expect(out).toContain('SUMMARY:Cerc de studiu biblic');
    expect(out).not.toContain('Altceva');
  });

  it('puts the feast in DESCRIPTION', () => {
    const z = day('2026-09-14', [['08:30', 'Sfânta Liturghie']], {
      feast: 'Înălțarea Sfintei Cruci',
      fast_day: true,
    });
    const out = ics([z]);
    expect(out).toContain('Înălțarea Sfintei Cruci');
    expect(out).toContain('zi de post');
  });

  it('marks cancelled days instead of omitting them', () => {
    const z = day('2026-09-16', [['18:30', 'Acatist']], { cancelled: true });
    expect(ics([z])).toContain('STATUS:CANCELLED');
  });

  it('writes DTSTAMP and LOCATION on every event', () => {
    // Amândouă se puteau șterge fără ca vreun test să pice. DTSTAMP e cerut de
    // RFC 5545 §3.6.1, iar LOCATION e un câmp numit în spec §8.
    for (const e of events(ics(week()))) {
      expect(e).toContain('DTSTAMP:20260915T060000Z');
      expect(e).toContain('LOCATION:Wehntalerstrasse 451\\, 8046 Zürich');
    }
  });

  it('escapes a lone CR too, not only CRLF and LF', () => {
    // RFC 5545 §3.3.11: un CR rămas crud într-o linie de conținut e nepermis.
    const z = day('2026-09-20', [['10:00', 'Altceva']], { notes: 'rândul unu\rrândul doi' });
    const out = ics([z]);
    expect(out).toContain('rândul unu\\nrândul doi');
    // și niciun CR care să nu fie urmat de LF
    expect(/\r(?!\n)/.test(out)).toBe(false);
  });
});

describe('escaping and folding', () => {
  it('escapes commas, semicolons and backslashes', () => {
    const z = day('2026-09-20', [['10:00', 'Altceva']], { feast: 'Unu, doi; trei\\patru' });
    const out = ics([z]);
    expect(out).toContain('Unu\\, doi\\; trei\\\\patru');
  });

  it('turns newlines into a literal \\n', () => {
    const z = day('2026-09-20', [['10:00', 'Altceva']], { notes: 'rândul unu\nrândul doi' });
    expect(ics([z])).toContain('rândul unu\\nrândul doi');
  });

  it('never exceeds 75 bytes per line, not even with diacritics', () => {
    const z = day('2026-09-14', [['08:30', 'Sfânta Liturghie']], {
      feast: 'Înălțarea Sfintei Cruci și pomenirea tuturor sfinților părinți români '
        + 'care au strălucit în credință de-a lungul veacurilor în Țara Românească',
    });
    const lines = ics([z]).split('\r\n');
    for (const line of lines) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it('continues folded lines with a space', () => {
    const z = day('2026-09-14', [['08:30', 'Sfânta Liturghie']], {
      feast: 'x'.repeat(200),
    });
    const lines = ics([z]).split('\r\n');
    const continuations = lines.filter((l) => l.startsWith(' '));
    expect(continuations.length).toBeGreaterThan(0);
  });

  it('does not split a multi-byte character across two lines', () => {
    const z = day('2026-09-14', [['08:30', 'Sfânta Liturghie']], {
      feast: 'ă'.repeat(120),
    });
    const out = ics([z]);
    // If a fold split a 2-byte character, re-joining would not round-trip.
    const unfolded = out.replace(/\r\n /g, '');
    expect(unfolded).toContain('ă'.repeat(120));
  });

  it('folds three- and four-byte characters correctly too', () => {
    // Testele de mai sus folosesc doar ă (doi octeți). Un editor poate lipi o
    // liniuță lungă (trei octeți) sau un emoji (patru octeți, pereche surogat
    // în JS), iar acolo se rupe o împăturire care numără caractere.
    for (const ch of ['—', '日', '𝄞', '😀']) {
      const out = ics([day('2026-09-14', [['08:30', 'Utrenia']], { feast: ch.repeat(80) })]);
      for (const line of out.split('\r\n')) {
        expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
      }
      expect(out.replace(/\r\n /g, '')).toContain(ch.repeat(80));
    }
  });

  it('no combination of text breaks the folding or the escaping', () => {
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
      const feast = rnd(seed.s % 400);
      const out = ics([day('2026-09-14', [['08:30', 'Utrenia']], { feast })]);

      for (const line of out.split('\r\n')) {
        expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
      }
      if (feast.length === 0) continue;

      const line = out.replace(/\r\n /g, '').split('\r\n')
        .find((l) => l.startsWith('DESCRIPTION:'));
      const unescaped = line!.slice('DESCRIPTION:'.length)
        .replace(/\\n/g, '\n')
        .replace(/\\,/g, ',')
        .replace(/\\;/g, ';')
        .replace(/\\\\/g, '\\');
      expect(unescaped, 'iterația ' + iter).toBe(feast);
    }
  });
});

describe('diacriticele feed-ului', () => {
  it('uses comma below, not cedilla', () => {
    // Tot ce ajunge într-un SUMMARY trece prin serviceLabel, așa că scanăm
    // feed-ul generat pentru întreaga listă de slujbe, nu doar literalele pe
    // care le scrie chiar acest modul.
    const allText = ics([
      day(
        '2026-09-14',
        SERVICE_NAMES.map((s, i): [string, string] => [`${String(i + 6).padStart(2, '0')}:00`, s]),
        { feast: 'Înălțarea Sfintei Cruci', notes: 'Se citește Acatistul' },
      ),
    ]);
    // Sedilele turcești, scrise ca escape-uri pentru ca garda să nu poată fi
    // înfrântă lipind chiar caracterele pe care le respinge:
    // U+015F, U+0163 și majusculele lor U+015E, U+0162.
    expect(allText).not.toMatch(/[\u015F\u0163\u015E\u0162]/);
    // Și dovada că garda are ce prinde, nu că trece fiindcă feed-ul scanat
    // s-a dovedit a fi ASCII.
    expect(allText).toMatch(/\u021B/); // ț, din „Liturghia Darurilor … sfințite”
    expect(allText).toMatch(/\u0219/); // ș, din nota zilei
    // Singurul literal cu diacritice pe care îl scrie acest modul, afirmat pe
    // codepoint, nu din ochi.
    expect(allText).toContain(
      'X-WR-CALNAME:Program liturgic \u2014 Sf\u00E2ntul Nicolae Z\u00FCrich',
    );
  });
});


describe('fusul orar', () => {
  it('declares the offsets and the transition rules, not just the block', () => {
    // Blocul VTIMEZONE era verificat doar prin prezența lui BEGIN:VTIMEZONE.
    // Trei mutații treceau: decalajul de vară pus pe +0100, regula de primăvară
    // înlocuită cu cea americană (a doua duminică, nu ultima) și blocul golit.
    // Fiecare pune toate slujbele cu o oră alături - cel mai rău lucru pe care
    // acest feed îl poate face.
    const out = ics([day('2026-07-05', [['10:00', 'Sfânta Liturghie']])]);
    expect(out).toContain('TZID:Europe/Zurich');
    expect(out).toContain('TZOFFSETFROM:+0100');
    expect(out).toContain('TZOFFSETTO:+0200');
    expect(out).toContain('TZNAME:CEST');
    expect(out).toContain('RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU');
    expect(out).toContain('TZOFFSETFROM:+0200');
    expect(out).toContain('TZOFFSETTO:+0100');
    expect(out).toContain('TZNAME:CET');
    expect(out).toContain('RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU');
  });

  it('a service at 10:00 stays at 10:00 in summer and in winter', () => {
    // Proprietatea pentru care există blocul. Luăm decalajul pe care îl declară
    // chiar feed-ul, scădem din ora locală scrisă în DTSTART ca să obținem
    // momentul absolut, apoi îl citim înapoi cu baza de fusuri a lui Node. Dacă
    // decalajul declarat e greșit, ora citită nu mai e 10:00.
    for (const [date, expectedOffset] of [['2026-07-05', 120], ['2026-01-11', 60]] as const) {
      const out = ics([day(date, [['10:00', 'Sfânta Liturghie']])]);
      const block = expectedOffset === 120 ? 'DAYLIGHT' : 'STANDARD';
      const text = out.split('BEGIN:' + block)[1].split('END:' + block)[0];
      const signMatch = /TZOFFSETTO:([+-])(\d{2})(\d{2})/.exec(text)!;
      const declaredOffset = (signMatch[1] === '-' ? -1 : 1)
        * (Number(signMatch[2]) * 60 + Number(signMatch[3]));

      expect(declaredOffset, 'decalajul declarat pentru ' + date).toBe(expectedOffset);
      // Și că e chiar decalajul real al Zürichului la acea dată.
      expect(actualZurichOffset(new Date(date + 'T12:00:00Z'))).toBe(expectedOffset);

      // 10:00 local, scris cu decalajul declarat, se citește înapoi tot 10:00.
      const moment = new Date(Date.parse(date + 'T10:00:00Z') - declaredOffset * 60_000);
      expect(actualZurichTime(moment), 'ora reală pentru ' + date).toBe('10:00');
      expect(out).toContain('DTSTART;TZID=Europe/Zurich:' + date.replace(/-/g, '') + 'T100000');
    }
  });

  it('does not write METHOD without ORGANIZER', () => {
    // RFC 5546 §3.2.1: METHOD face documentul un mesaj iTIP, care cere
    // ORGANIZER. Un feed la care te abonezi nu are nevoie de niciunul.
    expect(ics([day('2026-09-20', [['10:00', 'Sfânta Liturghie']])])).not.toContain('METHOD');
  });
});

describe('anulare', () => {
  it('marks only the cancelled day, not the whole feed', () => {
    // STATUS:CANCELLED aplicat la tot feed-ul trecea neobservat: o singură
    // duminică anulată ar fi marcat întreg programul parohiei ca anulat.
    const out = ics(week());
    const cancelled = events(out).filter((e) => e.includes('STATUS:CANCELLED'));
    const rest = events(out).filter((e) => !e.includes('STATUS:CANCELLED'));

    // 2026-09-23 e singura zi anulată din fixtură și are o singură slujbă.
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0]).toContain('20260923');
    expect(rest.length).toBeGreaterThan(5);
    for (const e of rest) expect(e).not.toContain('20260923');
  });

  it('puts a cancellation marker in SUMMARY, and only on cancelled days', () => {
    // STATUS:CANCELLED singur nu ajunge: se raportează că Google ascunde
    // evenimentele anulate din feed-urile la care ești abonat, ceea ce ar face
    // ziua să se golească în tăcere - exact ce am vrut să evităm. Marcajul se
    // vede și acolo unde evenimentul se afișează.
    const out = ics(week());
    for (const e of events(out)) {
      const summary = /SUMMARY:([^\r\n]*)/.exec(e)![1];
      if (e.includes('STATUS:CANCELLED')) expect(summary).toMatch(/^ANULAT: /);
      else expect(summary).not.toContain('ANULAT');
    }
  });

  it('keeps the service name after the marker', () => {
    const out = ics([day('2026-09-23', [['18:30', 'Acatist']], { cancelled: true })]);
    expect(out).toContain('SUMMARY:ANULAT: Acatist');
    expect(out).toContain('STATUS:CANCELLED');
  });
});