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
trip instead of arriving as question marks.

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
