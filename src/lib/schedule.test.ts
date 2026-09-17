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
    // Exact inversiunea din care se naște bug-ul: alfabetic, „9:30" vine după
    // „10:00". Numeric, nu.
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
    // Motivul pentru care funcția aceasta există: „Altceva" este portița din
    // CMS, nu un nume de slujbă. Niciun nume din listă nu are voie să îl scoată
    // pe pagină sau în feed-ul de calendar.
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
    // Sedilele turcești, scrise ca escape-uri pentru ca garda să nu poată fi
    // înfrântă lipind chiar caracterele pe care le respinge:
    // U+015F, U+0163 și majusculele lor U+015E, U+0162.
    expect(allText).not.toMatch(/[\u015F\u0163\u015E\u0162]/);
    // Și dovada că garda are ce prinde, nu că trece fiindcă șirurile scanate
    // s-au dovedit a fi ASCII. Primul vine din SERVICE_NAMES, prin serviceLabel.
    expect(allText).toMatch(/\u021B/); // ț, din „Liturghia Darurilor … sfințite"
    expect(allText).toMatch(/\u0219/); // ș, din detaliul „și Parastas"
    // Singurul literal românesc din schedule.ts, afirmat pe codepoint: ă = U+0103.
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
    // O seară obișnuită: spovedania se ține în timpul vecerniei. Gruparea nu
    // are voie nici să le contopească, nici să piardă ziua.
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
    // 2027-01-03 este duminica săptămânii ISO 2026-W53; 2027-01-05 deja W01.
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

  it('sare peste zilele anulate', () => {
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
    // Fără gardă, '15/09/2026' se compară sub orice dată stocată: fiecare zi ar
    // trece de filtru și funcția ar întoarce, sigură pe ea, slujba de la
    // 2026-09-14 07:30. O oră greșită, spusă cu toată convingerea.
    expect(() => nextService(sampleDays, '15/09/2026', '08:00')).toThrow(/invalid/);
    expect(() => nextService(sampleDays, '2026-9-21', '08:00')).toThrow(/invalid/);
    // Prins de verificarea existenței, nu de regex: 30 februarie trece de formă.
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
    // Cele trei funcții care primesc o dată o resping la fel, ca să nu existe
    // o singură poartă prin care o dată stricată să intre tăcută în pagină.
    expect(() => upcomingWeeks(sampleDays, '15/09/2026', 3)).toThrow(/invalid/);
    expect(() => upcomingWeeks(sampleDays, '2026-02-30', 3)).toThrow(/inexistent/);
  });

  it('returns an empty list for a non-positive number of weeks', () => {
    expect(upcomingWeeks(sampleDays, '2026-09-16', 0)).toEqual([]);
    // Fără gardă, slice(0, -1) ar tăia ultima săptămână și ar întoarce restul.
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
    // Schema normalizează ora înainte ca funcția să o vadă, așa că egalitatea de
    // șiruri ar fi de acord astăzi. Aici se dovedește că acordul nu e o
    // coincidență de padare: „9:30" și „09:30" sunt același minut.
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
    // 2026-W39 lipsește din fixtură și trebuie să lipsească și de aici.
    expect(three.map((s) => s.key)).toEqual(['2026-W38', '2026-W40', '2026-W41']);
  });

  it('counts weeks with entries, not calendar weeks', () => {
    // Trei săptămâni afișate, patru săptămâni de calendar acoperite: de luni 14
    // septembrie până duminică 11 octombrie. De aceea niciun titlu nu are voie
    // să promită „următoarele trei săptămâni" ca interval de date.
    const [first] = three;
    const last = three[three.length - 1];
    expect(three).toHaveLength(3);
    expect(first.monday).toBe('2026-09-14');
    expect(last.sunday).toBe('2026-10-11');
    // Ultima săptămână începe la trei săptămâni după prima, deci intervalul
    // acoperă patru. Cu `addDays`, nu cu aritmetică pe `Date`: în proiectul
    // ăsta datele calendaristice nu trec niciodată printr-un instant UTC.
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
    // 2026-09-09 este în fixtură tocmai ca excluderea să fie dovedită pe date.
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
    // 2026-10-04 este anulată și își păstrează ora; cardul trebuie să treacă la
    // 7 octombrie, nu să anunțe o slujbă care nu are loc.
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
    // Fără asta, testele de mai jos ar putea trece fiindcă nu au ce sorta.
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
    // Sortarea e stabilă din ES2019. Spovedania scrisă înaintea vecerniei
    // rămâne înaintea ei: a le inversa ar fi o decizie pe care codul nu o poate
    // lua, fiindcă nu vede ce înseamnă perechea.
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
    // Aceeași verificare pe care o are sora ei, `servicesAtSameTime`, și pentru
    // același motiv: `daySchema` padează `time` înainte ca funcția să o vadă, așa
    // că o comparație de șiruri ar fi de acord astăzi. Nepadat, „10:00" sortează
    // lexical înaintea lui „9:30", adică fix invers decât se întâmplă.
    const unpaddedTimes = [{ time: '10:00', service: 'Sfânta Liturghie' }, { time: '9:30', service: 'Utrenia' }] as Service[];
    expect(servicesInOrder(unpaddedTimes).map((s) => s.time)).toEqual(['9:30', '10:00']);
  });

  it('both pages receive it ordered, because both read it through the grouping', () => {
    // /program/ cheamă groupIntoWeeks direct, pagina de start prin
    // upcomingWeeks. Un singur loc le acoperă pe amândouă.
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
    // Bug-ul: „Slujbele acestei zile au loc la Winterthur.." — două puncte,
    // fiindcă și redactorul și propoziția pun câte unul.
    expect(fullStop('Winterthur.')).toBe('');
    expect(fullStop('Capela Sf. Gallus, Winterthur.')).toBe('');
  });

  it('treats an ellipsis as the end of a sentence too', () => {
    expect(fullStop('și altele…')).toBe('');
  });

  it('does not guess for an exclamation or question mark', () => {
    // Nimic din proiect nu compune o propoziție în jurul unei valori care s-ar
    // putea termina așa; a le trata ca terminatori ar fi o presupunere.
    expect(fullStop('Winterthur!')).toBe('.');
    expect(fullStop('Winterthur?')).toBe('.');
  });

  it('puts a full stop after an empty string, without throwing', () => {
    expect(fullStop('')).toBe('.');
  });

  it('the location in the fixture ends with a full stop, so there is something to pin', () => {
    // Control: dacă cineva „curăță" fixtura, testul de mai jos nu mai dovedește
    // nimic, așa că valoarea e afirmată explicit.
    const day = FIXTURE_DAYS.find((z) => z.date === '2026-09-30');
    expect(day?.location).toBe('Capela Sf. Gallus, Winterthur.');
    expect(fullStop(day!.location!)).toBe('');
  });

  it('the schema does not trim the full stop from the fixture, however far it travels through the grouping', () => {
    // ics.ts scrie exact valoarea asta în LOCATION; pagina e cea care omite
    // punctul ei, nu datele.
    const throughGrouping = groupIntoWeeks(FIXTURE_DAYS)
      .flatMap((s) => s.days)
      .find((z) => z.date === '2026-09-30');
    expect(throughGrouping?.location).toBe('Capela Sf. Gallus, Winterthur.');
  });
});

