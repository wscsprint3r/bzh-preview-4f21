import { describe, expect, it } from 'vitest';
import { NUME_SLUJBE, type Slujba, type ZiSlujba } from './schema';
import { formatIntervalSaptamana } from './date-ro';
import { adaugaZile } from './week';
import { AZI_FIXTURA, ZILE_FIXTURA } from './fixturi';
import {
  etichetaSlujba,
  grupeazaPeSaptamani,
  listaRomaneasca,
  minute,
  punctFinal,
  saptamaniViitoare,
  slujbeInOrdine,
  slujbeLaAceeasiOra,
  urmatoareaSlujba,
} from './schedule';

describe('minute', () => {
  it('numără minutele de la miezul nopții', () => {
    expect(minute('00:00')).toBe(0);
    expect(minute('10:00')).toBe(600);
    expect(minute('23:59')).toBe(1439);
  });

  it('acceptă și ora nepadată, pe care schema o normalizează oricum', () => {
    expect(minute('9:30')).toBe(570);
    expect(minute('09:30')).toBe(570);
  });

  it('ordonează orele numeric, acolo unde textul le-ar ordona invers', () => {
    // Exact inversiunea din care se naște bug-ul: alfabetic, „9:30" vine după
    // „10:00". Numeric, nu.
    expect('9:30' > '10:00').toBe(true);
    expect(minute('9:30') > minute('10:00')).toBe(false);
  });
});

describe('etichetaSlujba', () => {
  it('întoarce numele slujbei', () => {
    expect(etichetaSlujba({ ora: '10:00', slujba: 'Sfânta Liturghie' })).toBe('Sfânta Liturghie');
  });

  it('adaugă detaliul la numele slujbei', () => {
    expect(etichetaSlujba({ ora: '10:00', slujba: 'Sfânta Liturghie', detaliu: 'și Parastas' }))
      .toBe('Sfânta Liturghie și Parastas');
  });

  it('ignoră spațiile din jurul detaliului', () => {
    expect(etichetaSlujba({ ora: '18:30', slujba: 'Acatist', detaliu: '  la Sfântul Nicolae  ' }))
      .toBe('Acatist la Sfântul Nicolae');
  });

  it('pentru „Altceva" folosește detaliul ca nume', () => {
    expect(etichetaSlujba({ ora: '19:00', slujba: 'Altceva', detaliu: 'Cerc de studiu biblic' }))
      .toBe('Cerc de studiu biblic');
  });

  it('nu lasă „Altceva" să apară pe site fără detaliu', () => {
    expect(etichetaSlujba({ ora: '19:00', slujba: 'Altceva' })).toBe('Slujbă');
    expect(etichetaSlujba({ ora: '19:00', slujba: 'Altceva', detaliu: '   ' })).toBe('Slujbă');
  });

  it('nu lasă cuvântul „Altceva" în nicio etichetă', () => {
    // Motivul pentru care funcția aceasta există: „Altceva" este portița din
    // CMS, nu un nume de slujbă. Niciun nume din listă nu are voie să îl scoată
    // pe pagină sau în feed-ul de calendar.
    for (const slujba of NUME_SLUJBE) {
      const detaliu = slujba === 'Altceva' ? 'Cerc de studiu biblic' : undefined;
      expect(etichetaSlujba({ ora: '19:00', slujba, detaliu })).not.toContain('Altceva');
    }
  });
});

