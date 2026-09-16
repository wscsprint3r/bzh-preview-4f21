import { describe, expect, it } from 'vitest';
import { NUME_SLUJBE, idDinNumeFisier, ziSchema } from './schema';

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

  it('taie punctul final, ca să nu iasă „Winterthur.." în propoziție', () => {
    // Ambele pagini compun „Slujbele acestei zile au loc la X." în jurul lui.
    expect(loc('Winterthur.')).toBe('Winterthur');
  });

  it('taie și mai multe puncte, și spațiile din jur', () => {
    expect(loc('Winterthur...')).toBe('Winterthur');
    expect(loc('  Winterthur .  ')).toBe('Winterthur');
  });

  it('nu atinge o locație scrisă corect', () => {
    expect(loc('Capela Sf. Gallus, Winterthur')).toBe('Capela Sf. Gallus, Winterthur');
  });

  it('transformă un câmp doar cu spații în ceva fals', () => {
    // Altfel pagina ar scrie „…au loc la  ." iar ics.ts ar pune spații în
    // LOCATION în loc să cadă pe adresa parohiei.
    expect(loc('   ')).toBe('');
    expect(Boolean(loc('   '))).toBe(false);
  });

  it('lasă lipsa neatinsă', () => {
    expect(ziSchema.parse({ slujbe: [{ ora: '10:00', slujba: 'Utrenia' }] }).locatie).toBeUndefined();
  });
});
