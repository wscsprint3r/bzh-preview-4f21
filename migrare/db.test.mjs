import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { SURSA_DUMP, NUME_CONTAINER } from './db.mjs';

describe('sursa migrarii', () => {
  it('numeste dumpul prin cale absoluta, in afara depozitului', () => {
    expect(SURSA_DUMP.startsWith('/')).toBe(true);
    expect(SURSA_DUMP).toContain('backup-2026-08-27');
    expect(SURSA_DUMP.endsWith('database.sql.gz')).toBe(true);
    // The repository root must NOT be a prefix of the dump path: nothing in
    // `migrare/` may read migration source from inside this tree, because a
    // file inside the tree is a file somebody can commit.
    const radacina = new URL('../', import.meta.url).pathname;
    expect(SURSA_DUMP.startsWith(radacina)).toBe(false);
  });

  it('spune limpede cand dumpul lipseste, in loc sa migreze zero randuri', async () => {
    // Positive control: the detector can fire. A harness that reports success
    // on a missing source is the failure this whole file exists to prevent.
    const { verificaSursa } = await import('./db.mjs');
    expect(() => verificaSursa('/nu/exista/database.sql.gz')).toThrow(
      /Dumpul nu a fost gasit/,
    );
    // And the other direction, so the check is not vacuously true.
    if (existsSync(SURSA_DUMP)) {
      expect(() => verificaSursa(SURSA_DUMP)).not.toThrow();
    }
  });

  it('numele containerului este al acestui proiect, nu unul generic', () => {
    expect(NUME_CONTAINER).toBe('bzh-migrare');
  });
});
