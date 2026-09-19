import { describe, expect, it } from 'vitest';
import type { ServiceDay } from './schema';
import { SERVICE_NAMES } from './schema';
import { FIXTURE_DAYS } from './fixtures';
import { servicesInOrder } from './schedule';
import { generateIcs, feedStamp } from './ics';
import { cedillasIn } from './cedilla';

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

describe('the document structure', () => {
  it('opens and closes correctly', () => {
    const out = ics([day('2026-09-20', [['10:00', 'Sfânta Liturghie']])]);
    expect(out.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(out.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('uses CRLF line terminators', () => {
    const out = ics([day('2026-09-20', [['10:00', 'Sfânta Liturghie']])]);
    expect(out.split('\n').every((l) => l === '' || l.endsWith('\r'))).toBe(true);
  });

  it('includes the Europe/Zurich timezone', () => {
    const out = ics([day('2026-09-20', [['10:00', 'Sfânta Liturghie']])]);
    expect(out).toContain('BEGIN:VTIMEZONE');
    expect(out).toContain('TZID:Europe/Zurich');
  });

  it('emits one VEVENT per service', () => {
    const out = ics([day('2026-09-14', [['07:30', 'Utrenia'], ['08:30', 'Sfânta Liturghie']])]);
    expect(out.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });

  it('writes the days in chronological order, however they arrive', () => {
    // Without this, a sort that doesn't sort goes unnoticed: the feed stays
    // valid, only its order depends on the order of the files on disk.
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
 * A full parish week, with every shape the schedule can take:
 * pairs at the same hour, a cancelled day that keeps its times, a service that
 * crosses midnight, and the longest name in SERVICE_NAMES.
 *
 * It exists as a fixture for invariants: a test on examples confirms what you
 * thought to check; one on an invariant catches what you didn't think of.
 */
const week = (): ServiceDay[] => [
  day('2026-09-14', [['07:30', 'Utrenia'], ['08:30', 'Sfânta Liturghie']], {
    feast: 'Înălțarea Sfintei Cruci', great_feast: true, fast_day: true,
  }),
  day('2026-09-16', [['17:00', 'Spovedanie'], ['18:30', 'Acatist']]),
  day('2026-09-18', [['18:00', 'Liturghia Darurilor mai înainte sfințite']]),
  // Confession during vespers: two services at the same hour.
  day('2026-09-19', [['17:00', 'Spovedanie'], ['17:00', 'Vecernie']]),
  // Three services, two of them simultaneous, followed by a later one.
  day('2026-09-20', [['08:45', 'Utrenia'], ['10:00', 'Sfânta Liturghie'], ['10:00', 'Botez']], {
    feast: 'Duminica după Înălțarea Sfintei Cruci',
  }),
  // Crosses midnight: 23:00 + 90 minutes.
  day('2026-09-21', [['23:00', 'Priveghere']]),
  // Cancelled, but keeps its times - the flag is the truth, not the list.
  day('2026-09-23', [['18:30', 'Acatist']], { cancelled: true }),
];

/** The (DTSTART, DTEND) pairs of the events, in the order of the feed. */
function intervals(out: string): Array<[string, string]> {
  // DTSTART with a semicolon: the ones in VTIMEZONE are written DTSTART: and
  // are not events.
  const lines = out.split('\r\n');
  const startTimes = lines.filter((l) => l.startsWith('DTSTART;')).map((l) => l.split(':')[1]);
  const end = lines.filter((l) => l.startsWith('DTEND;')).map((l) => l.split(':')[1]);
  expect(startTimes).toHaveLength(end.length);
  return startTimes.map((s, i) => [s, end[i]]);
}

/** The VEVENT blocks of the feed, as text, without the header and without VTIMEZONE. */
function events(out: string): string[] {
  return out.split('BEGIN:VEVENT').slice(1).map((b) => b.split('END:VEVENT')[0]);
}

/**
 * The real offset of Zürich at a given moment, in minutes, taken from Node's
 * own timezone database - not from a constant we wrote. That is what makes
 * the test below a check, rather than a repetition of the code.
 */
function actualZurichOffset(when: Date): number {
  const name = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Zurich', timeZoneName: 'longOffset', year: 'numeric',
  }).formatToParts(when).find((p) => p.type === 'timeZoneName')!.value;
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  if (!m) return 0;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

/** The local time in Zürich at a given moment, as HH:MM. */
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
    // The invariant, not an example. RFC 5545 §3.6.1 requires DTEND strictly
    // later; a zero-duration event renders differently in every client - meaning
    // possibly not at all, which for a parish means a service that looks like it
    // is not happening. "The next one by index" produced exactly that for the
    // first of a pair at the same hour, and the feed stayed green.
    const days = week();
    const pairs = intervals(ics(days));
    // Without this the invariant would pass even on an empty feed.
    expect(pairs).toHaveLength(days.reduce((n, z) => n + z.services.length, 0));
    for (const [startTimes, end] of pairs) {
      expect(end > startTimes, startTimes + ' -> ' + end).toBe(true);
    }
  });

  it('loses neither of two services that start at the same time', () => {
    // The concrete pair behind the invariant above: both get the default
    // duration, meaning a confession that lasts as long as vespers.
    const out = ics([day('2026-09-19', [['17:00', 'Spovedanie'], ['17:00', 'Vecernie']])]);
    expect(intervals(out)).toEqual([
      ['20260919T170000', '20260919T183000'],
      ['20260919T170000', '20260919T183000'],
    ]);
  });
});

/*
 * SORTING A DAY'S SERVICES, which until now was a no-op under its own tests.
 *
 * `ics.ts` runs every day through `servicesInOrder`. Deleting that call left the whole
 * file green: every example above already writes the services in order, and the
 * invariant "DTEND strictly after DTSTART" stays true even on a feed where a
 * service at 17:00 ends at 19:00 over one at 18:00. `daySchema` neither sorts
 * `services` nor requires them sorted — the order in the YAML is the order the
 * volunteer wrote them in, and whoever adds the evening service first produces
 * exactly that.
 *
 * `fixtures.ts` already contained the day that was needed (2026-09-16: 18:30, 17:00, 17:00)
 * and the feed never used it. What is checked is the property, not an example: the start
 * times of a day are non-decreasing, and a feed built from an unordered day is
 * identical to one built from the same day ordered by hand.
 */
describe("the order of a day's services", () => {
  const unorderedDay = FIXTURE_DAYS.find((z) => z.date === '2026-09-16')!;

  /** The start times of the events, as HHMM, in the order of the feed. */
  const feedTimes = (out: string) => intervals(out).map(([startTimes]) => startTimes.slice(9, 13));

  it('control: the fixture really is unordered', () => {
    // Without this, everything that follows could pass because there is nothing to sort.
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
     * The counter-example, with three distinct hours, because the pair at the same
     * hour in the fixture hides half the effect: without sorting, the service at
     * 17:00 gets DTEND 19:00 — meaning it runs over the one at 18:00 — and the one
     * at 18:00 ends at 19:30, after the one at 19:00 has already begun. A subscriber
     * sees three services that overlap one another.
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
    // Confession during vespers — an ordinary parish evening.
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
    // Both could be deleted without any test failing. DTSTAMP is required by
    // RFC 5545 §3.6.1, and LOCATION is a field named in spec §8.
    for (const e of events(ics(week()))) {
      expect(e).toContain('DTSTAMP:20260915T060000Z');
      expect(e).toContain('LOCATION:Wehntalerstrasse 451\\, 8046 Zürich');
    }
  });

  it('escapes a lone CR too, not only CRLF and LF', () => {
    // RFC 5545 §3.3.11: a bare CR left raw in a content line is not allowed.
    const z = day('2026-09-20', [['10:00', 'Altceva']], { notes: 'rândul unu\rrândul doi' });
    const out = ics([z]);
    expect(out).toContain('rândul unu\\nrândul doi');
    // and no CR that is not followed by LF
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
    // The tests above use only ă (two bytes). An editor could paste in an em
    // dash (three bytes) or an emoji (four bytes, a surrogate pair in JS), and
    // that is where a folding scheme that counts characters breaks.
    for (const ch of ['—', '日', '𝄞', '😀']) {
      const out = ics([day('2026-09-14', [['08:30', 'Utrenia']], { feast: ch.repeat(80) })]);
      for (const line of out.split('\r\n')) {
        expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
      }
      expect(out.replace(/\r\n /g, '')).toContain(ch.repeat(80));
    }
  });

  it('no combination of text breaks the folding or the escaping', () => {
    // Deterministic fuzzing (fixed seed): bytes of 1-4, plus exactly the
    // characters that escaping treats specially, because a backslash right
    // before a semicolon is the case where a naive unescaping gets it wrong.
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
      expect(unescaped, 'iteration ' + iter).toBe(feast);
    }
  });
});

describe('the feed diacritics', () => {
  it('uses comma below, not cedilla', () => {
    // Everything that ends up in a SUMMARY goes through serviceLabel, so we scan
    // the generated feed for the entire list of services, not only the literals
    // this module itself writes.
    const allText = ics([
      day(
        '2026-09-14',
        SERVICE_NAMES.map((s, i): [string, string] => [`${String(i + 6).padStart(2, '0')}:00`, s]),
        { feast: 'Înălțarea Sfintei Cruci', notes: 'Se citește Acatistul' },
      ),
    ]);
    // The shared detector in `./cedilla` holds the four forbidden numbers;
    // this file names none of them, in any spelling. The escape form is also a
    // copy of the number, and until Task 12's fix round the repository sweep
    // could not see it - which is how this guard spent its life guarding the
    // feed with a copy of the very thing it rejects.
    expect(cedillasIn(allText)).toEqual([]);
    // And the proof that the guard has something to catch, not that it passes
    // because the scanned feed turned out to be ASCII.
    expect(allText).toMatch(/\u021B/); // ț, from „Liturghia Darurilor … sfințite"
    expect(allText).toMatch(/\u0219/); // ș, from the day's note
    // The only literal with diacritics that this module writes, asserted by
    // codepoint, not by eye.
    expect(allText).toContain(
      'X-WR-CALNAME:Program liturgic \u2014 Sf\u00E2ntul Nicolae Z\u00FCrich',
    );
  });
});


describe('the timezone', () => {
  it('declares the offsets and the transition rules, not just the block', () => {
    // The VTIMEZONE block was checked only through the presence of BEGIN:VTIMEZONE.
    // Three mutations passed: the summer offset set to +0100, the spring rule
    // replaced with the American one (the second Sunday, not the last), and the
    // block emptied out. Each one puts every service an hour off - the worst
    // thing this feed can do.
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
    // The property the block exists for. We take the offset the feed itself
    // declares, subtract it from the local time written in DTSTART to get
    // the absolute moment, then read it back with Node's own timezone database.
    // If the declared offset is wrong, the time read back is no longer 10:00.
    for (const [date, expectedOffset] of [['2026-07-05', 120], ['2026-01-11', 60]] as const) {
      const out = ics([day(date, [['10:00', 'Sfânta Liturghie']])]);
      const block = expectedOffset === 120 ? 'DAYLIGHT' : 'STANDARD';
      const text = out.split('BEGIN:' + block)[1].split('END:' + block)[0];
      const signMatch = /TZOFFSETTO:([+-])(\d{2})(\d{2})/.exec(text)!;
      const declaredOffset = (signMatch[1] === '-' ? -1 : 1)
        * (Number(signMatch[2]) * 60 + Number(signMatch[3]));

      expect(declaredOffset, 'the declared offset for ' + date).toBe(expectedOffset);
      // And that it really is the actual offset of Zürich on that date.
      expect(actualZurichOffset(new Date(date + 'T12:00:00Z'))).toBe(expectedOffset);

      // 10:00 local, written with the declared offset, reads back as 10:00 too.
      const moment = new Date(Date.parse(date + 'T10:00:00Z') - declaredOffset * 60_000);
      expect(actualZurichTime(moment), 'the actual time for ' + date).toBe('10:00');
      expect(out).toContain('DTSTART;TZID=Europe/Zurich:' + date.replace(/-/g, '') + 'T100000');
    }
  });

  it('does not write METHOD without ORGANIZER', () => {
    // RFC 5546 §3.2.1: METHOD turns the document into an iTIP message, which
    // requires ORGANIZER. A feed someone merely subscribes to needs neither.
    expect(ics([day('2026-09-20', [['10:00', 'Sfânta Liturghie']])])).not.toContain('METHOD');
  });
});

describe('cancellation', () => {
  it('marks only the cancelled day, not the whole feed', () => {
    // STATUS:CANCELLED applied to the whole feed went unnoticed: a single
    // cancelled Sunday would have marked the entire parish schedule as cancelled.
    const out = ics(week());
    const cancelled = events(out).filter((e) => e.includes('STATUS:CANCELLED'));
    const rest = events(out).filter((e) => !e.includes('STATUS:CANCELLED'));

    // 2026-09-23 is the only cancelled day in the fixture and it has a single service.
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0]).toContain('20260923');
    expect(rest.length).toBeGreaterThan(5);
    for (const e of rest) expect(e).not.toContain('20260923');
  });

  it('puts a cancellation marker in SUMMARY, and only on cancelled days', () => {
    // STATUS:CANCELLED alone is not enough: Google is reported to hide
    // cancelled events from feeds you are subscribed to, which would make
    // the day go quietly empty - exactly what this was meant to avoid. The
    // marker shows even in the one place where the event does get displayed.
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
/*
 * THE STAMP IS DERIVED FROM THE FEED, NOT FROM THE CLOCK. `new Date()` made
 * every build of an unchanged tree produce a different calendar feed; these
 * tests pin the replacement's two halves - it follows the content, and it is
 * always a well-formed RFC 5545 UTC date-time.
 */
describe('feedStamp', () => {
  it('takes the latest day the feed carries, whatever the order', () => {
    const days = [
      day('2026-09-16', [['18:30', 'Acatist']]),
      day('2026-10-04', [['10:00', 'Sfânta Liturghie']]),
      day('2026-09-20', [['10:00', 'Sfânta Liturghie']]),
    ];
    expect(feedStamp(days)).toBe('20261004T000000Z');
  });

  it('does not depend on the clock: two calls agree', () => {
    const days = week();
    expect(feedStamp(days)).toBe(feedStamp(days));
  });

  it('stamps an empty feed with the epoch rather than inventing a date', () => {
    expect(feedStamp([])).toBe('19700101T000000Z');
  });

  it('always produces the RFC 5545 §3.3.5 shape', () => {
    for (const days of [[], week()]) {
      expect(feedStamp(days)).toMatch(/^\d{8}T\d{6}Z$/);
    }
  });
});