describe('diacriticele etichetelor', () => {
  it('folosește virgulă dedesubt, nu sedilă', () => {
    const tot = [
      ...NUME_SLUJBE.map((slujba) => etichetaSlujba({ ora: '10:00', slujba })),
      etichetaSlujba({ ora: '10:00', slujba: 'Sfânta Liturghie', detaliu: 'și Parastas' }),
    ].join('');
    // Sedilele turcești, scrise ca escape-uri pentru ca garda să nu poată fi
    // înfrântă lipind chiar caracterele pe care le respinge:
    // U+015F, U+0163 și majusculele lor U+015E, U+0162.
    expect(tot).not.toMatch(/[\u015F\u0163\u015E\u0162]/);
    // Și dovada că garda are ce prinde, nu că trece fiindcă șirurile scanate
    // s-au dovedit a fi ASCII. Primul vine din NUME_SLUJBE, prin etichetaSlujba.
    expect(tot).toMatch(/\u021B/); // ț, din „Liturghia Darurilor … sfințite"
    expect(tot).toMatch(/\u0219/); // ș, din detaliul „și Parastas"
    // Singurul literal românesc din schedule.ts, afirmat pe codepoint: ă = U+0103.
    expect(etichetaSlujba({ ora: '19:00', slujba: 'Altceva' })).toBe('Slujb\u0103');
  });
});

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

const date = [
  zi('2026-09-14', [['07:30', 'Utrenia'], ['08:30', 'Sfânta Liturghie']]),
  zi('2026-09-16', [['17:00', 'Spovedanie'], ['18:30', 'Acatist']]),
  zi('2026-09-20', [['08:45', 'Utrenia'], ['10:00', 'Sfânta Liturghie']]),
  zi('2026-09-23', [['18:30', 'Acatist']]),
  zi('2026-10-04', [['10:00', 'Sfânta Liturghie']]),
];

describe('grupeazaPeSaptamani', () => {
  it('grupează zilele în săptămâni ISO', () => {
    const s = grupeazaPeSaptamani(date);
    expect(s.map((x) => x.cheie)).toEqual(['2026-W38', '2026-W39', '2026-W40']);
  });

  it('pune limitele corecte pe fiecare săptămână', () => {
    const [prima] = grupeazaPeSaptamani(date);
    expect(prima.luni).toBe('2026-09-14');
    expect(prima.duminica).toBe('2026-09-20');
    expect(prima.zile).toHaveLength(3);
  });

  it('sortează zilele în interiorul săptămânii', () => {
    const s = grupeazaPeSaptamani([date[2], date[0], date[1]]);
    expect(s[0].zile.map((z) => z.data)).toEqual(['2026-09-14', '2026-09-16', '2026-09-20']);
  });

  it('nu modifică lista primită', () => {
    const neordonate = [date[2], date[0], date[1]];
    const ordineaInitiala = [...neordonate];
    grupeazaPeSaptamani(neordonate);
    expect(neordonate).toEqual(ordineaInitiala);
  });

  it('omite săptămânile fără intrări', () => {
    const s = grupeazaPeSaptamani(date);
    expect(s.map((x) => x.cheie)).not.toContain('2026-W41');
  });

  it('întoarce o listă goală pentru date goale', () => {
    expect(grupeazaPeSaptamani([])).toEqual([]);
  });

  it('refuză o zi cu dată inexistentă', () => {
    expect(() => grupeazaPeSaptamani([zi('2026-02-30', [['10:00', 'Utrenia']])]))
      .toThrow(/inexistent/);
  });

  it('păstrează două slujbe diferite care încep la aceeași oră', () => {
    // O seară obișnuită: spovedania se ține în timpul vecerniei. Gruparea nu
    // are voie nici să le contopească, nici să piardă ziua.
    const s = grupeazaPeSaptamani([
      zi('2026-09-16', [['17:00', 'Spovedanie'], ['17:00', 'Vecernie'], ['18:30', 'Acatist']]),
    ]);
    expect(s).toHaveLength(1);
    expect(s[0].zile).toHaveLength(1);
    expect(s[0].zile[0].slujbe.map((x) => [x.ora, x.slujba])).toEqual([
      ['17:00', 'Spovedanie'],
      ['17:00', 'Vecernie'],
      ['18:30', 'Acatist'],
    ]);
  });

  it('grupează după săptămâna ISO, nu după anul calendaristic', () => {
    // 2027-01-03 este duminica săptămânii ISO 2026-W53; 2027-01-05 deja W01.
    const s = grupeazaPeSaptamani([
      zi('2027-01-05', [['18:30', 'Acatist']]),
      zi('2026-12-30', [['18:30', 'Acatist']]),
      zi('2027-01-03', [['10:00', 'Sfânta Liturghie']]),
    ]);
    expect(s.map((x) => x.cheie)).toEqual(['2026-W53', '2027-W01']);
    expect(s[0]).toMatchObject({ luni: '2026-12-28', duminica: '2027-01-03' });
    expect(s[0].zile.map((z) => z.data)).toEqual(['2026-12-30', '2027-01-03']);
    expect(s[1]).toMatchObject({ luni: '2027-01-04', duminica: '2027-01-10' });
  });
});

