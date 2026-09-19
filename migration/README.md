# migration

The Phase 2 migration harness: a disposable MariaDB container loaded from the
2026-08-27 WordPress dump, so the migration tasks can query the old content
with SQL instead of parsing 352 MB of phpMyAdmin output with regexes. Nothing
here ships to a visitor — `migration/` is committed and repeatable, but it is
not part of the site build.

## Requirements

- **Docker** must be running. `start()` shells out to the `docker` CLI
  directly; there is no fallback.
- **poppler** (`pdfinfo`) must be installed for the PDF gate. `gatePdf` shells
  `pdfinfo` and `pdfinfo -js`; there is no fallback, and without the binary
  every PDF reports "pdfinfo could not read it" and the run exits non-zero
  rather than migrating anything. On Debian and Ubuntu it is
  `sudo apt-get install poppler-utils`; `ci.yml` installs it before `npm test`.
- **The dump is not in this repository, and a fresh clone cannot run this.**
  `DUMP_PATH` points at
  `/Users/stefan/Work/stuff/site-bzh/backup-2026-08-27/database.sql.gz`, a
  path outside the repository root. That parent directory holds several GB of
  forensic backups of the compromised WordPress install plus a file of
  database credentials, and is deliberately excluded from git — see the root
  `CLAUDE.md`. `requireDump()` throws a named error carrying the path
  (`The dump was not found: …`) rather than silently migrating zero rows when the
  dump is absent, which is the failure this harness exists to prevent.

## Usage

```js
import { start, query, stop } from './db.mjs';

await start(); // starts bzh-migration, waits for MariaDB, loads the dump
const rows = await query('SELECT ... FROM wpoi_posts ...');
await stop(); // removes the container
```

`query()` returns rows as arrays of column strings (tab-separated
`mariadb -N -B` output, split), queried against the `wp` database with
`--default-character-set=utf8mb4` so Romanian diacritics survive the round
trip instead of arriving as question marks. `-B`'s own escaping (backslash,
newline, carriage return, tab, NUL, each printed as a two-character
backslash sequence) is reversed before rows come back, since every later
migration task reads `post_content` through this function.

**SQL `NULL` is not distinguishable from the four-character string `NULL`
here** - `-B` prints both identically. A caller reading a nullable column
must write `IFNULL(col, <sentinel>)` in the SQL itself and check for the
sentinel; `query()` cannot disambiguate the two from its output alone
and does not pretend to.

`start()` verifies its own load before returning: after the pipeline
finishes, it checks that `wpoi_posts` exists and that the published-post and
published-page counts still match `EXPECTED_POSTS`/`EXPECTED_PAGES` (45
and 26). A mismatch throws, naming both the expected and the found numbers,
rather than handing back a database that loaded "successfully" but short.

## Destroyed and recreated on every run, not reused

`start()` removes any existing `bzh-migration` container before creating a
new one. This is idempotent by destruction on purpose: reusing a container
would let the migration's output depend on whatever a previous run happened
to leave behind, and rerunning the migration must produce identical output
(no timestamps, no random ids, no locale-dependent ordering). Verified by
hand: running the full start/query/stop cycle twice in a row produced the
same counts both times, and starting `start()` against a pre-existing
container of the same name (including one from an unrelated image) tore it
down and replaced it rather than reusing it.

## Measured counts (2026-09-16)

Loaded the real dump and queried it through the harness itself
(`start()` → `query()` → `stop()`):

```
posts 45 pages 26
```

- `SELECT COUNT(*) FROM wpoi_posts WHERE post_type='post' AND post_status='publish'` → **45**
- `SELECT COUNT(*) FROM wpoi_posts WHERE post_type='page' AND post_status='publish'` → **26**

These two numbers are what the rest of Phase 2's task list is sized from. A
different count on a re-measurement means a different dump, and the plan
would need to be reconsidered before anything downstream is trusted.

## Verifying `stripPreamble` against the real corpus

