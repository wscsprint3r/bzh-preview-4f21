import { describe, expect, it } from 'vitest';
import { NUME_SLUJBE, type ZiSlujba } from './schema';
import {
  etichetaSlujba,
  grupeazaPeSaptamani,
  minute,
  saptamaniViitoare,
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

  it('întoarce o listă goală pentru un număr de săptămâni nepozitiv', () => {
    expect(saptamaniViitoare(date, '2026-09-16', 0)).toEqual([]);
    // Fără gardă, slice(0, -1) ar tăia ultima săptămână și ar întoarce restul.
    expect(saptamaniViitoare(date, '2026-09-16', -1)).toEqual([]);
  });
});