describe('urmatoareaSlujba', () => {
  it('alege următoarea slujbă din ziua curentă', () => {
    expect(urmatoareaSlujba(date, '2026-09-14', '08:00')).toMatchObject({
      data: '2026-09-14',
      ora: '08:30',
      slujba: 'Sfânta Liturghie',
    });
  });

  it('trece la ziua următoare când ziua curentă s-a încheiat', () => {
    expect(urmatoareaSlujba(date, '2026-09-14', '09:00')).toMatchObject({
      data: '2026-09-16',
      ora: '17:00',
    });
  });

  it('compară orele numeric, nu alfabetic', () => {
    const d = [zi('2026-09-14', [['09:00', 'Utrenia'], ['10:00', 'Sfânta Liturghie']])];
    // Lexicographically '9:00' > '10:00'; numerically it is not.
    expect(urmatoareaSlujba(d, '2026-09-14', '9:30')).toMatchObject({ ora: '10:00' });
  });

  it('caută în ziua cea mai apropiată, oricum ar fi ordonată lista', () => {
    const d = [date[4], date[3], date[1]];
    expect(urmatoareaSlujba(d, '2026-09-15', '00:00')).toMatchObject({ data: '2026-09-16' });
  });

  it('alege cea mai devreme slujbă a zilei fără să reordoneze ziua primită', () => {
    const z = zi('2026-09-16', [['18:30', 'Acatist'], ['17:00', 'Spovedanie']]);
    expect(urmatoareaSlujba([z], '2026-09-16', '00:00')).toMatchObject({ ora: '17:00' });
    expect(z.slujbe.map((s) => s.ora)).toEqual(['18:30', '17:00']);
  });

  it('alege prima slujbă scrisă, când două încep la aceeași oră', () => {
    const z = zi('2026-09-16', [['17:00', 'Spovedanie'], ['17:00', 'Vecernie']]);
    expect(urmatoareaSlujba([z], '2026-09-16', '16:00')).toMatchObject({
      ora: '17:00',
      slujba: 'Spovedanie',
    });
  });

  it('întoarce o slujbă care începe chiar acum', () => {
    expect(urmatoareaSlujba(date, '2026-09-14', '08:30')).toMatchObject({ ora: '08:30' });
  });

  it('sare peste zilele anulate', () => {
    const d = [
      zi('2026-09-16', [['18:30', 'Acatist']], { anulat: true }),
      zi('2026-09-20', [['10:00', 'Sfânta Liturghie']]),
    ];
    expect(urmatoareaSlujba(d, '2026-09-15', '12:00')).toMatchObject({ data: '2026-09-20' });
  });

  it('întoarce null când nu mai urmează nimic', () => {
    expect(urmatoareaSlujba(date, '2027-01-01', '00:00')).toBeNull();
  });

  it('întoarce null pentru date goale', () => {
    expect(urmatoareaSlujba([], '2026-09-14', '08:00')).toBeNull();
  });

  it('refuză o dată invalidă în loc să întoarcă prima slujbă din program', () => {
    // Fără gardă, '15/09/2026' se compară sub orice dată stocată: fiecare zi ar
    // trece de filtru și funcția ar întoarce, sigură pe ea, slujba de la
    // 2026-09-14 07:30. O oră greșită, spusă cu toată convingerea.
    expect(() => urmatoareaSlujba(date, '15/09/2026', '08:00')).toThrow(/invalid/);
    expect(() => urmatoareaSlujba(date, '2026-9-21', '08:00')).toThrow(/invalid/);
    // Prins de verificarea existenței, nu de regex: 30 februarie trece de formă.
    expect(() => urmatoareaSlujba(date, '2026-02-30', '08:00')).toThrow(/inexistent/);
  });
});

