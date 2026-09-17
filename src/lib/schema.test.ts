import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { SERVICE_NAMES, idFromFilename, serviceSchema, daySchema } from './schema';

const valid = {
  feast: 'Înălțarea Sfintei Cruci',
  great_feast: true,
  fast_day: true,
  services: [
    { time: '07:30', service: 'Utrenia' },
    { time: '08:30', service: 'Sfânta Liturghie' },
  ],
};

describe('daySchema', () => {
  it('accepts a complete day', () => {
    expect(daySchema.safeParse(valid).success).toBe(true);
  });

  it('accepts a minimal day', () => {
    const r = daySchema.safeParse({ services: [{ time: '10:00', service: 'Sfânta Liturghie' }] });
    expect(r.success).toBe(true);
  });

  it('applies defaults for the flags', () => {
    const r = daySchema.parse({ services: [{ time: '10:00', service: 'Sfânta Liturghie' }] });
    expect(r.fast_day).toBe(false);
    expect(r.great_feast).toBe(false);
    expect(r.cancelled).toBe(false);
  });

  it('rejects a time with no colon', () => {
    const r = daySchema.safeParse({ services: [{ time: '0830', service: 'Utrenia' }] });
    expect(r.success).toBe(false);
  });

  it('rejects an impossible time', () => {
    const r = daySchema.safeParse({ services: [{ time: '25:00', service: 'Utrenia' }] });
    expect(r.success).toBe(false);
  });

  it('accepts a time with no leading zero', () => {
    const r = daySchema.safeParse({ services: [{ time: '7:30', service: 'Utrenia' }] });
    expect(r.success).toBe(true);
  });

  it('rejects a day with no services', () => {
    const r = daySchema.safeParse({ services: [] });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toContain('cel puțin o slujbă');
    }
  });

  it('rejects a cancelled day with no services, so the cancellation reaches subscribers', () => {
    // Spec §8: o zi anulată emite STATUS:CANCELLED în loc să dispară. Dar
    // feed-ul scrie câte un eveniment pe slujbă, așa că o zi anulată rămasă
    // fără ore nu emite nimic: abonatul păstrează vechiul program în calendar,
    // nu află de anulare și vine la o biserică încuiată. Orele rămân, steagul
    // duce anularea.
    const r = daySchema.safeParse({ services: [], cancelled: true, notes: 'Părintele este plecat' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toContain('păstrați orele');
    }
  });

  it('rejects great_feast without feast', () => {
    const r = daySchema.safeParse({
      great_feast: true,
      services: [{ time: '10:00', service: 'Sfânta Liturghie' }],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toContain('numele praznicului');
    }
  });

  it('rejects an unknown service', () => {
    const r = daySchema.safeParse({ services: [{ time: '10:00', service: 'Brunch' }] });
    expect(r.success).toBe(false);
  });

  it('rejects Altceva with no detail', () => {
    // "Altceva" is the escape hatch for a service not on the dropdown. Without
    // `detail` the word "Altceva" itself is what a visitor would read.
    const r = daySchema.safeParse({ services: [{ time: '10:00', service: 'Altceva' }] });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toContain('detaliu');
    }
  });

  it('rejects Altceva with an empty detail', () => {
    const r = daySchema.safeParse({ services: [{ time: '10:00', service: 'Altceva', detail: '   ' }] });
    expect(r.success).toBe(false);
  });

  it('accepts Altceva with a detail', () => {
    const r = daySchema.safeParse({
      services: [{ time: '10:00', service: 'Altceva', detail: 'Sfințirea apei' }],
    });
    expect(r.success).toBe(true);
  });

  it('rejects the same service twice at the same time', () => {
    const r = daySchema.safeParse({
      services: [
        { time: '17:00', service: 'Spovedanie' },
        { time: '17:00', service: 'Spovedanie' },
      ],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toContain('de două ori');
    }
  });

  it('accepts two different services at the same time', () => {
    // Confession runs during vespers - an ordinary parish arrangement, and the
    // reason this rule is narrower than "one service per time slot".
    const r = daySchema.safeParse({
      services: [
        { time: '17:00', service: 'Spovedanie' },
        { time: '17:00', service: 'Vecernie' },
      ],
    });
    expect(r.success).toBe(true);
  });

  it('catches the duplicate even when the time is spelled differently', () => {
    // `7:30` and `07:30` are normalised before the duplicate check runs, so the
    // rule cannot be sidestepped by typing the hour differently.
    const r = daySchema.safeParse({
      services: [
        { time: '7:30', service: 'Utrenia' },
        { time: '07:30', service: 'Utrenia' },
      ],
    });
    expect(r.success).toBe(false);
  });

  it('normalises the time to two digits', () => {
    const r = daySchema.parse({ services: [{ time: '7:30', service: 'Utrenia' }] });
    expect(r.services[0].time).toBe('07:30');
  });

  it('leaves a canonical time unchanged', () => {
    const r = daySchema.parse({ services: [{ time: '07:30', service: 'Utrenia' }] });
    expect(r.services[0].time).toBe('07:30');
  });

  it('rejects an unknown key on the day', () => {
    // The quiet failure this exists to stop: `greatfeast` never becomes
    // `praznic_mare`, so the day silently loses its feast styling.
    const r = daySchema.safeParse({
      greatfeast: true,
      services: [{ time: '10:00', service: 'Sfânta Liturghie' }],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toContain('Câmp necunoscut');
      expect(r.error.issues[0].message).toContain('greatfeast');
    }
  });

  it('rejects an unknown key inside a service', () => {
    const r = daySchema.safeParse({
      services: [{ time: '10:00', service: 'Sfânta Liturghie', servicee: 'Utrenia' }],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toContain('servicee');
    }
  });

  // Deliberate, not an oversight, and the reasoning is in schema.ts above
  // `daySchema`: declaring `$schema` in the shape fails EVERY build, because
  // Astro calls `.extend({ $schema })` and Zod 4 will not overwrite an existing
  // key on a schema that carries refinements. This test exists so that anyone
  // who "fixes" it by adding the key gets a red test pointing at that comment,
  // rather than a red build pointing into Zod's internals.
  it('rejects $schema, although editors may write it', () => {
    const r = daySchema.safeParse({
      $schema: '../../../.astro/collections/services.schema.json',
      services: [{ time: '10:00', service: 'Sfânta Liturghie' }],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toContain('$schema');
    }
  });
});

describe('idFromFilename', () => {
  it('accepts a correct filename', () => {
    expect(idFromFilename('2026-09-14.yml')).toBe('2026-09-14');
  });

  it('rejects a date that does not exist', () => {
    // The whole reason this reuses dateParts rather than trusting the regex:
    // 2026-02-30 matches \d{4}-\d{2}-\d{2} but is not a day.
    expect(() => idFromFilename('2026-02-30.yml')).toThrow();
  });

  it('rejects an impossible month', () => {
    expect(() => idFromFilename('2026-13-01.yml')).toThrow();
  });

  it('rejects a date with no leading zero', () => {
    expect(() => idFromFilename('2026-9-21.yml')).toThrow();
  });

  it('respinge extensia .yaml', () => {
    expect(() => idFromFilename('2026-09-14.yaml')).toThrow();
  });

  it('rejects a file in a subdirectory', () => {
    expect(() => idFromFilename('arhiva/2026-09-14.yml')).toThrow();
  });

  it('rejects a name that is not a date', () => {
    expect(() => idFromFilename('program.yml')).toThrow();
  });

  it('names the rejected file in the message', () => {
    // Without the filename the build error would not say which file to fix.
    expect(() => idFromFilename('program.yml')).toThrow(/program\.yml/);
  });

  it('names the file when the date does not exist too', () => {
    // dateParts alone names only the date, and points its stack at date-ro.ts.
    expect(() => idFromFilename('2026-02-30.yml')).toThrow(/2026-02-30\.yml/);
  });
});

/** The messages the schema actually emits, rather than a copy of them. */
function messages(input: unknown): string[] {
  const r = daySchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => i.message);
}

/** Likewise for the messages thrown rather than returned as Zod issues. */
function thrownMessage(fn: () => unknown): string {
  try {
    fn();
    return '';
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

describe('diacritice', () => {
  it('writes the service names with exactly the correct codepoints', () => {
    // Written as escapes deliberately: a look-alike glyph in the expectation
    // would silently agree with a corrupted table. This list is also mirrored
    // into the CMS dropdown, so a wrong character here reaches the editor and
    // from there every page that groups services by name.
    expect(SERVICE_NAMES).toEqual([
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

  it('uses comma below, not cedilla', () => {
    const allText = [
      ...SERVICE_NAMES,
      ...messages({ services: [{ time: '0830', service: 'Utrenia' }] }),
      ...messages({ services: [] }),
      ...messages({ great_feast: true, services: [{ time: '10:00', service: 'Sf\u00E2nta Liturghie' }] }),
      ...messages({ greatfeast: true, services: [{ time: '10:00', service: 'Utrenia' }] }),
      ...messages({ services: [{ time: '10:00', service: 'Altceva' }] }),
      ...messages({
        services: [
          { time: '17:00', service: 'Utrenia' },
          { time: '17:00', service: 'Utrenia' },
        ],
      }),
      thrownMessage(() => idFromFilename('program.yml')),
      thrownMessage(() => idFromFilename('2026-02-30.yml')),
    ].join('');
    // The Turkish cedilla look-alikes, written as escapes so that this guard
    // cannot be defeated by pasting the very characters it is meant to reject:
    // U+015F, U+0163 and their capitals U+015E, U+0162.
    expect(allText).not.toMatch(/[\u015F\u0163\u015E\u0162]/);
    // And prove the guard has something to catch, rather than passing because
    // the strings it scans turned out to be empty.
    expect(allText).toMatch(/\u0219/); // ș, in "și numele praznicului"
    expect(allText).toMatch(/\u021B/); // ț, in "cel puțin" and "sfințite"
  });
});

describe('location, normalised at the boundary', () => {
  const withLocation = (location: unknown) =>
    daySchema.parse({ location, services: [{ time: '10:00', service: 'Utrenia' }] }).location;

  it('trims the surrounding whitespace', () => {
    expect(withLocation('  Capela Sf. Gallus, Winterthur  ')).toBe('Capela Sf. Gallus, Winterthur');
  });

  it('turns a whitespace-only field into something falsy', () => {
    // Altfel pagina ar scrie „…au loc la  ." iar ics.ts ar pune spații în
    // LOCATION în loc să cadă pe adresa parohiei.
    expect(withLocation('   ')).toBe('');
    expect(Boolean(withLocation('   '))).toBe(false);
  });

  it('does NOT trim the full stop — that is solved where the sentence is composed', () => {
    // Regula: normalizezi pentru afișare la momentul afișării; nu modifici
    // datele stocate ca să arate bine. Tăierea punctului ar pierde informație
    // („Capela Sf." ar deveni „Capela Sf") și ar schimba ce scrie ics.ts în
    // LOCATION, care e dată păstrată de clientul de calendar, nu propoziție.
    expect(withLocation('Capela Sf. Gallus, Winterthur.')).toBe('Capela Sf. Gallus, Winterthur.');
    expect(withLocation('Winterthur.')).toBe('Winterthur.');
    expect(withLocation('Capela Sf.')).toBe('Capela Sf.');
  });

  it('leaves an absent field untouched', () => {
    expect(daySchema.parse({ services: [{ time: '10:00', service: 'Utrenia' }] }).location).toBeUndefined();
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

interface CmsField {
  name: string;
  widget?: string;
  options?: unknown;
  pattern?: unknown;
  fields?: CmsField[];
}

interface CmsCollection {
  name: string;
  slug?: string;
  identifier_field?: string;
  fields: CmsField[];
}

const CMS_CONFIG = parse(
  readFileSync(fileURLToPath(new URL('../../public/admin/config.yml', import.meta.url)), 'utf8'),
) as { collections?: CmsCollection[] };

function collection(name: string): CmsCollection {
  const matched = CMS_CONFIG.collections?.find((c) => c.name === name);
  if (!matched) throw new Error(`config.yml nu conține colecția "${name}"`);
  return matched;
}

function field(fields: CmsField[] | undefined, name: string): CmsField {
  const hit = fields?.find((c) => c.name === name);
  if (!hit) throw new Error(`config.yml nu conține câmpul "${name}"`);
  return hit;
}

const SERVICES = collection('services');
const SERVICE_FIELD = field(field(SERVICES.fields, 'services').fields, 'service');
const TIME_FIELD = field(field(SERVICES.fields, 'services').fields, 'time');

describe('the CMS configuration', () => {
  it('offers exactly the same services as the schema', () => {
    // O singură egalitate prinde tot ce contează: o opțiune lipsă, una în plus,
    // o greșeală de scriere și o reordonare.
    expect(SERVICE_FIELD.options).toEqual([...SERVICE_NAMES]);
  });

  /*
   * Aceeași grijă pentru oră, dar prin COMPORTAMENT, nu prin text. Două
   * expresii regulate pot fi scrise altfel și să însemne același lucru, iar un
   * test care compară șirurile ar pica pentru o rescriere inofensivă și ar trece
   * pentru o diferență reală ascunsă într-o clasă de caractere. Aici se compară
   * verdictele: pentru fiecare oră de mai jos, tiparul din CMS și schema trebuie
   * să spună același lucru.
   */
  it('accepts exactly the same times as the schema', () => {
    const pattern = (TIME_FIELD.pattern as [string, string])[0];
    const fromCms = new RegExp(pattern);
    const times = [
      '08:30', '8:30', '7:30', '00:00', '23:59', '0:00', '19:05',
      '0830', '25:00', '24:00', '12:60', '8:5', '008:30', '08:30 ', ' 08:30', '', 'zece',
    ];
    const verdicts = times.map((time) => ({
      time,
      cms: fromCms.test(time),
      schema: serviceSchema.safeParse({ time, service: 'Utrenia' }).success,
    }));
    // Controlul pozitiv: dacă tabelul ar fi doar ore bune sau doar ore rele,
    // „amândouă spun la fel" nu ar mai însemna nimic.
    expect(verdicts.some((v) => v.schema)).toBe(true);
    expect(verdicts.some((v) => !v.schema)).toBe(true);
    for (const v of verdicts) {
      expect(v.cms, `ora ${JSON.stringify(v.time)}`).toBe(v.schema);
    }
  });

  /*
   * Numele fișierului este cheia primară a colecției, iar acesta este locul din
   * care CMS-ul o compune. Fără `slug`, Sveltia numește fișierul după
   * `identifier_field`; fără niciunul, după un șir aleator - și
   * `idFromFilename` respinge fiecare fișier pe care l-ar scrie.
   */
  it("names the file after the day's date", () => {
    expect(SERVICES.slug).toBe('{{fields.date}}');
    expect(SERVICES.identifier_field).toBe('date');
    // Și câmpul pe care îl numesc amândouă chiar există, cu widget de dată.
    expect(field(SERVICES.fields, 'date').widget).toBe('datetime');
  });

  /*
   * MULȚIMEA CÂMPURILOR ESTE ÎNCHISĂ, în amândouă sensurile, fiindcă fiecare
   * sens strică altceva:
   *
   * - un câmp în formular pe care schema nu îl are: `daySchema` este strict, deci
   *   prima zi publicată pică build-ul cu „Câmp necunoscut".
   * - un câmp în schemă pe care formularul nu îl are: câmpul nu mai poate fi
   *   completat de nimeni prin `/admin/`. Nimic nu pică, nimeni nu află, iar
   *   `location` sau `anulat` pur și simplu nu se mai pot pune - exact felul de
   *   pierdere tăcută pentru care există toată munca asta.
   *
   * Mulțimea așteptată se ia din `.shape`-ul schemei, nu dintr-o listă scrisă cu
   * mâna aici: o listă ar trebui ținută la zi în două locuri și ar rămâne în
   * urmă exact ca lista de slujbe.
   */
  it("has exactly the schema's fields, not one more, not one fewer", () => {
    const fieldNames = (c: CmsField[] | undefined) => (c ?? []).map((x) => x.name).sort();
    expect(fieldNames(SERVICES.fields)).toEqual(Object.keys(daySchema.shape).sort());
    expect(fieldNames(field(SERVICES.fields, 'services').fields)).toEqual(
      Object.keys(serviceSchema.shape).sort(),
    );
    // Controlul pozitiv: dacă `.shape` s-ar goli vreodată, egalitățile de mai
    // sus ar fi mulțumite de un formular fără niciun câmp.
    expect(Object.keys(daySchema.shape).length).toBeGreaterThan(5);
    expect(Object.keys(serviceSchema.shape).length).toBeGreaterThan(2);
  });
});

/*
 * ---------------------------------------------------------------------------
 * THE DATE IN THE FILE AGAINST THE DATE IN ITS NAME.
 *
 * The CMS writes `date:` into every file it creates, because that is the field
 * it names the file after. The two can come apart, and when they do nothing
 * downstream notices: every consumer builds its day as `{ ...e.data, date: e.id }`
 * with the filename last. So the correction a volunteer makes to a wrong date
 * would change the file and not the site.
 * ---------------------------------------------------------------------------
 */
describe('the date inside the file against the date in its name', () => {
  it('accepts a file that states the same date as its name', () => {
    expect(idFromFilename('2026-09-14.yml', { date: '2026-09-14' })).toBe('2026-09-14');
  });

  it('accepts a hand-written file, with no date field', () => {
    expect(idFromFilename('2026-09-14.yml', { feast: 'Ceva' })).toBe('2026-09-14');
    expect(idFromFilename('2026-09-14.yml')).toBe('2026-09-14');
  });

  /*
   * Mesajul trebuie să spună și CARE dintre cele două se schimbă. Nimic din cod
   * nu poate ști care dată este cea bună, deci mesajul le numește pe amândouă,
   * spune care dintre ele decide ce apare pe site și dă câte un leac pentru
   * fiecare sens. „Faceți-le să coincidă" ar lăsa cititorul să ghicească ce
   * jumătate să modifice, iar ghicitul greșit înseamnă o slujbă în ziua greșită.
   */
  it('rejects a file with two different dates, naming each of them', () => {
    const failing = () => idFromFilename('2026-09-14.yml', { date: '2026-09-21' });
    expect(failing).toThrow(/2026-09-14/); // data din nume
    expect(failing).toThrow(/2026-09-21/); // data dinăuntru
    expect(failing).toThrow(/numele fișierului este cel care decide/i);
    expect(failing).toThrow(/ștergeți-o din administrare/i); // leacul dacă ziua e cea dinăuntru
    expect(failing).toThrow(/puneți la loc/i); // leacul dacă ziua e cea din nume
  });

  /*
   * Data fără ghilimele este o greșeală cu alt leac decât cealaltă, deci are alt
   * mesaj: YAML citește `date: 2026-09-14` ca dată calendaristică, nu ca text,
   * iar `config.yml` cere de aceea `output.yaml.quote: double`.
   */
  it('rejects a date written without quotation marks, asking for them', () => {
    const failing = () => idFromFilename('2026-09-14.yml', { date: new Date('2026-09-14') });
    expect(failing).toThrow(/ghilimele/);
  });

  it('judges the name before the contents', () => {
    // Un nume imposibil pică pentru numele lui, nu pentru ce scrie înăuntru.
    expect(() => idFromFilename('2026-02-30.yml', { date: '2026-02-30' })).toThrow(/nu există/);
  });

  it('the schema accepts the day exactly as the CMS writes it', () => {
    // O reconstrucție a fișierului, nu fișierul însuși: nimic de aici nu poate
    // rula Sveltia. Ce dovedește este că forma pe care o descrie `config.yml` -
    // `date` prezent, orele ca text, o slujbă din listă - trece prin schemă.
    const raw = parse('date: "2026-09-14"\nservices:\n  - time: "07:30"\n    service: "Utrenia"\n');
    const r = daySchema.safeParse(raw);
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
    expect(idFromFilename('2026-09-14.yml', raw as Record<string, unknown>)).toBe('2026-09-14');
  });

  it('rejects a differently shaped date in the date field', () => {
    expect(daySchema.safeParse({ date: '14.09.2026', services: [{ time: '07:30', service: 'Utrenia' }] }).success).toBe(false);
  });
});
