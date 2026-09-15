import { describe, expect, it } from 'vitest';
import { NUME_SLUJBE, ziSchema } from './schema';

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

  it('respinge o zi fără slujbe care nu este anulată', () => {
    const r = ziSchema.safeParse({ slujbe: [] });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toContain('cel puțin o slujbă');
    }
  });

  it('acceptă o zi fără slujbe dacă este anulată', () => {
    const r = ziSchema.safeParse({ slujbe: [], anulat: true, note: 'Părintele este plecat' });
    expect(r.success).toBe(true);
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

/** The messages the schema actually emits, rather than a copy of them. */
function mesaje(input: unknown): string[] {
  const r = ziSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => i.message);
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