describe('saptamaniViitoare', () => {
  it('începe cu săptămâna care conține ziua curentă', () => {
    const s = saptamaniViitoare(date, '2026-09-16', 3);
    expect(s[0].cheie).toBe('2026-W38');
  });

  it('limitează numărul de săptămâni', () => {
    expect(saptamaniViitoare(date, '2026-09-16', 2)).toHaveLength(2);
  });

  it('păstrează întreagă săptămâna curentă, cu tot cu zilele deja trecute', () => {
    const s = saptamaniViitoare(date, '2026-09-20', 1);
    expect(s.map((x) => x.cheie)).toEqual(['2026-W38']);
    expect(s[0].zile.map((z) => z.data)).toEqual(['2026-09-14', '2026-09-16', '2026-09-20']);
  });

  it('exclude săptămânile complet trecute', () => {
    const s = saptamaniViitoare(date, '2026-09-23', 3);
    expect(s.map((x) => x.cheie)).toEqual(['2026-W39', '2026-W40']);
  });

  it('întoarce o listă goală când totul este în trecut', () => {
    expect(saptamaniViitoare(date, '2027-01-01', 3)).toEqual([]);
  });

  it('refuză o dată invalidă, la fel ca urmatoareaSlujba', () => {
    // Cele trei funcții care primesc o dată o resping la fel, ca să nu existe
    // o singură poartă prin care o dată stricată să intre tăcută în pagină.
    expect(() => saptamaniViitoare(date, '15/09/2026', 3)).toThrow(/invalid/);
    expect(() => saptamaniViitoare(date, '2026-02-30', 3)).toThrow(/inexistent/);
  });

  it('întoarce o listă goală pentru un număr de săptămâni nepozitiv', () => {
    expect(saptamaniViitoare(date, '2026-09-16', 0)).toEqual([]);
    // Fără gardă, slice(0, -1) ar tăia ultima săptămână și ar întoarce restul.
    expect(saptamaniViitoare(date, '2026-09-16', -1)).toEqual([]);
  });
});

describe('slujbeLaAceeasiOra', () => {
  const seara = [
    { ora: '17:00', slujba: 'Spovedanie' },
    { ora: '17:00', slujba: 'Vecernie' },
    { ora: '18:30', slujba: 'Paraclisul Maicii Domnului' },
  ] as Slujba[];

  it('întoarce ambele slujbe care încep în același minut', () => {
    expect(slujbeLaAceeasiOra(seara, '17:00').map((s) => s.slujba)).toEqual([
      'Spovedanie',
      'Vecernie',
    ]);
  });

  it('păstrează ordinea în care le-a scris redactorul', () => {
    const invers = [seara[1], seara[0]] as Slujba[];
    expect(slujbeLaAceeasiOra(invers, '17:00').map((s) => s.slujba)).toEqual([
      'Vecernie',
      'Spovedanie',
    ]);
  });

  it('nu ia și slujba de la altă oră', () => {
    expect(slujbeLaAceeasiOra(seara, '18:30').map((s) => s.slujba)).toEqual([
      'Paraclisul Maicii Domnului',
    ]);
  });

  it('compară minute, nu text', () => {
    // Schema normalizează ora înainte ca funcția să o vadă, așa că egalitatea de
    // șiruri ar fi de acord astăzi. Aici se dovedește că acordul nu e o
    // coincidență de padare: „9:30" și „09:30" sunt același minut.
    const nepadat = [{ ora: '9:30', slujba: 'Utrenia' }] as Slujba[];
    expect(slujbeLaAceeasiOra(nepadat, '09:30')).toHaveLength(1);
    expect(slujbeLaAceeasiOra(nepadat, '9:30')).toHaveLength(1);
  });

  it('întoarce o listă goală când nimic nu începe atunci', () => {
    expect(slujbeLaAceeasiOra(seara, '10:00')).toEqual([]);
    expect(slujbeLaAceeasiOra([], '17:00')).toEqual([]);
  });
});

