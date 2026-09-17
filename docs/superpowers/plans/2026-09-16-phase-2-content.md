# Phase 2 — Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the parish's written content off the compromised WordPress install into git, and render it — 45 news posts, nine prose pages, an editable settings singleton, `/noutati`, `/rss.xml` and a homepage news section.

**Architecture:** A one-way migration harness under `migration/` loads the 2026-08-27 database dump into a disposable MariaDB container, normalises the text, converts it to Markdown, and writes content files plus a URL map. The site then renders those files through three new Astro content collections that follow Phase 1's patterns exactly. The harness is committed and repeatable — rerunning it must produce byte-identical output — but it is not part of the site build and ships nothing to a visitor.

**Tech Stack:** Astro 7.3.2 (static), Zod 4 via `astro/zod`, Vitest 5, Turndown 7 (HTML → Markdown), sharp (already a transitive Astro dependency, used directly here), Docker + `mariadb:11` for the disposable import, Sveltia CMS 0.213.0.

**Spec:** `docs/superpowers/specs/2026-09-15-parish-site-rewrite-design.md` — sections 5 (IA), 6.2/6.4/6.7 (content model), 11 (migration), 12 (URL map), 13 (budget), 14 (security).

---

## Status

Last updated 2026-09-17. **Tasks 1-5 are complete, reviewed and pushed**
(`origin/phase-2`). Work is **paused** at the parish owner's request; Tasks 6-12
have not been started.

| Task | State | Commits |
|---|---|---|
| 1 · migration harness | done, review clean | `8dacf9f..c979dcc` |
| 2 · diacritic normalisation | done, review clean | `c979dcc..3c0d0a7` |
| 3 · HTML to Markdown | done, review clean | `3c0d0a7..fcb1e90` |
| 4 · three schemas | done, 1 minor parked | `fcb1e90..d03abab` |
| 5 · media pipeline | done, 3 minors parked | `d03abab..7f88abd` |
| 6 · the 45 posts | not started | — |
| 7 · nine prose pages, URL map | not started | — |
| 8 · `/noutati`, article, feed | not started | — |
| 9 · nine prose routes | not started | — |
| 10 · homepage news, settings | not started | — |
| 11 · the CMS | not started | — |
| 12 · guards, budget, handover | not started | — |

Since Task 5, a separate change renamed **every identifier, filename, field key,
test name and build message in this repository from Romanian to English**
(`7f88abd..551d01c`). Romanian remains only in page copy, CMS validation messages
and URL slugs. **The code samples in Tasks 6-12 below were rewritten to match**, so
they can be transcribed as written; where a task describes something Tasks 1-5
already built, the real module is authoritative.

### Carried into Tasks 6-12 from the five completed tasks

- **Task 6** owns the `BINARIES` rule it would otherwise break, and must assert that
  every file under the migrated-image directory decodes as an image.
- **Task 6** must stop the run on an image reference the map does not contain, and
  assert that each document's `<img>` count equals the number of sources found.
- **Task 7** must not strip the preamble twice — `toMarkdown` already calls
  `stripPreamble`.
- **Task 10** must de-duplicate the parish address: after it, `Wehntalerstrasse`
  appears only in `src/content/settings/settings.yml`.
- **Task 12** adds the seven typography and German characters to `PERMITTED`, with
  measured counts, and corrects its "lowercase only" comment, which real content
  falsifies.
- **Task 12** should record in `CLAUDE.md` the three lessons this phase paid for:
  a mutation list derived from your own tests inherits their blind spots; a probe
  whose arms share the defect measures nothing; and `git status` can misreport a
  clean tree, so verify with `git diff-index --quiet HEAD`.

### Three minors parked, with rulings, in the session ledger

- Task 4: one bare `.toThrow()` leaves a message unpinned.
- Task 5: `hostFrom`'s `lastIndexOf('@')` is unpinned; every mutation fails safe.
- Task 5: the reorder widens the halt surface for foreign hosts — accepted, since
  the alternative let an attacker mute the traversal alarm by choosing a domain.
- Task 5: the second live-collision fixture is decorative on a folding filesystem.

### Open question for the parish, not for an implementer

`src/content/settings/settings.yml` carries `contact@bor-zh.ch`. Whether that
address exists and reaches somebody is a fact about the parish. The two personal
addresses in the spec were deliberately not used: this rewrite exists partly to
stop publishing them as scrapeable `mailto:` links.

---

## Global Constraints

Every task's requirements implicitly include this section. Phase 1's constraints
(`docs/superpowers/plans/2026-09-15-phase-1-schedule-and-cms.md`, lines 17-261)
still bind; these are the ones this phase adds or sharpens.

- **Node 22.12.0+, Astro 7.x, `output: 'static'`, Zod 4 imported as `astro/zod`.** Never a direct `zod` dependency — a second copy breaks `instanceof`.
- **The four forbidden codepoints are U+015E, U+015F, U+0162 and U+0163** (S/s and T/t with cedilla). Romanian's letters are U+0218/U+0219 and U+021A/U+021B, comma below. **They are never written as glyphs in any tracked file, including this plan** — `src/lib/diacritics-sources.test.ts` sweeps `git ls-files`, so a plan or a test that spelled them out could not be swept. Build them from `CEDILLAS`, exported by `src/lib/cedilla.ts` — **the only tracked file allowed to write the four numbers.** That same sweep also forbids their hexadecimal spelling everywhere else, this plan included, so no file below writes one: they are imported, and `COMMA_BELOW` carries Romanian's four in the matching order, which is what makes the pairing below a zip rather than a table somebody can mistype.
- **The migrated content contains 684 of them today** — measured 2026-09-16 across all published posts and pages: 362 U+015F, 317 U+0163, 5 U+015E, 0 U+0162. It also contains **312 U+00E3** (`a` with tilde), which is not a Romanian letter. Normalisation is therefore a hard requirement, not a nicety: without it `src/lib/diacritics.itest.ts` fails the build on the first migrated file. That guard is Phase 1's, and this phase is the first thing that ever tested it against real input.
- **Escape sequences of the form backslash-u followed by four hex digits do not survive being written to disk** — the Bash heredoc (even quoted) and the file-writing tools both decode them silently. Build such characters from numbers, or write a placeholder and post-process it.
- **Verdicts come from the process exit code**, never `.vitest/json/output.json`. `rtk proxy npx vitest run …` for readable output.
- **`rtk` lies in five ways**, all documented in `CLAUDE.md`: `diff` exits 0 even when it prints a difference; `grep` drops `-v` and truncates; **any `rtk <cmd> | wc -l` counts the rendering rather than the data**; `git status --short` prints `ok` for a clean tree; and the JSON reporter file goes stale in both directions. Use `rtk proxy …`, or read files with `node` when you need a count.
- **All user-facing copy is Romanian.** `docs/`, `README.md`, `CLAUDE.md` and code comments are English.
- **Identifiers, filenames and test names are English too.** Romanian is only for what a person reads: page copy, CMS labels and hints, and the schema's validation messages. Variables, functions, types, constants, object and YAML field keys, file and directory names, `it()`/`describe()` names and build-time diagnostics are all English.
- **`#B08B3E` and `#C8A45C` are ornament only, never text**, and the gold roles **invert** on the oxblood ground. `TEXT_ROLES` and `TEXT_ROLES_ON_OXBLOOD` in `src/lib/tokens.ts` are the two sets.
- **Opacity on text is contrast reduction, not dimming.** Say "not happening" with a strike or a label.
- **A scoped component rule defeats a global one where both set the same property.** A component that sets `color` on a link owns that link's interactive states.
- **`hidden` does not hide when the author sets `display`.** Any component that does both needs its own `[hidden]` rule.
- **Performance budget (spec §13), enforced by `scripts/check-budget.mjs`:** `dist/index.html` at 45 KB combined HTML+CSS, client JS at 3,800 B, at most 12 requests. **`/program/` is already exempt from the page limit by name and still crosses it at 58 weeks** — that is a stated gap, not a licence. Every page this phase adds is subject to the limit unless this plan says otherwise.
- **The source material comes off a server compromised twice in eighteen months.** Nothing executable is migrated. Rasters are sanitised by being decoded and re-encoded through `sharp`; a file that fails to decode is not an image and is dropped by name. **SVG cannot be sanitised that way and is not migrated.** Neither are `.doc`, `.js`, `.html`, `.htaccess`, `.json`, `.css` or `.txt` from `uploads/`.
- **The parent directory is not part of this repository.** It holds the forensic backups and a file of database credentials. The harness reads from it by absolute path and **never** `git add`s anything from outside this root.
- **Rerunning the migration must produce identical output** (spec §11). No timestamps, no random ids, no locale-dependent ordering, no `Date.now()`.

---

## Measured source facts

Taken 2026-09-16 from `backup-2026-08-27/database.sql.gz` loaded into `mariadb:11`, and from `backup-2026-08-22/web01/htdocs/wp-content/uploads`. **The spec was wrong on three of these**, which is why they are restated here as measurements rather than quoted from it.

| Fact | Value |
|---|---|
| Published posts (`post_type='post'`) | **45** (spec said 48) |
| ...with a genuine date | **13** |
| ...with a bulk-import stamp | **32** — 20 at `2024-06-08`, 11 at `2024-05-21`, 1 other |
| Published pages | 26, of which **9** are this phase's prose pages |
| Post categories | `Noutati` (42), `Catehismul Bisericii Ortodoxe` (3) |
| Posts with a featured image | **3** |
| Attachments in the database | 457 |
| Raster originals on disk (no `-WxH` suffix) | 652 — 494 jpg, 137 png, 21 jpeg |
| SVG / PDF / doc on disk | 24 / 10 / 9 |
| `uploads/` total | 7,421 files, 997 MB |
| Byte-identical post pairs | **2** only |

**`post_content` is clean and the Elementor tree-walk is not needed for text.** The spec called this "the hard part" and said content lives in `_elementor_data` and **not** in `post_content`. Measured across all ten real prose pages, `post_content` carries the full prose in clean HTML behind a constant preamble: `<p>Layouts: Popup</p>`, then a breadcrumb line such as `Parohia noastra > Istoric`. `istoric` alone is 6,994 characters of real paragraphs. Posts have no preamble at all.

---

## File structure

**Migration harness** — `migration/`, committed, not part of the site build, ships nothing:

| File | Responsibility |
|---|---|
| `migration/README.md` | How to run it, what it needs, what it writes |
| `migration/db.mjs` | Container lifecycle, dump load, one `query(sql)` helper |
| `migration/diacritics.mjs` | Text normalisation — the 684 forbidden characters, `a`-tilde, non-breaking spaces |
| `migration/html-md.mjs` | Preamble strip + Turndown, one `toMarkdown(html)` |
| `migration/media.mjs` | Referenced images only: decode, re-encode, downscale, emit |
| `migration/articles.mjs` | The 45 posts to `src/content/articles/*.md` |
| `migration/pages.mjs` | The nine prose pages to `src/content/pages/*.md` |
| `migration/url-map.mjs` | `docs/url-map.csv` — old path to new path |
| `migration/run.mjs` | Orchestrator: the whole migration, in order, idempotent |

**Site code:**

