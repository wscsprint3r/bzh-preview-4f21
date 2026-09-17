import { describe, expect, it } from 'vitest';
import { SERVICE_NAMES, type Service, type ServiceDay } from './schema';
import { formatWeekRange } from './date-ro';
import { addDays } from './week';
import { FIXTURE_TODAY, FIXTURE_DAYS } from './fixtures';
import {
  ISLAND_DAYS,
  serviceLabel,
  groupIntoWeeks,
  romanianList,
  minutes,
  scheduleForIsland,
  fullStop,
  upcomingWeeks,
  servicesInOrder,
  servicesAtSameTime,
  nextService,
} from './schedule';

describe('minutes', () => {
  it('counts the minutes from midnight', () => {
    expect(minutes('00:00')).toBe(0);
    expect(minutes('10:00')).toBe(600);
    expect(minutes('23:59')).toBe(1439);
  });

  it('accepts an unpadded time too, which the schema normalises anyway', () => {
    expect(minutes('9:30')).toBe(570);
    expect(minutes('09:30')).toBe(570);
  });

  it('orders the times numerically, where text would order them the other way', () => {
    // The exact inversion the bug is born from: alphabetically, "9:30" comes after
    // "10:00". Numerically, it does not.
    expect('9:30' > '10:00').toBe(true);
    expect(minutes('9:30') > minutes('10:00')).toBe(false);
  });
});

describe('serviceLabel', () => {
  it('returns the service name', () => {
    expect(serviceLabel({ time: '10:00', service: 'Sfânta Liturghie' })).toBe('Sfânta Liturghie');
  });

  it('appends the detail to the service name', () => {
    expect(serviceLabel({ time: '10:00', service: 'Sfânta Liturghie', detail: 'și Parastas' }))
      .toBe('Sfânta Liturghie și Parastas');
  });

  it('ignores the whitespace around the detail', () => {
    expect(serviceLabel({ time: '18:30', service: 'Acatist', detail: '  la Sfântul Nicolae  ' }))
      .toBe('Acatist la Sfântul Nicolae');
  });

  it('uses the detail as the name for „Altceva"', () => {
    expect(serviceLabel({ time: '19:00', service: 'Altceva', detail: 'Cerc de studiu biblic' }))
      .toBe('Cerc de studiu biblic');
  });

  it('does not let „Altceva" appear on the site without a detail', () => {
    expect(serviceLabel({ time: '19:00', service: 'Altceva' })).toBe('Slujbă');
    expect(serviceLabel({ time: '19:00', service: 'Altceva', detail: '   ' })).toBe('Slujbă');
  });

  it('leaves the word „Altceva" in no label at all', () => {
    // The reason this function exists: "Altceva" is the escape hatch from the
    // CMS, not a service name. No name on the list is allowed to let it out
    // onto the page or into the calendar feed.
    for (const service of SERVICE_NAMES) {
      const detail = service === 'Altceva' ? 'Cerc de studiu biblic' : undefined;
      expect(serviceLabel({ time: '19:00', service, detail })).not.toContain('Altceva');
    }
  });
});

describe('diacriticele etichetelor', () => {
  it('uses comma below, not cedilla', () => {
    const allText = [
      ...SERVICE_NAMES.map((service) => serviceLabel({ time: '10:00', service })),
      serviceLabel({ time: '10:00', service: 'Sfânta Liturghie', detail: 'și Parastas' }),
    ].join('');
    // The Turkish cedillas, written as escapes so the guard cannot be
    // defeated by pasting in the very characters it rejects:
    // U+015F, U+0163 and their uppercase forms U+015E, U+0162.
    expect(allText).not.toMatch(/[\u015F\u0163\u015E\u0162]/);
    // And the proof that the guard has something to catch, not that it passes because the scanned
    // strings turned out to be ASCII. The first comes from SERVICE_NAMES, through serviceLabel.
    expect(allText).toMatch(/\u021B/); // ț, from „Liturghia Darurilor … sfințite"
    expect(allText).toMatch(/\u0219/); // ș, from the detail „și Parastas"
    // The only Romanian literal in schedule.ts, asserted by codepoint: ă = U+0103.
    expect(serviceLabel({ time: '19:00', service: 'Altceva' })).toBe('Slujb\u0103');
  });
});

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

const sampleDays = [
  day('2026-09-14', [['07:30', 'Utrenia'], ['08:30', 'Sfânta Liturghie']]),
  day('2026-09-16', [['17:00', 'Spovedanie'], ['18:30', 'Acatist']]),
  day('2026-09-20', [['08:45', 'Utrenia'], ['10:00', 'Sfânta Liturghie']]),
  day('2026-09-23', [['18:30', 'Acatist']]),
  day('2026-10-04', [['10:00', 'Sfânta Liturghie']]),
];