`migration/check-preamble.mjs` re-proves Task 3's preamble strip against
every one of the 71 real published posts and pages, not a synthetic fixture:
that a changed document has lost BOTH markers it recognises (not just one —
a weaker "did the string change" check would miss a partial strip), that
applying it twice never changes anything a first pass did not already
change, and both directions of the original brief's proof (no post touched,
every one of the nine target pages touched). It needs Docker and the dump
like `db.mjs` does, so it is not part of `npm test` — run it by hand:

```
node migration/check-preamble.mjs
```

It exits non-zero and names every offending document on any violation, and
prints the measured counts either way. Re-run whenever `stripPreamble`'s
regexes change or the dump is refreshed.

## A defect found while measuring the above

The task plan's original query code queried the database name
`h164835_wordpress7`. That database does not exist in the loaded dump — the
dump contains no `CREATE DATABASE` or `USE` statement at all, so every table
lands in whatever database the connection defaults to, which is `wp` (the
name `start()` creates via `MARIADB_DATABASE`). `h164835_wordpress7` does
appear in the dump, but only as *data*: it is the original host's own
database name, embedded as a string inside a backup plugin's serialized
configuration. Querying it throws `ERROR 1049 (42000): Unknown database`
rather than returning a wrong count, which is how the mismatch was caught
here rather than in a later task. `query()` queries `wp`.

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
Linux CI runner's `/bin/sh` (dash) does not have. `start()` also no longer
trusts the pipeline's exit code alone even with the fix: it queries the two
counts above after loading and throws if they do not match, so a load that
somehow still succeeds while short of the real content does not go unnoticed
either. See `db.test.mjs` for the fast, container-free test of that
comparison, and `task-1-report.md` for the full negative-control run.

## `media.mjs` — the image pipeline

`migrateImages(sources, repoRoot?, uploadsRoot?)` takes the `src`
attributes `imagesIn()` found, writes sanitised images under
`src/assets/content/`, and returns a `Map` from each original `src` to its new
repo-relative path. A `src` with no entry in that map is a reference the
migration could not honour, and **the caller must treat that as a failure rather
than emitting a blank** — nothing downstream validates image paths, because
`image` is deliberately an unvalidated string in `content-schema.ts`.

**Re-encoding is the sanitisation.** Nothing is copied. Every file is decoded to
pixels by sharp and written out fresh, so an archive appended after the end
marker, a payload in EXIF, or anything else that is not pixels does not survive.
A file that fails to decode is not an image and is dropped by name. **SVG is not
migrated at all** — sharp can rasterise it, but an SVG that stays an SVG carries
script. Neither are `.doc`, `.js`, `.html`, `.htaccess`, `.json`, `.css`, `.txt`.

**`UPLOADS_ROOT` points at the 2026-08-22 backup, not the 2026-08-27 one
`DUMP_PATH` uses.** That is not a typo: the 08-27 capture holds only
`database.sql.gz` and `htdocs.tar.gz`, and the unpacked file tree lives in
08-22. The two dates are two different captures and both are correct.

### Measured (2026-09-17, 71 published posts and pages)

```
116 <img> tags -> 97 unique srcs, plus 3 featured images = 100 references
100 migrated, 0 skipped, 50.0 MB written, 100 source files
 33 of the 100 were -WxH thumbnails, resolved to 33 distinct originals,
    all 33 of which no <img> references directly
100/100 byte-identical across two runs into two different roots
```

### A referenced thumbnail is migrated as its original

WordPress writes `name-WIDTHxHEIGHT.ext` for every generated size, and 33 of the
references point at one. They are not dropped: the suffix is stripped and the
original is migrated in its place, with both srcs mapping to the same
destination. Dropping them would lose the icon of Saint Nicholas from `istoric`,
a council member's photograph, five Doxologia cover scans and the liturgical
programme — on a green build, because a missing picture fails nothing.

Stripping `-WxH` is a guess about which file a name belongs to, and a wrong
guess puts a *different picture* on the page, which nothing downstream can
detect because a valid image is exactly what it finds. So it is checked three
ways, each stopping the run by name: the original must exist; the file must be
the size its name claims (this is what tells a generated thumbnail from a real
upload whose name happens to carry digits and an `x`); and the original must be
at least as large in both directions, compared **after** EXIF orientation.