| File | Responsibility |
|---|---|
| `src/lib/content-schema.ts` | `articleSchema`, `pageSchema`, `settingsSchema` and their shared vocabulary |
| `src/content.config.ts` | Registers `articles`, `pages`, `settings` beside `services` |
| `src/lib/articles.ts` | Reading, filtering and ordering posts — the `published` rule lives here |
| `src/lib/settings.ts` | Typed access to the settings singleton |
| `src/components/ArticleCard.astro` | One post in a list |
| `src/components/ArticleList.astro` | A list of post cards, used by `/noutati` and the homepage |
| `src/pages/noutati/index.astro` | The news index |
| `src/pages/noutati/[slug].astro` | One article |
| `src/pages/rss.xml.ts` | The feed |
| `src/pages/[...page].astro` | The nine prose pages, from the `pages` collection |
| `src/content/articles/*.md` | 45 generated files |
| `src/content/pages/*.md` | 9 generated files |
| `src/content/settings/settings.yml` | The singleton |
| `src/assets/content/**` | Migrated images |
| `public/admin/config.yml` | Three new CMS collections |
| `docs/url-map.csv` | Generated URL map, consumed by Phase 4 |

**Modified:** `src/components/SiteHeader.astro` (navigation), `src/components/SiteFooter.astro` (reads `settings`), `scripts/check-budget.mjs` (the new pages), `scripts/a11y.mjs` (the new pages), `CLAUDE.md`, `README.md`.

---

### Task 1: The migration harness — a disposable database you can trust

**Files:**
- Create: `migration/db.mjs`, `migration/README.md`
- Test: `migration/db.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `start()` → `Promise<void>`, `stop()` → `Promise<void>`, `query(sql: string)` → `Promise<string[][]>` (rows of column strings, tab-separated output split), `DUMP_PATH` (absolute path string), `CONTAINER_NAME = 'bzh-migration'`.

**Why a container rather than parsing the SQL.** The dump is 352 MB of phpMyAdmin output with serialized PHP inside `postmeta`. A regex over `INSERT` statements is a parser that will be wrong on exactly the rows that matter and will look right on the rest. MariaDB is the parser that already exists.

**Why it must fail loudly when the source is absent.** The dump lives outside this repository, in a directory a fresh clone does not have. A harness that quietly produces zero posts is this project's most-paid-for failure shape.

- [x] **Step 1: Write the failing test**

```js
// migration/db.test.mjs
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { DUMP_PATH, CONTAINER_NAME } from './db.mjs';