describe('groupIntoWeeks', () => {
  it('groups the days into ISO weeks', () => {
    const s = groupIntoWeeks(sampleDays);
    expect(s.map((x) => x.key)).toEqual(['2026-W38', '2026-W39', '2026-W40']);
  });

  it('puts the correct bounds on each week', () => {
    const [first] = groupIntoWeeks(sampleDays);
    expect(first.monday).toBe('2026-09-14');
    expect(first.sunday).toBe('2026-09-20');
    expect(first.days).toHaveLength(3);
  });

  it('sorts the days inside the week', () => {
    const s = groupIntoWeeks([sampleDays[2], sampleDays[0], sampleDays[1]]);
    expect(s[0].days.map((z) => z.date)).toEqual(['2026-09-14', '2026-09-16', '2026-09-20']);
  });

  it('does not modify the list it was handed', () => {
    const unordered = [sampleDays[2], sampleDays[0], sampleDays[1]];
    const originalOrder = [...unordered];
    groupIntoWeeks(unordered);
    expect(unordered).toEqual(originalOrder);
  });

  it('omits weeks with no entries', () => {
    const s = groupIntoWeeks(sampleDays);
    expect(s.map((x) => x.key)).not.toContain('2026-W41');
  });

  it('returns an empty list for empty data', () => {
    expect(groupIntoWeeks([])).toEqual([]);
  });

  it('refuses a day whose date does not exist', () => {
    expect(() => groupIntoWeeks([day('2026-02-30', [['10:00', 'Utrenia']])]))
      .toThrow(/inexistent/);
  });

  it('keeps two different services that start at the same time', () => {
    // An ordinary evening: confession is held during vespers. The grouping is not
    // allowed to either merge them, or lose the day.
    const s = groupIntoWeeks([
      day('2026-09-16', [['17:00', 'Spovedanie'], ['17:00', 'Vecernie'], ['18:30', 'Acatist']]),
    ]);
    expect(s).toHaveLength(1);
    expect(s[0].days).toHaveLength(1);
    expect(s[0].days[0].services.map((x) => [x.time, x.service])).toEqual([
      ['17:00', 'Spovedanie'],
      ['17:00', 'Vecernie'],
      ['18:30', 'Acatist'],
    ]);
  });

  it('groups by ISO week, not by calendar year', () => {
    // 2027-01-03 is the Sunday of ISO week 2026-W53; 2027-01-05 is already W01.
    const s = groupIntoWeeks([
      day('2027-01-05', [['18:30', 'Acatist']]),
      day('2026-12-30', [['18:30', 'Acatist']]),
      day('2027-01-03', [['10:00', 'Sfânta Liturghie']]),
    ]);
    expect(s.map((x) => x.key)).toEqual(['2026-W53', '2027-W01']);
    expect(s[0]).toMatchObject({ monday: '2026-12-28', sunday: '2027-01-03' });
    expect(s[0].days.map((z) => z.date)).toEqual(['2026-12-30', '2027-01-03']);
    expect(s[1]).toMatchObject({ monday: '2027-01-04', sunday: '2027-01-10' });
  });
});