**Eight of the 33 are hard crops**, so those pages will show a differently framed
picture than they do today: `testi-1/2/3`, `event1`, `event6`, `service1` (all
Astra theme demo content) and the two `PHOTO-2026-02-20-*` on
`cursuri-de-pictura`, which are real. That is a Phase 3 decision about those
pages, not a migration defect — and per-file "is this demo content?" judgement
was deliberately not made here, because it is the kind of call that goes wrong
quietly.

### Why the images are committed by Task 6 and not by Task 5

Task 5 produces the pipeline and commits only `media.mjs` and `media.test.mjs`.
It does **not** commit `src/assets/content/**`, and that is deliberate:
`src/lib/diacritics-sources.test.ts` fails any tracked file that is not valid UTF-8
and is not listed in `BINARIES`, which holds one path and is named one by one by
design. A hundred images cannot be.

Task 6 owns that change: `BINARIES` becomes a predicate — `public/favicon.ico`, or
a path under `src/assets/content/` with an extension on a fixed allow-list. A
prefix rule is a pure weakening on its own, so it does not ship alone: the
property it removes is replaced by a stronger one, a check that **every file
under that prefix actually decodes as an image through sharp**. Renaming a
payload to `.jpg` defeats a name list; it does not defeat a decoder. That check
needs sharp and about a hundred files, so it belongs in an `.itest.ts` run by
`npm run test:build`, not in the unit sweep.

## The PDF gate

The 87 PDFs are **copied byte-for-byte, never re-encoded**, and that is a
recorded ruling rather than an unfinished pipeline. Re-encoding is how every
raster is sanitised, but a PDF cannot be re-encoded without either destroying
its text or rasterising it, so the archive ships as bytes behind a gate. The
gate is weaker than re-encoding and is stated as such: it does not rewrite the
file, and it cannot see a payload that hides in a compressed stream. What it
does catch is what the corpus was measured for.

- **Readability** is `pdfinfo`'s. A file it cannot open is dropped by name —
  the same shape as sharp's decode-or-drop.
- **JavaScript** is `pdfinfo -js`'s. A non-empty report fails the file.
- **Payload names** are a raw-byte scan for `/EmbeddedFile` and `/Launch`.
  `/JS` is deliberately NOT in the byte scan: measured 2026-09-18, six of the
  87 clean files contain those bytes inside compressed streams, so scanning
  for it would drop six documents the JavaScript question had already cleared.

A failing file is **dropped by name and counted**, not skipped silently: the run
prints `PDFs skipped: N` with each name and reason and exits non-zero, because
the corpus measured 87 clean files. The corpus itself is pinned in
`MEASURED` in `documents.mjs` (10 uploads, 26 `revista/`, 43 `pastorala/`,
8 `files/`, 206,424,931 bytes); a tree that changed size stops the run before
anything is written.

**Measured 2026-09-18.** All 87 open with `pdfinfo`, none reports JavaScript,
and the byte scan finds zero `/EmbeddedFile` and zero `/Launch`. Two full runs
produced byte-identical output: a `sha256` manifest over `src/content`,
`public/documente`, `src/assets/content` and `docs/url-map.csv` was identical
across both, 320 files. The migration writes `public/documente/<slug>.pdf`, one
`src/content/documente/<slug>.md` per file, and one `docs/url-map.csv` row per
old path (55 → 144 rows).

Titles come from a **closed table of measured filename shapes** in
`documents.mjs`, one rule per shape, each with an example asserted in
`documents.test.mjs` and the whole 87-name corpus listed there too. A filename
matching none stops the migration by name: a wrong title on a pastoral letter is
content nobody can verify mechanically, so the table refuses to guess.

`src/lib/documents.itest.ts` re-runs the gate over every committed PDF in
`npm run test:build`, so a PDF added by hand after the migration cannot bypass
it. It needs `pdfinfo` from poppler.