describe('the migration source', () => {
  it('names the dump by absolute path, outside the repository', () => {
    expect(DUMP_PATH.startsWith('/')).toBe(true);
    expect(DUMP_PATH).toContain('backup-2026-08-27');
    expect(DUMP_PATH.endsWith('database.sql.gz')).toBe(true);
    // The repository root must NOT be a prefix of the dump path: nothing in
    // `migration/` may read migration source from inside this tree, because a
    // file inside the tree is a file somebody can commit.
    const root = new URL('../', import.meta.url).pathname;
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
```

- [x] **Step 2: Run it to confirm it fails**

Run: `rtk proxy npx vitest run migration/db.test.mjs`
Expected: FAIL — `Failed to resolve import "./db.mjs"`.

- [x] **Step 3: Write the harness**

```js
// migration/db.mjs
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

const PASSWORD = 'migration';
const DATABASE = 'wp';

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
 */
export async function start() {
  requireDump();
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
        throw new Error('MariaDB did not start within 90 seconds.');
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  await execFileAsync('/bin/sh', [
    '-c',
    `gunzip -c ${JSON.stringify(DUMP_PATH)} | ` +
      `docker exec -i ${CONTAINER_NAME} mariadb -uroot -p${PASSWORD} --force ${DATABASE}`,
  ], { maxBuffer: 1024 * 1024 * 64 });
}

/** Removes the container. Safe to call when it does not exist. */
export async function stop() {
  if (exists()) docker(['rm', '-f', CONTAINER_NAME]);
}

/**
 * One query, rows as arrays of column strings.
 *
 * `-N` drops the header, `-B` makes it tab-separated and `--default-character-
 * set=utf8mb4` is what stops every Romanian letter arriving as a question mark -
 * which would not fail anything, it would just quietly migrate mangled text.
 */
export async function query(sql) {
  const { stdout } = await execFileAsync('docker', [
    'exec', CONTAINER_NAME, 'mariadb', '-uroot', `-p${PASSWORD}`,
    '-N', '-B', '--default-character-set=utf8mb4',
    '-e', sql, 'h164835_wordpress7',
  ], { maxBuffer: 1024 * 1024 * 512 });
  if (stdout.trim() === '') return [];
  return stdout.replace(/\n$/, '').split('\n').map((r) => r.split('\t'));
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `rtk proxy npx vitest run migration/db.test.mjs`
Expected: PASS, 3 tests.

- [x] **Step 5: Prove the harness actually loads the dump**

Run this by hand once and paste the numbers into `migration/README.md`:

```bash
node -e "
import('./migration/db.mjs').then(async (m) => {
  await m.start();
  const p = await m.query(\"SELECT COUNT(*) FROM wpoi_posts WHERE post_type='post' AND post_status='publish'\");
  const g = await m.query(\"SELECT COUNT(*) FROM wpoi_posts WHERE post_type='page' AND post_status='publish'\");
  console.log('posts', p[0][0], 'pages', g[0][0]);
  await m.stop();
});
"
```

Expected: `posts 45 pages 26`. **If either number differs, stop and report it** — this plan's task list is sized from those two numbers, and a different count means a different dump.

- [x] **Step 6: Write `migration/README.md`**

It must state: that Docker is required; that the source lives outside the repository and a fresh clone cannot run this; the two counts from Step 5 with the date they were measured; that rerunning must produce identical output; and that the container is destroyed and recreated on every run rather than reused.

- [x] **Step 7: Commit**

```bash
git add migration/db.mjs migration/db.test.mjs migration/README.md
git commit -m "feat(migration): a disposable database that fails loudly when the source is missing"
```

---

### Task 2: Diacritic normalisation — the 684 characters this repository forbids

**Files:**
- Create: `migration/diacritics.mjs`
- Test: `migration/diacritics.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `normalize(text: string)` → `string`, `REPLACEMENTS` (a `Map<number, number>` from forbidden codepoint to correct one), `codepointReport(text: string)` → `Map<number, number>`.

**This is the task the whole migration turns on.** Phase 1's `src/lib/diacritics.itest.ts` sweeps every text file in `dist/` for four codepoints and fails the build. The content being migrated contains 684 of them. Get this wrong and either the build fails on the first migrated file, or — far worse — somebody "fixes" the build by narrowing the sweep.

**What is mechanical and what is not.** U+015E, U+015F, U+0162, U+0163 map one-to-one onto U+0218, U+0219, U+021A, U+021B: same letters, wrong encoding, no judgement needed. U+00E3 (`a` with tilde) and U+00C3 are not Romanian letters at all and map onto U+0103 and U+0102. **Missing diacritics are a different problem and are NOT fixed here** — text that reads `si` where it should read the word with U+0219 is a human editing job, and a script that guessed would silently rewrite the parish's words.

**`ü` stays.** 42 occurrences, and they are in `Zürich`.

- [x] **Step 1: Write the failing test**

```js
// migration/diacritics.test.mjs
import { describe, expect, it } from 'vitest';
import { REPLACEMENTS, normalize, codepointReport } from './diacritics.mjs';
import { CEDILLAS, COMMA_BELOW } from '../src/lib/cedilla.ts';

// Built from numbers, never written as glyphs: a test file that spelled these
// out could not be swept for them, and `src/lib/diacritics-sources.test.ts`
// sweeps every tracked file.
const [CAPITAL_S_CEDILLA, S_CEDILLA, CAPITAL_T_CEDILLA, T_CEDILLA] = CEDILLAS.map((c) => String.fromCodePoint(c));
const [CAPITAL_S_COMMA, S_COMMA, CAPITAL_T_COMMA, T_COMMA] =
  COMMA_BELOW.map((c) => String.fromCodePoint(c));
const A_TILDE = String.fromCodePoint(0x00e3);
const A_BREVE = String.fromCodePoint(0x0103);

describe('diacritic normalisation', () => {
  it('changes all four cedilla forms', () => {
    expect(normalize(S_CEDILLA)).toBe(S_COMMA);
    expect(normalize(T_CEDILLA)).toBe(T_COMMA);
    expect(normalize(CAPITAL_S_CEDILLA)).toBe(CAPITAL_S_COMMA);
    expect(normalize(CAPITAL_T_CEDILLA)).toBe(CAPITAL_T_COMMA);
  });

  it('changes a with tilde, which is not a Romanian letter', () => {
    expect(normalize(A_TILDE)).toBe(A_BREVE);
    expect(normalize(String.fromCodePoint(0x00c3))).toBe(String.fromCodePoint(0x0102));
  });

  it('does not touch the correct letters', () => {
    const correct = S_COMMA + T_COMMA + A_BREVE + 'aiu' + String.fromCodePoint(0x00e2);
    expect(normalize(correct)).toBe(correct);
  });

  it('keeps u with umlaut, because it spells Zurich', () => {
    const u = String.fromCodePoint(0x00fc);
    expect(normalize(`Z${u}rich`)).toBe(`Z${u}rich`);
  });

  it('replaces the non-breaking space with an ordinary one', () => {
    expect(normalize(`a${String.fromCodePoint(0x00a0)}b`)).toBe('a b');
  });

  it('does NOT add missing diacritics - that is a human job', () => {
    // "si" stays "si". A script that guessed here would rewrite the parish's
    // words on its own authority, in a language it cannot read.
    expect(normalize('si')).toBe('si');
    expect(normalize('anuntati')).toBe('anuntati');
  });

  it('leaves no forbidden codepoint behind, for any input', () => {
    // The property, not an example. Every forbidden codepoint, in one string.
    const all = [...REPLACEMENTS.keys()].map((c) => String.fromCodePoint(c)).join('');
    const after = normalize(all);
    for (const forbidden of CEDILLAS) {
      expect(after.includes(String.fromCodePoint(forbidden))).toBe(false);
    }
  });

  it('the report counts what it found, so it can be read from a single run', () => {
    const r = codepointReport(S_CEDILLA + S_CEDILLA + T_CEDILLA);
    expect(r.get(CEDILLAS[1])).toBe(2);
    expect(r.get(CEDILLAS[3])).toBe(1);
  });

  it('is idempotent', () => {
    const entry = S_CEDILLA + T_CEDILLA + A_TILDE + 'text';
    expect(normalize(normalize(entry))).toBe(normalize(entry));
  });
});
```

- [x] **Step 2: Run it to confirm it fails**

Run: `rtk proxy npx vitest run migration/diacritics.test.mjs`
Expected: FAIL — module not found.

- [x] **Step 3: Write the normaliser**

```js
// migration/diacritics.mjs

/**
 * Wrong encoding to right encoding, by NUMBER on both sides.
 *
 * Neither the forbidden characters nor their replacements are written as
 * glyphs anywhere in this file. A source file that spelled the forbidden four
 * out could not be swept for them by `src/lib/diacritics-sources.test.ts`, and a
 * corrupted expectation would then agree with a corrupted source - which is
 * exactly the failure this project has already paid for once.
 *
 * The four cedilla forms are the same LETTERS as Romanian's comma-below ones,
 * encoded the way a Turkish keyboard layout or an old font substitution leaves
 * them. `a` with tilde and `A` with tilde are not Romanian letters at all;
 * they are what a Portuguese-ish fallback produced where the breve belonged.
 */
export const REPLACEMENTS = new Map([
  // The four are zipped from the two exported arrays rather than typed out as
  // pairs: `src/lib/cedilla.ts` is the one file allowed to write the numbers, and
  // a hand-written table here would be a second copy to keep in step AND a
  // chance to pair the capital with the wrong small letter. The arrays are
  // declared in matching order, which is the property this relies on.
  ...CEDILLAS.map((c, i) => [c, COMMA_BELOW[i]]),
  // `A`/`a` with tilde are not among the swept four, so they are written here.
  [0x00c3, 0x0102],
  [0x00e3, 0x0103],
]);

/** The non-breaking space, which WordPress scatters through pasted text. */
const NBSP = 0x00a0;

/**
 * Normalises one string.
 *
 * WHAT THIS DOES NOT DO, and must not start doing: add missing diacritics.
 * Plenty of this content is written without them - `si` for the word spelled
 * with U+0219, `anuntati` for the one with U+021B. Guessing would mean a
 * script rewriting the parish's own words in a language it cannot read, and
 * getting it wrong somewhere nobody would notice for years. Those are left
 * exactly as written, for a person to fix in the CMS or leave alone.
 */
export function normalize(text) {
  let result = '';
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if (c === NBSP) { result += ' '; continue; }
    const replacement = REPLACEMENTS.get(c);
    result += replacement === undefined ? ch : String.fromCodePoint(replacement);
  }
  return result;
}

/**
 * Every non-ASCII codepoint in the text, with its count.
 *
 * Print what was measured, not only the verdict: the migration prints this
 * before and after so a later reader can check a number rather than trust a
 * sentence. It is also the stronger question - not "does this contain the four
 * forbidden characters" but "is every character in here one this project
 * expects".
 */
export function codepointReport(text) {
  const mapping = new Map();
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if (c > 127) mapping.set(c, (mapping.get(c) ?? 0) + 1);
  }
  return mapping;
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `rtk proxy npx vitest run migration/diacritics.test.mjs`
Expected: PASS, 8 tests.

- [x] **Step 5: Prove it against the real corpus, not against the fixtures**

```bash
node -e "
Promise.all([import('./migration/db.mjs'), import('./migration/diacritics.mjs'), import('./src/lib/cedilla.ts')]).then(async ([db, d, cedilla]) => {
  await db.start();
  const r = await db.query(\"SELECT post_content FROM wpoi_posts WHERE post_type IN ('post','page') AND post_status='publish'\");
  const all = r.map((x) => x[0]).join('');
  const before = d.codepointReport(all);
  const after = d.codepointReport(d.normalize(all));
  for (const c of [...cedilla.CEDILLAS, 0x00e3]) {
    console.log('U+' + c.toString(16).toUpperCase().padStart(4,'0'), 'before', before.get(c) ?? 0, 'after', after.get(c) ?? 0);
  }
  await db.stop();
});
"
```

Expected, from the 2026-09-16 measurement: `U+015E 5 -> 0`, `U+015F 362 -> 0`, `U+0162 0 -> 0`, `U+0163 317 -> 0`, `U+00E3 312 -> 0`. **Record the actual numbers in the commit message.** If the "before" figures differ from these, say so rather than adjusting the plan — a different dump is a fact worth surfacing.

- [x] **Step 6: Commit**

```bash
git add migration/diacritics.mjs migration/diacritics.test.mjs
git commit -m "feat(migration): normalise the 684 forbidden characters the old content carries"
```

---

### Task 3: HTML to Markdown, and the preamble that is not content

**Files:**
- Create: `migration/html-md.mjs`
- Test: `migration/html-md.test.mjs`
- Modify: `package.json` — add `turndown@^7.2.0` to `devDependencies`

**Interfaces:**
- Consumes: `normalize` from `migration/diacritics.mjs`.
- Produces: `stripPreamble(html: string)` → `string`, `toMarkdown(html: string)` → `string`, `imagesIn(html: string)` → `string[]` (every `src` in document order).

**`turndown` is a devDependency and must stay one.** It runs during migration and never during a build; a runtime dependency here would ship nothing but would make the site's dependency surface a lie.

**The preamble is constant and mechanical.** Every prose page begins `<p>Layouts: Popup</p>` followed by a breadcrumb line — `Parohia noastra > Istoric`, `Resurse crestine > Catehism` — where the `>` arrives as `&gt;` and the page's own title is wrapped in `<u><b>`. Posts have no preamble at all, so the strip must be a no-op on them rather than eating a first paragraph.

- [x] **Step 1: Write the failing test**

```js
// migration/html-md.test.mjs
import { describe, expect, it } from 'vitest';
import { stripPreamble, imagesIn, toMarkdown } from './html-md.mjs';
import { CEDILLAS, COMMA_BELOW } from '../src/lib/cedilla.ts';

const REAL_PREAMBLE =
  '<p>Layouts: Popup</p>\t\t\n\t\tParohia noastra &gt; <u><b>Istoric</b></u>\t\t\n\t\t\t';

describe('stripping the preamble', () => {
  it('removes the Layouts line and the navigation crumbs', () => {
    const after = stripPreamble(`${REAL_PREAMBLE}<h2>Titlu</h2><p>Text.</p>`);
    expect(after).not.toContain('Layouts: Popup');
    expect(after).not.toContain('Parohia noastra');
    expect(after.trim().startsWith('<h2>')).toBe(true);
  });

  it('does nothing on an article, which has no preamble', () => {
    // The strip must be a no-op here. A version that ate a leading paragraph
    // would remove real content from 45 posts and nothing would fail.
    const article = '<h3>Hramul parohiei</h3><p>Programul va fi:</p>';
    expect(stripPreamble(article)).toBe(article);
  });

  it('does not remove a paragraph merely for being first', () => {
    const html = '<p>Un paragraf adevarat, primul.</p><p>Al doilea.</p>';
    expect(stripPreamble(html)).toBe(html);
  });
});

describe('conversion to Markdown', () => {
  it('keeps headings, paragraphs and lists', () => {
    const md = toMarkdown('<h2>Titlu</h2><p>Text.</p><ul><li>Unu</li><li>Doi</li></ul>');
    expect(md).toContain('## Titlu');
    expect(md).toContain('Text.');
    expect(md).toContain('-   Unu');
  });

  it('normalises the diacritics along the way', () => {
    const cedilla = String.fromCodePoint(CEDILLAS[1]);
    const comma = String.fromCodePoint(COMMA_BELOW[1]);
    expect(toMarkdown(`<p>Mo${cedilla}ii</p>`)).toContain(`Mo${comma}ii`);
  });

  it('leaves no raw HTML behind', () => {
    expect(toMarkdown('<p>a</p>')).not.toContain('<p>');
  });

  it('leaves no empty tab-only lines from Elementor markup', () => {
    expect(toMarkdown('<p>a</p>\t\t\n\t\t<p>b</p>')).not.toMatch(/\t/);
  });
});

describe('the images in the HTML', () => {
  it('gives them in document order', () => {
    const html = '<img src="/a.jpg"><p>x</p><img src="/b.png" width="10">';
    expect(imagesIn(html)).toEqual(['/a.jpg', '/b.png']);
  });

  it('gives an empty list rather than throwing when there are none', () => {
    expect(imagesIn('<p>x</p>')).toEqual([]);
  });
});
```

- [x] **Step 2: Run it to confirm it fails**

Run: `rtk proxy npx vitest run migration/html-md.test.mjs`
Expected: FAIL — module not found.

- [x] **Step 3: Install turndown**

```bash
npm install --save-dev turndown@^7.2.0
```

- [x] **Step 4: Write the converter**

```js
// migration/html-md.mjs
import TurndownService from 'turndown';
import { normalize } from './diacritics.mjs';

/**
 * Elementor's rendered preamble, which is chrome rather than content.
 *
 * Every prose page starts with the same two things: a `Layouts: Popup` marker
 * the page builder emitted, and a breadcrumb line that repeats the section and
 * the page's own title. Neither belongs in the content - the title is
 * frontmatter and the breadcrumb is navigation this site renders itself.
 *
 * ANCHORED TO WHAT IT MATCHES, NOT TO POSITION. An earlier shape of this
 * function dropped "everything before the first heading", which is correct on
 * the nine pages and eats the opening paragraph of every one of the 45 posts,
 * because posts have no preamble at all. So each piece is removed by
 * recognising itself, and a document without them comes back unchanged.
 */
export function stripPreamble(html) {
  let result = html.replace(/^\s*<p>\s*Layouts:[^<]*<\/p>/i, '');
  // The breadcrumb: optional wrapping <p>, some text, `&gt;` or `>`, then the
  // page title inside <u><b>. Only matched at the very start of the document.
  result = result.replace(
    /^[\s\t]*(?:<p>)?[^<>]{0,60}?(?:&gt;|>)\s*<u><b>[^<]*<\/b><\/u>\s*(?:<\/p>)?/i,
    '',
  );
  return result === html ? html : result;
}

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

// WordPress wraps stray text in nothing at all and Elementor leaves literal
// tabs between blocks. Turndown keeps them, which produces Markdown with
// indented lines that render as code blocks - silently, and only on the
// paragraphs that happened to follow a tab.
function cleanWhitespace(md) {
  return md
    .replace(/\t/g, ' ')
    .replace(/[ ]{2,}\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** HTML in, Markdown out, with the text normalised on the way through. */
export function toMarkdown(html) {
  // ORDER IS LOAD-BEARING: Turndown converts FIRST, normalize runs on its
  // output. An entity like `&nbsp;` or `&#160;` is plain ASCII to normalize
  // and to the dist sweep; it becomes U+00A0 only when Turndown decodes it. The
  // dump holds 14,961 of the first and 6 of the second - normalising first would
  // reintroduce 14,967 non-breaking spaces immediately after removing 459 literal
  // ones, invisibly, because U+00A0 renders as a space. Measured 2026-09-16.
  return cleanWhitespace(normalize(turndown.turndown(stripPreamble(html))));
}

/** Every `src` an `<img>` carries, in document order, duplicates included. */
export function imagesIn(html) {
  return [...html.matchAll(/<img\b[^>]*?\ssrc=["']([^"']+)["']/gi)].map((m) => m[1]);
}
```

- [x] **Step 5: Run the test to verify it passes**

Run: `rtk proxy npx vitest run migration/html-md.test.mjs`
Expected: PASS, 9 tests.

- [x] **Step 6: Prove the strip is a no-op on all 45 posts and fires on all 9 pages**

```bash
node -e "
Promise.all([import('./migration/db.mjs'), import('./migration/html-md.mjs')]).then(async ([db, h]) => {
  await db.start();
  const posts = await db.query(\"SELECT post_name, post_content FROM wpoi_posts WHERE post_type='post' AND post_status='publish'\");
  const touched = posts.filter(([, c]) => h.stripPreamble(c) !== c);
  console.log('posts touched by stripping (must be 0):', touched.length, touched.map((x) => x[0]).join(' '));
  const NINE = ['istoric','consiliul-parohial','catehism','studii','revista-doxologia','link-uri-utile','scoala-parohiala','cursuri-de-pictura','servicii-liturgice'];
  const pages = await db.query(\`SELECT post_name, post_content FROM wpoi_posts WHERE post_type='page' AND post_status='publish' AND post_name IN ('\${NINE.join(\"','\")}')\`);
  const untouched = pages.filter(([, c]) => h.stripPreamble(c) === c);
  console.log('pages NOT touched (must be 0):', untouched.length, untouched.map((x) => x[0]).join(' '));
  await db.stop();
});
"
```

Expected: `posts touched by stripping (must be 0): 0` and `pages NOT touched (must be 0): 0`. **Both directions matter**: the first says the strip cannot eat a post's opening paragraph, the second says it is not silently doing nothing on the pages it exists for. Paste both lines into the commit message.

- [x] **Step 7: Commit**

```bash
git add migration/html-md.mjs migration/html-md.test.mjs package.json package-lock.json
git commit -m "feat(migration): HTML to Markdown, and a preamble strip that recognises itself"
```

---

### Task 4: Three schemas and three collections

**Files:**
- Create: `src/lib/content-schema.ts`, `src/lib/content-schema.test.ts`
- Modify: `src/content.config.ts`
- Create: `src/content/settings/settings.yml`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `articleSchema`, `pageSchema`, `settingsSchema`, `CATEGORIES` (readonly string tuple), `type Article`, `type Page`, `type Settings`.

**Follow `src/lib/schema.ts` exactly.** It uses `astro/zod`, `z.strictObject`, Romanian error messages, and a refinement that teaches the workflow rather than naming a type. A misspelled key must fail the build, because the alternative is a silently dropped field on a green build.

**`published: false` is the archive's holding pen** (spec §6.2). 32 posts arrive unpublished because their dates were destroyed by a bulk import. An unpublished post is absent from `/noutati`, from the homepage, from `/rss.xml`, **and has no page of its own** — otherwise "unpublished" would mean "reachable by anyone with the link".

- [x] **Step 1: Write the failing test**

```ts
// src/lib/content-schema.test.ts
import { describe, expect, it } from 'vitest';
import { articleSchema, CATEGORIES, pageSchema, settingsSchema } from './content-schema';

const MINIMAL_ARTICLE = {
  title: 'Hramul parohiei',
  date: '2025-11-05',
  category: 'Noutati',
  published: true,
};

describe('articleSchema', () => {
  it('accepts a minimal article', () => {
    expect(articleSchema.parse(MINIMAL_ARTICLE).title).toBe('Hramul parohiei');
  });

  it('rejects a misspelled key', () => {
    // The likeliest CMS mistake, and the one that would otherwise drop a field
    // on a green build.
    expect(() => articleSchema.parse({ ...MINIMAL_ARTICLE, publishedd: true }))
      // Phase 1`s error map, which Step 3 mandates, emits this WITH diacritics.
      // An earlier draft of this line spelled it `Camp`, which contradicted the
      // step below it and is a misspelling besides.
      .toThrow(/Câmp necunoscut: publicatt/);
  });

  it('requires a real date, not merely something date-shaped', () => {
    expect(() => articleSchema.parse({ ...MINIMAL_ARTICLE, date: '2025-02-30' })).toThrow();
    expect(() => articleSchema.parse({ ...MINIMAL_ARTICLE, date: '2025-13-01' })).toThrow();
  });

  it('requires a category from the list', () => {
    expect(() => articleSchema.parse({ ...MINIMAL_ARTICLE, category: 'Altceva' })).toThrow();
    for (const c of CATEGORIES) {
      expect(articleSchema.parse({ ...MINIMAL_ARTICLE, category: c }).category).toBe(c);
    }
  });

  it('published is required and has no default', () => {
    // No default. A post whose `published` was lost must fail the build rather
    // than quietly publish 32 undated archive posts.
    const { published: _, ...without } = MINIMAL_ARTICLE;
    expect(() => articleSchema.parse(without)).toThrow();
  });

  it('rejects a title that is empty or only spaces', () => {
    expect(() => articleSchema.parse({ ...MINIMAL_ARTICLE, title: '   ' })).toThrow();
  });

  it('has the author Parohia when none is given', () => {
    expect(articleSchema.parse(MINIMAL_ARTICLE).author).toBe('Parohia');
  });
});

describe('pageSchema', () => {
  it('accepts a page with a title and a path', () => {
    const p = pageSchema.parse({ title: 'Istoric', path: 'parohia/istoric', order: 10 });
    expect(p.path).toBe('parohia/istoric');
  });

  it('rejects a path with a leading or trailing slash', () => {
    // The route builds `/${path}/`; a stored slash would produce `//istoric//`,
    // which 404s while the file looks perfectly correct.
    expect(() => pageSchema.parse({ title: 'x', path: '/parohia/istoric', order: 1 })).toThrow();
    expect(() => pageSchema.parse({ title: 'x', path: 'parohia/istoric/', order: 1 })).toThrow();
  });

  it('rejects a path with capitals or spaces', () => {
    expect(() => pageSchema.parse({ title: 'x', path: 'Parohia/Istoric', order: 1 })).toThrow();
    expect(() => pageSchema.parse({ title: 'x', path: 'parohia/is toric', order: 1 })).toThrow();
  });
});

describe('settingsSchema', () => {
  const MINIMAL_SETTINGS = {
    name: 'Parohia Ortodoxa Romana Sfantul Nicolae',
    address: 'Wehntalerstrasse 451, 8046 Zurich',
    phone: '076 512 04 52',
    email: 'contact@bor-zh.ch',
  };

  it('accepts the minimal settings', () => {
    expect(settingsSchema.parse(MINIMAL_SETTINGS).name).toContain('Parohia');
  });

  it('rejects an email with no @', () => {
    expect(() => settingsSchema.parse({ ...MINIMAL_SETTINGS, email: 'contact' })).toThrow();
  });

  it('rejects the two demo values from the old site', () => {
    // Named explicitly because they are what is live today: the footer shows
    // an Athos theme placeholder address and a French phone number. Migrating
    // them would be worse than leaving the field blank.
    expect(() => settingsSchema.parse({ ...MINIMAL_SETTINGS, email: 'info@website.com' }))
      .toThrow(/demo/);
    expect(() => settingsSchema.parse({ ...MINIMAL_SETTINGS, phone: '+33 877 554 332' }))
      .toThrow(/demo/);
  });
});
```

- [x] **Step 2: Run it to confirm it fails**

Run: `rtk proxy npx vitest run src/lib/content-schema.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Write the schemas**

```ts
// src/lib/content-schema.ts
import { z } from 'astro/zod';
import { dateParts } from './date-ro';

/**
 * The categories the migrated corpus actually uses.
 *
 * Measured: `Noutati` on 42 posts and `Catehismul Bisericii Ortodoxe` on 3.
 * The spec's model also listed a third, for announcements, which no post has
 * ever carried - so it is not offered. An option nobody uses is an option a
 * volunteer has to think about every week.
 */
export const CATEGORIES = ['Noutati', 'Cateheza'] as const;

const nonEmptyTitle = z
  .string()
  .trim()
  .min(1, { message: 'Titlul nu poate fi gol.' });

/** `YYYY-MM-DD` that is a real calendar date, validated by Phase 1's parser. */
const realDate = z.string().refine(
  (v) => {
    try { dateParts(v); return true; } catch { return false; }
  },
  { message: 'Data trebuie sa fie reala, in forma AAAA-LL-ZZ.' },
);

/**
 * Unknown keys are rejected, in Romanian, naming the key.
 *
 * Zod's default message is English and says nothing a volunteer can act on.
 * This is the error they will actually hit - a misspelled field in the CMS or
 * in a hand-edited file - and `publishedd:` silently dropping a flag on a green
 * build is exactly what this schema exists to prevent.
 */
function strict<T extends z.ZodRawShape>(shape: T) {
  return z.strictObject(shape).catch;
}

export const articleSchema = z
  .strictObject({
    title: nonEmptyTitle,
    date: realDate,
    /**
     * No default, deliberately. 32 of the 45 migrated posts arrive
     * `published: false` because a bulk import destroyed their dates; a default
     * of `true` would publish them the first time anyone touched a file, and a
     * default of `false` would silently unpublish a post whose flag was lost.
     * Requiring it means the file always says which it is.
     */
    published: z.boolean(),
    category: z.enum(CATEGORIES),
    author: z.string().trim().min(1).default('Parohia'),
    summary: z.string().trim().optional(),
    image: z.string().trim().optional(),
  })
  .describe('Un articol de pe /noutati.');

export const pageSchema = z
  .strictObject({
    title: nonEmptyTitle,
    /**
     * The route, WITHOUT leading or trailing slash: `parohia/istoric`.
     * `[...page].astro` builds `/${path}/` from it, so a stored slash yields
     * `//parohia/istoric//` - a 404 produced by a file that reads correctly.
     */
    path: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/, {
        message:
          'Calea se scrie cu litere mici si liniute, fara slash la inceput sau la sfarsit, de exemplu parohia/istoric.',
      }),
    order: z.number().int(),
    description: z.string().trim().optional(),
    image: z.string().trim().optional(),
  })
  .describe('O pagina de text editabila.');

