import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { daySchema } from './schema';
import {
  CATEGORIES,
  articleSchema,
  documentSchema,
  eventSchema,
  gallerySchema,
  pageSchema,
  settingsSchema,
} from './content-schema';

/*
 * WHAT THIS FILE PROVES: the schemas really do reject what must not
 * pass, not merely accept what must - and they say so in Romanian, naming the field.
 *
 * A schema is easy to test badly. A test that takes a valid value, spreads
 * it with `...` and then checks that the schema accepts it passes just as well
 * if the schema has no rule at all: the expectation does not come from what it
 * should be, but from the same source as the thing being checked.
 *
 * THE FIRST VERSION OF THIS FILE FELL EXACTLY INTO THAT PIT, and it is worth writing
 * down here because it was found by someone else. It had a test for every
 * RULE, but none for REQUIREDNESS: 10 of the 11 required fields could be made
 * optional and all 34 tests would stay green. An
 * article with no date, or a `settings.yml` with no address, is exactly how
 * these files break - someone deletes a line, the build stays green, and
 * the parish's address disappears from the site's footer. The mutation list had been
 * written by the same hand as the tests, so it only covered what was already covered.
 *
 * So: for every required field there is a test that its absence fails, and for
 * every message there is a test on its TEXT. An empty `.toThrow()` cannot see
 * the difference between the right message and one that names a different field - and that
 * is exactly what had happened: `address` and `phone` both answered „Titlul nu
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
  accounts: [
    {
      label: 'Susținerea parohiei',
      iban: 'CH54 0021 5215 3048 5501 P',
      holder: 'Parohia Ortodoxă Română Sfântul Nicolae',
      bank: 'UBS (Schweiz) AG',
      qr_bill: false,
    },
  ],
};

/** The same value, without one field - without damaging the original. */
const without = (object: Record<string, unknown>, field: string) => {
  const copy = { ...object };
  delete copy[field];
  return copy;
};