describe('nextService', () => {
  it("picks the next service on today's day", () => {
    expect(nextService(sampleDays, '2026-09-14', '08:00')).toMatchObject({
      date: '2026-09-14',
      time: '08:30',
      service: 'Sfânta Liturghie',
    });
  });

  it('moves to the next day once the current day has ended', () => {
    expect(nextService(sampleDays, '2026-09-14', '09:00')).toMatchObject({
      date: '2026-09-16',
      time: '17:00',
    });
  });

  it('compares the times numerically, not alphabetically', () => {
    const d = [day('2026-09-14', [['09:00', 'Utrenia'], ['10:00', 'Sfânta Liturghie']])];
    // Lexicographically '9:00' > '10:00'; numerically it is not.
    expect(nextService(d, '2026-09-14', '9:30')).toMatchObject({ time: '10:00' });
  });

  it('searches the nearest day, however the list is ordered', () => {
    const d = [sampleDays[4], sampleDays[3], sampleDays[1]];
    expect(nextService(d, '2026-09-15', '00:00')).toMatchObject({ date: '2026-09-16' });
  });

  it("picks the earliest service of the day without reordering the day it was handed", () => {
    const z = day('2026-09-16', [['18:30', 'Acatist'], ['17:00', 'Spovedanie']]);
    expect(nextService([z], '2026-09-16', '00:00')).toMatchObject({ time: '17:00' });
    expect(z.services.map((s) => s.time)).toEqual(['18:30', '17:00']);
  });

  it('picks the first service written, when two start at the same time', () => {
    const z = day('2026-09-16', [['17:00', 'Spovedanie'], ['17:00', 'Vecernie']]);
    expect(nextService([z], '2026-09-16', '16:00')).toMatchObject({
      time: '17:00',
      service: 'Spovedanie',
    });
  });

  it('returns a service that starts right now', () => {
    expect(nextService(sampleDays, '2026-09-14', '08:30')).toMatchObject({ time: '08:30' });
  });

  it('skips cancelled days', () => {
    const d = [
      day('2026-09-16', [['18:30', 'Acatist']], { cancelled: true }),
      day('2026-09-20', [['10:00', 'Sfânta Liturghie']]),
    ];
    expect(nextService(d, '2026-09-15', '12:00')).toMatchObject({ date: '2026-09-20' });
  });

  it('returns null when nothing else is coming', () => {
    expect(nextService(sampleDays, '2027-01-01', '00:00')).toBeNull();
  });

  it('returns null for empty data', () => {
    expect(nextService([], '2026-09-14', '08:00')).toBeNull();
  });

  it('refuses an invalid date instead of returning the first service in the schedule', () => {
    // Without the guard, '15/09/2026' compares below every stored date: every day would
    // pass the filter and the function would confidently return the service from
    // 2026-09-14 07:30. A wrong time, stated with full conviction.
    expect(() => nextService(sampleDays, '15/09/2026', '08:00')).toThrow(/invalid/);
    expect(() => nextService(sampleDays, '2026-9-21', '08:00')).toThrow(/invalid/);
    // Caught by the existence check, not by the regex: February 30 passes the shape check.
    expect(() => nextService(sampleDays, '2026-02-30', '08:00')).toThrow(/inexistent/);
  });
});

describe('upcomingWeeks', () => {
  it('starts with the week that contains today', () => {
    const s = upcomingWeeks(sampleDays, '2026-09-16', 3);
    expect(s[0].key).toBe('2026-W38');
  });

  it('limits the number of weeks', () => {
    expect(upcomingWeeks(sampleDays, '2026-09-16', 2)).toHaveLength(2);
  });

  it('keeps the current week whole, including the days already past', () => {
    const s = upcomingWeeks(sampleDays, '2026-09-20', 1);
    expect(s.map((x) => x.key)).toEqual(['2026-W38']);
    expect(s[0].days.map((z) => z.date)).toEqual(['2026-09-14', '2026-09-16', '2026-09-20']);
  });

  it('excludes weeks entirely in the past', () => {
    const s = upcomingWeeks(sampleDays, '2026-09-23', 3);
    expect(s.map((x) => x.key)).toEqual(['2026-W39', '2026-W40']);
  });

  it('returns an empty list when everything is in the past', () => {
    expect(upcomingWeeks(sampleDays, '2027-01-01', 3)).toEqual([]);
  });

  it('refuses an invalid date, just as nextService does', () => {
    // The three functions that take a date reject it the same way, so there is no
    // single gate through which a broken date could enter the page silently.
    expect(() => upcomingWeeks(sampleDays, '15/09/2026', 3)).toThrow(/invalid/);
    expect(() => upcomingWeeks(sampleDays, '2026-02-30', 3)).toThrow(/inexistent/);
  });

  it('returns an empty list for a non-positive number of weeks', () => {
    expect(upcomingWeeks(sampleDays, '2026-09-16', 0)).toEqual([]);
    // Without the guard, slice(0, -1) would cut the last week and return the rest.
    expect(upcomingWeeks(sampleDays, '2026-09-16', -1)).toEqual([]);
  });
});

describe('servicesAtSameTime', () => {
  const evening = [
    { time: '17:00', service: 'Spovedanie' },
    { time: '17:00', service: 'Vecernie' },
    { time: '18:30', service: 'Paraclisul Maicii Domnului' },
  ] as Service[];

  it('returns both services that start in the same minute', () => {
    expect(servicesAtSameTime(evening, '17:00').map((s) => s.service)).toEqual([
      'Spovedanie',
      'Vecernie',
    ]);
  });

  it('keeps the order the editor wrote them in', () => {
    const reversed = [evening[1], evening[0]] as Service[];
    expect(servicesAtSameTime(reversed, '17:00').map((s) => s.service)).toEqual([
      'Vecernie',
      'Spovedanie',
    ]);
  });

  it('does not also take the service at another time', () => {
    expect(servicesAtSameTime(evening, '18:30').map((s) => s.service)).toEqual([
      'Paraclisul Maicii Domnului',
    ]);
  });

  it('compares minutes, not text', () => {
    // The schema normalises the time before the function sees it, so string
    // equality would agree today. Here it is proved that the agreement is not a
    // padding coincidence: "9:30" and "09:30" are the same minute.
    const unpadded = [{ time: '9:30', service: 'Utrenia' }] as Service[];
    expect(servicesAtSameTime(unpadded, '09:30')).toHaveLength(1);
    expect(servicesAtSameTime(unpadded, '9:30')).toHaveLength(1);
  });

  it('returns an empty list when nothing starts then', () => {
    expect(servicesAtSameTime(evening, '10:00')).toEqual([]);
    expect(servicesAtSameTime([], '17:00')).toEqual([]);
  });
});