/*
 * The homepage renders `saptamaniViitoare(zile, azi, 3)` and prints each week's
 * own interval under its band. The seed content has entries in a single week,
 * so none of that composition runs on a normal build — it ran only when someone
 * remembered to force it by hand. `ZILE_FIXTURA` makes it run on every test.
 */
describe('fereastra de trei săptămâni a paginii de start', () => {
  const trei = saptamaniViitoare(ZILE_FIXTURA, AZI_FIXTURA, 3);

  it('sare peste săptămâna fără intrări', () => {
    // 2026-W39 lipsește din fixtură și trebuie să lipsească și de aici.
    expect(trei.map((s) => s.cheie)).toEqual(['2026-W38', '2026-W40', '2026-W41']);
  });

  it('numără săptămâni cu intrări, nu săptămâni calendaristice', () => {
    // Trei săptămâni afișate, patru săptămâni de calendar acoperite: de luni 14
    // septembrie până duminică 11 octombrie. De aceea niciun titlu nu are voie
    // să promită „următoarele trei săptămâni" ca interval de date.
    const [prima] = trei;
    const ultima = trei[trei.length - 1];
    expect(trei).toHaveLength(3);
    expect(prima.luni).toBe('2026-09-14');
    expect(ultima.duminica).toBe('2026-10-11');
    // Ultima săptămână începe la trei săptămâni după prima, deci intervalul
    // acoperă patru. Cu `adaugaZile`, nu cu aritmetică pe `Date`: în proiectul
    // ăsta datele calendaristice nu trec niciodată printr-un instant UTC.
    expect(adaugaZile(prima.luni, 21)).toBe(ultima.luni);
  });

  it('dă fiecărei săptămâni intervalul ei, singurul care e adevărat', () => {
    expect(trei.map((s) => formatIntervalSaptamana(s.luni, s.duminica))).toEqual([
      '14 – 20 septembrie 2026',
      '28 septembrie – 4 octombrie 2026',
      '5 – 11 octombrie 2026',
    ]);
  });

  it('exclude săptămâna deja încheiată', () => {
    // 2026-09-09 este în fixtură tocmai ca excluderea să fie dovedită pe date.
    expect(saptamaniViitoare(ZILE_FIXTURA, AZI_FIXTURA, 9).map((s) => s.cheie)).not.toContain(
      '2026-W37',
    );
  });

  it('trece corect peste granița de an', () => {
    const peste = saptamaniViitoare(ZILE_FIXTURA, '2026-12-28', 3);
    expect(peste.map((s) => s.cheie)).toEqual(['2026-W53', '2027-W01']);
    expect(peste.map((s) => formatIntervalSaptamana(s.luni, s.duminica))).toEqual([
      '28 decembrie 2026 – 3 ianuarie 2027',
      '4 – 10 ianuarie 2027',
    ]);
  });

  it('cheile sunt ordonate lexical, cum le va compara selectorul din Task 10', () => {
    const chei = saptamaniViitoare(ZILE_FIXTURA, AZI_FIXTURA, 9).map((s) => s.cheie);
    expect(chei).toEqual([...chei].sort());
  });

  it('cardul „următoarea slujbă" numește ambele slujbe de la 17:00', () => {
    const u = urmatoareaSlujba(ZILE_FIXTURA, AZI_FIXTURA, '09:00');
    expect(u).not.toBeNull();
    expect(u?.data).toBe('2026-09-16');
    expect(u?.ora).toBe('17:00');
    const ziua = ZILE_FIXTURA.find((z) => z.data === u?.data);
    expect(slujbeLaAceeasiOra(ziua?.slujbe ?? [], u!.ora).map(etichetaSlujba)).toEqual([
      'Spovedanie',
      'Vecernie',
    ]);
  });

  it('sare peste ziua anulată în întregime', () => {
    // 2026-10-04 este anulată și își păstrează ora; cardul trebuie să treacă la
    // 7 octombrie, nu să anunțe o slujbă care nu are loc.
    const u = urmatoareaSlujba(ZILE_FIXTURA, '2026-10-04', '00:00');
    expect(u?.data).toBe('2026-10-07');
  });
});

