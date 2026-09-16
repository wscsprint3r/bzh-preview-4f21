import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { NUME_SLUJBE, idDinNumeFisier, slujbaSchema, ziSchema } from './schema';

const valid = {
  praznic: 'Înălțarea Sfintei Cruci',
  praznic_mare: true,
  zi_de_post: true,
  slujbe: [
    { ora: '07:30', slujba: 'Utrenia' },
    { ora: '08:30', slujba: 'Sfânta Liturghie' },
  ],
};

describe('ziSchema', () => {
  it('acceptă o zi completă', () => {
    expect(ziSchema.safeParse(valid).success).toBe(true);
  });

  it('acceptă o zi minimă', () => {
    const r = ziSchema.safeParse({ slujbe: [{ ora: '10:00', slujba: 'Sfânta Liturghie' }] });
    expect(r.success).toBe(true);
  });

  it('pune valori implicite pentru steaguri', () => {
    const r = ziSchema.parse({ slujbe: [{ ora: '10:00', slujba: 'Sfânta Liturghie' }] });
    expect(r.zi_de_post).toBe(false);
    expect(r.praznic_mare).toBe(false);
    expect(r.anulat).toBe(false);
  });

  it('respinge o oră fără două puncte', () => {
    const r = ziSchema.safeParse({ slujbe: [{ ora: '0830', slujba: 'Utrenia' }] });
    expect(r.success).toBe(false);
  });

  it('respinge o oră imposibilă', () => {
    const r = ziSchema.safeParse({ slujbe: [{ ora: '25:00', slujba: 'Utrenia' }] });
    expect(r.success).toBe(false);
  });

  it('acceptă ora fără zero la început', () => {
    const r = ziSchema.safeParse({ slujbe: [{ ora: '7:30', slujba: 'Utrenia' }] });
    expect(r.success).toBe(true);
  });

  it('respinge o zi fără slujbe', () => {
    const r = ziSchema.safeParse({ slujbe: [] });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toContain('cel puțin o slujbă');
    }
  });

  it('respinge o zi anulată fără slujbe, ca anularea să ajungă la abonați', () => {
    // Spec §8: o zi anulată emite STATUS:CANCELLED în loc să dispară. Dar
    // feed-ul scrie câte un eveniment pe slujbă, așa că o zi anulată rămasă
    // fără ore nu emite nimic: abonatul păstrează vechiul program în calendar,
    // nu află de anulare și vine la o biserică încuiată. Orele rămân, steagul
    // duce anularea.
    const r = ziSchema.safeParse({ slujbe: [], anulat: true, note: 'Părintele este plecat' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toContain('păstrați orele');
    }
  });

  it('respinge praznic_mare fără praznic', () => {
    const r = ziSchema.safeParse({
      praznic_mare: true,
      slujbe: [{ ora: '10:00', slujba: 'Sfânta Liturghie' }],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toContain('numele praznicului');
    }
  });

  it('respinge o slujbă necunoscută', () => {
    const r = ziSchema.safeParse({ slujbe: [{ ora: '10:00', slujba: 'Brunch' }] });
    expect(r.success).toBe(false);
  });

  it('respinge Altceva fără detaliu', () => {
    // "Altceva" is the escape hatch for a service not on the dropdown. Without
    // `detaliu` the word "Altceva" itself is what a visitor would read.
    const r = ziSchema.safeParse({ slujbe: [{ ora: '10:00', slujba: 'Altceva' }] });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toContain('detaliu');
    }
  });

  it('respinge Altceva cu detaliu gol', () => {
    const r = ziSchema.safeParse({ slujbe: [{ ora: '10:00', slujba: 'Altceva', detaliu: '   ' }] });
    expect(r.success).toBe(false);
  });

  it('acceptă Altceva cu detaliu', () => {
    const r = ziSchema.safeParse({
      slujbe: [{ ora: '10:00', slujba: 'Altceva', detaliu: 'Sfințirea apei' }],
    });
    expect(r.success).toBe(true);
  });

  it('respinge aceeași slujbă de două ori la aceeași oră', () => {
    const r = ziSchema.safeParse({
      slujbe: [
        { ora: '17:00', slujba: 'Spovedanie' },
        { ora: '17:00', slujba: 'Spovedanie' },
      ],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toContain('de două ori');
    }
  });

  it('acceptă două slujbe diferite la aceeași oră', () => {
    // Confession runs during vespers - an ordinary parish arrangement, and the
    // reason this rule is narrower than "one service per time slot".
    const r = ziSchema.safeParse({
      slujbe: [
        { ora: '17:00', slujba: 'Spovedanie' },
        { ora: '17:00', slujba: 'Vecernie' },
      ],
    });
    expect(r.success).toBe(true);
  });

  it('prinde duplicatul chiar dacă ora este scrisă diferit', () => {
    // `7:30` and `07:30` are normalised before the duplicate check runs, so the
    // rule cannot be sidestepped by typing the hour differently.
    const r = ziSchema.safeParse({
      slujbe: [
        { ora: '7:30', slujba: 'Utrenia' },
        { ora: '07:30', slujba: 'Utrenia' },
      ],
    });
    expect(r.success).toBe(false);
  });

  it('normalizează ora la două cifre', () => {
    const r = ziSchema.parse({ slujbe: [{ ora: '7:30', slujba: 'Utrenia' }] });
    expect(r.slujbe[0].ora).toBe('07:30');
  });

  it('lasă ora canonică neschimbată', () => {
    const r = ziSchema.parse({ slujbe: [{ ora: '07:30', slujba: 'Utrenia' }] });
    expect(r.slujbe[0].ora).toBe('07:30');
  });

  it('respinge o cheie necunoscută în zi', () => {
    // The quiet failure this exists to stop: `praznicmare` never becomes
    // `praznic_mare`, so the day silently loses its feast styling.
    const r = ziSchema.safeParse({
      praznicmare: true,
      slujbe: [{ ora: '10:00', slujba: 'Sfânta Liturghie' }],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toContain('Câmp necunoscut');
      expect(r.error.issues[0].message).toContain('praznicmare');
    }
  });

  it('respinge o cheie necunoscută într-o slujbă', () => {
    const r = ziSchema.safeParse({
      slujbe: [{ ora: '10:00', slujba: 'Sfânta Liturghie', slujbaa: 'Utrenia' }],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toContain('slujbaa');
    }
  });

  // Deliberate, not an oversight, and the reasoning is in schema.ts above
  // `ziSchema`: declaring `$schema` in the shape fails EVERY build, because
  // Astro calls `.extend({ $schema })` and Zod 4 will not overwrite an existing
  // key on a schema that carries refinements. This test exists so that anyone
  // who "fixes" it by adding the key gets a red test pointing at that comment,
  // rather than a red build pointing into Zod's internals.
  it('respinge $schema, deși editoarele îl pot scrie', () => {
    const r = ziSchema.safeParse({
      $schema: '../../../.astro/collections/slujbe.schema.json',
      slujbe: [{ ora: '10:00', slujba: 'Sfânta Liturghie' }],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toContain('$schema');
    }
  });
});

describe('idDinNumeFisier', () => {
  it('acceptă un nume de fișier corect', () => {
    expect(idDinNumeFisier('2026-09-14.yml')).toBe('2026-09-14');
  });

  it('respinge o dată inexistentă', () => {
    // The whole reason this reuses partiData rather than trusting the regex:
    // 2026-02-30 matches \d{4}-\d{2}-\d{2} but is not a day.
    expect(() => idDinNumeFisier('2026-02-30.yml')).toThrow();
  });

  it('respinge o lună imposibilă', () => {
    expect(() => idDinNumeFisier('2026-13-01.yml')).toThrow();
  });

  it('respinge o dată fără zero la început', () => {
    expect(() => idDinNumeFisier('2026-9-21.yml')).toThrow();
  });

  it('respinge extensia .yaml', () => {
    expect(() => idDinNumeFisier('2026-09-14.yaml')).toThrow();
  });

  it('respinge un fișier dintr-un subdirector', () => {
    expect(() => idDinNumeFisier('arhiva/2026-09-14.yml')).toThrow();
  });

  it('respinge un nume care nu este o dată', () => {
    expect(() => idDinNumeFisier('program.yml')).toThrow();
  });

  it('numește fișierul respins în mesaj', () => {
    // Without the filename the build error would not say which file to fix.
    expect(() => idDinNumeFisier('program.yml')).toThrow(/program\.yml/);
  });

  it('numește fișierul și când data nu există', () => {
    // partiData alone names only the date, and points its stack at date-ro.ts.
    expect(() => idDinNumeFisier('2026-02-30.yml')).toThrow(/2026-02-30\.yml/);
  });
});

/** The messages the schema actually emits, rather than a copy of them. */
function mesaje(input: unknown): string[] {
  const r = ziSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => i.message);
}

/** Likewise for the messages thrown rather than returned as Zod issues. */
function mesajAruncat(fn: () => unknown): string {
  try {
    fn();
    return '';
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

describe('diacritice', () => {
  it('scrie numele slujbelor cu exact codepoint-urile corecte', () => {
    // Written as escapes deliberately: a look-alike glyph in the expectation
    // would silently agree with a corrupted table. This list is also mirrored
    // into the CMS dropdown, so a wrong character here reaches the editor and
    // from there every page that groups services by name.
    expect(NUME_SLUJBE).toEqual([
      'Utrenia',
      'Sf\u00E2nta Liturghie', // U+00E2 a-circumflex
      'Vecernie',
      'Spovedanie',
      'Acatist',
      'Paraclisul Maicii Domnului',
      'Sf\u00E2ntul Maslu',
      'Litie',
      'Parastas',
      'Priveghere',
      'Denie',
      // U+00EE i-circumflex, U+021B t-comma-below - never U+0163
      'Liturghia Darurilor mai \u00EEnainte sfin\u021Bite',
      'Botez',
      'Cununie',
      'Altceva',
    ]);
  });

  it('folosește virgulă dedesubt, nu sedilă', () => {
    const tot = [
      ...NUME_SLUJBE,
      ...mesaje({ slujbe: [{ ora: '0830', slujba: 'Utrenia' }] }),
      ...mesaje({ slujbe: [] }),
      ...mesaje({ praznic_mare: true, slujbe: [{ ora: '10:00', slujba: 'Sf\u00E2nta Liturghie' }] }),
      ...mesaje({ praznicmare: true, slujbe: [{ ora: '10:00', slujba: 'Utrenia' }] }),
      ...mesaje({ slujbe: [{ ora: '10:00', slujba: 'Altceva' }] }),
      ...mesaje({
        slujbe: [
          { ora: '17:00', slujba: 'Utrenia' },
          { ora: '17:00', slujba: 'Utrenia' },
        ],
      }),
      mesajAruncat(() => idDinNumeFisier('program.yml')),
      mesajAruncat(() => idDinNumeFisier('2026-02-30.yml')),
    ].join('');
    // The Turkish cedilla look-alikes, written as escapes so that this guard
    // cannot be defeated by pasting the very characters it is meant to reject:
    // U+015F, U+0163 and their capitals U+015E, U+0162.
    expect(tot).not.toMatch(/[\u015F\u0163\u015E\u0162]/);
    // And prove the guard has something to catch, rather than passing because
    // the strings it scans turned out to be empty.
    expect(tot).toMatch(/\u0219/); // ș, in "și numele praznicului"
    expect(tot).toMatch(/\u021B/); // ț, in "cel puțin" and "sfințite"
  });
});

describe('locatie, normalizată la graniță', () => {
  const loc = (locatie: unknown) =>
    ziSchema.parse({ locatie, slujbe: [{ ora: '10:00', slujba: 'Utrenia' }] }).locatie;

  it('taie spațiile din jur', () => {
    expect(loc('  Capela Sf. Gallus, Winterthur  ')).toBe('Capela Sf. Gallus, Winterthur');
  });

  it('transformă un câmp doar cu spații în ceva fals', () => {
    // Altfel pagina ar scrie „…au loc la  ." iar ics.ts ar pune spații în
    // LOCATION în loc să cadă pe adresa parohiei.
    expect(loc('   ')).toBe('');
    expect(Boolean(loc('   '))).toBe(false);
  });

  it('NU taie punctul final — acela se rezolvă la compunerea propoziției', () => {
    // Regula: normalizezi pentru afișare la momentul afișării; nu modifici
    // datele stocate ca să arate bine. Tăierea punctului ar pierde informație
    // („Capela Sf." ar deveni „Capela Sf") și ar schimba ce scrie ics.ts în
    // LOCATION, care e dată păstrată de clientul de calendar, nu propoziție.
    expect(loc('Capela Sf. Gallus, Winterthur.')).toBe('Capela Sf. Gallus, Winterthur.');
    expect(loc('Winterthur.')).toBe('Winterthur.');
    expect(loc('Capela Sf.')).toBe('Capela Sf.');
  });

  it('lasă lipsa neatinsă', () => {
    expect(ziSchema.parse({ slujbe: [{ ora: '10:00', slujba: 'Utrenia' }] }).locatie).toBeUndefined();
  });
});


/*
 * ---------------------------------------------------------------------------
 * THE CMS FORM, CHECKED AGAINST THIS SCHEMA.
 *
 * `public/admin/config.yml` is the form a parish volunteer fills in, and two of
 * its rules are copies of rules in `schema.ts`: the list of service names, and
 * the shape of a time. A copy that drifts is worse than no copy at all - the
 * dropdown offers a name the build then rejects, or the time field accepts a
 * spelling the schema refuses. Either way the failed build belongs to the
 * volunteer, for picking an option we gave them.
 *
 * THE EXPECTED VALUES COME FROM `./schema`, which `config.yml` cannot edit.
 *
 * READ WITH A YAML PARSER, AND ADDRESSED BY FIELD NAME. Scanning for a line
 * reading `options:` takes the FIRST one in the file, so adding any other
 * `options:` above this one would move the test onto a different list while it
 * went on passing - the same shape as the three `.ics` guards that let the
 * artefact nominate its own subject. Every step of the path below throws by
 * name if it is missing, so a renamed field fails loudly instead of comparing
 * against `undefined`.
 * ---------------------------------------------------------------------------
 */

interface CampCms {
  name: string;
  widget?: string;
  options?: unknown;
  pattern?: unknown;
  fields?: CampCms[];
}

interface ColectieCms {
  name: string;
  slug?: string;
  identifier_field?: string;
  fields: CampCms[];
}

const CONFIG_CMS = parse(
  readFileSync(fileURLToPath(new URL('../../public/admin/config.yml', import.meta.url)), 'utf8'),
) as { collections?: ColectieCms[] };

function colectie(nume: string): ColectieCms {
  const gasita = CONFIG_CMS.collections?.find((c) => c.name === nume);
  if (!gasita) throw new Error(`config.yml nu conține colecția "${nume}"`);
  return gasita;
}

function camp(campuri: CampCms[] | undefined, nume: string): CampCms {
  const gasit = campuri?.find((c) => c.name === nume);
  if (!gasit) throw new Error(`config.yml nu conține câmpul "${nume}"`);
  return gasit;
}

const SLUJBE = colectie('slujbe');
const CAMP_SLUJBA = camp(camp(SLUJBE.fields, 'slujbe').fields, 'slujba');
const CAMP_ORA = camp(camp(SLUJBE.fields, 'slujbe').fields, 'ora');

describe('configurația CMS', () => {
  it('oferă exact aceleași slujbe ca schema', () => {
    // O singură egalitate prinde tot ce contează: o opțiune lipsă, una în plus,
    // o greșeală de scriere și o reordonare.
    expect(CAMP_SLUJBA.options).toEqual([...NUME_SLUJBE]);
  });

  /*
   * Aceeași grijă pentru oră, dar prin COMPORTAMENT, nu prin text. Două
   * expresii regulate pot fi scrise altfel și să însemne același lucru, iar un
   * test care compară șirurile ar pica pentru o rescriere inofensivă și ar trece
   * pentru o diferență reală ascunsă într-o clasă de caractere. Aici se compară
   * verdictele: pentru fiecare oră de mai jos, tiparul din CMS și schema trebuie
   * să spună același lucru.
   */
  it('acceptă exact aceleași ore ca schema', () => {
    const tipar = (CAMP_ORA.pattern as [string, string])[0];
    const dinCms = new RegExp(tipar);
    const ore = [
      '08:30', '8:30', '7:30', '00:00', '23:59', '0:00', '19:05',
      '0830', '25:00', '24:00', '12:60', '8:5', '008:30', '08:30 ', ' 08:30', '', 'zece',
    ];
    const verdicte = ore.map((ora) => ({
      ora,
      cms: dinCms.test(ora),
      schema: slujbaSchema.safeParse({ ora, slujba: 'Utrenia' }).success,
    }));
    // Controlul pozitiv: dacă tabelul ar fi doar ore bune sau doar ore rele,
    // „amândouă spun la fel" nu ar mai însemna nimic.
    expect(verdicte.some((v) => v.schema)).toBe(true);
    expect(verdicte.some((v) => !v.schema)).toBe(true);
    for (const v of verdicte) {
      expect(v.cms, `ora ${JSON.stringify(v.ora)}`).toBe(v.schema);
    }
  });

  /*
   * Numele fișierului este cheia primară a colecției, iar acesta este locul din
   * care CMS-ul o compune. Fără `slug`, Sveltia numește fișierul după
   * `identifier_field`; fără niciunul, după un șir aleator - și
   * `idDinNumeFisier` respinge fiecare fișier pe care l-ar scrie.
   */
  it('numește fișierul după data zilei', () => {
    expect(SLUJBE.slug).toBe('{{fields.data}}');
    expect(SLUJBE.identifier_field).toBe('data');
    // Și câmpul pe care îl numesc amândouă chiar există, cu widget de dată.
    expect(camp(SLUJBE.fields, 'data').widget).toBe('datetime');
  });

  /*
   * MULȚIMEA CÂMPURILOR ESTE ÎNCHISĂ, în amândouă sensurile, fiindcă fiecare
   * sens strică altceva:
   *
   * - un câmp în formular pe care schema nu îl are: `ziSchema` este strict, deci
   *   prima zi publicată pică build-ul cu „Câmp necunoscut".
   * - un câmp în schemă pe care formularul nu îl are: câmpul nu mai poate fi
   *   completat de nimeni prin `/admin/`. Nimic nu pică, nimeni nu află, iar
   *   `locatie` sau `anulat` pur și simplu nu se mai pot pune - exact felul de
   *   pierdere tăcută pentru care există toată munca asta.
   *
   * Mulțimea așteptată se ia din `.shape`-ul schemei, nu dintr-o listă scrisă cu
   * mâna aici: o listă ar trebui ținută la zi în două locuri și ar rămâne în
   * urmă exact ca lista de slujbe.
   */
  it('are exact câmpurile schemei, nici unul în plus, nici unul în minus', () => {
    const numeCampuri = (c: CampCms[] | undefined) => (c ?? []).map((x) => x.name).sort();
    expect(numeCampuri(SLUJBE.fields)).toEqual(Object.keys(ziSchema.shape).sort());
    expect(numeCampuri(camp(SLUJBE.fields, 'slujbe').fields)).toEqual(
      Object.keys(slujbaSchema.shape).sort(),
    );
    // Controlul pozitiv: dacă `.shape` s-ar goli vreodată, egalitățile de mai
    // sus ar fi mulțumite de un formular fără niciun câmp.
    expect(Object.keys(ziSchema.shape).length).toBeGreaterThan(5);
    expect(Object.keys(slujbaSchema.shape).length).toBeGreaterThan(2);
  });
});

/*
 * ---------------------------------------------------------------------------
 * THE DATE IN THE FILE AGAINST THE DATE IN ITS NAME.
 *
 * The CMS writes `data:` into every file it creates, because that is the field
 * it names the file after. The two can come apart, and when they do nothing
 * downstream notices: every consumer builds its day as `{ ...e.data, data: e.id }`
 * with the filename last. So the correction a volunteer makes to a wrong date
 * would change the file and not the site.
 * ---------------------------------------------------------------------------
 */
describe('data din fișier față de data din nume', () => {
  it('acceptă un fișier care spune aceeași dată ca numele lui', () => {
    expect(idDinNumeFisier('2026-09-14.yml', { data: '2026-09-14' })).toBe('2026-09-14');
  });

  it('acceptă un fișier scris de mână, fără câmpul data', () => {
    expect(idDinNumeFisier('2026-09-14.yml', { praznic: 'Ceva' })).toBe('2026-09-14');
    expect(idDinNumeFisier('2026-09-14.yml')).toBe('2026-09-14');
  });

  /*
   * Mesajul trebuie să spună și CARE dintre cele două se schimbă. Nimic din cod
   * nu poate ști care dată este cea bună, deci mesajul le numește pe amândouă,
   * spune care dintre ele decide ce apare pe site și dă câte un leac pentru
   * fiecare sens. „Faceți-le să coincidă" ar lăsa cititorul să ghicească ce
   * jumătate să modifice, iar ghicitul greșit înseamnă o slujbă în ziua greșită.
   */
  it('respinge un fișier cu două date diferite, numind-o pe fiecare', () => {
    const cadere = () => idDinNumeFisier('2026-09-14.yml', { data: '2026-09-21' });
    expect(cadere).toThrow(/2026-09-14/); // data din nume
    expect(cadere).toThrow(/2026-09-21/); // data dinăuntru
    expect(cadere).toThrow(/numele fișierului este cel care decide/i);
    expect(cadere).toThrow(/ștergeți-o din administrare/i); // leacul dacă ziua e cea dinăuntru
    expect(cadere).toThrow(/puneți la loc/i); // leacul dacă ziua e cea din nume
  });

  /*
   * Data fără ghilimele este o greșeală cu alt leac decât cealaltă, deci are alt
   * mesaj: YAML citește `data: 2026-09-14` ca dată calendaristică, nu ca text,
   * iar `config.yml` cere de aceea `output.yaml.quote: double`.
   */
  it('respinge o dată scrisă fără ghilimele, cerând ghilimelele', () => {
    const cadere = () => idDinNumeFisier('2026-09-14.yml', { data: new Date('2026-09-14') });
    expect(cadere).toThrow(/ghilimele/);
  });

  it('judecă numele înaintea conținutului', () => {
    // Un nume imposibil pică pentru numele lui, nu pentru ce scrie înăuntru.
    expect(() => idDinNumeFisier('2026-02-30.yml', { data: '2026-02-30' })).toThrow(/nu există/);
  });

  it('schema acceptă ziua exact așa cum o scrie CMS-ul', () => {
    // O reconstrucție a fișierului, nu fișierul însuși: nimic de aici nu poate
    // rula Sveltia. Ce dovedește este că forma pe care o descrie `config.yml` -
    // `data` prezent, orele ca text, o slujbă din listă - trece prin schemă.
    const brut = parse('data: "2026-09-14"\nslujbe:\n  - ora: "07:30"\n    slujba: "Utrenia"\n');
    const r = ziSchema.safeParse(brut);
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
    expect(idDinNumeFisier('2026-09-14.yml', brut as Record<string, unknown>)).toBe('2026-09-14');
  });

  it('respinge o dată de altă formă în câmpul data', () => {
    expect(ziSchema.safeParse({ data: '14.09.2026', slujbe: [{ ora: '07:30', slujba: 'Utrenia' }] }).success).toBe(false);
  });
});
