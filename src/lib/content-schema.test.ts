import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { daySchema } from './schema';
import { CATEGORIES, articleSchema, pageSchema, settingsSchema } from './content-schema';

/*
 * CE DOVEDEȘTE FIȘIERUL ACESTA: cele trei scheme chiar resping ce nu trebuie să
 * treacă, nu doar acceptă ce trebuie - și o spun în română, numind câmpul.
 *
 * O schemă este ușor de testat prost. Un test care ia o valoare validă, o
 * împrăștie cu `...` și verifică apoi că schema o acceptă trece la fel de bine
 * și dacă schema nu are nicio regulă: expectativa nu vine din ce ar trebui să
 * fie, ci din aceeași sursă cu lucrul verificat.
 *
 * PRIMA VERSIUNE A ACESTUI FIȘIER A PICAT EXACT ÎN ACEA GROAPĂ, și merită scris
 * aici fiindcă a fost găsită de altcineva. Avea câte un test pentru fiecare
 * REGULĂ, dar niciunul pentru OBLIGATIVITATE: se puteau face neobligatorii 10
 * din cele 11 câmpuri cerute și toate cele 34 de teste rămâneau verzi. Un
 * articol fără dată sau un `settings.yml` fără adresă este tocmai felul în care
 * fișierele astea se strică - omul șterge o linie, build-ul rămâne verde, iar
 * adresa parohiei dispare din subsolul sitului. Lista de mutații fusese scrisă
 * de aceeași mână cu testele, așa că a acoperit numai ce era deja acoperit.
 *
 * Deci: pentru fiecare câmp cerut există un test că lipsa lui pică, și pentru
 * fiecare mesaj există un test pe TEXTUL lui. Un `.toThrow()` gol nu vede
 * diferența dintre mesajul potrivit și unul care numește alt câmp - și chiar
 * asta se întâmplase: `adresa` și `phone` răspundeau amândouă „Titlul nu
 * poate fi gol.”.
 */

const MINIMAL_ARTICLE = {
  title: 'Hramul parohiei',
  date: '2025-11-05',
  category: 'Noutati',
  published: true,
};

const MINIMAL_PAGE = { title: 'Istoric', path: 'parohia/istoric', order: 10 };

const MINIMAL_SETTINGS = {
  name: 'Parohia Ortodoxă Română Sfântul Nicolae',
  address: 'Wehntalerstrasse 451, 8046 Zürich',
  phone: '076 512 04 52',
  email: 'contact@bor-zh.ch',
};

/** Aceeași valoare, fără un câmp - fără să strice originalul. */
const without = (object: Record<string, unknown>, field: string) => {
  const copy = { ...object };
  delete copy[field];
  return copy;
};

describe('CATEGORIES', () => {
  /*
   * Scrisă cu mâna, nu luată din `CATEGORIES`, fiindcă mulțimea asta este un
   * contract între trei task-uri: Task 6 oprește migrarea la o categorie din
   * afara ei, iar Task 11 construiește lista din CMS din ea. Un test care ar
   * compara `CATEGORIES` cu ea însăși ar fi mulțumit de orice.
   */
  it('is exactly the set the migration writes', () => {
    expect([...CATEGORIES]).toEqual(['Noutati', 'Cateheza']);
  });
});

