import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  ASTEPTAT_PAGINI,
  ASTEPTAT_POSTARI,
  NUME_CONTAINER,
  PAROLA,
  SURSA_DUMP,
  interogheaza,
  opreste,
  verificaNumerele,
} from './db.mjs';

describe('sursa migrarii', () => {
  it('numeste dumpul prin cale absoluta, in afara depozitului', () => {
    expect(SURSA_DUMP.startsWith('/')).toBe(true);
    expect(SURSA_DUMP).toContain('backup-2026-08-27');
    expect(SURSA_DUMP.endsWith('database.sql.gz')).toBe(true);
    // The repository root must NOT be a prefix of the dump path: nothing in
    // `migrare/` may read migration source from inside this tree, because a
    // file inside the tree is a file somebody can commit.
    //
    // `fileURLToPath`, not `.pathname`: a `URL`'s `.pathname` is percent-
    // encoded, so a checkout under a path containing a space - or any other
    // character `URL` escapes - would turn this into `/a%20b/`, which is
    // never a prefix of a real filesystem path, and the assertion would pass
    // for every checkout at such a path regardless of where the dump sits.
    // `fileURLToPath` reverses that encoding back to real path bytes.
    const radacina = fileURLToPath(new URL('../', import.meta.url));
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

describe('verificaNumerele', () => {
  // Pure comparison, no docker: cheap enough to run on every `npm test`, so
  // this is the negative control for `porneste()`'s post-load assertion that
  // does not cost a container. The container-level proof - that a genuinely
  // corrupted load now throws before this function is ever reached - is
  // demonstrated by hand in `task-1-report.md`, against a real truncated copy
  // of the real dump, because that half of the claim is about shell and
  // process exit codes rather than about this comparison.
  it('nu arunca atunci cand numerele coincid cu ce astepta planul', () => {
    expect(() => verificaNumerele(ASTEPTAT_POSTARI, ASTEPTAT_PAGINI)).not.toThrow();
  });

  it('arunca numind numerele asteptate si cele gasite, cand postarile nu se potrivesc', () => {
    let eroare;
    try {
      verificaNumerele(3, ASTEPTAT_PAGINI);
    } catch (e) {
      eroare = e;
    }
    expect(eroare).toBeInstanceOf(Error);
    expect(eroare.message).toContain(String(ASTEPTAT_POSTARI));
    expect(eroare.message).toContain(String(ASTEPTAT_PAGINI));
    expect(eroare.message).toContain('3');
  });

  it('arunca si cand doar paginile nu se potrivesc', () => {
    expect(() => verificaNumerele(ASTEPTAT_POSTARI, 0)).toThrow(
      new RegExp(`${ASTEPTAT_POSTARI}.*${ASTEPTAT_PAGINI}`),
    );
  });
});

// The tests below start their own disposable, dump-free `bzh-migrare`
// container - not the real 28MB dump, which `porneste()`'s own report proves
// separately - because what is under test here is `interogheaza`'s handling
// of `-B`'s output format itself, which needs a real MariaDB round trip to
// prove (a claim about what a real client prints is not decidable by reading
// this file), but does not need the real content to prove it with.
describe('interogheaza - randuri reale printr-un container', () => {
  beforeAll(async () => {
    await opreste(); // clean slate, reusing the harness's own teardown
    execFileSync('docker', [
      'run', '-d', '--name', NUME_CONTAINER,
      '-e', `MARIADB_ROOT_PASSWORD=${PAROLA}`,
      '-e', 'MARIADB_DATABASE=wp',
      'mariadb:11',
    ]);
    const pornit = Date.now();
    for (;;) {
      try {
        await interogheaza('SELECT 1');
        break;
      } catch {
        if (Date.now() - pornit > 90_000) {
          throw new Error('MariaDB nu a pornit in 90 de secunde (container de test).');
        }
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }, 120_000);

  afterAll(async () => {
    await opreste();
  });

  it('intoarce neschimbate o linie noua, un tab si un backslash, dupa un tur complet prin -B', async () => {
    const original = 'a\nb\tc\\d'; // one real newline, one real tab, one real backslash
    // MySQL's OWN string-literal escaping (doubling the backslash), not -B's -
    // this is what makes the container store the 7 characters above, not the
    // 9 we are about to send it.
    const literalSql = original.replace(/\\/g, '\\\\');
    await interogheaza('DROP TABLE IF EXISTS proba_evadare');
    await interogheaza('CREATE TABLE proba_evadare (v TEXT)');
    await interogheaza(`INSERT INTO proba_evadare (v) VALUES ('${literalSql}')`);
    const randuri = await interogheaza('SELECT v FROM proba_evadare');
    expect(randuri).toEqual([[original]]);
  });

  it('NULL soseste ca sirul NULL, indistinguibil de text - de asta interogheaza cere IFNULL', async () => {
    await interogheaza('DROP TABLE IF EXISTS proba_null');
    await interogheaza('CREATE TABLE proba_null (v TEXT)');
    await interogheaza('INSERT INTO proba_null (v) VALUES (NULL)');
    // Raw: exactly the failure mode the doc comment warns about - a real NULL
    // and the four-character string 'NULL' are the same output.
    const bruta = await interogheaza('SELECT v FROM proba_null');
    expect(bruta).toEqual([['NULL']]);
    // Only a caller's own IFNULL disambiguates it.
    const cuSentinela = await interogheaza("SELECT IFNULL(v, '<<NUL>>') FROM proba_null");
    expect(cuSentinela).toEqual([['<<NUL>>']]);
  });

  it('un rand real cu o singura coloana goala nu se confunda cu zero randuri', async () => {
    const unRandGol = await interogheaza("SELECT '' FROM DUAL");
    expect(unRandGol).toEqual([['']]);
    const chiarZeroRanduri = await interogheaza('SELECT 1 FROM DUAL WHERE 1=0');
    expect(chiarZeroRanduri).toEqual([]);
  });
});