/*
 * The homepage renders `upcomingWeeks(days, today, 3)` and prints each week's
 * own interval under its band. The seed content has entries in a single week,
 * so none of that composition runs on a normal build — it ran only when someone
 * remembered to force it by hand. `FIXTURE_DAYS` makes it run on every test.
 */
describe("the homepage's three-week window", () => {
  const three = upcomingWeeks(FIXTURE_DAYS, FIXTURE_TODAY, 3);

  it('skips the week with no entries', () => {
    // 2026-W39 is missing from the fixture and must be missing from here too.
    expect(three.map((s) => s.key)).toEqual(['2026-W38', '2026-W40', '2026-W41']);
  });

  it('counts weeks with entries, not calendar weeks', () => {
    // Three weeks shown, four calendar weeks covered: from Monday 14
    // September to Sunday 11 October. That is why no heading is allowed to
    // promise "the next three weeks" as a date range.
    const [first] = three;
    const last = three[three.length - 1];
    expect(three).toHaveLength(3);
    expect(first.monday).toBe('2026-09-14');
    expect(last.sunday).toBe('2026-10-11');
    // The last week starts three weeks after the first, so the interval
    // covers four. With `addDays`, not with arithmetic on `Date`: in this
    // project calendar dates never pass through a UTC instant.
    expect(addDays(first.monday, 21)).toBe(last.monday);
  });

  it('gives each week its own interval, the only one that is true', () => {
    expect(three.map((s) => formatWeekRange(s.monday, s.sunday))).toEqual([
      '14 – 20 septembrie 2026',
      '28 septembrie – 4 octombrie 2026',
      '5 – 11 octombrie 2026',
    ]);
  });

  it('excludes the week that has already ended', () => {
    // 2026-09-09 is in the fixture precisely so the exclusion is proved on real dates.
    expect(upcomingWeeks(FIXTURE_DAYS, FIXTURE_TODAY, 9).map((s) => s.key)).not.toContain(
      '2026-W37',
    );
  });

  it('crosses the year boundary correctly', () => {
    const acrossYearEnd = upcomingWeeks(FIXTURE_DAYS, '2026-12-28', 3);
    expect(acrossYearEnd.map((s) => s.key)).toEqual(['2026-W53', '2027-W01']);
    expect(acrossYearEnd.map((s) => formatWeekRange(s.monday, s.sunday))).toEqual([
      '28 decembrie 2026 – 3 ianuarie 2027',
      '4 – 10 ianuarie 2027',
    ]);
  });

  it("the keys are ordered lexically, as Task 10's picker will compare them", () => {
    const keys = upcomingWeeks(FIXTURE_DAYS, FIXTURE_TODAY, 9).map((s) => s.key);
    expect(keys).toEqual([...keys].sort());
  });

  it('the „next service" card names both services at 17:00', () => {
    const u = nextService(FIXTURE_DAYS, FIXTURE_TODAY, '09:00');
    expect(u).not.toBeNull();
    expect(u?.date).toBe('2026-09-16');
    expect(u?.time).toBe('17:00');
    const theDay = FIXTURE_DAYS.find((z) => z.date === u?.date);
    expect(servicesAtSameTime(theDay?.services ?? [], u!.time).map(serviceLabel)).toEqual([
      'Spovedanie',
      'Vecernie',
    ]);
  });

  it('skips the cancelled day entirely', () => {
    // 2026-10-04 is cancelled and keeps its time; the card must move on to
    // 7 October, not announce a service that is not taking place.
    const u = nextService(FIXTURE_DAYS, '2026-10-04', '00:00');
    expect(u?.date).toBe('2026-10-07');
  });
});

/*
 * `daySchema` neither sorts a day's services nor requires them sorted, so the
 * order in the YAML is whatever the volunteer typed. `nextService` and
 * `ics.ts` have always sorted their own copy; the two pages did not, and both
 * read the schedule through `groupIntoWeeks`.
 */
