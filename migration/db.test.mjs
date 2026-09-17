import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  EXPECTED_PAGES,
  EXPECTED_POSTS,
  CONTAINER_NAME,
  PASSWORD,
  DUMP_PATH,
  query,
  stop,
  checkCounts,
} from './db.mjs';

describe('sursa migrarii', () => {
  it('numeste dumpul prin cale absoluta, in afara depozitului', () => {
    expect(DUMP_PATH.startsWith('/')).toBe(true);
    expect(DUMP_PATH).toContain('backup-2026-08-27');
    expect(DUMP_PATH.endsWith('database.sql.gz')).toBe(true);
    // The repository root must NOT be a prefix of the dump path: nothing in
    // `migration/` may read migration source from inside this tree, because a
    // file inside the tree is a file somebody can commit.
    //
    // `fileURLToPath`, not `.pathname`: a `URL`'s `.pathname` is percent-
    // encoded, so a checkout under a path containing a space - or any other
    // character `URL` escapes - would turn this into `/a%20b/`, which is
    // never a prefix of a real filesystem path, and the assertion would pass
    // for every checkout at such a path regardless of where the dump sits.
    // `fileURLToPath` reverses that encoding back to real path bytes.
    const root = fileURLToPath(new URL('../', import.meta.url));
    expect(DUMP_PATH.startsWith(root)).toBe(false);
  });

  it('says plainly when the dump is missing, instead of migrating zero rows', async () => {
    // Positive control: the detector can fire. A harness that reports success
    // on a missing source is the failure this whole file exists to prevent.
    const { requireDump } = await import('./db.mjs');
    expect(() => requireDump('/nu/exista/database.sql.gz')).toThrow(
      /The dump was not found/,
    );
    // And the other direction, so the check is not vacuously true.
    if (existsSync(DUMP_PATH)) {
      expect(() => requireDump(DUMP_PATH)).not.toThrow();
    }
  });

  it("the container name is this project's, not a generic one", () => {
    expect(CONTAINER_NAME).toBe('bzh-migration');
  });
});

describe('checkCounts', () => {
  // Pure comparison, no docker: cheap enough to run on every `npm test`, so
  // this is the negative control for `start()`'s post-load assertion that
  // does not cost a container. The container-level proof - that a genuinely
  // corrupted load now throws before this function is ever reached - is
  // demonstrated by hand in `task-1-report.md`, against a real truncated copy
  // of the real dump, because that half of the claim is about shell and
  // process exit codes rather than about this comparison.
  it('does not throw when the counts match what the plan expected', () => {
    expect(() => checkCounts(EXPECTED_POSTS, EXPECTED_PAGES)).not.toThrow();
  });

  it('throws naming the expected and the found counts, when the posts do not match', () => {
    let error;
    try {
      checkCounts(3, EXPECTED_PAGES);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain(String(EXPECTED_POSTS));
    expect(error.message).toContain(String(EXPECTED_PAGES));
    expect(error.message).toContain('3');
  });

  it('throws when only the pages do not match too', () => {
    expect(() => checkCounts(EXPECTED_POSTS, 0)).toThrow(
      new RegExp(`${EXPECTED_POSTS}.*${EXPECTED_PAGES}`),
    );
  });
});

// The tests below start their own disposable, dump-free `bzh-migration`
// container - not the real 28MB dump, which `start()`'s own report proves
// separately - because what is under test here is `query`'s handling
// of `-B`'s output format itself, which needs a real MariaDB round trip to
// prove (a claim about what a real client prints is not decidable by reading
// this file), but does not need the real content to prove it with.
describe('query - real rows through a container', () => {
  beforeAll(async () => {
    await stop(); // clean slate, reusing the harness's own teardown
    execFileSync('docker', [
      'run', '-d', '--name', CONTAINER_NAME,
      '-e', `MARIADB_ROOT_PASSWORD=${PASSWORD}`,
      '-e', 'MARIADB_DATABASE=wp',
      'mariadb:11',
    ]);
    const startedAt = Date.now();
    for (;;) {
      try {
        await query('SELECT 1');
        break;
      } catch {
        if (Date.now() - startedAt > 90_000) {
          throw new Error('MariaDB did not start within 90 seconds (test container).');
        }
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }, 120_000);

  afterAll(async () => {
    await stop();
  });

  it('returns a newline, a tab and a backslash unchanged, after a full round trip through -B', async () => {
    const original = 'a\nb\tc\\d'; // one real newline, one real tab, one real backslash
    // MySQL's OWN string-literal escaping (doubling the backslash), not -B's -
    // this is what makes the container store the 7 characters above, not the
    // 9 we are about to send it.
    const sqlLiteral = original.replace(/\\/g, '\\\\');
    await query('DROP TABLE IF EXISTS proba_evadare');
    await query('CREATE TABLE proba_evadare (v TEXT)');
    await query(`INSERT INTO proba_evadare (v) VALUES ('${sqlLiteral}')`);
    const rows = await query('SELECT v FROM proba_evadare');
    expect(rows).toEqual([[original]]);
  });

  it('NULL arrives as the string NULL, indistinguishable from text - which is why query demands IFNULL', async () => {
    await query('DROP TABLE IF EXISTS proba_null');
    await query('CREATE TABLE proba_null (v TEXT)');
    await query('INSERT INTO proba_null (v) VALUES (NULL)');
    // Raw: exactly the failure mode the doc comment warns about - a real NULL
    // and the four-character string 'NULL' are the same output.
    const rawLine = await query('SELECT v FROM proba_null');
    expect(rawLine).toEqual([['NULL']]);
    // Only a caller's own IFNULL disambiguates it.
    const withSentinel = await query("SELECT IFNULL(v, '<<NUL>>') FROM proba_null");
    expect(withSentinel).toEqual([['<<NUL>>']]);
  });

  it('a real row with a single empty column is not confused with zero rows', async () => {
    const oneEmptyRow = await query("SELECT '' FROM DUAL");
    expect(oneEmptyRow).toEqual([['']]);
    const trulyNoRows = await query('SELECT 1 FROM DUAL WHERE 1=0');
    expect(trulyNoRows).toEqual([]);
  });
});
