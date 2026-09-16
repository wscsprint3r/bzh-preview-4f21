# migrare

The Phase 2 migration harness: a disposable MariaDB container loaded from the
2026-08-27 WordPress dump, so the migration tasks can query the old content
with SQL instead of parsing 352 MB of phpMyAdmin output with regexes. Nothing
here ships to a visitor — `migrare/` is committed and repeatable, but it is
not part of the site build.

## Requirements

- **Docker** must be running. `porneste()` shells out to the `docker` CLI
  directly; there is no fallback.
- **The dump is not in this repository, and a fresh clone cannot run this.**
  `SURSA_DUMP` points at
  `/Users/stefan/Work/stuff/site-bzh/backup-2026-08-27/database.sql.gz`, a
  path outside the repository root. That parent directory holds several GB of
  forensic backups of the compromised WordPress install plus a file of
  database credentials, and is deliberately excluded from git — see the root
  `CLAUDE.md`. `verificaSursa()` throws a named, Romanian error
  (`Dumpul nu a fost gasit`) rather than silently migrating zero rows when the
  dump is absent, which is the failure this harness exists to prevent.

## Usage

```js
import { porneste, interogheaza, opreste } from './db.mjs';

await porneste(); // starts bzh-migrare, waits for MariaDB, loads the dump
const randuri = await interogheaza('SELECT ... FROM wpoi_posts ...');
await opreste(); // removes the container
```

`interogheaza()` returns rows as arrays of column strings (tab-separated
`mariadb -N -B` output, split), queried against the `wp` database with
`--default-character-set=utf8mb4` so Romanian diacritics survive the round
trip instead of arriving as question marks. `-B`'s own escaping (backslash,
newline, carriage return, tab, NUL, each printed as a two-character
backslash sequence) is reversed before rows come back, since every later
migration task reads `post_content` through this function.

**SQL `NULL` is not distinguishable from the four-character string `NULL`
here** - `-B` prints both identically. A caller reading a nullable column
must write `IFNULL(col, <sentinel>)` in the SQL itself and check for the
sentinel; `interogheaza()` cannot disambiguate the two from its output alone
and does not pretend to.

`porneste()` verifies its own load before returning: after the pipeline
finishes, it checks that `wpoi_posts` exists and that the published-post and
published-page counts still match `ASTEPTAT_POSTARI`/`ASTEPTAT_PAGINI` (45
and 26). A mismatch throws, naming both the expected and the found numbers,
rather than handing back a database that loaded "successfully" but short.

## Destroyed and recreated on every run, not reused

`porneste()` removes any existing `bzh-migrare` container before creating a
new one. This is idempotent by destruction on purpose: reusing a container
would let the migration's output depend on whatever a previous run happened
to leave behind, and rerunning the migration must produce identical output
(no timestamps, no random ids, no locale-dependent ordering). Verified by
hand: running the full start/query/stop cycle twice in a row produced the
same counts both times, and starting `porneste()` against a pre-existing
container of the same name (including one from an unrelated image) tore it
down and replaced it rather than reusing it.

## Measured counts (2026-09-16)

Loaded the real dump and queried it through the harness itself
(`porneste()` → `interogheaza()` → `opreste()`):

```
posts 45 pages 26
```

- `SELECT COUNT(*) FROM wpoi_posts WHERE post_type='post' AND post_status='publish'` → **45**
- `SELECT COUNT(*) FROM wpoi_posts WHERE post_type='page' AND post_status='publish'` → **26**

These two numbers are what the rest of Phase 2's task list is sized from. A
different count on a re-measurement means a different dump, and the plan
would need to be reconsidered before anything downstream is trusted.

## A defect found while measuring the above

The task plan's original query code queried the database name
`h164835_wordpress7`. That database does not exist in the loaded dump — the
dump contains no `CREATE DATABASE` or `USE` statement at all, so every table
lands in whatever database the connection defaults to, which is `wp` (the
name `porneste()` creates via `MARIADB_DATABASE`). `h164835_wordpress7` does
appear in the dump, but only as *data*: it is the original host's own
database name, embedded as a string inside a backup plugin's serialized
configuration. Querying it throws `ERROR 1049 (42000): Unknown database`
rather than returning a wrong count, which is how the mismatch was caught
here rather than in a later task. `interogheaza()` queries `wp`.

## A second defect: a partial load could exit 0

The load pipeline was originally `gunzip -c dump.gz | docker exec -i
CONTAINER mariadb ... --force wp`, run under `/bin/sh`. Two problems compound:
`--force` makes mariadb log and skip a SQL error and keep going rather than
stop, and a shell pipeline's exit status - without `set -o pipefail` - is only
the LAST command's, so gunzip failing partway through is invisible regardless.
A dump that can only partially decompress - truncated in transit, a corrupted
copy - would load a valid PREFIX and still exit 0.

Measured on a copy of the real dump truncated to a third of its size: the old
pipeline (`/bin/sh`, `--force`) exited 0. The fixed one (`/bin/bash`,
`set -o pipefail`, no `--force`) exited 1 on the same file - `/bin/bash`
rather than `/bin/sh` because `pipefail` is a bash feature that a typical
Linux CI runner's `/bin/sh` (dash) does not have. `porneste()` also no longer
trusts the pipeline's exit code alone even with the fix: it queries the two
counts above after loading and throws if they do not match, so a load that
somehow still succeeds while short of the real content does not go unnoticed
either. See `db.test.mjs` for the fast, container-free test of that
comparison, and `task-1-report.md` for the full negative-control run.
