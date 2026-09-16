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

const PAROLA = 'migrare';
const BAZA = 'wp';

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
 */
export async function porneste() {
  verificaSursa();
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
        throw new Error('MariaDB nu a pornit in 90 de secunde.');
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  await executa('/bin/sh', [
    '-c',
    `gunzip -c ${JSON.stringify(SURSA_DUMP)} | ` +
      `docker exec -i ${NUME_CONTAINER} mariadb -uroot -p${PAROLA} --force ${BAZA}`,
  ], { maxBuffer: 1024 * 1024 * 64 });
}

/** Removes the container. Safe to call when it does not exist. */
export async function opreste() {
  if (exista()) docker(['rm', '-f', NUME_CONTAINER]);
}

/**
 * One query, rows as arrays of column strings.
 *
 * `-N` drops the header, `-B` makes it tab-separated and `--default-character-
 * set=utf8mb4` is what stops every Romanian letter arriving as a question mark -
 * which would not fail anything, it would just quietly migrate mangled text.
 *
 * The database argument is `BAZA` ('wp'), the same name `porneste()` creates
 * via `MARIADB_DATABASE`. The dump has no `CREATE DATABASE` or `USE`
 * statement in it - measured with `grep` over the decompressed file - so
 * every table lands in whatever database the connection defaults to, which is
 * `wp`. The original plan text queried `h164835_wordpress7`, which does not
 * exist here: that string appears in the dump only as *data*, inside a
 * backup plugin's serialized config recording the live host's own database
 * name. Querying it throws `ERROR 1049 (42000): Unknown database`, not a
 * wrong count, which is how this was caught before it reached a later task.
 */
export async function interogheaza(sql) {
  const { stdout } = await executa('docker', [
    'exec', NUME_CONTAINER, 'mariadb', '-uroot', `-p${PAROLA}`,
    '-N', '-B', '--default-character-set=utf8mb4',
    '-e', sql, BAZA,
  ], { maxBuffer: 1024 * 1024 * 512 });
  if (stdout.trim() === '') return [];
  return stdout.replace(/\n$/, '').split('\n').map((r) => r.split('\t'));
}