describe('articleSchema', () => {
  it('accepts a minimal article', () => {
    expect(articleSchema.parse(MINIMAL_ARTICLE).title).toBe('Hramul parohiei');
  });

  it('accepts the optional fields when they are given', () => {
    const a = articleSchema.parse({
      ...MINIMAL_ARTICLE,
      summary: 'Câteva rânduri.',
      image: '/media/hram.jpg',
    });
    expect(a.summary).toBe('Câteva rânduri.');
    expect(a.image).toBe('/media/hram.jpg');
  });

  /*
   * OBLIGATIVITATEA, câmp cu câmp. Fiecare caz șterge exact un câmp și cere ca
   * mesajul să îl numească pe acela; un `.toThrow()` gol ar fi trecut și dacă
   * toate patru ar fi răspuns la fel.
   */
  const REQUIRED_FIELDS: [string, RegExp][] = [
    ['title', /Articolul trebuie să aibă un titlu\./],
    ['date', /Articolul trebuie să aibă o dată/],
    ['published', /trebuie să spună dacă este publicat/],
    ['category', /Articolul trebuie să aibă o categorie/],
  ];
  for (const [field, message] of REQUIRED_FIELDS) {
    it(`requires the field ${field}`, () => {
      expect(() => articleSchema.parse(without(MINIMAL_ARTICLE, field))).toThrow(message);
    });
  }

  it('rejects a misspelled key', () => {
    // Greșeala cea mai probabilă din CMS, și singura care altfel ar pierde un
    // câmp pe un build verde.
    expect(() => articleSchema.parse({ ...MINIMAL_ARTICLE, publishedd: true })).toThrow(
      /Câmp necunoscut: publishedd\. Verificați scrierea\./,
    );
  });

  it('requires a real date, not merely something date-shaped', () => {
    expect(() => articleSchema.parse({ ...MINIMAL_ARTICLE, date: '2025-02-30' })).toThrow(
      /Data trebuie să fie o zi reală/,
    );
    expect(() => articleSchema.parse({ ...MINIMAL_ARTICLE, date: '2025-13-01' })).toThrow(
      /Data trebuie să fie o zi reală/,
    );
  });

  it('requires the YYYY-MM-DD shape, not a date written any which way', () => {
    expect(() => articleSchema.parse({ ...MINIMAL_ARTICLE, date: '5 noiembrie 2025' })).toThrow(
      /Data trebuie să fie o zi reală/,
    );
    expect(() => articleSchema.parse({ ...MINIMAL_ARTICLE, date: '2025-11-5' })).toThrow();
  });

  /*
   * Fără ghilimele, YAML citește `date: 2025-11-05` ca dată calendaristică, nu
   * ca text, și schema primește un `Date`. Mesajul implicit al lui Zod pentru
   * asta este în engleză și vorbește despre tipuri; cel de aici spune ce are de
   * făcut omul. Aceeași capcană a fost deja plătită o dată, la `services`.
   */
  it('says what to do when the date is written without quotation marks', () => {
    expect(() =>
      articleSchema.parse({ ...MINIMAL_ARTICLE, date: new Date('2025-11-05') }),
    ).toThrow(/Data trebuie scrisă între ghilimele/);
  });

  /*
   * Și NU spune asta în celelalte cazuri de tip greșit. Toate sunt
   * `invalid_type` pentru Zod, așa că un singur mesaj pentru toate îi cerea
   * omului care ȘTERSESE linia să îi pună ghilimele.
   */
  it('does not ask for quotation marks when the date is missing or null', () => {
    const missing = (() => {
      try {
        articleSchema.parse(without(MINIMAL_ARTICLE, 'date'));
        return '';
      } catch (e) {
        return (e as Error).message;
      }
    })();
    expect(missing).toContain('Articolul trebuie să aibă o dată');
    expect(missing).not.toContain('ghilimele');

    expect(() => articleSchema.parse({ ...MINIMAL_ARTICLE, date: null })).toThrow(
      /Data se scrie ca text, între ghilimele/,
    );
    expect(() => articleSchema.parse({ ...MINIMAL_ARTICLE, date: 20251105 })).toThrow(
      /Data se scrie ca text, între ghilimele/,
    );
  });

  it('requires a category from the list', () => {
    expect(() => articleSchema.parse({ ...MINIMAL_ARTICLE, category: 'Altceva' })).toThrow(
      /Categoria poate fi doar Noutati sau Cateheza\./,
    );
    for (const c of CATEGORIES) {
      expect(articleSchema.parse({ ...MINIMAL_ARTICLE, category: c }).category).toBe(c);
    }
  });

  it('published is a true/false, not the text "true"', () => {
    // `publicat: "true"` în frontmatter este un șir, iar un șir nevid ar fi
    // adevărat la orice citire neatentă de mai târziu.
    expect(() => articleSchema.parse({ ...MINIMAL_ARTICLE, published: 'true' })).toThrow(
      /primește doar true sau false/,
    );
  });

  it('rejects a title that is empty or only spaces', () => {
    expect(() => articleSchema.parse({ ...MINIMAL_ARTICLE, title: '   ' })).toThrow(
      /Titlul nu poate fi gol\./,
    );
  });

  it('rejects an empty author', () => {
    expect(() => articleSchema.parse({ ...MINIMAL_ARTICLE, author: '   ' })).toThrow(
      /Numele autorului nu poate fi gol\./,
    );
  });

  it('has the author Parohia when none is given', () => {
    expect(articleSchema.parse(MINIMAL_ARTICLE).author).toBe('Parohia');
  });

  it('keeps the author when one is given', () => {
    // Altfel un `.default()` pus peste orice valoare ar trece neobservat.
    expect(articleSchema.parse({ ...MINIMAL_ARTICLE, author: 'Pr. Ioan' }).author).toBe('Pr. Ioan');
  });
});