/** The two values the live WordPress footer shows today, both theme demo data. */
const DEMO = ['info@website.com', '+33 877 554 332'];

export const settingsSchema = z
  .strictObject({
    name: nonEmptyTitle,
    address: nonEmptyTitle,
    phone: nonEmptyTitle,
    email: z.string().trim().email({ message: 'Adresa de e-mail nu este valida.' }),
    phone2: z.string().trim().optional(),
    email2: z.string().trim().email().optional(),
    iban: z.string().trim().optional(),
    iban2: z.string().trim().optional(),
    visiting_hours: z.string().trim().optional(),
    mapping: z.string().trim().url().optional(),
  })
  .superRefine((v, ctx) => {
    for (const [key, value] of Object.entries(v)) {
      if (typeof value === 'string' && DEMO.includes(value.trim())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message:
            `Valoarea "${value}" este o ramasita demo de pe situl vechi, nu un contact al parohiei.`,
        });
      }
    }
  })
  .describe('Datele parohiei, editabile din CMS.');

export type Article = z.infer<typeof articleSchema>;
export type Page = z.infer<typeof pageSchema>;
export type Settings = z.infer<typeof settingsSchema>;
```

**Note for the implementer:** the `strict` helper sketched above is not used — delete it rather than leaving it. It is named here only so you do not reinvent it: `z.strictObject` already rejects unknown keys, and the Romanian message comes from the collection's error map, exactly as `src/lib/schema.ts` does it. Copy that mechanism rather than inventing a second one.

- [x] **Step 4: Register the collections**

```ts
// src/content.config.ts — add to the existing file, keep `services` unchanged
import { articleSchema, pageSchema, settingsSchema } from './lib/content-schema';