describe("the order of a day's services", () => {
  const unorderedDay = FIXTURE_DAYS.find((z) => z.date === '2026-09-16')!;

  it('control: the fixture really is unordered', () => {
    // Without this, the tests below could pass because there is nothing to sort.
    expect(unorderedDay.services.map((s) => s.time)).toEqual(['18:30', '17:00', '17:00']);
  });

  it('servicesInOrder puts them in the order they happen', () => {
    expect(servicesInOrder(unorderedDay.services).map((s) => s.time)).toEqual([
      '17:00',
      '17:00',
      '18:30',
    ]);
  });

  it("keeps the same-time pair in the editor's order", () => {
    // Sorting has been stable since ES2019. Confession written before vespers
    // stays before it: reversing them would be a decision the code cannot
    // make, because it cannot see what the pair means.
    expect(servicesInOrder(unorderedDay.services).map((s) => s.service)).toEqual([
      'Spovedanie',
      'Vecernie',
      'Paraclisul Maicii Domnului',
    ]);
  });

  it('does not modify the list it was handed', () => {
    const beforeSort = [...unorderedDay.services];
    servicesInOrder(unorderedDay.services);
    expect(unorderedDay.services).toEqual(beforeSort);
  });

  it('compares minutes, not text', () => {
    // The same check its sibling `servicesAtSameTime` has, and for the
    // same reason: `daySchema` pads `time` before the function sees it, so
    // a string comparison would agree today. Unpadded, "10:00" sorts
    // lexically before "9:30", which is exactly the reverse of what happens.
    const unpaddedTimes = [{ time: '10:00', service: 'Sfânta Liturghie' }, { time: '9:30', service: 'Utrenia' }] as Service[];
    expect(servicesInOrder(unpaddedTimes).map((s) => s.time)).toEqual(['9:30', '10:00']);
  });

  it('both pages receive it ordered, because both read it through the grouping', () => {
    // /program/ calls groupIntoWeeks directly, the homepage through
    // upcomingWeeks. A single place covers both.
    const throughGrouping = groupIntoWeeks(FIXTURE_DAYS)
      .flatMap((s) => s.days)
      .find((z) => z.date === '2026-09-16');
    const throughTheWindow = upcomingWeeks(FIXTURE_DAYS, FIXTURE_TODAY, 3)
      .flatMap((s) => s.days)
      .find((z) => z.date === '2026-09-16');
    expect(throughGrouping?.services.map((s) => s.time)).toEqual(['17:00', '17:00', '18:30']);
    expect(throughTheWindow?.services.map((s) => s.time)).toEqual(['17:00', '17:00', '18:30']);
  });

  it('the grouping does not damage the original day from the collection', () => {
    groupIntoWeeks(FIXTURE_DAYS);
    expect(unorderedDay.services.map((s) => s.time)).toEqual(['18:30', '17:00', '17:00']);
  });
});

describe('fullStop', () => {
  it('adds the full stop when the value has none', () => {
    expect(fullStop('Capela Sf. Gallus, Winterthur')).toBe('.');
    expect(fullStop('Winterthur')).toBe('.');
  });

  it('does not add a second full stop', () => {
    // The bug: „Slujbele acestei zile au loc la Winterthur.." — two full stops,
    // because both the editor and the sentence add one each.
    expect(fullStop('Winterthur.')).toBe('');
    expect(fullStop('Capela Sf. Gallus, Winterthur.')).toBe('');
  });

  it('treats an ellipsis as the end of a sentence too', () => {
    expect(fullStop('și altele…')).toBe('');
  });

  it('does not guess for an exclamation or question mark', () => {
    // Nothing in the project composes a sentence around a value that could
    // end that way; treating them as terminators would be an assumption.
    expect(fullStop('Winterthur!')).toBe('.');
    expect(fullStop('Winterthur?')).toBe('.');
  });

  it('puts a full stop after an empty string, without throwing', () => {
    expect(fullStop('')).toBe('.');
  });

  it('the location in the fixture ends with a full stop, so there is something to pin', () => {
    // Control: if someone "cleans up" the fixture, the test below no longer proves
    // anything, so the value is asserted explicitly.
    const day = FIXTURE_DAYS.find((z) => z.date === '2026-09-30');
    expect(day?.location).toBe('Capela Sf. Gallus, Winterthur.');
    expect(fullStop(day!.location!)).toBe('');
  });

  it('the schema does not trim the full stop from the fixture, however far it travels through the grouping', () => {
    // ics.ts writes this exact value into LOCATION; it is the page that omits
    // its full stop, not the data.
    const throughGrouping = groupIntoWeeks(FIXTURE_DAYS)
      .flatMap((s) => s.days)
      .find((z) => z.date === '2026-09-30');
    expect(throughGrouping?.location).toBe('Capela Sf. Gallus, Winterthur.');
  });
});