describe('pageSchema', () => {
  it('accepts a page with a title and a path', () => {
    expect(pageSchema.parse(MINIMAL_PAGE).path).toBe('parohia/istoric');
  });

  it('accepts the paths of the nine pages, with hyphens and one level deep', () => {
    // „Link-uri” și „Servicii liturgice” sunt două dintre cele nouă: dacă
    // expresia ar fi prea strictă, migrarea ar pica pe ele.
    for (const path of ['istoric', 'link-uri', 'servicii-liturgice', 'parohia/scoala']) {
      expect(pageSchema.parse({ ...MINIMAL_PAGE, path }).path).toBe(path);
    }
  });

  const REQUIRED_FIELDS: [string, RegExp][] = [
    ['title', /Pagina trebuie să aibă un titlu\./],
    ['path', /Pagina trebuie să aibă o cale/],
    ['order', /Pagina trebuie să aibă o ordine/],
  ];
  for (const [field, message] of REQUIRED_FIELDS) {
    it(`requires the field ${field}`, () => {
      expect(() => pageSchema.parse(without(MINIMAL_PAGE, field))).toThrow(message);
    });
  }

  it('rejects a path with a leading or trailing slash', () => {
    // Ruta construiește `/${path}/`; un slash păstrat ar da `//istoric//`, care
    // dă 404 în timp ce fișierul arată perfect corect.
    for (const path of ['/parohia/istoric', 'parohia/istoric/']) {
      expect(() => pageSchema.parse({ ...MINIMAL_PAGE, path }), path).toThrow(
        /fără slash la început sau la sfârșit/,
      );
    }
  });

  it('rejects a path with capitals or spaces', () => {
    for (const path of ['Parohia/Istoric', 'parohia/is toric']) {
      expect(() => pageSchema.parse({ ...MINIMAL_PAGE, path }), path).toThrow(
        /litere mici, cifre și liniuțe/,
      );
    }
  });

  it('rejects a path with diacritics, because the URL does not carry them', () => {
    expect(() => pageSchema.parse({ ...MINIMAL_PAGE, path: 'pictură' })).toThrow(
      /fără diacritice/,
    );
  });

  it('rejects an empty title', () => {
    expect(() => pageSchema.parse({ ...MINIMAL_PAGE, title: '  ' })).toThrow(
      /Titlul paginii nu poate fi gol\./,
    );
  });

  it('requires a whole-number order', () => {
    expect(() => pageSchema.parse({ ...MINIMAL_PAGE, order: 1.5 })).toThrow(
      /Ordinea trebuie să fie un număr întreg/,
    );
    expect(() => pageSchema.parse({ ...MINIMAL_PAGE, order: 'prima' })).toThrow(
      /Ordinea se scrie ca număr/,
    );
  });

  it('rejects a misspelled key', () => {
    expect(() => pageSchema.parse({ ...MINIMAL_PAGE, ordinea: 2 })).toThrow(
      /Câmp necunoscut: ordinea\./,
    );
  });

  it('accepts the optional fields when they are given', () => {
    const p = pageSchema.parse({
      ...MINIMAL_PAGE,
      description: 'Istoricul parohiei.',
      image: '/media/biserica.jpg',
    });
    expect(p.description).toBe('Istoricul parohiei.');
  });
});