const articles = defineCollection({
  loader: glob({ pattern: ['**/*.md'], base: './src/content/articles' }),
  schema: articleSchema,
});

const pages = defineCollection({
  loader: glob({ pattern: ['**/*.md'], base: './src/content/pages' }),
  schema: pageSchema,
});

const settings = defineCollection({
  loader: glob({ pattern: ['**/*.yml', '**/*.yaml'], base: './src/content/settings' }),
  schema: settingsSchema,
});

export const collections = { services, articles, pages, settings };
```

- [x] **Step 5: Write the settings file**

`src/content/settings/settings.yml`, with the parish's real values — the address and phone already in `SiteFooter.astro`, and **not** the two demo values the live site shows.

- [x] **Step 6: Run the suite**

Run: `TZ=Europe/Zurich npm test && TZ=Europe/Zurich npm run check`
Expected: both exit 0. `check` reports 0 errors.

- [x] **Step 7: Commit**

```bash
git add src/lib/content-schema.ts src/lib/content-schema.test.ts src/content.config.ts src/content/settings/settings.yml
git commit -m "feat: schemas for articles, pages and settings, with published as a required flag"
```

---

### Task 5: The media pipeline — re-encoding is the sanitisation

**Files:**
- Create: `migration/media.mjs`, `migration/media.test.mjs`
- Creates at run time: `src/assets/content/**`

**Interfaces:**
- Consumes: `imagesIn` from `migration/html-md.mjs`.
- Produces: `destinationName(srcWp: string)` → `string` (a repo-relative path under `src/assets/content/`), `isOriginal(path: string)` → `boolean`, `migrateImages(sources: string[])` → `Promise<Map<string,string>>` mapping each WordPress `src` to its new path, `UPLOADS_ROOT`.

**Only referenced images are migrated.** `uploads/` holds 7,421 files and 997 MB, of which 652 are raster originals — but most belong to theme demo content and plugin scaffolding (`astra-sites/`, `ai-builder/`, `essential-addons-elementor/`). Migrating all of them would put hundreds of megabytes of somebody else's stock photography into this repository's history, permanently. The set that matters is the set the 45 posts and 9 pages actually reference, plus the 3 featured images.

**Re-encoding is why this is safe, and it is not optional.** This media comes off a server compromised twice in eighteen months. Decoding a file and re-encoding it through `sharp` discards everything that is not pixels — appended archives, injected markup, EXIF payloads. **A file that fails to decode is not an image**: it is dropped by name and counted, never copied through. **SVG cannot be sanitised this way and is not migrated at all**; neither are `.doc`, `.js`, `.html`, `.htaccess`, `.json`, `.css` or `.txt`.

- [x] **Step 1: Write the failing test**

```js
// migration/media.test.mjs
import { describe, expect, it } from 'vitest';
import { isOriginal, destinationName, ALLOWED_EXTENSIONS } from './media.mjs';

describe('choosing files', () => {
  it('rejects the WordPress thumbnail variants', () => {
    expect(isOriginal('/uploads/2024/05/poza-300x200.jpg')).toBe(false);
    expect(isOriginal('/uploads/2024/05/poza-1024x768.png')).toBe(false);
    expect(isOriginal('/uploads/2024/05/poza.jpg')).toBe(true);
  });

  it('does not mistake a name that contains digits and an x for a thumbnail', () => {
    // `matrix-2.jpg` and `pers-3x.jpg` are originals. A looser pattern eats
    // real files and nothing says so, because the page just loses an image.
    expect(isOriginal('/uploads/2024/05/matrix-2.jpg')).toBe(true);
    expect(isOriginal('/uploads/2024/05/pers-3x.jpg')).toBe(true);
  });

  it('rejects everything that cannot be re-encoded', () => {
    // SVG is a script vector and cannot be re-encoded to itself; .doc and .js
    // are not images at all. This list is the allowlist, derived from what
    // sharp can decode - never a denylist of what we happened to think of.
    expect(ALLOWED_EXTENSIONS).toEqual(['jpeg', 'jpg', 'png', 'webp']);
    expect(isOriginal('/uploads/logo.svg')).toBe(false);
    expect(isOriginal('/uploads/pliant.doc')).toBe(false);
    expect(isOriginal('/uploads/pum/pum-site-scripts.js')).toBe(false);
  });
});

describe('the destination name', () => {
  it('keeps the year and month, so two pictures named alike do not collide', () => {
    expect(destinationName('/wp-content/uploads/2024/05/hram.jpg'))
      .toBe('src/assets/content/2024/05/hram.jpg');
  });

  it('accepts an absolute address on the old site', () => {
    expect(destinationName('https://www.bor-zh.ch/wp-content/uploads/2024/05/hram.jpg'))
      .toBe('src/assets/content/2024/05/hram.jpg');
  });

  it('is deterministic - the same input, the same result', () => {
    // Spec 11: rerunning the migration must produce identical output.
    const a = destinationName('/wp-content/uploads/2024/05/hram.jpg');
    const b = destinationName('/wp-content/uploads/2024/05/hram.jpg');
    expect(a).toBe(b);
  });
});
```

- [x] **Step 2: Run it to confirm it fails**

Run: `rtk proxy npx vitest run migration/media.test.mjs`
Expected: FAIL — module not found.

- [x] **Step 3: Write the pipeline**

```js
// migration/media.mjs
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

export const UPLOADS_ROOT =
  '/Users/stefan/Work/stuff/site-bzh/backup-2026-08-22/web01/htdocs/wp-content/uploads';

/**
 * What `sharp` can decode AND re-encode, which is the same thing as what can
 * be sanitised. Derived from the capability, not from a list of file types
 * somebody remembered to worry about.
 *
 * SVG is absent deliberately: sharp can rasterise it, but an SVG that stays an
 * SVG carries script, and this media comes off a server that was compromised
 * twice. The 24 SVGs on disk are logos and icons; if one is ever wanted, it
 * gets looked at by a person and added by hand.
 */
export const ALLOWED_EXTENSIONS = ['jpeg', 'jpg', 'png', 'webp'];

/** The long edge everything is downscaled to. Spec 11. */
const MAX_EDGE = 2400;

/**
 * WordPress writes `name-WIDTHxHEIGHT.ext` for every generated thumbnail.
 *
 * ANCHORED TO THE END and requiring digits on BOTH sides of the `x`, because a
 * looser pattern silently eats originals: `matrix-2.jpg` and `pers-3x.jpg` are
 * real files somebody uploaded. An over-eager filter here does not fail - the
 * page just loses a picture, on a green build.
 */
const THUMBNAIL = /-\d+x\d+\.[A-Za-z0-9]+$/;

export function isOriginal(path) {
  if (THUMBNAIL.test(path)) return false;
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return ALLOWED_EXTENSIONS.includes(ext);
}

/**
 * The repo path an upload becomes, keeping WordPress's year/month folders.
 *
 * The folders are kept because filenames repeat: `hram.jpg` exists under
 * several months, and flattening would have one silently overwrite another.
 */
export function destinationName(srcWp) {
  const m = srcWp.match(/uploads\/(.+)$/);
  if (m === null) throw new Error(`Not an upload path: ${srcWp}`);
  return `src/assets/content/${m[1]}`;
}

/**
 * Copies the referenced images across, sanitising each one by re-encoding it.
 *
 * Returns a map from the original `src` to its new repo path. A source that is
 * missing, or that sharp cannot decode, is reported by name and LEFT OUT of
 * the map - the caller then knows the reference is dead and can say so, rather
 * than emitting Markdown pointing at a file that was never written.
 */
export async function migrateImages(sources, repoRoot = process.cwd()) {
  const mapping = new Map();
  const skipped = [];
  for (const src of [...new Set(sources)]) {
    if (!isOriginal(src)) { skipped.push([src, 'disallowed type']); continue; }
    const relative = src.match(/uploads\/(.+)$/)?.[1];
    if (relative === undefined) { skipped.push([src, 'foreign path']); continue; }
    const source = join(UPLOADS_ROOT, relative);
    const destinationRelative = destinationName(src);
    const destination = join(repoRoot, destinationRelative);
    try {
      const raw = await readFile(source);
      // Decode -> resize -> re-encode. This is the sanitisation: whatever was
      // appended to, or hidden in, the original does not survive being turned
      // back into pixels and written out fresh.
      const image = sharp(raw, { failOn: 'error' }).rotate();
      const meta = await image.metadata();
      const resized =
        Math.max(meta.width ?? 0, meta.height ?? 0) > MAX_EDGE
          ? image.resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside' })
          : image;
      const output = await resized.toBuffer();
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, output);
      mapping.set(src, destinationRelative);
    } catch (e) {
      skipped.push([src, e instanceof Error ? e.message : String(e)]);
    }
  }
  // Print what was measured, not only the verdict.
  process.stdout.write(
    `\nImages migrated: ${mapping.size} of ${new Set(sources).size} referenced.\n`,
  );
  for (const [src, reason] of skipped) process.stdout.write(`  skipped: ${src} - ${reason}\n`);
  return mapping;
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `rtk proxy npx vitest run migration/media.test.mjs`
Expected: PASS, 6 tests.

- [x] **Step 5: Prove the sanitisation fires**

Build a file that is a valid JPEG with a payload appended, run it through, and show the payload is gone:

```bash
node -e "
import('sharp').then(async ({default: sharp}) => {
  const fs = await import('node:fs/promises');
  const bun = await sharp({create:{width:10,height:10,channels:3,background:'#fff'}}).jpeg().toBuffer();
  await fs.writeFile('/tmp/poisoned.jpg', Buffer.concat([bun, Buffer.from('<?php system(\$_GET[0]); ?>')]));
  const before = await fs.readFile('/tmp/poisoned.jpg');
  console.log('before contains php:', before.includes('<?php'));
  const after = await sharp(before).toBuffer();
  console.log('after  contains php:', after.includes('<?php'));
});
"
```

Expected: `before contains php: true`, `after contains php: false`. Paste both lines into the commit message — this is the claim the whole task rests on and it should be a measurement rather than an assertion.

- [x] **Step 6: Commit**

```bash
git add migration/media.mjs migration/media.test.mjs
git commit -m "feat(migration): migrate only referenced images, sanitising each by re-encoding it"
```

---

### Task 6: The 45 posts

**Files:**
- Create: `migration/articles.mjs`, `migration/articles.test.mjs`
- Modify: `src/lib/diacritics-sources.test.ts` (the `BINARIES` rule, below)
- Create: `src/lib/binaries.itest.ts`
- Creates at run time: `src/content/articles/*.md`

**This is the task that first commits the migrated images, and the moment it
does, `src/lib/diacritics-sources.test.ts` goes red.** Its case *leaves out no
tracked file that nobody has named as binary* fails every tracked
file that is not valid UTF-8 and is not listed in `BINARIES` — which holds one
path, named one by one on purpose. About a hundred JPEGs and PNGs cannot be
named one by one.