/*
 * `ziSchema` neither sorts a day's services nor requires them sorted, so the
 * order in the YAML is whatever the volunteer typed. `urmatoareaSlujba` and
 * `ics.ts` have always sorted their own copy; the two pages did not, and both
 * read the schedule through `grupeazaPeSaptamani`.
 */
describe('ordinea slujbelor dintr-o zi', () => {
  const ziuaNeordonata = ZILE_FIXTURA.find((z) => z.data === '2026-09-16')!;

  it('control: fixtura chiar este neordonată', () => {
    // Fără asta, testele de mai jos ar putea trece fiindcă nu au ce sorta.
    expect(ziuaNeordonata.slujbe.map((s) => s.ora)).toEqual(['18:30', '17:00', '17:00']);
  });

  it('slujbeInOrdine le pune în ordinea în care se întâmplă', () => {
    expect(slujbeInOrdine(ziuaNeordonata.slujbe).map((s) => s.ora)).toEqual([
      '17:00',
      '17:00',
      '18:30',
    ]);
  });

  it('păstrează perechea de la aceeași oră în ordinea redactorului', () => {
    // Sortarea e stabilă din ES2019. Spovedania scrisă înaintea vecerniei
    // rămâne înaintea ei: a le inversa ar fi o decizie pe care codul nu o poate
    // lua, fiindcă nu vede ce înseamnă perechea.
    expect(slujbeInOrdine(ziuaNeordonata.slujbe).map((s) => s.slujba)).toEqual([
      'Spovedanie',
      'Vecernie',
      'Paraclisul Maicii Domnului',
    ]);
  });

  it('nu modifică lista primită', () => {
    const inainteDeSortare = [...ziuaNeordonata.slujbe];
    slujbeInOrdine(ziuaNeordonata.slujbe);
    expect(ziuaNeordonata.slujbe).toEqual(inainteDeSortare);
  });

  it('ambele pagini o primesc ordonată, fiindcă amândouă citesc prin grupare', () => {
    // /program/ cheamă grupeazaPeSaptamani direct, pagina de start prin
    // saptamaniViitoare. Un singur loc le acoperă pe amândouă.
    const prinGrupare = grupeazaPeSaptamani(ZILE_FIXTURA)
      .flatMap((s) => s.zile)
      .find((z) => z.data === '2026-09-16');
    const prinFereastra = saptamaniViitoare(ZILE_FIXTURA, AZI_FIXTURA, 3)
      .flatMap((s) => s.zile)
      .find((z) => z.data === '2026-09-16');
    expect(prinGrupare?.slujbe.map((s) => s.ora)).toEqual(['17:00', '17:00', '18:30']);
    expect(prinFereastra?.slujbe.map((s) => s.ora)).toEqual(['17:00', '17:00', '18:30']);
  });

  it('gruparea nu strică ziua originală din colecție', () => {
    grupeazaPeSaptamani(ZILE_FIXTURA);
    expect(ziuaNeordonata.slujbe.map((s) => s.ora)).toEqual(['18:30', '17:00', '17:00']);
  });
});