describe('settingsSchema', () => {
  it('accepts the minimal settings', () => {
    expect(settingsSchema.parse(MINIMAL_SETTINGS).name).toContain('Parohia');
  });

  const REQUIRED_FIELDS: [string, RegExp][] = [
    ['name', /Setările trebuie să cuprindă numele parohiei\./],
    ['address', /Setările trebuie să cuprindă adresa parohiei\./],
    ['phone', /Setările trebuie să cuprindă numărul de telefon\./],
    ['email', /Setările trebuie să cuprindă o adresă de e-mail\./],
  ];
  for (const [field, message] of REQUIRED_FIELDS) {
    it(`requires the field ${field}`, () => {
      expect(() => settingsSchema.parse(without(MINIMAL_SETTINGS, field))).toThrow(message);
    });
  }

  /*
   * FIECARE MESAJ ÎȘI NUMEȘTE PROPRIUL CÂMP. Ajutorul comun de dinainte dădea
   * un singur text pentru trei câmpuri, așa că golirea numărului de telefon
   * răspundea „Titlul nu poate fi gol.” - adevărat despre cod, fals despre ce
   * făcuse omul. Testul vechi era un `.toThrow()` gol și nu putea vedea asta.
   */
  const EMPTY_FIELDS: [string, RegExp][] = [
    ['name', /Numele parohiei nu poate fi gol\./],
    ['address', /Adresa parohiei nu poate fi goală\./],
    ['phone', /Numărul de telefon nu poate fi gol\./],
  ];
  for (const [field, message] of EMPTY_FIELDS) {
    it(`says which field is empty, not "the title", for ${field}`, () => {
      const attempt = () => settingsSchema.parse({ ...MINIMAL_SETTINGS, [field]: '   ' });
      expect(attempt).toThrow(message);
      expect(attempt).not.toThrow(/Titlul/);
    });
  }

  it('rejects an email with no @', () => {
    expect(() => settingsSchema.parse({ ...MINIMAL_SETTINGS, email: 'contact' })).toThrow(
      /Adresa de e-mail nu este validă\./,
    );
  });

  it('rejects the two demo values from the old site', () => {
    // Numite anume fiindcă ele sunt ce se vede azi pe sit: subsolul arată o
    // adresă de temă și un număr de telefon franțuzesc. Migrarea lor ar fi mai
    // rea decât un câmp lăsat gol.
    expect(() => settingsSchema.parse({ ...MINIMAL_SETTINGS, email: 'info@website.com' })).toThrow(
      /rămășiță demo de pe situl vechi/,
    );
    expect(() => settingsSchema.parse({ ...MINIMAL_SETTINGS, phone: '+33 877 554 332' })).toThrow(
      /rămășiță demo de pe situl vechi/,
    );
  });

  it('finds the demo values in any field, not only in the two required ones', () => {
    // Verificarea trece prin toate câmpurile: altfel al doilea e-mail ar putea
    // purta mai departe exact valoarea pe care primul o respinge.
    expect(() => settingsSchema.parse({ ...MINIMAL_SETTINGS, email2: 'info@website.com' })).toThrow(
      /rămășiță demo/,
    );
    expect(() => settingsSchema.parse({ ...MINIMAL_SETTINGS, phone2: '+33 877 554 332' })).toThrow(
      /rămășiță demo/,
    );
  });

  it('rejects a misspelled key', () => {
    expect(() => settingsSchema.parse({ ...MINIMAL_SETTINGS, emial: 'x@y.ch' })).toThrow(
      /Câmp necunoscut: emial\./,
    );
  });

  it('accepts the optional fields and checks their shape', () => {
    const s = settingsSchema.parse({
      ...MINIMAL_SETTINGS,
      phone2: '044 000 00 00',
      email2: 'preot@bor-zh.ch',
      iban: 'CH00 0000 0000 0000 0000 0',
      visiting_hours: 'Duminica, după Liturghie',
      map_url: 'https://maps.example.ch/parohia',
    });
    expect(s.email2).toBe('preot@bor-zh.ch');
    expect(() => settingsSchema.parse({ ...MINIMAL_SETTINGS, email2: 'nu-este-email' })).toThrow(
      /A doua adresă de e-mail nu este validă\./,
    );
  });

  it('requires https for the map, not any URL scheme', () => {
    // `javascript:` trece printr-un `z.url()` simplu. Pus într-un `href`, ar fi
    // exact felul de gaură pentru care se rescrie tot situl.
    for (const badPath of [
      'nu-este-adresa',
      'http://maps.example.ch/parohia',
      'javascript:alert(1)',
      'data:text/html,x',
      '//maps.example.ch/parohia',
    ]) {
      expect(() => settingsSchema.parse({ ...MINIMAL_SETTINGS, map_url: badPath }), badPath).toThrow(
        /Adresa hărții trebuie să înceapă cu https/,
      );
    }
    expect(settingsSchema.parse({ ...MINIMAL_SETTINGS, map_url: 'https://maps.example.ch/x' }).map_url).toBe(
      'https://maps.example.ch/x',
    );
  });
});