Replace `BINARIES.includes(path)` with a predicate: `public/favicon.ico`, or a
path under the migrated-image directory whose extension is on a fixed
allow-list. **A prefix rule on its own is a pure weakening, so it does not ship
alone.** The "cannot fall behind" property is replaced by something stronger
than naming: a check that every file under that prefix actually DECODES as an
image through sharp. A name list is defeated by renaming a payload to `.jpg`; a
decode check is not, and it asserts from the outside exactly the guarantee
Task 5's pipeline makes from the inside. It needs sharp and around a hundred
files, so it belongs in `src/lib/binaries.itest.ts`, run by `npm run test:build`,
not in the unit sweep.

Also assert that the prefix rule matches at least one real file, so it cannot
quietly become dead, and that nothing under the prefix carries an extension off
the allow-list.

**Interfaces:**
- Consumes: `query`, `toMarkdown`, `imagesIn`, `migrateImages`, `articleSchema`.
- Produces: `IMPORT_STAMPS` (the two bulk-import dates), `isDated(date: string)` → `boolean`, `fileName(slug, date)` → `string`, `extractArticles()` → `Promise<{written: number, published: number}>`.

**The date rule is the whole task.** 32 of the 45 posts carry a bulk-import stamp rather than a publication date — 20 at `2024-06-08`, 11 at `2024-05-21`, and one more. Those import with `published: false`. The 13 with a genuine date import with `published: true`. The parish decides the rest in the CMS.

**Why the stamps are recognised by value rather than by heuristic.** "A date shared by many posts" would be a rule that changes meaning the moment the parish legitimately publishes three things on one day. The two stamps are facts about this dump, so they are named as facts, with the measured counts beside them, and a count that no longer matches fails.

- [ ] **Step 1: Write the failing test**

```js
// migration/articles.test.mjs
import { describe, expect, it } from 'vitest';
import { isDated, fileName, IMPORT_STAMPS } from './articles.mjs';

describe('the import dates', () => {
  it('names exactly the two measured stamps', () => {
    expect(IMPORT_STAMPS).toEqual(['2024-05-21', '2024-06-08']);
  });

  it('treats a stamp as undated and everything else as dated', () => {
    expect(isDated('2024-06-08')).toBe(false);
    expect(isDated('2024-05-21')).toBe(false);
    expect(isDated('2025-11-05')).toBe(true);
    expect(isDated('2024-06-09')).toBe(true);
  });
});

describe('the file name', () => {
  it('puts the date in front, so the folder order is the chronological order', () => {
    expect(fileName('hramul-parohiei-2024', '2024-11-04'))
      .toBe('2024-11-04-hramul-parohiei-2024.md');
  });

  it('is deterministic', () => {
    expect(fileName('a', '2024-01-01')).toBe(fileName('a', '2024-01-01'));
  });

  it('does not produce the same name for two articles on the same day', () => {
    expect(fileName('a', '2024-06-08')).not.toBe(fileName('b', '2024-06-08'));
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `rtk proxy npx vitest run migration/articles.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the extractor**

Key points the implementer must honour, with the code shape following `migration/media.mjs`:

- `IMPORT_STAMPS = ['2024-05-21', '2024-06-08']`, sorted, with a comment giving the measured counts (11 and 20) and the date measured.
- Query: `SELECT post_name, post_title, DATE(post_date), post_content, post_excerpt FROM wpoi_posts WHERE post_type='post' AND post_status='publish' ORDER BY post_name` — **ordered by slug, not by date**, so the run is deterministic and two posts sharing a date cannot swap places between runs.
- Category from `wpoi_term_relationships`; map `Noutati` to `Noutati` and `Catehismul Bisericii Ortodoxe` to `Cateheza`. **A category that maps to neither is an error that stops the run**, naming the post — never a silent fallback to `Noutati`.
- Featured image from `_thumbnail_id` where present (3 posts).
- Body through `toMarkdown`; images through `imagesIn` then `migrateImages`;
  rewrite each `src` in the Markdown to its new path. **An `src` the map does not
  contain stops the run, naming the document and the reference** — it is not a
  warning and not a blank. Task 5 cannot enforce this: it omits a dead direct
  reference from the map and names it on stdout, but still exits 0 by design,
  because the caller is what gates. This is that gate, and without it the
  failure is an image silently missing from a page on a green build.
- **Assert the count as well as the contents**: the number of `<img>` tags in a
  document must equal the number of srcs `imagesIn` returned for it. Measured
  2026-09-17 across the 71 published documents: 116 tags, 116 srcs, zero
  disagreement. That equality is what would catch an attribute shape
  `imagesIn` cannot see — `data-src` only, or an unquoted `src`, both of which
  occur zero times today and are documented limits rather than fixed behaviour.
- Frontmatter written in a fixed key order, validated with `articleSchema.parse` **before** the file is written. A file that would not build is not written.
- Print the two counts at the end: written, and of those published.

- [ ] **Step 4: Run the test to verify it passes**

Run: `rtk proxy npx vitest run migration/articles.test.mjs`
Expected: PASS, 5 tests.

- [ ] **Step 5: Run the extraction and check the numbers**

Expected: **45 files written, 13 published.** If either differs, stop and report — those two numbers are this plan's contract with the parish's decision.

- [ ] **Step 6: Prove it is repeatable**

Run the extraction twice and diff the tree:

```bash
node migration/articles.mjs && cp -r src/content/articles /tmp/run-1
node migration/articles.mjs && rtk proxy diff -r /tmp/run-1 src/content/articles; echo "exit=$?"
```

Expected: `exit=0` and no output. **Read the exit code, not the absence of output** — `rtk`'s `diff` exits 0 even when it prints a difference, which is why this uses `rtk proxy`.

- [ ] **Step 7: Verify the build accepts all 45**

Run: `TZ=Europe/Zurich npm run check && TZ=Europe/Zurich npm run test:build`
Expected: both exit 0. **A build failure here is a migration bug** (spec §11) — fix the migration, never the schema.

- [ ] **Step 8: Commit**

```bash
git add migration/articles.mjs migration/articles.test.mjs src/content/articles src/assets/content
git commit -m "feat(migration): the 45 posts, 13 published and 32 held for the parish to date"
```

---

### Task 7: The nine prose pages, and the URL map

**Files:**
- Create: `migration/pages.mjs`, `migration/pages.test.mjs`, `migration/url-map.mjs`, `migration/run.mjs`
- Creates at run time: `src/content/pages/*.md`, `docs/url-map.csv`

**Interfaces:**
- Consumes: everything from Tasks 1, 3, 5.
- Produces: `PAGES` (the nine, each `{ slug, path, title, order }`), `extractPages()`, `writeUrlMap()`, and `migration/run.mjs` as the one entry point.

**The nine, with their old slug and their new route** — this table is the task's contract and the URL map's source of truth:

| WordPress slug | New route | Title | `order` |
|---|---|---|---|
| `istoric` | `parohia/istoric` | Istoric | 10 |
| `consiliul-parohial` | `parohia/consiliul` | Consiliul Parohial | 20 |
| `servicii-liturgice` | `servicii-liturgice` | Servicii liturgice | 30 |
| `scoala-parohiala` | `comunitate/scoala` | Scoala parohiala | 40 |
| `cursuri-de-pictura` | `comunitate/pictura` | Cursuri de pictura | 50 |
| `catehism` | `resurse/catehism` | Catehism | 60 |
| `studii` | `resurse/studii` | Studii | 70 |
| `revista-doxologia` | `resurse/doxologia` | Revista Doxologia | 80 |
| `link-uri-utile` | `resurse/linkuri` | Link-uri utile | 90 |

**Titles carry their real diacritics in the actual file** — they are written here without, because this plan is swept for codepoints and the correct Romanian letters would be fine but the surrounding table is easier to read plain. The implementer takes each title from `wpoi_posts.post_title`, normalised, not from this table.

**`order` is a spaced integer, not a position.** Tens leave room to insert a page between two others without renumbering nine files.

- [ ] **Step 1: Write the failing test**

```js
// migration/pages.test.mjs
import { describe, expect, it } from 'vitest';
import { PAGES } from './pages.mjs';
import { pageSchema } from '../src/lib/content-schema.ts';

describe('the nine pages', () => {
  it('are exactly nine', () => {
    expect(PAGES).toHaveLength(9);
  });

  it('every path passes the schema, so every route will build', () => {
    // The route is built as `/${path}/`. Validating here rather than at build
    // time means a bad path fails in the migration, where somebody is looking,
    // instead of producing a 404 page that reads correctly.
    for (const p of PAGES) {
      expect(() => pageSchema.parse({ title: p.title, path: p.path, order: p.order }))
        .not.toThrow();
    }
  });

  it('has no two pages on the same path or the same slug', () => {
    expect(new Set(PAGES.map((p) => p.path)).size).toBe(9);
    expect(new Set(PAGES.map((p) => p.slug)).size).toBe(9);
  });

  it('the order is in tens, so one can be inserted between two others', () => {
    for (const p of PAGES) expect(p.order % 10).toBe(0);
    const orders = PAGES.map((p) => p.order);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `rtk proxy npx vitest run migration/pages.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `migration/pages.mjs`**

`PAGES` as the table above. For each: query the page by slug, `toMarkdown` the `post_content` — **`toMarkdown` already calls `stripPreamble` itself, so do NOT call it first.** Calling both strips twice, and a second strip is not guaranteed to be a no-op: it removes whatever now sits at the top if that happens to be preamble-shaped. Measured 2026-09-17 across all 71 published posts and pages: 16 carry a `<p>Layouts:` marker and 17 are changed by one strip — the difference is `pastorale`, which has only the breadcrumb — while 0 are non-idempotent under a double strip and 0 leave residue after one — so this is a latent trap rather than a present bug, which is exactly when it is cheap to close. Then migrate its images, validate with `pageSchema`, write `src/content/pages/<slug>.md`. **If a slug returns no row, that is an error that stops the run** — a page silently missing is the failure this project has paid for most.

- [ ] **Step 4: Write `migration/url-map.mjs`**

Emits `docs/url-map.csv` with a header row `vechi,nou` and one row per redirect, sorted by old path so the file is stable across runs:

- the nine pages: `/<slug>/` to `/<path>/`
- all 45 posts: `/<slug>/` to `/noutati/<slug>/` — **including the 32 unpublished ones**, because the old URLs exist and will be linked from elsewhere for years. A redirect to a page that does not exist yet is better than a 404 *and* it is why the unpublished posts keep their slugs.
- `/program-liturgic/` to `/program/`
- `/feed/` to `/rss.xml`

Phase 4 turns this into `_redirects`; this phase only emits it. Say that in the file's header comment, because a CSV nobody consumes looks exactly like a CSV somebody forgot to wire up.

- [ ] **Step 5: Write `migration/run.mjs`**

One entry point, in order: `start()`, extract posts, extract pages, write the URL map, `stop()`. It prints one summary block at the end — posts written, posts published, pages written, images migrated, images skipped, redirects emitted — and **exits non-zero if any count is zero**, because a migration that produced nothing must not report success.

- [ ] **Step 6: Run it and check every number**

Run: `node migration/run.mjs`
Expected: 45 posts, 13 published, 9 pages, a non-zero image count, 56 redirects (9 + 45 + 2).