describe('punctFinal', () => {
  it('adaugă punctul când valoarea nu are unul', () => {
    expect(punctFinal('Capela Sf. Gallus, Winterthur')).toBe('.');
    expect(punctFinal('Winterthur')).toBe('.');
  });

  it('nu adaugă al doilea punct', () => {
    // Bug-ul: „Slujbele acestei zile au loc la Winterthur.." — două puncte,
    // fiindcă și redactorul și propoziția pun câte unul.
    expect(punctFinal('Winterthur.')).toBe('');
    expect(punctFinal('Capela Sf. Gallus, Winterthur.')).toBe('');
  });

  it('tratează și punctele de suspensie ca sfârșit de propoziție', () => {
    expect(punctFinal('și altele…')).toBe('');
  });

  it('nu ghicește pentru semnul exclamării sau al întrebării', () => {
    // Nimic din proiect nu compune o propoziție în jurul unei valori care s-ar
    // putea termina așa; a le trata ca terminatori ar fi o presupunere.
    expect(punctFinal('Winterthur!')).toBe('.');
    expect(punctFinal('Winterthur?')).toBe('.');
  });

  it('pune punct după un șir gol, fără să arunce', () => {
    expect(punctFinal('')).toBe('.');
  });

  it('locația din fixtură se termină cu punct, ca să fie ce trebuie de pinuit', () => {
    // Control: dacă cineva „curăță" fixtura, testul de mai jos nu mai dovedește
    // nimic, așa că valoarea e afirmată explicit.
    const zi = ZILE_FIXTURA.find((z) => z.data === '2026-09-30');
    expect(zi?.locatie).toBe('Capela Sf. Gallus, Winterthur.');
    expect(punctFinal(zi!.locatie!)).toBe('');
  });

  it('schema nu taie punctul din fixtură, oricât ar trece prin grupare', () => {
    // ics.ts scrie exact valoarea asta în LOCATION; pagina e cea care omite
    // punctul ei, nu datele.
    const prinGrupare = grupeazaPeSaptamani(ZILE_FIXTURA)
      .flatMap((s) => s.zile)
      .find((z) => z.data === '2026-09-30');
    expect(prinGrupare?.locatie).toBe('Capela Sf. Gallus, Winterthur.');
  });
});

describe('listaRomaneasca', () => {
  /*
   * Această funcție era o expresie scrisă direct în `index.astro`. Din Task 10
   * cardul „următoarea slujbă" se recalculează și în browser, așa că expresia ar
   * fi existat în două locuri — exact forma în care au ajuns să se contrazică
   * cele trei sortări pe care le-a unificat `slujbeInOrdine`.
   */
  it('un singur nume rămâne neatins', () => {
    expect(listaRomaneasca(['Vecernie'])).toBe('Vecernie');
  });

  it('două nume se leagă cu „și", fără virgulă', () => {
    expect(listaRomaneasca(['Spovedanie', 'Vecernie'])).toBe('Spovedanie și Vecernie');
  });

  it('trei nume: virgulă între primele, „și" înaintea ultimului', () => {
    expect(listaRomaneasca(['Utrenia', 'Spovedanie', 'Vecernie'])).toBe(
      'Utrenia, Spovedanie și Vecernie',
    );
  });

  it('lista goală dă șirul gol, nu „undefined"', () => {
    // Pagina nu randează cardul fără o slujbă următoare, dar o funcție care
    // întoarce `undefined` pune cuvântul „undefined" pe pagină în ziua în care
    // se schimbă paza de deasupra ei.
    expect(listaRomaneasca([])).toBe('');
  });

  it('nu pune sedilă în legătură', () => {
    // Legătura este „și": s cu virgulă dedesubt, U+0219. Garda e scrisă pe
    // codepoint, nu pe glifă, ca fișierul să rămână scanabil pentru sedile.
    const legat = listaRomaneasca(['A', 'B']);
    expect(legat).not.toMatch(/[\u015F\u0163\u015E\u0162]/);
    expect(legat).toMatch(/\u0219/);
  });
});