describe('settings.yml', () => {
  const SETTINGS_PATH = fileURLToPath(new URL('../content/settings/settings.yml', import.meta.url));

  /*
   * Fișierul chiar livrat, trecut prin chiar schema care îl păzește. Build-ul
   * l-ar valida oricum, dar abia după ce pornește Astro; aici pică în suita de
   * unități, unde se citește eroarea.
   */
  it('the shipped file passes the schema', () => {
    const raw: unknown = parse(readFileSync(SETTINGS_PATH, 'utf8'));
    const s = settingsSchema.parse(raw);
    expect(s.name).toContain('Sfântul Nicolae');
    expect(s.email).toContain('@');
  });

  it('carries neither of the two demo values forward', () => {
    // Controlul pozitiv pentru testul de deasupra: dacă `superRefine` ar fi
    // scos, testul acesta ar trece degeaba, așa că el verifică textul brut.
    const text = readFileSync(SETTINGS_PATH, 'utf8');
    expect(text).not.toContain('info@website.com');
    expect(text).not.toContain('+33 877 554 332');
  });
});

describe('the message for unknown keys', () => {
  /*
   * `strictKeys` se importă acum din `./schema.ts`, nu se mai copiază: o
   * singură sursă pentru amândouă. Testul rămâne fiindcă el fixează TEXTUL -
   * schimbarea formulării în `schema.ts` trebuie să fie o faptă văzută, nu una
   * care se strecoară în patru colecții deodată.
   */
  it("is word for word the same as the schedule schema's", () => {
    const badKey = { publishedd: true };
    const inContentSchema = articleSchema.safeParse({ ...MINIMAL_ARTICLE, ...badKey });
    const inDaySchema = daySchema.safeParse({
      services: [{ time: '10:00', service: 'Sfânta Liturghie' }],
      ...badKey,
    });
    expect(inContentSchema.success).toBe(false);
    expect(inDaySchema.success).toBe(false);
    // Tipat structural, fiindcă cele două scheme dau rezultate de tipuri
    // diferite; aici nu ne interesează decât mesajul.
    const message = (r: { error?: { issues: readonly { message: string }[] } }) =>
      r.error?.issues[0]?.message ?? '';
    // Scris cu mâna, nu luat dintr-una dintre scheme: altfel două mesaje
    // stricate la fel ar fi de acord între ele pe vecie.
    expect(message(inContentSchema)).toBe('Câmp necunoscut: publishedd. Verificați scrierea.');
    expect(message(inDaySchema)).toBe(message(inContentSchema));
  });
});

describe('import from plain node', () => {
  /*
   * SINGURA GARDĂ PENTRU EXTENSIA `.ts`. Scripturile de migrare (Task 6 și 7)
   * sunt `.mjs` rulate direct de node, care rezolvă specificatorii relativi
   * literal: `'./date-ro'` în loc de `'./date-ro.ts'` aruncă
   * ERR_MODULE_NOT_FOUND. Vite, Astro și vitest rezolvă amândouă formele, deci
   * restul suitei nu ar vedea niciodată regresia - de aceea aici se pornește un
   * proces node adevărat.
   */
  const ROOT = fileURLToPath(new URL('../..', import.meta.url));
  const runNode = (specifier: string) =>
    spawnSync(
      process.execPath,
      ['-e', `import('${specifier}').then((m) => { if (!m.articleSchema) process.exit(3); })`],
      { cwd: ROOT, encoding: 'utf8' },
    );

  it('can be imported from plain node, without Astro and without vitest', () => {
    const r = runNode('./src/lib/content-schema.ts');
    expect(r.stderr).not.toContain('ERR_MODULE_NOT_FOUND');
    expect(r.status, r.stderr).toBe(0);
  });

  it('the positive control: the same check really does fail without the extension', () => {
    // Dacă și asta ar ieși cu 0, testul de deasupra nu ar dovedi nimic.
    const r = runNode('./src/lib/content-schema');
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('ERR_MODULE_NOT_FOUND');
  });
});