- [ ] **Step 7: Verify the build, then prove the diacritics guard actually saw this content**

```bash
TZ=Europe/Zurich npm run check && TZ=Europe/Zurich npm run test:build
```

Then the positive control that matters most in this whole phase:

```bash
node -e "
const fs=require('fs');
const f='src/content/pages/istoric.md';
// \`node -e\` is CommonJS, so this is a .then() rather than a top-level await.
import('./src/lib/cedilla.ts').then(({ CEDILLAS }) => {
  const t=fs.readFileSync(f,'utf8');
  fs.writeFileSync(f, t.replace('a', String.fromCodePoint(CEDILLAS[1])));
});
" && TZ=Europe/Zurich npm run test:build; echo "must be 1: $?"
git checkout src/content/pages/istoric.md
TZ=Europe/Zurich npm run test:build; echo "must be 0: $?"
```

Expected: exit 1 then exit 0. Phase 1 built that sweep and this is the first time it has ever been pointed at real migrated prose — if it does not fire, the sweep is not covering `src/content/` and that is a finding, not something to work around.

- [ ] **Step 8: Commit**

```bash
git add migration/pages.mjs migration/pages.test.mjs migration/url-map.mjs migration/run.mjs src/content/pages docs/url-map.csv src/assets/content
git commit -m "feat(migration): the nine prose pages, and the URL map Phase 4 will consume"
```

---

### Task 8: `/noutati`, one article, and the feed

**Files:**
- Create: `src/lib/articles.ts`, `src/lib/articles.test.ts`, `src/components/ArticleCard.astro`, `src/components/ArticleList.astro`, `src/pages/noutati/index.astro`, `src/pages/noutati/[slug].astro`, `src/pages/rss.xml.ts`

**Interfaces:**
- Consumes: the `articles` collection, `articleSchema`.
- Produces: `publishedArticles(entries)` → sorted newest-first, `type ArticleEntry`.

**The `published` rule lives in one function and nowhere else.** Three surfaces filter posts — the index, the feed and the homepage — and a fourth builds the article pages. Four copies of `.filter((a) => a.data.published)` is four chances for one of them to be forgotten, and the one that gets forgotten is `getStaticPaths`, which is how an unpublished post ends up with a live URL.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/articles.test.ts
import { describe, expect, it } from 'vitest';
import { publishedArticles } from './articles';

const makeEntry = (id: string, date: string, published: boolean) => ({
  id,
  data: { title: id, date, published, category: 'Noutati' as const, author: 'Parohia' },
});

