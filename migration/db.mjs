import { execFileSync, execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * The database dump, by absolute path, OUTSIDE this repository.
 *
 * The enclosing directory holds several GB of forensic backups of the
 * compromised server and a file of database credentials. Nothing from it is
 * ever copied into this tree and nothing in this tree is ever the source of a
 * migration - which is why this path is absolute and asserted to sit outside
 * the repository root rather than being resolved relative to it.
 */
export const DUMP_PATH =
  '/Users/stefan/Work/stuff/site-bzh/backup-2026-08-27/database.sql.gz';

/** Named for this project, so a stray container is attributable. */
export const CONTAINER_NAME = 'bzh-migration';

// Exported (not a real secret - a disposable local container's root password)
// so `db.test.mjs` can start its own minimal, dump-free container for the
// round-trip tests below, using the exact credentials `query` connects
// with, rather than a second copy of this string that could drift from it.
export const PASSWORD = 'migrare';
const DATABASE = 'wp';

/**
 * The two counts this plan is sized from - see `migration/README.md`'s
 * "Measured counts". Hard-coded rather than derived from anything the load
 * itself could get wrong, because they are what `checkCounts` checks the
 * load against.
 */
export const EXPECTED_POSTS = 45;
export const EXPECTED_PAGES = 26;

/**
 * Throws when the loaded counts do not match `EXPECTED_POSTS`/
 * `EXPECTED_PAGES`. Pure - no docker, no I/O - so a unit test can prove it
 * fires without a container: pass numbers, don't run a load. `start()`
 * calls it with real counts after loading; the two are tested separately
 * because a container is expensive and this comparison is not.
 */
export function checkCounts(posts, pages) {
  if (posts !== EXPECTED_POSTS || pages !== EXPECTED_PAGES) {
    throw new Error(
      `The load does not match what the plan expected: ${EXPECTED_POSTS} published ` +
        `posts and ${EXPECTED_PAGES} published pages, but the loaded database has ` +
        `${posts} posts and ${pages} pages. Either the load failed part way, or the ` +
        'dump itself has changed - in both cases, do not migrate from this data.',
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
export function requireDump(path = DUMP_PATH) {
  if (!existsSync(path)) {
    throw new Error(
      `The dump was not found: ${path}\n` +
        'The migration reads from the backups in the parent directory, which are ' +
        'not part of the repository. Without them nothing can be migrated.',
    );
  }
  return path;
}

function docker(args, options = {}) {
  return execFileSync('docker', args, { encoding: 'utf8', ...options });
}

/** True when a container of that name exists, running or not. */
function exists() {
  return docker(['ps', '-aq', '--filter', `name=^${CONTAINER_NAME}$`]).trim() !== '';
}

/**
 * Starts a disposable MariaDB and loads the dump into it.
 *
 * IDEMPOTENT BY DESTRUCTION, on purpose: an existing container is removed
 * rather than reused. Reuse would make the migration's output depend on what a
 * previous run happened to leave behind, and spec 11 requires that rerunning
 * produce identical output.
 *
 * Takes an optional dump path, defaulting to `DUMP_PATH`, symmetrically with
 * `requireDump`'s own default parameter. No real caller passes one; it
 * exists so the corruption-detection below can be demonstrated against a
 * deliberately truncated copy without duplicating this function's container
 * setup in a throwaway script - see `task-1-report.md`'s negative control.
 */
export async function start(path = DUMP_PATH) {
  requireDump(path);
  if (exists()) await stop();
  docker([
    'run', '-d', '--name', CONTAINER_NAME,
    '-e', `MARIADB_ROOT_PASSWORD=${PASSWORD}`,
    '-e', `MARIADB_DATABASE=${DATABASE}`,
    'mariadb:11',
  ]);

  // Wait for the server rather than sleeping a fixed amount: a fixed sleep is
  // a timing figure from one machine, and this one has to work on a laptop
  // under load and in CI.
  const startedAt = Date.now();
  for (;;) {
    try {
      docker(['exec', CONTAINER_NAME, 'mariadb', `-p${PASSWORD}`, '-uroot', '-e', 'SELECT 1'],
        { stdio: 'pipe' });
      break;
    } catch {
      if (Date.now() - startedAt > 90_000) {
        throw new Error(
          `MariaDB did not start within 90 seconds. See 'docker logs ${CONTAINER_NAME}'.`,
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
  await execFileAsync('/bin/bash', [
    '-c',
    `set -o pipefail; gunzip -c ${JSON.stringify(path)} | ` +
      `docker exec -i ${CONTAINER_NAME} mariadb -uroot -p${PASSWORD} ${DATABASE}`,
  ], { maxBuffer: 1024 * 1024 * 64 });

  // Belt and braces beyond the pipeline's own exit code: prove the load
  // produced the table this project reads and the row counts the plan is
  // sized from, rather than trusting a clean exit status alone. A clean exit
  // is necessary but was never sufficient - see the pipefail comment above for
  // the shape of a load that "succeeds" while short of the real content.
  const tables = await query("SHOW TABLES LIKE 'wpoi_posts'");
  if (tables.length === 0) {
    throw new Error('The load failed: the table wpoi_posts does not exist afterwards.');
  }
  const [[posts]] = await query(
    "SELECT COUNT(*) FROM wpoi_posts WHERE post_type='post' AND post_status='publish'",
  );
  const [[pages]] = await query(
    "SELECT COUNT(*) FROM wpoi_posts WHERE post_type='page' AND post_status='publish'",
  );
  checkCounts(Number(posts), Number(pages));
}

/** Removes the container. Safe to call when it does not exist. */
export async function stop() {
  if (exists()) docker(['rm', '-f', CONTAINER_NAME]);
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
const B_ESCAPES = { 0: '\0', n: '\n', t: '\t', r: '\r', '\\': '\\' };

/** Reverses exactly the escaping `-B` performs - see `B_ESCAPES` - no more. */
function unescapeField(field) {
  return field.replace(/\\[0ntr\\]/g, (sequence) => B_ESCAPES[sequence[1]]);
}

/**
 * One query, rows as arrays of column strings.
 *
 * `-N` drops the header, `-B` makes it tab-separated and `--default-character-
 * set=utf8mb4` is what stops every Romanian letter arriving as a question mark -
 * which would not fail anything, it would just quietly migrate mangled text.
 * `-B`'s own escaping is reversed before rows are returned - see
 * `unescapeField` - because every later migration task reads `post_content`
 * through this function, and a BUILT_TEXT column's real newlines and tabs must not
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
export async function query(sql) {
  const { stdout } = await execFileAsync('docker', [
    'exec', CONTAINER_NAME, 'mariadb', '-uroot', `-p${PASSWORD}`,
    '-N', '-B', '--default-character-set=utf8mb4',
    '-e', sql, DATABASE,
  ], { maxBuffer: 1024 * 1024 * 512 });
  // Not `.trim() === ''`: a real one-row, one-column result whose only value
  // is the empty string is `'\n'` (the row's own terminator), which `.trim()`
  // erases before it can be told apart from "no rows at all" (`''`, no
  // terminator because there was no row to terminate).
  if (stdout === '') return [];
  return stdout
    .replace(/\n$/, '')
    .split('\n')
    .map((row) => row.split('\t').map(unescapeField));
}
