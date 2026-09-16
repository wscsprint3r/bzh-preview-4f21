import { execFileSync, execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';

const executa = promisify(execFile);

/**
 * The database dump, by absolute path, OUTSIDE this repository.
 *
 * The enclosing directory holds several GB of forensic backups of the
 * compromised server and a file of database credentials. Nothing from it is
 * ever copied into this tree and nothing in this tree is ever the source of a
 * migration - which is why this path is absolute and asserted to sit outside
 * the repository root rather than being resolved relative to it.
 */
export const SURSA_DUMP =
  '/Users/stefan/Work/stuff/site-bzh/backup-2026-08-27/database.sql.gz';

/** Named for this project, so a stray container is attributable. */
export const NUME_CONTAINER = 'bzh-migrare';

// Exported (not a real secret - a disposable local container's root password)
// so `db.test.mjs` can start its own minimal, dump-free container for the
// round-trip tests below, using the exact credentials `interogheaza` connects
// with, rather than a second copy of this string that could drift from it.
export const PAROLA = 'migrare';
const BAZA = 'wp';

/**
 * The two counts this plan is sized from - see `migrare/README.md`'s
 * "Measured counts". Hard-coded rather than derived from anything the load
 * itself could get wrong, because they are what `verificaNumerele` checks the
 * load against.
 */
export const ASTEPTAT_POSTARI = 45;
export const ASTEPTAT_PAGINI = 26;

/**
 * Throws when the loaded counts do not match `ASTEPTAT_POSTARI`/
 * `ASTEPTAT_PAGINI`. Pure - no docker, no I/O - so a unit test can prove it
 * fires without a container: pass numbers, don't run a load. `porneste()`
 * calls it with real counts after loading; the two are tested separately
 * because a container is expensive and this comparison is not.
 */
export function verificaNumerele(postari, pagini) {
  if (postari !== ASTEPTAT_POSTARI || pagini !== ASTEPTAT_PAGINI) {
    throw new Error(
      `Incarcarea nu se potriveste cu ce astepta planul: ${ASTEPTAT_POSTARI} postari ` +
        `publicate si ${ASTEPTAT_PAGINI} pagini publicate, dar baza incarcata are ` +
        `${postari} postari si ${pagini} pagini. Fie incarcarea a esuat partial, fie ` +
        'dumpul insusi s-a schimbat - in ambele cazuri, nu migra pe baza acestor date.',
    );
  }
}

/**
 * Fails by name when the dump is absent.
 *
 * A guard that reads a file must prove it read something. Without this, a
 * fresh clone on a machine that has never held the backups runs the whole
 * migration, writes zero content files, and exits 0 - and the first symptom is
 * an empty news section nobody can explain.
 */
export function verificaSursa(cale = SURSA_DUMP) {
  if (!existsSync(cale)) {
    throw new Error(
      `Dumpul nu a fost gasit: ${cale}\n` +
        'Migrarea citeste din copiile de siguranta din directorul parinte, care ' +
        'nu fac parte din depozit. Fara ele nu se poate migra nimic.',
    );
  }
  return cale;
}

function docker(args, optiuni = {}) {
  return execFileSync('docker', args, { encoding: 'utf8', ...optiuni });
}

/** True when a container of that name exists, running or not. */
function exista() {
  return docker(['ps', '-aq', '--filter', `name=^${NUME_CONTAINER}$`]).trim() !== '';
}

/**
 * Starts a disposable MariaDB and loads the dump into it.
 *
 * IDEMPOTENT BY DESTRUCTION, on purpose: an existing container is removed
 * rather than reused. Reuse would make the migration's output depend on what a
 * previous run happened to leave behind, and spec 11 requires that rerunning
 * produce identical output.
 *
 * Takes an optional dump path, defaulting to `SURSA_DUMP`, symmetrically with
 * `verificaSursa`'s own default parameter. No real caller passes one; it
 * exists so the corruption-detection below can be demonstrated against a
 * deliberately truncated copy without duplicating this function's container
 * setup in a throwaway script - see `task-1-report.md`'s negative control.
 */
export async function porneste(cale = SURSA_DUMP) {
  verificaSursa(cale);
  if (exista()) await opreste();
  docker([
    'run', '-d', '--name', NUME_CONTAINER,
    '-e', `MARIADB_ROOT_PASSWORD=${PAROLA}`,
    '-e', `MARIADB_DATABASE=${BAZA}`,
    'mariadb:11',
  ]);

  // Wait for the server rather than sleeping a fixed amount: a fixed sleep is
  // a timing figure from one machine, and this one has to work on a laptop
  // under load and in CI.
  const pornit = Date.now();
  for (;;) {
    try {
      docker(['exec', NUME_CONTAINER, 'mariadb', `-p${PAROLA}`, '-uroot', '-e', 'SELECT 1'],
        { stdio: 'pipe' });
      break;
    } catch {
      if (Date.now() - pornit > 90_000) {
        throw new Error(
          `MariaDB nu a pornit in 90 de secunde. Vezi 'docker logs ${NUME_CONTAINER}'.`,
        );
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  // `set -o pipefail` and no `--force`, both load-bearing. Without either, a
  // dump gunzip can only partially decompress - truncated in transit, a
  // corrupted copy, a network hiccup on however this file arrives in future -
  // feeds mariadb a valid PREFIX of the dump: `--force` makes mariadb log and
  // skip the SQL error where the stream cuts off and keep going, and without
  // pipefail a shell pipeline's exit status is only the LAST command's, so
  // gunzip's own failure is invisible regardless. Measured on a copy of the
  // real dump truncated to a third of its size: the old combination
  // (`/bin/sh`, `--force`) exited 0; this one exits 1. `/bin/bash` rather than
  // `/bin/sh` because `pipefail` is a bash feature - `/bin/sh` is dash on a
  // typical Linux CI runner, which rejects the option outright.
  await executa('/bin/bash', [
    '-c',
    `set -o pipefail; gunzip -c ${JSON.stringify(cale)} | ` +
      `docker exec -i ${NUME_CONTAINER} mariadb -uroot -p${PAROLA} ${BAZA}`,
  ], { maxBuffer: 1024 * 1024 * 64 });

  // Belt and braces beyond the pipeline's own exit code: prove the load
  // produced the table this project reads and the row counts the plan is
  // sized from, rather than trusting a clean exit status alone. A clean exit
  // is necessary but was never sufficient - see the pipefail comment above for
  // the shape of a load that "succeeds" while short of the real content.
  const tabele = await interogheaza("SHOW TABLES LIKE 'wpoi_posts'");
  if (tabele.length === 0) {
    throw new Error('Incarcarea a esuat: tabelul wpoi_posts nu exista dupa incarcare.');
  }
  const [[postari]] = await interogheaza(
    "SELECT COUNT(*) FROM wpoi_posts WHERE post_type='post' AND post_status='publish'",
  );
  const [[pagini]] = await interogheaza(
    "SELECT COUNT(*) FROM wpoi_posts WHERE post_type='page' AND post_status='publish'",
  );
  verificaNumerele(Number(postari), Number(pagini));
}

/** Removes the container. Safe to call when it does not exist. */
export async function opreste() {
  if (exista()) docker(['rm', '-f', NUME_CONTAINER]);
}

/**
 * The characters `-B` (below) escapes on output, and their real values.
 * Documented by MariaDB/MySQL's own client manual for tab-separated output,
 * not guessed: NUL, backslash, newline, carriage return and tab each arrive
 * as two characters, a backslash followed by the letter shown here. Reversed
 * in one regex pass rather than five sequential `.replace` calls, because a
 * sequential pass would re-scan a backslash a previous replacement just
 * produced - unescaping `\\n` (a literal backslash-n, two source characters)
 * two ways in sequence turns it into a real newline, which is wrong twice
 * over.
 */
const EVADARI_B = { 0: '\0', n: '\n', t: '\t', r: '\r', '\\': '\\' };

/** Reverses exactly the escaping `-B` performs - see `EVADARI_B` - no more. */
function deescapeaza(camp) {
  return camp.replace(/\\[0ntr\\]/g, (secventa) => EVADARI_B[secventa[1]]);
}

/**
 * One query, rows as arrays of column strings.
 *
 * `-N` drops the header, `-B` makes it tab-separated and `--default-character-
 * set=utf8mb4` is what stops every Romanian letter arriving as a question mark -
 * which would not fail anything, it would just quietly migrate mangled text.
 * `-B`'s own escaping is reversed before rows are returned - see
 * `deescapeaza` - because every later migration task reads `post_content`
 * through this function, and a TEXT column's real newlines and tabs must not
 * arrive as the two-character sequences `-B` prints them as.
 *
 * SQL NULL IS NOT DISTINGUISHABLE FROM THE FOUR-CHARACTER STRING `NULL` HERE.
 * `-B` prints an actual NULL as the literal word `NULL`, unescaped and
 * unquoted - identical to a column that really contains that text. This
 * function cannot tell the two apart from the output alone, so it does not
 * try: a caller reading a nullable column writes `IFNULL(col, <sentinel>)` in
 * the SQL itself, where `<sentinel>` is a value the real column cannot hold,
 * and treats a fresh mismatch here as its own bug to fix at the query site,
 * not a mangling to fix in this function.
 */
export async function interogheaza(sql) {
  const { stdout } = await executa('docker', [
    'exec', NUME_CONTAINER, 'mariadb', '-uroot', `-p${PAROLA}`,
    '-N', '-B', '--default-character-set=utf8mb4',
    '-e', sql, BAZA,
  ], { maxBuffer: 1024 * 1024 * 512 });
  // Not `.trim() === ''`: a real one-row, one-column result whose only value
  // is the empty string is `'\n'` (the row's own terminator), which `.trim()`
  // erases before it can be told apart from "no rows at all" (`''`, no
  // terminator because there was no row to terminate).
  if (stdout === '') return [];
  return stdout
    .replace(/\n$/, '')
    .split('\n')
    .map((rand) => rand.split('\t').map(deescapeaza));
}