describe('CATEGORIES', () => {
  /*
   * Written by hand, not taken from `CATEGORIES`, because this set is a
   * contract between three tasks: Task 6 stops the migration at a category
   * outside it, and Task 11 builds the CMS list from it. A test that
   * compared `CATEGORIES` against itself would be satisfied by anything.
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
   * REQUIREDNESS, field by field. Each case deletes exactly one field and requires that
   * the message name that one; an empty `.toThrow()` would have passed even if
   * all four had answered the same way.
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
    // The most likely mistake from the CMS, and the only one that would otherwise lose a
    // field on a green build.
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
   * Without quotation marks, YAML reads `date: 2025-11-05` as a calendar date, not
   * as text, and the schema receives a `Date`. Zod's default message for
   * that is in English and talks about types; the one here says what the person
   * has to do. The same trap was already paid for once, on `services`.
   */
  it('says what to do when the date is written without quotation marks', () => {
    expect(() =>
      articleSchema.parse({ ...MINIMAL_ARTICLE, date: new Date('2025-11-05') }),
    ).toThrow(/Data trebuie scrisă între ghilimele/);
  });

  /*
   * And it does NOT say that in the other wrong-type cases. All of them are
   * `invalid_type` for Zod, so a single message for all of them would have told
   * a person who had DELETED the line to add quotation marks.
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
    // `published: "true"` in the frontmatter is a string, and a non-empty string would be
    // truthy on any careless read later.
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
    // Otherwise a `.default()` placed over any value would go unnoticed.
    expect(articleSchema.parse({ ...MINIMAL_ARTICLE, author: 'Pr. Ioan' }).author).toBe('Pr. Ioan');
  });
});

describe('pageSchema', () => {
  it('accepts a page with a title and a path', () => {
    expect(pageSchema.parse(MINIMAL_PAGE).path).toBe('parohia/istoric');
  });

  it('accepts the paths of the nine pages, with hyphens and one level deep', () => {
    // "Link-uri" and "Servicii liturgice" are two of the nine: if
    // the pattern were too strict, the migration would fail on them.
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
    // The route builds `/${path}/`; a kept slash would give `//istoric//`, which
    // 404s while the file looks perfectly correct.
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
   * EVERY MESSAGE NAMES ITS OWN FIELD. The shared helper before this gave
   * a single text for three fields, so emptying the phone number
   * answered „Titlul nu poate fi gol.” - true about the code, false about what
   * the person had done. The old test was an empty `.toThrow()` and could not see that.
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
    // Named specifically because they are what shows on the site today: the footer shows a
    // theme demo address and a French phone number. Migrating them forward would be worse
    // than a field left empty.
    expect(() => settingsSchema.parse({ ...MINIMAL_SETTINGS, email: 'info@website.com' })).toThrow(
      /rămășiță demo de pe situl vechi/,
    );
    expect(() => settingsSchema.parse({ ...MINIMAL_SETTINGS, phone: '+33 877 554 332' })).toThrow(
      /rămășiță demo de pe situl vechi/,
    );
  });

  it('finds the demo values in any field, not only in the two required ones', () => {
    // The check runs across every field: otherwise the second email could
    // carry forward exactly the value the first one rejects.
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
      visiting_hours: 'Duminica, după Liturghie',
      map_url: 'https://maps.example.ch/parohia',
    });
    expect(s.email2).toBe('preot@bor-zh.ch');
    expect(() => settingsSchema.parse({ ...MINIMAL_SETTINGS, email2: 'nu-este-email' })).toThrow(
      /A doua adresă de e-mail nu este validă\./,
    );
  });

  it('requires https for the map, not any URL scheme', () => {
    // `javascript:` passes through a plain `z.url()`. Put into an `href`, it would be
    // exactly the kind of hole this whole site is being rewritten to close.
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

describe('the events schema', () => {
  const event = {
    title: 'Concert de colinde',
    start_date: '2026-12-19',
    time: '18:00',
    location: 'Capela Sf. Katharina',
    description: 'Concertul corului parohial.',
  };

  it('accepts a minimal event and leaves end_date absent', () => {
    const parsed = eventSchema.parse(event);
    expect(parsed.start_date).toBe('2026-12-19');
    expect(parsed.end_date).toBeUndefined();
  });

  it('rejects an end_date before the start, naming the field', () => {
    expect(() => eventSchema.parse({ ...event, end_date: '2026-12-18' })).toThrow(/înainte/);
  });

  it('rejects a time that is not HH:MM and normalises 9:30', () => {
    expect(() => eventSchema.parse({ ...event, time: '25:00' })).toThrow(/18:00/);
    expect(eventSchema.parse({ ...event, time: '9:30' }).time).toBe('09:30');
  });

  it('rejects a misspelled key', () => {
    expect(() => eventSchema.parse({ ...event, locatie: 'x' })).toThrow(/Câmp necunoscut/);
  });
});

describe('the galleries schema', () => {
  const gallery = {
    title: 'Sfintele Paști 2024',
    date: '2024-05-05',
    cover: '../../assets/content/galleries/2024/05/a.jpg',
    images: [{ file: '../../assets/content/galleries/2024/05/a.jpg' }],
  };

  it('accepts one image and leaves its description absent', () => {
    expect(gallerySchema.parse(gallery).images[0]!.description).toBeUndefined();
  });

  it('rejects an empty image list, naming the field', () => {
    expect(() => gallerySchema.parse({ ...gallery, images: [] })).toThrow(/cel puțin o imagine/);
  });

  it('rejects a misspelled key', () => {
    expect(() => gallerySchema.parse({ ...gallery, titlu: 'x' })).toThrow(/Câmp necunoscut/);
  });
});

describe('the documents schema', () => {
  const document = {
    title: 'Pastorală',
    date: '2025-04-20',
    file: '/documente/pastorala-invierii-2025.pdf',
  };

  it('accepts a PDF under /documente/', () => {
    expect(documentSchema.parse(document).file).toBe('/documente/pastorala-invierii-2025.pdf');
  });

  it('rejects a file that is not a /documente/ PDF', () => {
    expect(() => documentSchema.parse({ ...document, file: '/uploads/x.pdf' })).toThrow(/documente/);
  });

  it('rejects a misspelled key', () => {
    expect(() => documentSchema.parse({ ...document, autor: 'x' })).toThrow(/Câmp necunoscut/);
  });
});

describe('settings.yml', () => {
  const SETTINGS_PATH = fileURLToPath(new URL('../content/settings/settings.yml', import.meta.url));

  /*
   * The actual shipped file, run through the actual schema that guards it. The build
   * would validate it anyway, but only after Astro starts; here it fails in the unit
   * suite, where the error is legible.
   */
  it('the shipped file passes the schema', () => {
    const raw: unknown = parse(readFileSync(SETTINGS_PATH, 'utf8'));
    const s = settingsSchema.parse(raw);
    expect(s.name).toContain('Sfântul Nicolae');
    expect(s.email).toContain('@');
  });

  it('carries neither of the two demo values forward', () => {
    // The positive control for the test above: if `superRefine` were
    // removed, this test would pass for nothing, so it checks the raw text.
    const text = readFileSync(SETTINGS_PATH, 'utf8');
    expect(text).not.toContain('info@website.com');
    expect(text).not.toContain('+33 877 554 332');
  });
});

describe('the message for unknown keys', () => {
  /*
   * `strictKeys` is now imported from `./schema.ts`, no longer copied: a
   * single source for both. The test stays because it pins down the TEXT -
   * changing the wording in `schema.ts` has to be a visible act, not one
   * that sneaks into four collections at once.
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
    // Typed structurally, because the two schemas give results of
    // different types; only the message matters here.
    const message = (r: { error?: { issues: readonly { message: string }[] } }) =>
      r.error?.issues[0]?.message ?? '';
    // Written by hand, not taken from either schema: otherwise two messages
    // broken the same way would agree with each other forever.
    expect(message(inContentSchema)).toBe('Câmp necunoscut: publishedd. Verificați scrierea.');
    expect(message(inDaySchema)).toBe(message(inContentSchema));
  });
});

describe('import from plain node', () => {
  /*
   * THE ONLY GUARD FOR THE `.ts` EXTENSION. The migration scripts (Task 6 and 7)
   * are `.mjs` run directly by node, which resolves relative specifiers
   * literally: `'./date-ro'` instead of `'./date-ro.ts'` throws
   * ERR_MODULE_NOT_FOUND. Vite, Astro and vitest resolve both forms, so
   * the rest of the suite would never see the regression - which is why a
   * real node process is launched here.
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
    // If this one too exited with 0, the test above would prove nothing.
    const r = runNode('./src/lib/content-schema');
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('ERR_MODULE_NOT_FOUND');
  });
});