describe('romanianList', () => {
  /*
   * This function used to be an expression written directly in `index.astro`. Since Task 10
   * the "next service" card is also recalculated in the browser, so the expression would
   * have existed in two places — exactly the shape in which the three sortings
   * that `servicesInOrder` unified ended up disagreeing.
   */
  it('a single name is left untouched', () => {
    expect(romanianList(['Vecernie'])).toBe('Vecernie');
  });

  it('two names are joined with „și", with no comma', () => {
    expect(romanianList(['Spovedanie', 'Vecernie'])).toBe('Spovedanie și Vecernie');
  });

  it('three names: a comma between the first two, „și" before the last', () => {
    expect(romanianList(['Utrenia', 'Spovedanie', 'Vecernie'])).toBe(
      'Utrenia, Spovedanie și Vecernie',
    );
  });

  it('an empty list gives the empty string, not „undefined"', () => {
    // The page does not render the card without a next service, but a function that
    // returns `undefined` puts the word "undefined" on the page on the day
    // the guard above it changes.
    expect(romanianList([])).toBe('');
  });

  it('puts no cedilla in the conjunction', () => {
    // The conjunction is "și": s with comma below, U+0219. The guard is written on the
    // codepoint, not the glyph, so the file stays scannable for cedillas.
    const joined = romanianList(['A', 'B']);
    expect(joined).not.toMatch(/[\u015F\u0163\u015E\u0162]/);
    expect(joined).toMatch(/\u0219/);
  });
});

/*
 * ===========================================================================
 * THE DATA ISLAND, AND WHY IT HAS A BOUND.
 *
 * NOTHING USES IT ANY MORE. The "next service" card on the homepage was
 * removed at the parish's request — the schedule below says the same thing — and
 * with it went the JSON island and the recalculation in the browser.
 * `scheduleForIsland`, `nextService`, `servicesAtSameTime` and
 * `romanianList` stayed in `schedule.ts`, tested and unused by any
 * page: they are what a "next service" would be built from anywhere else.
 * What follows is therefore a property of a library function, NOT a measure
 * of today's homepage — the numbers below describe the page as it was then, and
 * are kept because they are the argument for why the bound exists.
 *
 * `index.astro` for a long time carried ALL the future days in its JSON island, so
 * the page's weight was a function of how far ahead the parish publishes. Measured on
 * test constructions with a realistic parish week (Wednesday, Friday,
 * Saturday, Sunday): the page without the island is constant at 20.693 bytes, and
 * the island costs about 133 bytes per service day. At 47 weeks published
 * the page is 45.567 bytes and the budget passes; at 48 it is 46.093 and fails — by
 * thirteen bytes — for perfectly valid content.
 *
 * What that costs is not a failure of the site: Cloudflare does not run the budget, so the site
 * keeps publishing. It costs the fact that, from that day on, EVERY save by
 * the volunteer produces a red CI run and a failure email addressed to them,
 * about correct content, without naming any file and without anything they
 * could do about it.
 *
 * The tests below pin the bound with a schedule built far into the future, so
 * the threshold becomes unreachable, not just distant. They do not measure the page — that is
 * `scripts/check-budget.mjs`'s job, on the real artifact — but the property it
 * follows from: the island does not grow with the published horizon.
 * ===========================================================================
 */