describe('romanianList', () => {
  /*
   * Această funcție era o expresie scrisă direct în `index.astro`. Din Task 10
   * cardul „următoarea slujbă" se recalculează și în browser, așa că expresia ar
   * fi existat în două locuri — exact forma în care au ajuns să se contrazică
   * cele trei sortări pe care le-a unificat `servicesInOrder`.
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
    // Pagina nu randează cardul fără o slujbă următoare, dar o funcție care
    // întoarce `undefined` pune cuvântul „undefined" pe pagină în ziua în care
    // se schimbă paza de deasupra ei.
    expect(romanianList([])).toBe('');
  });

  it('puts no cedilla in the conjunction', () => {
    // Legătura este „și": s cu virgulă dedesubt, U+0219. Garda e scrisă pe
    // codepoint, nu pe glifă, ca fișierul să rămână scanabil pentru sedile.
    const joined = romanianList(['A', 'B']);
    expect(joined).not.toMatch(/[\u015F\u0163\u015E\u0162]/);
    expect(joined).toMatch(/\u0219/);
  });
});

/*
 * ===========================================================================
 * INSULA DE DATE, ȘI DE CE ARE O MARGINE.
 *
 * NIMIC NU O MAI FOLOSEȘTE. Cardul „următoarea slujbă" de pe pagina de start a
 * fost scos la cererea parohiei — programul de dedesubt spune același lucru — și
 * odată cu el au plecat insula JSON și recalcularea din browser.
 * `scheduleForIsland`, `nextService`, `servicesAtSameTime` și
 * `romanianList` au rămas în `schedule.ts`, testate și nefolosite de nicio
 * pagină: ele sunt din ce s-ar construi un „următoarea slujbă" oriunde altundeva.
 * Ce urmează este deci o proprietate a unei funcții de bibliotecă, NU o măsură
 * a paginii de start de azi — numerele de mai jos descriu pagina de atunci, și
 * sunt păstrate fiindcă ele sunt argumentul pentru care marginea există.
 *
 * `index.astro` a purtat multă vreme TOATE zilele viitoare în insula ei JSON, așa
 * că greutatea paginii era o funcție de cât de departe publică parohia. Măsurat pe
 * construcții de probă cu o săptămână parohială realistă (miercuri, vineri,
 * sâmbătă, duminică): pagina fără insulă este constantă la 20.693 de octeți, iar
 * insula costă circa 133 de octeți pe zi de slujbă. La 47 de săptămâni publicate
 * pagina are 45.567 de octeți și bugetul trece; la 48 are 46.093 și pică — cu
 * treisprezece octeți — pentru un conținut perfect valid.
 *
 * Ce costă nu este o cădere a sitului: Cloudflare nu rulează bugetul, deci situl
 * se publică mai departe. Costă faptul că, din ziua aceea, FIECARE salvare a
 * voluntarului produce o rulare roșie de CI și un e-mail de eșec adresat lui,
 * despre un conținut corect, fără să numească vreun fișier și fără nimic ce ar
 * putea face.
 *
 * Testele de mai jos fixează marginea cu un program construit mult în viitor, ca
 * pragul să devină de neatins, nu doar depărtat. Ele nu măsoară pagina — asta face
 * `scripts/check-budget.mjs`, pe artefactul adevărat — ci proprietatea din care
 * rezultă: insula nu crește cu orizontul publicat.
 * ===========================================================================
 */
describe('the data island (used by no page; see the note above)', () => {
  /** N săptămâni de program parohial obișnuit, începând din lunea lui `de la`. */
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

  const TODAY = '2026-09-14'; // o luni
  const TWO_YEARS = longSchedule(TODAY, 104);

  it('control: the constructed schedule really is far longer than the bound', () => {
    // Fără asta, tot ce urmează ar putea trece fiindcă nu are ce tăia.
    expect(TWO_YEARS.length).toBe(416);
    expect(TWO_YEARS.length).toBeGreaterThan(ISLAND_DAYS * 4);
  });

  it('stops at ISLAND_DAYS days, however far ahead the parish publishes', () => {
    expect(scheduleForIsland(TWO_YEARS, TODAY)).toHaveLength(ISLAND_DAYS);
  });

  it('publishing further ahead does not change the island at all', () => {
    // Proprietatea, spusă direct: doi ani publicați și zece săptămâni publicate
    // produc aceeași insulă, octet cu octet.
    const tenWeeks = longSchedule(TODAY, 10);
    expect(tenWeeks.length).toBeGreaterThanOrEqual(ISLAND_DAYS);
    expect(scheduleForIsland(TWO_YEARS, TODAY)).toEqual(scheduleForIsland(tenWeeks, TODAY));
  });

  it('stays well under budget once serialised, even with two years published', () => {
    const bytes = Buffer.byteLength(JSON.stringify(scheduleForIsland(TWO_YEARS, TODAY)));
    const unbounded = Buffer.byteLength(JSON.stringify(scheduleForIsland(TWO_YEARS, TODAY, TWO_YEARS.length)));
    // Tipărit, nu doar verificat: numărul de mai jos este cel pe care îl verifică
    // un cititor de mai târziu dacă un comentariu îl contrazice.
    process.stdout.write(
      `\nInsula la 104 săptămâni publicate: ${bytes} octeți (${ISLAND_DAYS} zile)` +
        ` — nemărginită ar fi ${unbounded} octeți (${TWO_YEARS.length} zile).\n` +
        `Pagina de atunci, fără insulă, măsura 20693 octeți; bugetul este ${45 * 1024}.\n`,
    );
    // Marginea de aici este generoasă fiindcă o zi poate purta mai multe slujbe,
    // o `location` sau un `detail` mai lung decât cele de mai sus. Bugetul adevărat
    // se măsoară pe pagina construită, în scripts/check-budget.mjs.
    expect(bytes).toBeLessThan(20 * 1024);
    // Și controlul pozitiv: fără margine, aceleași date chiar depășesc.
    expect(20693 + unbounded).toBeGreaterThan(45 * 1024);
  });

  it('the card gives the same answer as the whole schedule, for any clock inside the window', () => {
    /*
     * Asta este proprietatea de care depinde tăierea. Insula trebuie să răspundă
     * exact ce ar fi răspuns lista întreagă, pentru orice moment de la construcție
     * înainte — singura direcție în care merge un ceas.
     *
     * Comparate sunt răspunsurile pe care le pune cardul pe pagină — ziua, ora și
     * numele slujbelor care încep atunci — nu obiectele întregi: proiecția poartă
     * `name` deja randat acolo unde ziua din colecție poartă `service`, fiindcă
     * browserului i se trimite decizia, nu regula de randare.
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
    // O gardă care citește ceva trebuie să dovedească faptul că a citit ceva.
    expect(checked).toBe(240);
  });

  it('past the window the card disappears, instead of saying something other than the page', () => {
    // Direcția sigură, și singura degradare pe care o are tăierea: scriptul
    // găsește lista goală și ascunde cardul. Pentru asta situl trebuie să fi stat
    // nereconstruit mai mult decât fereastra, adică mult peste bariera de 60 de
    // zile după care GitHub oprește oricum reconstrucția programată.
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
    // Câmpul rămâne în proiecție deși este acum întotdeauna fals: este a doua
    // curea, iar `nextService` din browser tot îl citește. Dacă dispare din
    // JSON, testul acesta pică înainte să dispară comportamentul.
    expect(Object.keys(island[0])).toContain('cancelled');
    // Numele sunt randate aici, nu în browser: `serviceLabel` deține portița
    // `Altceva`, iar cuvântul acela nu are voie să ajungă pe pagină.
    expect(island[0].services).toEqual([{ time: '10:00', name: 'Sfânta Liturghie' }]);
    expect(island[0].title).toBe('Duminică, 20 septembrie');
  });

  /*
   * ZILELE ANULATE NU CONSUMĂ MARGINEA, și de ce are cazul acesta un test al lui.
   *
   * Tăierea rula ÎNAINTE de filtrarea anulatelor, iar `nextService` filtrează
   * după. Deci primele `ISLAND_DAYS` zile publicate viitoare, toate anulate,
   * goleau insula de răspunsuri în timp ce programul era plin de ele: serverul
   * randa un card corect și clientul îl ascundea, PE O CONSTRUCȚIE PROASPĂTĂ, fără
   * nicio vechime la mijloc. Pragul, măsurat pe funcțiile astea: 39 de zile anulate
   * și cele două se potrivesc, 40 și nu.
   *
   * Patruzeci de zile anulate la rând sunt vreo zece săptămâni la patru zile de
   * slujbă pe săptămână — o vacanță, o închidere sau o boală lungă, introduse exact
   * cum cere proiectul: `README.md` și hotărârea #28 spun editorului să PĂSTREZE
   * orele și să bifeze anularea, ca abonații la calendar să afle.
   */
  it("cancelled days do not eat into the island's bound", () => {
    /** `TWO_YEARS` cu primele `n` zile viitoare anulate, orele păstrate. */
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
        `  primele ${String(n).padStart(2)} zile anulate → server ${server?.date ?? 'NULL'}` +
          ` | client ${client?.date ?? 'NULL'} | acord: ${server?.date === client?.date}`,
      );
      expect(server, `n=${n}: programul întreg mai are slujbe`).not.toBeNull();
      expect(client?.date, `n=${n}: clientul nu răspunde ca serverul`).toBe(server?.date);
      checked += 1;
    }
    process.stdout.write(`\nInsula cu zile anulate la început:\n${measuredLines.join('\n')}\n`);
    expect(checked).toBe(6);

    /*
     * CONTROL POZITIV, în aceeași funcție: aranjamentul chiar este unul care rupe.
     * Aici este vechea ordine — taie întâi, filtrează după — pe exact aceleași
     * date. Fără el, cazul de mai sus ar putea fi verde fiindcă nu are ce sparge.
     */
    const days = withFirstCancelled(ISLAND_DAYS);
    const oldIsland = days
      .filter((z) => z.date >= TODAY)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .slice(0, ISLAND_DAYS);
    expect(nextService(oldIsland, TODAY, '00:00'), 'vechea ordine chiar golea insula').toBeNull();
    expect(nextService(days, TODAY, '00:00')).not.toBeNull();
  });

  it("a broken today's-date fails, instead of starting the island in the past", () => {
    // Aceeași pază ca la `nextService`, și din același motiv: „15/09/2026"
    // sortează sub orice dată stocată, deci fiecare zi ar trece de filtru.
    expect(() => scheduleForIsland(TWO_YEARS, '15/09/2026')).toThrow();
  });

  it('keeps the chronological order, however the collection arrives', () => {
    const shuffled = [...TWO_YEARS].reverse();
    const sampleDays = scheduleForIsland(shuffled, TODAY).map((z) => z.date);
    expect(sampleDays).toEqual([...sampleDays].sort());
    expect(sampleDays).toEqual(scheduleForIsland(TWO_YEARS, TODAY).map((z) => z.date));
  });
});