describe('publishedArticles', () => {
  it('leaves out everything that is not published', () => {
    const r = publishedArticles([makeEntry('a', '2025-01-01', true), makeEntry('b', '2025-02-01', false)]);
    expect(r.map((x) => x.id)).toEqual(['a']);
  });

  it('gives them newest to oldest', () => {
    const r = publishedArticles([
      makeEntry('old', '2024-01-01', true),
      makeEntry('new', '2025-11-05', true),
      makeEntry('middle', '2025-03-03', true),
    ]);
    expect(r.map((x) => x.id)).toEqual(['new', 'middle', 'old']);
  });

  it('stably orders two articles from the same day, by id', () => {
    // Without a tiebreak the build output changes between runs for no reason,
    // which makes every diff of `dist/` untrustworthy.
    const r = publishedArticles([makeEntry('b', '2025-01-01', true), makeEntry('a', '2025-01-01', true)]);
    expect(r.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('gives an empty list without throwing when there is no article', () => {
    expect(publishedArticles([])).toEqual([]);
  });

  it('is not a vacuous pass: 32 unpublished and 13 published split correctly', () => {
    // The shape of the real corpus, asserted as a property rather than trusted.
    const mixed = [
      ...Array.from({ length: 13 }, (_, i) => makeEntry(`p${i}`, `2025-01-${String(i + 1).padStart(2, '0')}`, true)),
      ...Array.from({ length: 32 }, (_, i) => makeEntry(`n${i}`, '2024-06-08', false)),
    ];
    expect(publishedArticles(mixed)).toHaveLength(13);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `rtk proxy npx vitest run src/lib/articles.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/lib/articles.ts`**

```ts
import type { Article } from './content-schema';

export interface ArticleEntry {
  id: string;
  data: Article;
}

/**
 * The published posts, newest first.
 *
 * THE ONLY PLACE `published` IS READ. `/noutati`, `/rss.xml`, the homepage and
 * `getStaticPaths` in `[slug].astro` all come through here. Four copies of the
 * same filter is four chances to forget one, and the one that gets forgotten
 * is `getStaticPaths` - which does not look wrong anywhere, it just quietly
 * gives all 32 archived posts a live URL of their own.
 *
 * The id tiebreak is not decoration: 32 of the migrated posts share one of two
 * dates, so without it the build's output order depends on filesystem order
 * and every `dist/` diff becomes noise.
 */
export function publishedArticles(entries: ArticleEntry[]): ArticleEntry[] {
  return entries
    .filter((a) => a.data.published)
    .sort((a, b) => (a.data.date === b.data.date
      ? a.id.localeCompare(b.id, 'en')
      : b.data.date.localeCompare(a.data.date, 'en')));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `rtk proxy npx vitest run src/lib/articles.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Build the three routes and two components**

- `ArticleCard.astro` — date, title, category, optional summary. Colours from `TEXT_ROLES`; no gold on text.
- `ArticleList.astro` — takes `articles` and an optional `limit`; used by `/noutati` and by the homepage.
- `noutati/index.astro` — `Base` layout, `<h1>Noutati</h1>`, the list. When the list is empty, the same shape of sentence `/program/` uses for an unpublished schedule.
- `noutati/[slug].astro` — `getStaticPaths` **from `publishedArticles`**, never from the raw collection. Renders title, date, author, body.
- `rss.xml.ts` — follow `src/pages/program.ics.ts` for shape: a route that returns a `Response` with the right content type, built from `publishedArticles`.

- [ ] **Step 6: Assert the archive has no pages of its own**

Add to `src/lib/build-output.itest.ts`:

```ts
it('no unpublished article has a page of its own in dist/', () => {
  // "Unpublished" must not mean "reachable by anyone with the link". Taken
  // from the CONTENT FILES rather than from the built output, because a guard
  // that derives its subject from the artifact it checks can only check what
  // it recognised - and what it would fail to recognise here is precisely the
  // page that should not exist.
  const unpublished = articleFiles()
    .filter((f) => f.frontmatter.published === false)
    .map((f) => f.slug);
  expect(unpublished.length, 'no unpublished article - the guard would prove nothing')
    .toBeGreaterThan(0);
  for (const slug of unpublished) {
    expect(existsSync(`dist/noutati/${slug}/index.html`), `${slug} must not have a page`)
      .toBe(false);
  }
});
```

- [ ] **Step 7: Run the suite**

Run: `TZ=Europe/Zurich npm run test:all && TZ=Europe/Zurich npm run check`
Expected: both exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/lib/articles.ts src/lib/articles.test.ts src/components/ArticleCard.astro src/components/ArticleList.astro src/pages/noutati src/pages/rss.xml.ts src/lib/build-output.itest.ts
git commit -m "feat: /noutati, the article page and the feed, all filtered in one place"
```

---

### Task 9: The nine prose routes, from one file

**Files:**
- Create: `src/pages/[...page].astro`
- Modify: `src/components/SiteHeader.astro`
- Test: added to `src/lib/build-output.itest.ts`

**Interfaces:**
- Consumes: the `pages` collection, `pageSchema`.
- Produces: nine built routes.

**One dynamic route, not nine files.** The pages differ only in their content, so nine near-identical `.astro` files would be nine places to fix a heading level. `getStaticPaths` reads the collection and builds `/${path}/` for each.

**The navigation grows from two links to five.** `Acasa`, `Program`, `Noutati`, and two groupings. The header is a flex row that already wraps; check it at 390px, where the parish mostly reads this site, and remember Chrome silently refuses a window under about 500px — `Emulation.setDeviceMetricsOverride` over CDP is the only thing that honours the request, and `scripts/a11y.mjs` already does it.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/build-output.itest.ts`:

```ts
it('every page in the collection has exactly one built file', () => {
  // The expected set comes from the CONTENT FILES, which the route cannot
  // edit - not from walking `dist/`, which would only ever confirm what the
  // route already produced.
  const paths = pageFiles().map((f) => f.frontmatter.path);
  expect(paths.length, 'no page - the guard would prove nothing').toBe(9);
  for (const path of paths) {
    expect(existsSync(`dist/${path}/index.html`), `missing /${path}/`).toBe(true);
  }
});

it('every built page really has content, not just a title', () => {
  // A page whose body failed to render looks completely correct: header,
  // title, footer. Measured on the real corpus, the shortest of the nine is
  // over 3,000 characters of prose, so a floor of 400 catches an empty body
  // without pinning the test to today's content.
  for (const f of pageFiles()) {
    const html = readFileSync(`dist/${f.frontmatter.path}/index.html`, 'utf8');
    const body = html.split('<main')[1]?.split('</main>')[0] ?? '';
    const text = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    expect(text.length, `/${f.frontmatter.path}/ looks empty`).toBeGreaterThan(400);
  }
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `TZ=Europe/Zurich npm run test:build`
Expected: FAIL — the routes do not exist.

- [ ] **Step 3: Write the route**

```astro
---
// src/pages/[...page].astro
import { getCollection, render } from 'astro:content';
import Base from '../layouts/Base.astro';

export async function getStaticPaths() {
  const pages = await getCollection('pages');
  return pages.map((p) => ({ params: { page: p.data.path }, props: { p } }));
}

const { p } = Astro.props;
const { Content } = await render(p);
---

<Base title={p.data.title} description={p.data.description}>
  <div class="container prose">
    <h1>{p.data.title}</h1>
    <Content />
  </div>
</Base>
```

The `.prose` styles go in this file: measure (`var(--masura)`), heading scale, list and link treatment. **Any `a { color }` declared here takes that link's interactive states with it** — Astro scopes the rule at (0,3,1) and the global `a:hover` is (0,1,1) — so declare `:hover` and `:focus-visible` alongside, or do not declare `color` at all. Do **not** declare `outline`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `TZ=Europe/Zurich npm run test:build`
Expected: PASS.

- [ ] **Step 5: Extend the navigation**

`SiteHeader.astro` gains `Noutati`, `Servicii liturgice` and a link to the parish pages. Keep the existing `aria-current` treatment. **The nav is now long enough to wrap**; the 390px pass is what says whether it wraps acceptably.

- [ ] **Step 6: Run every browser pass**

Run: `TZ=Europe/Zurich npm run test:all`
Expected: exit 0, four passes green. The audit now covers nine more pages — **check that it actually does**: `scripts/a11y.mjs` takes its page list from somewhere, and if that somewhere is a hardcoded array then these nine are not being audited and nothing says so. Extend it and print the count.

- [ ] **Step 7: Commit**

```bash
git add src/pages/'[...page].astro' src/components/SiteHeader.astro src/lib/build-output.itest.ts scripts/a11y.mjs
git commit -m "feat: the nine prose pages from one route, and a navigation that reaches them"
```

---

### Task 10: The homepage news section, and the settings singleton

**Files:**
- Modify: `src/pages/index.astro`, `src/components/SiteFooter.astro`, `src/pages/program.ics.ts`
- Create: `src/lib/settings.ts`, `src/lib/settings.test.ts`

**The parish address exists in three places and this task is where that ends.**
Measured 2026-09-17: `src/content/settings/settings.yml` (`address`),
`src/pages/program.ics.ts:31` (`LOCATION`, a byte-identical string) and
`src/components/SiteFooter.astro:12` (the same content, split across a `<br />`).
Converting only the footer leaves the calendar feed as a second source of truth
for the address a visitor drives to — so `program.ics.ts` reads `settings` too.
The footer's line break is a rendering choice, not a second address: decide how
one `address` string renders there, rather than adding a field to carry the break.
After this task, `rtk proxy grep -rn Wehntalerstrasse src/` must find it only in
`settings.yml`.

**Interfaces:**
- Consumes: `publishedArticles`, `ArticleList`, the `settings` collection.
- Produces: `pickSettings()` → `Promise<Settings>`.

**Spec §5 defines the homepage as hero, week band, then news.** Phase 1 built the first two and the parish has since removed the hero's address and its next-service card; the news section is the third and last part.

**Watch the budget.** `dist/index.html` is 15,913 B against a 45 KB limit, so there is room — but `scripts/check-budget.mjs` is what says so, and it must be run rather than reasoned about. Cap the homepage list at the most recent three.

**The settings singleton is what makes the footer editable.** It also has to fail loudly when it is missing: a footer that silently renders empty is worse than a build that stops.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/settings.test.ts
import { describe, expect, it } from 'vitest';
import { pickSettings } from './settings';

describe('pickSettings', () => {
  it('picks the single entry', () => {
    const s = { name: 'Parohia', address: 'a', phone: 'b', email: 'c@d.ch' };
    expect(pickSettings([{ id: 'settings', data: s }]).name).toBe('Parohia');
  });

  it('throws in Romanian when there is none, instead of giving an empty footer', () => {
    // A footer that renders blank looks like a design choice. A build that
    // stops names the file somebody has to create.
    expect(() => pickSettings([])).toThrow(/src\/content\/settings/);
  });

  it('throws when there are two, because then it is not known which is true', () => {
    const s = { name: 'x', address: 'a', phone: 'b', email: 'c@d.ch' };
    expect(() => pickSettings([{ id: 'a', data: s }, { id: 'b', data: s }]))
      .toThrow(/o singura/);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `rtk proxy npx vitest run src/lib/settings.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/lib/settings.ts`, then wire the footer and the homepage**

`pickSettings` throws a Romanian message naming `src/content/settings/settings.yml` when the collection is empty, and a different one when it holds more than one entry. `SiteFooter.astro` reads it and drops its hardcoded values. `index.astro` renders `ArticleList` with `limit={3}` under a heading, and a link to `/noutati/`. When there are no published posts the section renders nothing at all rather than an empty heading.

- [ ] **Step 4: Run the suite and the budget**

Run: `TZ=Europe/Zurich npm run test:all && TZ=Europe/Zurich npm run budget`
Expected: exit 0. **Record the homepage's new byte count in the commit message** — the number is what a later reader trusts when a comment disagrees with it.

- [ ] **Step 5: Commit**

```bash
git add src/lib/settings.ts src/lib/settings.test.ts src/components/SiteFooter.astro src/pages/index.astro
git commit -m "feat: news on the homepage, and a footer the parish can edit"
```

---

### Task 11: The CMS, which is the point of the whole phase

**Files:**
- Modify: `public/admin/config.yml`
- Modify: `src/lib/cms.test.ts`

**Interfaces:**
- Consumes: `CATEGORIES`, `articleSchema`, `pageSchema`, `settingsSchema`.
- Produces: three CMS collections a volunteer can use.

**Every label, hint and description is Romanian.** The CMS chrome is English — Sveltia ships 29 UI translations and Romanian is not one of them, a trade the spec records — so the field labels are the only Romanian a volunteer sees and they carry the whole weight.

**`media_folder` must be revisited, and Phase 1 said so in a comment.** This is the first phase with a real image field. `src/assets/uploads` is where Astro's image pipeline wants files, and **a file there is not served at `/uploads`** — so `public_folder` has to match how the schema stores a path and how the components resolve it. Get this wrong and uploads work in the CMS and break on the page.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/cms.test.ts`:

```ts
it('the CMS categories are identical to CATEGORIES', () => {
  // Same mechanism, same reason as SERVICE_NAMES in Phase 1: a dropdown that
  // offers a value the build then rejects hands the volunteer a failed deploy
  // for picking an option this file gave them.
  const field = collectionField('articles', 'category');
  expect(field.options).toEqual([...CATEGORIES]);
});

it('every collection has a label and a description in Romanian', () => {
  for (const name of ['articles', 'pages', 'settings']) {
    const c = collection(name);
    expect(c.label, `${name} has no label`).toBeTruthy();
    expect(c.label).not.toMatch(/^[a-z_]+$/); // not the raw key
  }
});

it("the schema's required fields are required in the CMS too", () => {
  // Otherwise the volunteer saves a valid-looking entry and the BUILD fails,
  // somewhere they will never see it.
  for (const field of ['title', 'date', 'published', 'category']) {
    expect(collectionField('articles', field).required).not.toBe(false);
  }
});

it('media_folder and public_folder are a matched pair, not two separate guesses', () => {
  expect(CONFIG.media_folder).toBe('src/assets/uploads');
  expect(CONFIG.public_folder).toBe('/src/assets/uploads');
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `rtk proxy npx vitest run src/lib/cms.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add the three collections to `config.yml`**

`articles` (folder `src/content/articles`, `create: true`, sorted newest-first, `published` a boolean with a Romanian hint saying an unpublished article appears nowhere on the site), `pages` (folder, `create: false` — the nine exist and a tenth needs a route decision), `settings` (a `files` singleton).

- [ ] **Step 4: Run the test, then look at the running CMS**

Run: `rtk proxy npx vitest run src/lib/cms.test.ts` — expect PASS.

Then **open `/admin/` and use it**, because a control found in the bundle is not a control this configuration renders. Phase 1 put three buttons that do not exist into its documentation before anyone checked. `astro dev --background`, then `/admin/`, sign in with the `test-repo` backend, and confirm: the three collections appear, `Articles` is sorted newest-first, the category dropdown holds exactly two options, and the settings singleton opens as a form rather than a list.

- [ ] **Step 5: Commit**

```bash
git add public/admin/config.yml src/lib/cms.test.ts
git commit -m "feat(cms): articles, pages and settings, with the media pair finally settled"
```

---

### Task 12: The guards, the budget, and the handover

**Files:**
- Modify: `scripts/check-budget.mjs`, `scripts/a11y.mjs`, `src/lib/diacritics.itest.ts`, `CLAUDE.md`, `README.md`, `docs/handover.md`

- [ ] **Step 1: Bring the new pages under the budget**

`PAGE_BUDGET` currently names the visitor pages by hand. Add `/noutati/`, one article page and one prose page. **`/noutati/` grows with every post the parish publishes** — same shape as `/program/`, which is already exempt by name and still crosses its limit at 58 weeks. Decide explicitly: either the index is paginated, or it is exempt and says so with the count at which it would break, measured rather than estimated.

- [ ] **Step 2: Bring them under the audit**

`scripts/a11y.mjs` must visit an article page and a prose page in every condition it already runs — both script states, all three widths. Print the page count so a later reader can see it changed.

- [ ] **Step 3: Prove the diacritics sweep covers `src/content/`**

The corpus that lands in this phase is the first real input that sweep has ever had. Corrupt one migrated file, run `npm run test:build`, watch it exit 1, restore it, watch it exit 0. If it does not fire, the sweep's scope is the finding.

- [ ] **Step 4: Update the documentation**

`CLAUDE.md` gains the migration's rules: that `migration/` reads from outside the repository and a fresh clone cannot run it; that re-encoding is the sanitisation; that `published: false` means no page at all. `README.md` gains how to add a post. `docs/handover.md` gains the Phase 2 steps — and **check every command by running it**, because this project has shipped a handover that pointed at a file which did not exist.

- [ ] **Step 5: Run everything from a clean clone**

```bash
TZ=Europe/Zurich npm run test:all && TZ=Europe/Zurich npm run check
```

Expected: both exit 0, from a fresh `git clone` of this branch into a temporary directory with `npm ci`. **A fresh clone cannot run the migration** — the backups are not in it — so the check is that the *site* builds from committed content, which is the property that matters.

- [ ] **Step 6: Commit**

```bash
git add scripts/ src/lib/diacritics.itest.ts CLAUDE.md README.md docs/handover.md
git commit -m "feat: the new pages come under the budget, the audit and the codepoint sweep"
```

---

## Self-review

**Spec coverage.** §5 IA — Tasks 7, 9, 10 build `/noutati`, the nine prose routes and the navigation; the routes this phase does not build (`/events`, `/galerie`, `/pastorale`, `/contact`, `/doneaza`) are Phase 3 by the parish's decision, recorded in §19. §6.2 `articles` — Tasks 4, 6, 8. §6.4 `pages` — Tasks 4, 7, 9. §6.7 `settings` — Tasks 4, 10, 11. §11 migration, all seven steps — Tasks 1, 2, 3, 5, 6, 7; step 7's URL map is Task 7. §12 redirects — the CSV is emitted in Task 7 and consumed in Phase 4, stated in the file's own header. §13 budget — Task 12. §14 security — Task 5's sanitisation and the SVG exclusion.

**Gaps I am leaving open, deliberately:**

1. **The 32 unpublished posts keep their old URLs in the redirect map but have no page.** A visitor following an old link reaches `/noutati/<slug>/`, which 404s until the parish publishes that post. The alternative — no redirect — 404s too, and loses the mapping. Named in Task 7.
2. **`/noutati` has no pagination.** At 13 posts it does not need any. Task 12 forces the decision rather than letting it arrive as a red build years later.
3. **Elementor image *placement* is not recovered.** `post_content`'s own `<img>` tags are used; `_elementor_data` is not walked. On a page where an image sat in a layout column rather than in the text flow, the image will be missing. This is the residue of the spec's "lossy" warning, now much smaller, and it is what the hand-review in Task 7 is for.

**Placeholder scan.** No `TBD`, no "add error handling", no "similar to Task N". Tasks 6, 7, 9, 10, 11 and 12 describe some steps in prose rather than full code — deliberately, where the shape is set by an existing file in the repository that the implementer must match (`src/lib/schema.ts`, `src/pages/program.ics.ts`, `public/admin/config.yml`). Each names that file.

**Type consistency.** `articleSchema`/`pageSchema`/`settingsSchema` defined in Task 4 and used in 6, 7, 8, 10, 11. `publishedArticles` defined in Task 8, used in 8 and 10. `toMarkdown`/`imagesIn` defined in Task 3, used in 6 and 7. `migrateImages` defined in Task 5, used in 6 and 7. `CATEGORIES` defined in Task 4, used in 6 and 11. `path` has no leading or trailing slash everywhere it appears.