describe('the data island (used by no page; see the note above)', () => {
  /** N weeks of an ordinary parish schedule, starting from the Monday of `from`. */
  function longSchedule(from: string, weeks: number): ServiceDay[] {
    const days: ServiceDay[] = [];
    for (let s = 0; s < weeks; s += 1) {
      for (const [offset, services] of [
        [2, [{ time: '18:30', service: 'Acatist' }]],
        [4, [{ time: '18:00', service: 'Vecernie' }]],
        [5, [{ time: '17:00', service: 'Spovedanie' }, { time: '17:00', service: 'Vecernie' }]],
        [6, [{ time: '08:30', service: 'Utrenia' }, { time: '10:00', service: 'Sfânta Liturghie' }]],
      ] as Array<[number, Service[]]>) {
        days.push({
          date: addDays(from, s * 7 + offset),
          great_feast: false, fast_day: false, cancelled: false,
          services,
        } as ServiceDay);
      }
    }
    return days;
  }

  const TODAY = '2026-09-14'; // a Monday
  const TWO_YEARS = longSchedule(TODAY, 104);

  it('control: the constructed schedule really is far longer than the bound', () => {
    // Without this, everything that follows could pass because there is nothing to cut.
    expect(TWO_YEARS.length).toBe(416);
    expect(TWO_YEARS.length).toBeGreaterThan(ISLAND_DAYS * 4);
  });

  it('stops at ISLAND_DAYS days, however far ahead the parish publishes', () => {
    expect(scheduleForIsland(TWO_YEARS, TODAY)).toHaveLength(ISLAND_DAYS);
  });

  it('publishing further ahead does not change the island at all', () => {
    // The property, stated directly: two years published and ten weeks published
    // produce the same island, byte for byte.
    const tenWeeks = longSchedule(TODAY, 10);
    expect(tenWeeks.length).toBeGreaterThanOrEqual(ISLAND_DAYS);
    expect(scheduleForIsland(TWO_YEARS, TODAY)).toEqual(scheduleForIsland(tenWeeks, TODAY));
  });

  it('stays well under budget once serialised, even with two years published', () => {
    const bytes = Buffer.byteLength(JSON.stringify(scheduleForIsland(TWO_YEARS, TODAY)));
    const unbounded = Buffer.byteLength(JSON.stringify(scheduleForIsland(TWO_YEARS, TODAY, TWO_YEARS.length)));
    // Printed, not only checked: the number below is the one a later reader
    // checks against if a comment contradicts it.
    process.stdout.write(
      `\nThe island at 104 published weeks: ${bytes} bytes (${ISLAND_DAYS} days)` +
        ` — unbounded it would be ${unbounded} bytes (${TWO_YEARS.length} days).\n` +
        `The page then, without the island, measured 20693 bytes; the budget is ${45 * 1024}.\n`,
    );
    // The bound here is generous because a day can carry more services,
    // a `location` or a `detail` longer than the ones above. The real budget
    // is measured on the built page, in scripts/check-budget.mjs.
    expect(bytes).toBeLessThan(20 * 1024);
    // And the positive control: without the bound, the same data really do exceed it.
    expect(20693 + unbounded).toBeGreaterThan(45 * 1024);
  });

  it('the card gives the same answer as the whole schedule, for any clock inside the window', () => {
    /*
     * This is the property the cutting depends on. The island has to answer
     * exactly what the whole list would have answered, for any moment from construction
     * onward — the only direction a clock runs.
     *
     * What is compared are the answers the card puts on the page — the day, the time and
     * the names of the services that start then — not the whole objects: the projection carries
     * `name` already rendered where the day in the collection carries `service`, because
     * the browser is sent the decision, not the rendering rule.
     */
    const island = scheduleForIsland(TWO_YEARS, TODAY);
    const answer = <S extends { time: string; date: string }>(
      days: Array<{ date: string; cancelled: boolean; services: Array<{ time: string }> }>,
      nextOne: S | null,
      label: (s: never) => string,
    ) => {
      if (nextOne === null) return null;
      const theDay = days.find((z) => z.date === nextOne.date)!;
      return {
        date: nextOne.date,
        time: nextOne.time,
        name: servicesAtSameTime(theDay.services, nextOne.time).map((s) => label(s as never)),
      };
    };
    let checked = 0;
    for (let day = 0; day < 60; day += 1) {
      const when = addDays(TODAY, day);
      for (const time of ['00:00', '09:00', '17:30', '23:59']) {
        const fromIsland = answer(island, nextService(island, when, time), (s: never) => (s as { name: string }).name);
        const fromWholeSchedule = answer(TWO_YEARS, nextService(TWO_YEARS, when, time), serviceLabel);
        expect(fromIsland, `${when} ${time}`).toEqual(fromWholeSchedule);
        checked += 1;
      }
    }
    // A guard that reads something has to prove it read something.
    expect(checked).toBe(240);
  });

  it('past the window the card disappears, instead of saying something other than the page', () => {
    // The safe direction, and the only degradation the cutting has: the script
    // finds the empty list and hides the card. For that the site would have to have gone
    // unrebuilt for longer than the window, which is well past the 60-day
    // barrier after which GitHub stops the scheduled rebuild anyway.
    const island = scheduleForIsland(TWO_YEARS, TODAY);
    const pastTheWindow = addDays(island[island.length - 1].date, 1);
    expect(nextService(island, pastTheWindow, '00:00')).toBeNull();
    expect(nextService(TWO_YEARS, pastTheWindow, '00:00')).not.toBeNull();
  });

  it('carries neither past days nor cancelled days', () => {
    const withCancelled: ServiceDay[] = [
      { date: '2026-09-12', great_feast: false, fast_day: false, cancelled: false,
        services: [{ time: '10:00', service: 'Sfânta Liturghie' }] } as ServiceDay,
      { date: '2026-09-16', great_feast: false, fast_day: false, cancelled: true,
        services: [{ time: '18:30', service: 'Acatist' }] } as ServiceDay,
      { date: '2026-09-20', great_feast: false, fast_day: false, cancelled: false,
        services: [{ time: '10:00', service: 'Sfânta Liturghie' }] } as ServiceDay,
    ];
    const island = scheduleForIsland(withCancelled, TODAY);
    expect(island.map((z) => z.date)).toEqual(['2026-09-20']);
    expect(island[0].cancelled).toBe(false);
    // The field stays in the projection even though it is now always false: it is the second
    // belt, and `nextService` in the browser still reads it. If it disappears from
    // the JSON, this test fails before the behaviour disappears.
    expect(Object.keys(island[0])).toContain('cancelled');
    // Names are rendered here, not in the browser: `serviceLabel` owns the
    // `Altceva` escape hatch, and that word is not allowed to reach the page.
    expect(island[0].services).toEqual([{ time: '10:00', name: 'Sfânta Liturghie' }]);
    expect(island[0].title).toBe('Duminică, 20 septembrie');
  });

  /*
   * CANCELLED DAYS DO NOT EAT INTO THE BOUND, and why this case has its own test.
   *
   * The cutting used to run BEFORE filtering out the cancelled days, and `nextService` filters
   * afterward. So the first `ISLAND_DAYS` future published days, all cancelled,
   * emptied the island of answers while the schedule was full of them: the server
   * rendered a correct card and the client hid it, ON A FRESH BUILD, with
   * no staleness in the middle. The threshold, measured on these functions: 39 cancelled days
   * agree between the two, and 40 does not.
   *
   * Forty cancelled days in a row are about ten weeks at four service days
   * per week — a vacation, a closure or a long illness, introduced exactly
   * as the project requires: `README.md` and ruling #28 tell the editor to KEEP
   * the times and check the cancellation box, so calendar subscribers find out.
   */
  it("cancelled days do not eat into the island's bound", () => {
    /** `TWO_YEARS` with the first `n` future days cancelled, times kept. */
    function withFirstCancelled(n: number): ServiceDay[] {
      const ordered = [...TWO_YEARS].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      return ordered.map((z, i) => ({ ...z, cancelled: i < n }));
    }

    const measuredLines: string[] = [];
    let checked = 0;
    for (const n of [0, 38, 39, 40, 41, 80]) {
      const days = withFirstCancelled(n);
      const server = nextService(days, TODAY, '00:00');
      const client = nextService(scheduleForIsland(days, TODAY), TODAY, '00:00');
      measuredLines.push(
        `  first ${String(n).padStart(2)} cancelled days → server ${server?.date ?? 'NULL'}` +
          ` | client ${client?.date ?? 'NULL'} | agree: ${server?.date === client?.date}`,
      );
      expect(server, `n=${n}: the whole schedule still has services`).not.toBeNull();
      expect(client?.date, `n=${n}: the client does not answer as the server does`).toBe(server?.date);
      checked += 1;
    }
    process.stdout.write(`\nThe island with cancelled days at the start:\n${measuredLines.join('\n')}\n`);
    expect(checked).toBe(6);

    /*
     * POSITIVE CONTROL, in the same function: the arrangement really is one that breaks.
     * This is the old order — cut first, filter after — on exactly the same
     * data. Without it, the case above could be green because there is nothing to break.
     */
    const days = withFirstCancelled(ISLAND_DAYS);
    const oldIsland = days
      .filter((z) => z.date >= TODAY)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .slice(0, ISLAND_DAYS);
    expect(nextService(oldIsland, TODAY, '00:00'), 'the old order really did empty the island').toBeNull();
    expect(nextService(days, TODAY, '00:00')).not.toBeNull();
  });

  it("a broken today's-date fails, instead of starting the island in the past", () => {
    // The same guard as in `nextService`, and for the same reason: "15/09/2026"
    // sorts below every stored date, so every day would pass the filter.
    expect(() => scheduleForIsland(TWO_YEARS, '15/09/2026')).toThrow();
  });

  it('keeps the chronological order, however the collection arrives', () => {
    const shuffled = [...TWO_YEARS].reverse();
    const sampleDays = scheduleForIsland(shuffled, TODAY).map((z) => z.date);
    expect(sampleDays).toEqual([...sampleDays].sort());
    expect(sampleDays).toEqual(scheduleForIsland(TWO_YEARS, TODAY).map((z) => z.date));
  });
});
