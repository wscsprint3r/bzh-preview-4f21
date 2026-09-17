# Phase 2 — Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the parish's written content off the compromised WordPress install into git, and render it — 45 news posts, nine prose pages, an editable settings singleton, `/noutati`, `/rss.xml` and a homepage news section.

**Architecture:** A one-way migration harness under `migrare/` loads the 2026-08-27 database dump into a disposable MariaDB container, normalises the text, converts it to Markdown, and writes content files plus a URL map. The site then renders those files through three new Astro content collections that follow Phase 1's patterns exactly. The harness is committed and repeatable — rerunning it must produce byte-identical output — but it is not part of the site build and ships nothing to a visitor.

**Tech Stack:** Astro 7.3.2 (static), Zod 4 via `astro/zod`, Vitest 5, Turndown 7 (HTML → Markdown), sharp (already a transitive Astro dependency, used directly here), Docker + `mariadb:11` for the disposable import, Sveltia CMS 0.213.0.

**Spec:** `docs/superpowers/specs/2026-09-15-parish-site-rewrite-design.md` — sections 5 (IA), 6.2/6.4/6.7 (content model), 11 (migration), 12 (URL map), 13 (budget), 14 (security).

---

## Global Constraints

Every task's requirements implicitly include this section. Phase 1's constraints
(`docs/superpowers/plans/2026-09-15-phase-1-schedule-and-cms.md`, lines 17-261)
still bind; these are the ones this phase adds or sharpens.

- **Node 22.12.0+, Astro 7.x, `output: 'static'`, Zod 4 imported as `astro/zod`.** Never a direct `zod` dependency — a second copy breaks `instanceof`.
- **The four forbidden codepoints are U+015E, U+015F, U+0162 and U+0163** (S/s and T/t with cedilla). Romanian's letters are U+0218/U+0219 and U+021A/U+021B, comma below. **They are never written as glyphs in any tracked file, including this plan** — `src/lib/diacritice-surse.test.ts` sweeps `git ls-files`, so a plan or a test that spelled them out could not be swept. Build them from `CEDILE`, exported by `src/lib/cedile.ts` — **the only tracked file allowed to write the four numbers.** That same sweep also forbids their hexadecimal spelling everywhere else, this plan included, so no file below writes one: they are imported, and `VIRGULA_DEDESUBT` carries Romanian's four in the matching order, which is what makes the pairing below a zip rather than a table somebody can mistype.
- **The migrated content contains 684 of them today** — measured 2026-09-16 across all published posts and pages: 362 U+015F, 317 U+0163, 5 U+015E, 0 U+0162. It also contains **312 U+00E3** (`a` with tilde), which is not a Romanian letter. Normalisation is therefore a hard requirement, not a nicety: without it `src/lib/diacritice.itest.ts` fails the build on the first migrated file. That guard is Phase 1's, and this phase is the first thing that ever tested it against real input.
- **Escape sequences of the form backslash-u followed by four hex digits do not survive being written to disk** — the Bash heredoc (even quoted) and the file-writing tools both decode them silently. Build such characters from numbers, or write a placeholder and post-process it.
- **Verdicts come from the process exit code**, never `.vitest/json/output.json`. `rtk proxy npx vitest run …` for readable output.
- **`rtk` lies in five ways**, all documented in `CLAUDE.md`: `diff` exits 0 even when it prints a difference; `grep` drops `-v` and truncates; **any `rtk <cmd> | wc -l` counts the rendering rather than the data**; `git status --short` prints `ok` for a clean tree; and the JSON reporter file goes stale in both directions. Use `rtk proxy …`, or read files with `node` when you need a count.
- **All user-facing copy is Romanian.** `docs/`, `README.md`, `CLAUDE.md` and code comments are English.
- **`#B08B3E` and `#C8A45C` are ornament only, never text**, and the gold roles **invert** on the oxblood ground. `ROLURI_TEXT` and `ROLURI_TEXT_PE_OXBLOOD` in `src/lib/tokens.ts` are the two sets.
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

**Migration harness** — `migrare/`, committed, not part of the site build, ships nothing:

| File | Responsibility |
|---|---|
| `migrare/README.md` | How to run it, what it needs, what it writes |
| `migrare/db.mjs` | Container lifecycle, dump load, one `interogheaza(sql)` helper |
| `migrare/diacritice.mjs` | Text normalisation — the 684 forbidden characters, `a`-tilde, non-breaking spaces |
| `migrare/html-md.mjs` | Preamble strip + Turndown, one `laMarkdown(html)` |
| `migrare/media.mjs` | Referenced images only: decode, re-encode, downscale, emit |
| `migrare/articole.mjs` | The 45 posts to `src/content/articole/*.md` |
| `migrare/pagini.mjs` | The nine prose pages to `src/content/pagini/*.md` |
| `migrare/harta-url.mjs` | `docs/harta-url.csv` — old path to new path |
| `migrare/ruleaza.mjs` | Orchestrator: the whole migration, in order, idempotent |

**Site code:**

| File | Responsibility |
|---|---|
| `src/lib/schema-continut.ts` | `articolSchema`, `paginaSchema`, `setariSchema` and their shared vocabulary |
| `src/content.config.ts` | Registers `articole`, `pagini`, `setari` beside `slujbe` |
| `src/lib/articole.ts` | Reading, filtering and ordering posts — the `publicat` rule lives here |
| `src/lib/setari.ts` | Typed access to the settings singleton |
| `src/components/CardArticol.astro` | One post in a list |
| `src/components/ListaArticole.astro` | A list of post cards, used by `/noutati` and the homepage |
| `src/pages/noutati/index.astro` | The news index |
| `src/pages/noutati/[slug].astro` | One article |
| `src/pages/rss.xml.ts` | The feed |
| `src/pages/[...pagina].astro` | The nine prose pages, from the `pagini` collection |
| `src/content/articole/*.md` | 45 generated files |
| `src/content/pagini/*.md` | 9 generated files |
| `src/content/setari/setari.yml` | The singleton |
| `src/assets/continut/**` | Migrated images |
| `public/admin/config.yml` | Three new CMS collections |
| `docs/harta-url.csv` | Generated URL map, consumed by Phase 4 |

**Modified:** `src/components/SiteHeader.astro` (navigation), `src/components/SiteFooter.astro` (reads `setari`), `scripts/check-budget.mjs` (the new pages), `scripts/a11y.mjs` (the new pages), `CLAUDE.md`, `README.md`.

---

### Task 1: The migration harness — a disposable database you can trust

**Files:**
- Create: `migrare/db.mjs`, `migrare/README.md`
- Test: `migrare/db.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `porneste()` → `Promise<void>`, `opreste()` → `Promise<void>`, `interogheaza(sql: string)` → `Promise<string[][]>` (rows of column strings, tab-separated output split), `SURSA_DUMP` (absolute path string), `NUME_CONTAINER = 'bzh-migrare'`.

**Why a container rather than parsing the SQL.** The dump is 352 MB of phpMyAdmin output with serialized PHP inside `postmeta`. A regex over `INSERT` statements is a parser that will be wrong on exactly the rows that matter and will look right on the rest. MariaDB is the parser that already exists.

**Why it must fail loudly when the source is absent.** The dump lives outside this repository, in a directory a fresh clone does not have. A harness that quietly produces zero posts is this project's most-paid-for failure shape.

- [ ] **Step 1: Write the failing test**

```js
// migrare/db.test.mjs
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
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `rtk proxy npx vitest run migrare/db.test.mjs`
Expected: FAIL — `Failed to resolve import "./db.mjs"`.

- [ ] **Step 3: Write the harness**

```js
// migrare/db.mjs
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
 */
export async function interogheaza(sql) {
  const { stdout } = await executa('docker', [
    'exec', NUME_CONTAINER, 'mariadb', '-uroot', `-p${PAROLA}`,
    '-N', '-B', '--default-character-set=utf8mb4',
    '-e', sql, 'h164835_wordpress7',
  ], { maxBuffer: 1024 * 1024 * 512 });
  if (stdout.trim() === '') return [];
  return stdout.replace(/\n$/, '').split('\n').map((r) => r.split('\t'));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `rtk proxy npx vitest run migrare/db.test.mjs`
Expected: PASS, 3 tests.

- [ ] **Step 5: Prove the harness actually loads the dump**

Run this by hand once and paste the numbers into `migrare/README.md`:

```bash
node -e "
import('./migrare/db.mjs').then(async (m) => {
  await m.porneste();
  const p = await m.interogheaza(\"SELECT COUNT(*) FROM wpoi_posts WHERE post_type='post' AND post_status='publish'\");
  const g = await m.interogheaza(\"SELECT COUNT(*) FROM wpoi_posts WHERE post_type='page' AND post_status='publish'\");
  console.log('posts', p[0][0], 'pages', g[0][0]);
  await m.opreste();
});
"
```

Expected: `posts 45 pages 26`. **If either number differs, stop and report it** — this plan's task list is sized from those two numbers, and a different count means a different dump.

- [ ] **Step 6: Write `migrare/README.md`**

It must state: that Docker is required; that the source lives outside the repository and a fresh clone cannot run this; the two counts from Step 5 with the date they were measured; that rerunning must produce identical output; and that the container is destroyed and recreated on every run rather than reused.

- [ ] **Step 7: Commit**

```bash
git add migrare/db.mjs migrare/db.test.mjs migrare/README.md
git commit -m "feat(migrare): a disposable database that fails loudly when the source is missing"
```

---

### Task 2: Diacritic normalisation — the 684 characters this repository forbids

**Files:**
- Create: `migrare/diacritice.mjs`
- Test: `migrare/diacritice.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `normalizeaza(text: string)` → `string`, `INLOCUIRI` (a `Map<number, number>` from forbidden codepoint to correct one), `raportCodepoints(text: string)` → `Map<number, number>`.

**This is the task the whole migration turns on.** Phase 1's `src/lib/diacritice.itest.ts` sweeps every text file in `dist/` for four codepoints and fails the build. The content being migrated contains 684 of them. Get this wrong and either the build fails on the first migrated file, or — far worse — somebody "fixes" the build by narrowing the sweep.

**What is mechanical and what is not.** U+015E, U+015F, U+0162, U+0163 map one-to-one onto U+0218, U+0219, U+021A, U+021B: same letters, wrong encoding, no judgement needed. U+00E3 (`a` with tilde) and U+00C3 are not Romanian letters at all and map onto U+0103 and U+0102. **Missing diacritics are a different problem and are NOT fixed here** — text that reads `si` where it should read the word with U+0219 is a human editing job, and a script that guessed would silently rewrite the parish's words.

**`ü` stays.** 42 occurrences, and they are in `Zürich`.

- [ ] **Step 1: Write the failing test**

```js
// migrare/diacritice.test.mjs
import { describe, expect, it } from 'vitest';
import { INLOCUIRI, normalizeaza, raportCodepoints } from './diacritice.mjs';
import { CEDILE, VIRGULA_DEDESUBT } from '../src/lib/cedile.ts';

// Built from numbers, never written as glyphs: a test file that spelled these
// out could not be swept for them, and `src/lib/diacritice-surse.test.ts`
// sweeps every tracked file.
const [S_MARE_CEDILA, S_CEDILA, T_MARE_CEDILA, T_CEDILA] = CEDILE.map((c) => String.fromCodePoint(c));
const [S_MARE_VIRGULA, S_VIRGULA, T_MARE_VIRGULA, T_VIRGULA] =
  VIRGULA_DEDESUBT.map((c) => String.fromCodePoint(c));
const A_TILDA = String.fromCodePoint(0x00e3);
const A_BREVE = String.fromCodePoint(0x0103);

describe('normalizarea diacriticelor', () => {
  it('schimba toate cele patru forme cu sedila', () => {
    expect(normalizeaza(S_CEDILA)).toBe(S_VIRGULA);
    expect(normalizeaza(T_CEDILA)).toBe(T_VIRGULA);
    expect(normalizeaza(S_MARE_CEDILA)).toBe(S_MARE_VIRGULA);
    expect(normalizeaza(T_MARE_CEDILA)).toBe(T_MARE_VIRGULA);
  });

  it('schimba a cu tilda, care nu este o litera romaneasca', () => {
    expect(normalizeaza(A_TILDA)).toBe(A_BREVE);
    expect(normalizeaza(String.fromCodePoint(0x00c3))).toBe(String.fromCodePoint(0x0102));
  });

  it('nu atinge literele corecte', () => {
    const corecte = S_VIRGULA + T_VIRGULA + A_BREVE + 'aiu' + String.fromCodePoint(0x00e2);
    expect(normalizeaza(corecte)).toBe(corecte);
  });

  it('pastreaza u cu umlaut, fiindca scrie Zurich', () => {
    const u = String.fromCodePoint(0x00fc);
    expect(normalizeaza(`Z${u}rich`)).toBe(`Z${u}rich`);
  });

  it('inlocuieste spatiul neseparabil cu spatiu obisnuit', () => {
    expect(normalizeaza(`a${String.fromCodePoint(0x00a0)}b`)).toBe('a b');
  });

  it('NU adauga diacritice lipsa - asta este treaba unui om', () => {
    // "si" stays "si". A script that guessed here would rewrite the parish's
    // words on its own authority, in a language it cannot read.
    expect(normalizeaza('si')).toBe('si');
    expect(normalizeaza('anuntati')).toBe('anuntati');
  });

  it('nu lasa niciun codepoint interzis in urma, pentru orice intrare', () => {
    // The property, not an example. Every forbidden codepoint, in one string.
    const toate = [...INLOCUIRI.keys()].map((c) => String.fromCodePoint(c)).join('');
    const dupa = normalizeaza(toate);
    for (const interzis of CEDILE) {
      expect(dupa.includes(String.fromCodePoint(interzis))).toBe(false);
    }
  });

  it('raportul numara ce a gasit, ca sa poata fi citit intr-o rulare', () => {
    const r = raportCodepoints(S_CEDILA + S_CEDILA + T_CEDILA);
    expect(r.get(CEDILE[1])).toBe(2);
    expect(r.get(CEDILE[3])).toBe(1);
  });

  it('este idempotenta', () => {
    const intrare = S_CEDILA + T_CEDILA + A_TILDA + 'text';
    expect(normalizeaza(normalizeaza(intrare))).toBe(normalizeaza(intrare));
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `rtk proxy npx vitest run migrare/diacritice.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the normaliser**

```js
// migrare/diacritice.mjs

/**
 * Wrong encoding to right encoding, by NUMBER on both sides.
 *
 * Neither the forbidden characters nor their replacements are written as
 * glyphs anywhere in this file. A source file that spelled the forbidden four
 * out could not be swept for them by `src/lib/diacritice-surse.test.ts`, and a
 * corrupted expectation would then agree with a corrupted source - which is
 * exactly the failure this project has already paid for once.
 *
 * The four cedilla forms are the same LETTERS as Romanian's comma-below ones,
 * encoded the way a Turkish keyboard layout or an old font substitution leaves
 * them. `a` with tilde and `A` with tilde are not Romanian letters at all;
 * they are what a Portuguese-ish fallback produced where the breve belonged.
 */
export const INLOCUIRI = new Map([
  // The four are zipped from the two exported arrays rather than typed out as
  // pairs: `src/lib/cedile.ts` is the one file allowed to write the numbers, and
  // a hand-written table here would be a second copy to keep in step AND a
  // chance to pair the capital with the wrong small letter. The arrays are
  // declared in matching order, which is the property this relies on.
  ...CEDILE.map((c, i) => [c, VIRGULA_DEDESUBT[i]]),
  // `A`/`a` with tilde are not among the swept four, so they are written here.
  [0x00c3, 0x0102],
  [0x00e3, 0x0103],
]);

/** The non-breaking space, which WordPress scatters through pasted text. */
const SPATIU_NESEPARABIL = 0x00a0;

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
export function normalizeaza(text) {
  let rezultat = '';
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if (c === SPATIU_NESEPARABIL) { rezultat += ' '; continue; }
    const inlocuitor = INLOCUIRI.get(c);
    rezultat += inlocuitor === undefined ? ch : String.fromCodePoint(inlocuitor);
  }
  return rezultat;
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
export function raportCodepoints(text) {
  const harta = new Map();
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if (c > 127) harta.set(c, (harta.get(c) ?? 0) + 1);
  }
  return harta;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `rtk proxy npx vitest run migrare/diacritice.test.mjs`
Expected: PASS, 8 tests.

- [ ] **Step 5: Prove it against the real corpus, not against the fixtures**

```bash
node -e "
Promise.all([import('./migrare/db.mjs'), import('./migrare/diacritice.mjs'), import('./src/lib/cedile.ts')]).then(async ([db, d, cedile]) => {
  await db.porneste();
  const r = await db.interogheaza(\"SELECT post_content FROM wpoi_posts WHERE post_type IN ('post','page') AND post_status='publish'\");
  const tot = r.map((x) => x[0]).join('');
  const inainte = d.raportCodepoints(tot);
  const dupa = d.raportCodepoints(d.normalizeaza(tot));
  for (const c of [...cedile.CEDILE, 0x00e3]) {
    console.log('U+' + c.toString(16).toUpperCase().padStart(4,'0'), 'inainte', inainte.get(c) ?? 0, 'dupa', dupa.get(c) ?? 0);
  }
  await db.opreste();
});
"
```

Expected, from the 2026-09-16 measurement: `U+015E 5 -> 0`, `U+015F 362 -> 0`, `U+0162 0 -> 0`, `U+0163 317 -> 0`, `U+00E3 312 -> 0`. **Record the actual numbers in the commit message.** If the "before" figures differ from these, say so rather than adjusting the plan — a different dump is a fact worth surfacing.

- [ ] **Step 6: Commit**

```bash
git add migrare/diacritice.mjs migrare/diacritice.test.mjs
git commit -m "feat(migrare): normalise the 684 forbidden characters the old content carries"
```

---

### Task 3: HTML to Markdown, and the preamble that is not content

**Files:**
- Create: `migrare/html-md.mjs`
- Test: `migrare/html-md.test.mjs`
- Modify: `package.json` — add `turndown@^7.2.0` to `devDependencies`

**Interfaces:**
- Consumes: `normalizeaza` from `migrare/diacritice.mjs`.
- Produces: `dezbracaPreambul(html: string)` → `string`, `laMarkdown(html: string)` → `string`, `imaginiDin(html: string)` → `string[]` (every `src` in document order).

**`turndown` is a devDependency and must stay one.** It runs during migration and never during a build; a runtime dependency here would ship nothing but would make the site's dependency surface a lie.

**The preamble is constant and mechanical.** Every prose page begins `<p>Layouts: Popup</p>` followed by a breadcrumb line — `Parohia noastra > Istoric`, `Resurse crestine > Catehism` — where the `>` arrives as `&gt;` and the page's own title is wrapped in `<u><b>`. Posts have no preamble at all, so the strip must be a no-op on them rather than eating a first paragraph.

- [ ] **Step 1: Write the failing test**

```js
// migrare/html-md.test.mjs
import { describe, expect, it } from 'vitest';
import { dezbracaPreambul, imaginiDin, laMarkdown } from './html-md.mjs';
import { CEDILE, VIRGULA_DEDESUBT } from '../src/lib/cedile.ts';

const PREAMBUL_REAL =
  '<p>Layouts: Popup</p>\t\t\n\t\tParohia noastra &gt; <u><b>Istoric</b></u>\t\t\n\t\t\t';

describe('dezbracarea preambulului', () => {
  it('scoate linia Layouts si firimiturile de navigare', () => {
    const dupa = dezbracaPreambul(`${PREAMBUL_REAL}<h2>Titlu</h2><p>Text.</p>`);
    expect(dupa).not.toContain('Layouts: Popup');
    expect(dupa).not.toContain('Parohia noastra');
    expect(dupa.trim().startsWith('<h2>')).toBe(true);
  });

  it('nu face nimic pe un articol, care nu are preambul', () => {
    // The strip must be a no-op here. A version that ate a leading paragraph
    // would remove real content from 45 posts and nothing would fail.
    const articol = '<h3>Hramul parohiei</h3><p>Programul va fi:</p>';
    expect(dezbracaPreambul(articol)).toBe(articol);
  });

  it('nu scoate un paragraf doar fiindca este primul', () => {
    const html = '<p>Un paragraf adevarat, primul.</p><p>Al doilea.</p>';
    expect(dezbracaPreambul(html)).toBe(html);
  });
});

describe('conversia la Markdown', () => {
  it('pastreaza titlurile, paragrafele si listele', () => {
    const md = laMarkdown('<h2>Titlu</h2><p>Text.</p><ul><li>Unu</li><li>Doi</li></ul>');
    expect(md).toContain('## Titlu');
    expect(md).toContain('Text.');
    expect(md).toContain('-   Unu');
  });

  it('normalizeaza diacriticele pe drum', () => {
    const cedila = String.fromCodePoint(CEDILE[1]);
    const virgula = String.fromCodePoint(VIRGULA_DEDESUBT[1]);
    expect(laMarkdown(`<p>Mo${cedila}ii</p>`)).toContain(`Mo${virgula}ii`);
  });

  it('nu lasa HTML brut in urma', () => {
    expect(laMarkdown('<p>a</p>')).not.toContain('<p>');
  });

  it('nu lasa randuri de tabulatoare goale din markupul Elementor', () => {
    expect(laMarkdown('<p>a</p>\t\t\n\t\t<p>b</p>')).not.toMatch(/\t/);
  });
});

describe('imaginile din HTML', () => {
  it('le da in ordinea documentului', () => {
    const html = '<img src="/a.jpg"><p>x</p><img src="/b.png" width="10">';
    expect(imaginiDin(html)).toEqual(['/a.jpg', '/b.png']);
  });

  it('da o lista goala cand nu sunt imagini, nu arunca', () => {
    expect(imaginiDin('<p>x</p>')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `rtk proxy npx vitest run migrare/html-md.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Install turndown**

```bash
npm install --save-dev turndown@^7.2.0
```

- [ ] **Step 4: Write the converter**

```js
// migrare/html-md.mjs
import TurndownService from 'turndown';
import { normalizeaza } from './diacritice.mjs';

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
export function dezbracaPreambul(html) {
  let rezultat = html.replace(/^\s*<p>\s*Layouts:[^<]*<\/p>/i, '');
  // The breadcrumb: optional wrapping <p>, some text, `&gt;` or `>`, then the
  // page title inside <u><b>. Only matched at the very start of the document.
  rezultat = rezultat.replace(
    /^[\s\t]*(?:<p>)?[^<>]{0,60}?(?:&gt;|>)\s*<u><b>[^<]*<\/b><\/u>\s*(?:<\/p>)?/i,
    '',
  );
  return rezultat === html ? html : rezultat;
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
function curataSpatii(md) {
  return md
    .replace(/\t/g, ' ')
    .replace(/[ ]{2,}\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** HTML in, Markdown out, with the text normalised on the way through. */
export function laMarkdown(html) {
  // ORDER IS LOAD-BEARING: Turndown converts FIRST, normalizeaza runs on its
  // output. An entity like `&nbsp;` or `&#160;` is plain ASCII to normalizeaza
  // and to the dist sweep; it becomes U+00A0 only when Turndown decodes it. The
  // dump holds 14,961 of the first and 6 of the second - normalising first would
  // reintroduce 14,967 non-breaking spaces immediately after removing 459 literal
  // ones, invisibly, because U+00A0 renders as a space. Measured 2026-09-16.
  return curataSpatii(normalizeaza(turndown.turndown(dezbracaPreambul(html))));
}

/** Every `src` an `<img>` carries, in document order, duplicates included. */
export function imaginiDin(html) {
  return [...html.matchAll(/<img\b[^>]*?\ssrc=["']([^"']+)["']/gi)].map((m) => m[1]);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `rtk proxy npx vitest run migrare/html-md.test.mjs`
Expected: PASS, 9 tests.

- [ ] **Step 6: Prove the strip is a no-op on all 45 posts and fires on all 9 pages**

```bash
node -e "
Promise.all([import('./migrare/db.mjs'), import('./migrare/html-md.mjs')]).then(async ([db, h]) => {
  await db.porneste();
  const posts = await db.interogheaza(\"SELECT post_name, post_content FROM wpoi_posts WHERE post_type='post' AND post_status='publish'\");
  const atinse = posts.filter(([, c]) => h.dezbracaPreambul(c) !== c);
  console.log('articole atinse de dezbracare (trebuie 0):', atinse.length, atinse.map((x) => x[0]).join(' '));
  const NOUA = ['istoric','consiliul-parohial','catehism','studii','revista-doxologia','link-uri-utile','scoala-parohiala','cursuri-de-pictura','servicii-liturgice'];
  const pages = await db.interogheaza(\`SELECT post_name, post_content FROM wpoi_posts WHERE post_type='page' AND post_status='publish' AND post_name IN ('\${NOUA.join(\"','\")}')\`);
  const neatinse = pages.filter(([, c]) => h.dezbracaPreambul(c) === c);
  console.log('pagini NEatinse (trebuie 0):', neatinse.length, neatinse.map((x) => x[0]).join(' '));
  await db.opreste();
});
"
```

Expected: `articole atinse de dezbracare (trebuie 0): 0` and `pagini NEatinse (trebuie 0): 0`. **Both directions matter**: the first says the strip cannot eat a post's opening paragraph, the second says it is not silently doing nothing on the pages it exists for. Paste both lines into the commit message.

- [ ] **Step 7: Commit**

```bash
git add migrare/html-md.mjs migrare/html-md.test.mjs package.json package-lock.json
git commit -m "feat(migrare): HTML to Markdown, and a preamble strip that recognises itself"
```

---

### Task 4: Three schemas and three collections

**Files:**
- Create: `src/lib/schema-continut.ts`, `src/lib/schema-continut.test.ts`
- Modify: `src/content.config.ts`
- Create: `src/content/setari/setari.yml`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `articolSchema`, `paginaSchema`, `setariSchema`, `CATEGORII` (readonly string tuple), `type Articol`, `type Pagina`, `type Setari`.

**Follow `src/lib/schema.ts` exactly.** It uses `astro/zod`, `z.strictObject`, Romanian error messages, and a refinement that teaches the workflow rather than naming a type. A misspelled key must fail the build, because the alternative is a silently dropped field on a green build.

**`publicat: false` is the archive's holding pen** (spec §6.2). 32 posts arrive unpublished because their dates were destroyed by a bulk import. An unpublished post is absent from `/noutati`, from the homepage, from `/rss.xml`, **and has no page of its own** — otherwise "unpublished" would mean "reachable by anyone with the link".

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/schema-continut.test.ts
import { describe, expect, it } from 'vitest';
import { articolSchema, CATEGORII, paginaSchema, setariSchema } from './schema-continut';

const ARTICOL_MINIM = {
  titlu: 'Hramul parohiei',
  data: '2025-11-05',
  categorie: 'Noutati',
  publicat: true,
};

describe('articolSchema', () => {
  it('accepta un articol minim', () => {
    expect(articolSchema.parse(ARTICOL_MINIM).titlu).toBe('Hramul parohiei');
  });

  it('respinge o cheie scrisa gresit, in romana', () => {
    // The likeliest CMS mistake, and the one that would otherwise drop a field
    // on a green build.
    expect(() => articolSchema.parse({ ...ARTICOL_MINIM, publicatt: true }))
      // Phase 1`s error map, which Step 3 mandates, emits this WITH diacritics.
      // An earlier draft of this line spelled it `Camp`, which contradicted the
      // step below it and is a misspelling besides.
      .toThrow(/Câmp necunoscut: publicatt/);
  });

  it('cere o data reala, nu doar ceva in forma de data', () => {
    expect(() => articolSchema.parse({ ...ARTICOL_MINIM, data: '2025-02-30' })).toThrow();
    expect(() => articolSchema.parse({ ...ARTICOL_MINIM, data: '2025-13-01' })).toThrow();
  });

  it('cere o categorie din lista', () => {
    expect(() => articolSchema.parse({ ...ARTICOL_MINIM, categorie: 'Altceva' })).toThrow();
    for (const c of CATEGORII) {
      expect(articolSchema.parse({ ...ARTICOL_MINIM, categorie: c }).categorie).toBe(c);
    }
  });

  it('publicat este obligatoriu si nu are implicit', () => {
    // No default. A post whose `publicat` was lost must fail the build rather
    // than quietly publish 32 undated archive posts.
    const { publicat: _, ...fara } = ARTICOL_MINIM;
    expect(() => articolSchema.parse(fara)).toThrow();
  });

  it('respinge un titlu gol sau numai spatii', () => {
    expect(() => articolSchema.parse({ ...ARTICOL_MINIM, titlu: '   ' })).toThrow();
  });

  it('are autorul Parohia cand nu este dat', () => {
    expect(articolSchema.parse(ARTICOL_MINIM).autor).toBe('Parohia');
  });
});

describe('paginaSchema', () => {
  it('accepta o pagina cu titlu si cale', () => {
    const p = paginaSchema.parse({ titlu: 'Istoric', cale: 'parohia/istoric', ordine: 10 });
    expect(p.cale).toBe('parohia/istoric');
  });

  it('respinge o cale cu slash la inceput sau la sfarsit', () => {
    // The route builds `/${cale}/`; a stored slash would produce `//istoric//`,
    // which 404s while the file looks perfectly correct.
    expect(() => paginaSchema.parse({ titlu: 'x', cale: '/parohia/istoric', ordine: 1 })).toThrow();
    expect(() => paginaSchema.parse({ titlu: 'x', cale: 'parohia/istoric/', ordine: 1 })).toThrow();
  });

  it('respinge o cale cu majuscule sau spatii', () => {
    expect(() => paginaSchema.parse({ titlu: 'x', cale: 'Parohia/Istoric', ordine: 1 })).toThrow();
    expect(() => paginaSchema.parse({ titlu: 'x', cale: 'parohia/is toric', ordine: 1 })).toThrow();
  });
});

describe('setariSchema', () => {
  const MINIM = {
    nume: 'Parohia Ortodoxa Romana Sfantul Nicolae',
    adresa: 'Wehntalerstrasse 451, 8046 Zurich',
    telefon: '076 512 04 52',
    email: 'contact@bor-zh.ch',
  };

  it('accepta setarile minime', () => {
    expect(setariSchema.parse(MINIM).nume).toContain('Parohia');
  });

  it('respinge un email fara @', () => {
    expect(() => setariSchema.parse({ ...MINIM, email: 'contact' })).toThrow();
  });

  it('respinge cele doua valori demo de pe situl vechi', () => {
    // Named explicitly because they are what is live today: the footer shows
    // an Athos theme placeholder address and a French phone number. Migrating
    // them would be worse than leaving the field blank.
    expect(() => setariSchema.parse({ ...MINIM, email: 'info@website.com' }))
      .toThrow(/demo/);
    expect(() => setariSchema.parse({ ...MINIM, telefon: '+33 877 554 332' }))
      .toThrow(/demo/);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `rtk proxy npx vitest run src/lib/schema-continut.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the schemas**

```ts
// src/lib/schema-continut.ts
import { z } from 'astro/zod';
import { partiData } from './date-ro';

/**
 * The categories the migrated corpus actually uses.
 *
 * Measured: `Noutati` on 42 posts and `Catehismul Bisericii Ortodoxe` on 3.
 * The spec's model also listed a third, for announcements, which no post has
 * ever carried - so it is not offered. An option nobody uses is an option a
 * volunteer has to think about every week.
 */
export const CATEGORII = ['Noutati', 'Cateheza'] as const;

const titluNevid = z
  .string()
  .trim()
  .min(1, { message: 'Titlul nu poate fi gol.' });

/** `YYYY-MM-DD` that is a real calendar date, validated by Phase 1's parser. */
const dataReala = z.string().refine(
  (v) => {
    try { partiData(v); return true; } catch { return false; }
  },
  { message: 'Data trebuie sa fie reala, in forma AAAA-LL-ZZ.' },
);

/**
 * Unknown keys are rejected, in Romanian, naming the key.
 *
 * Zod's default message is English and says nothing a volunteer can act on.
 * This is the error they will actually hit - a misspelled field in the CMS or
 * in a hand-edited file - and `publicatt:` silently dropping a flag on a green
 * build is exactly what this schema exists to prevent.
 */
function strict<T extends z.ZodRawShape>(shape: T) {
  return z.strictObject(shape).catch;
}

export const articolSchema = z
  .strictObject({
    titlu: titluNevid,
    data: dataReala,
    /**
     * No default, deliberately. 32 of the 45 migrated posts arrive
     * `publicat: false` because a bulk import destroyed their dates; a default
     * of `true` would publish them the first time anyone touched a file, and a
     * default of `false` would silently unpublish a post whose flag was lost.
     * Requiring it means the file always says which it is.
     */
    publicat: z.boolean(),
    categorie: z.enum(CATEGORII),
    autor: z.string().trim().min(1).default('Parohia'),
    rezumat: z.string().trim().optional(),
    imagine: z.string().trim().optional(),
  })
  .describe('Un articol de pe /noutati.');

export const paginaSchema = z
  .strictObject({
    titlu: titluNevid,
    /**
     * The route, WITHOUT leading or trailing slash: `parohia/istoric`.
     * `[...pagina].astro` builds `/${cale}/` from it, so a stored slash yields
     * `//parohia/istoric//` - a 404 produced by a file that reads correctly.
     */
    cale: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/, {
        message:
          'Calea se scrie cu litere mici si liniute, fara slash la inceput sau la sfarsit, de exemplu parohia/istoric.',
      }),
    ordine: z.number().int(),
    descriere: z.string().trim().optional(),
    imagine: z.string().trim().optional(),
  })
  .describe('O pagina de text editabila.');

/** The two values the live WordPress footer shows today, both theme demo data. */
const DEMO = ['info@website.com', '+33 877 554 332'];

export const setariSchema = z
  .strictObject({
    nume: titluNevid,
    adresa: titluNevid,
    telefon: titluNevid,
    email: z.string().trim().email({ message: 'Adresa de e-mail nu este valida.' }),
    telefon2: z.string().trim().optional(),
    email2: z.string().trim().email().optional(),
    iban: z.string().trim().optional(),
    iban2: z.string().trim().optional(),
    program_vizite: z.string().trim().optional(),
    harta: z.string().trim().url().optional(),
  })
  .superRefine((v, ctx) => {
    for (const [cheie, valoare] of Object.entries(v)) {
      if (typeof valoare === 'string' && DEMO.includes(valoare.trim())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [cheie],
          message:
            `Valoarea "${valoare}" este o ramasita demo de pe situl vechi, nu un contact al parohiei.`,
        });
      }
    }
  })
  .describe('Datele parohiei, editabile din CMS.');

export type Articol = z.infer<typeof articolSchema>;
export type Pagina = z.infer<typeof paginaSchema>;
export type Setari = z.infer<typeof setariSchema>;
```

**Note for the implementer:** the `strict` helper sketched above is not used — delete it rather than leaving it. It is named here only so you do not reinvent it: `z.strictObject` already rejects unknown keys, and the Romanian message comes from the collection's error map, exactly as `src/lib/schema.ts` does it. Copy that mechanism rather than inventing a second one.

- [ ] **Step 4: Register the collections**

```ts
// src/content.config.ts — add to the existing file, keep `slujbe` unchanged
import { articolSchema, paginaSchema, setariSchema } from './lib/schema-continut';

const articole = defineCollection({
  loader: glob({ pattern: ['**/*.md'], base: './src/content/articole' }),
  schema: articolSchema,
});

const pagini = defineCollection({
  loader: glob({ pattern: ['**/*.md'], base: './src/content/pagini' }),
  schema: paginaSchema,
});

const setari = defineCollection({
  loader: glob({ pattern: ['**/*.yml', '**/*.yaml'], base: './src/content/setari' }),
  schema: setariSchema,
});

export const collections = { slujbe, articole, pagini, setari };
```

- [ ] **Step 5: Write the settings file**

`src/content/setari/setari.yml`, with the parish's real values — the address and phone already in `SiteFooter.astro`, and **not** the two demo values the live site shows.

- [ ] **Step 6: Run the suite**

Run: `TZ=Europe/Zurich npm test && TZ=Europe/Zurich npm run check`
Expected: both exit 0. `check` reports 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/schema-continut.ts src/lib/schema-continut.test.ts src/content.config.ts src/content/setari/setari.yml
git commit -m "feat: schemas for articole, pagini and setari, with publicat as a required flag"
```

---

### Task 5: The media pipeline — re-encoding is the sanitisation

**Files:**
- Create: `migrare/media.mjs`, `migrare/media.test.mjs`
- Creates at run time: `src/assets/continut/**`

**Interfaces:**
- Consumes: `imaginiDin` from `migrare/html-md.mjs`.
- Produces: `numeDestinatie(srcWp: string)` → `string` (a repo-relative path under `src/assets/continut/`), `esteOriginal(cale: string)` → `boolean`, `migreazaImagini(surse: string[])` → `Promise<Map<string,string>>` mapping each WordPress `src` to its new path, `RADACINA_UPLOADS`.

**Only referenced images are migrated.** `uploads/` holds 7,421 files and 997 MB, of which 652 are raster originals — but most belong to theme demo content and plugin scaffolding (`astra-sites/`, `ai-builder/`, `essential-addons-elementor/`). Migrating all of them would put hundreds of megabytes of somebody else's stock photography into this repository's history, permanently. The set that matters is the set the 45 posts and 9 pages actually reference, plus the 3 featured images.

**Re-encoding is why this is safe, and it is not optional.** This media comes off a server compromised twice in eighteen months. Decoding a file and re-encoding it through `sharp` discards everything that is not pixels — appended archives, injected markup, EXIF payloads. **A file that fails to decode is not an image**: it is dropped by name and counted, never copied through. **SVG cannot be sanitised this way and is not migrated at all**; neither are `.doc`, `.js`, `.html`, `.htaccess`, `.json`, `.css` or `.txt`.

- [ ] **Step 1: Write the failing test**

```js
// migrare/media.test.mjs
import { describe, expect, it } from 'vitest';
import { esteOriginal, numeDestinatie, EXTENSII_PERMISE } from './media.mjs';

describe('alegerea fisierelor', () => {
  it('respinge variantele de miniatura WordPress', () => {
    expect(esteOriginal('/uploads/2024/05/poza-300x200.jpg')).toBe(false);
    expect(esteOriginal('/uploads/2024/05/poza-1024x768.png')).toBe(false);
    expect(esteOriginal('/uploads/2024/05/poza.jpg')).toBe(true);
  });

  it('nu confunda un nume care contine cifre si x cu o miniatura', () => {
    // `matrix-2.jpg` and `pers-3x.jpg` are originals. A looser pattern eats
    // real files and nothing says so, because the page just loses an image.
    expect(esteOriginal('/uploads/2024/05/matrix-2.jpg')).toBe(true);
    expect(esteOriginal('/uploads/2024/05/pers-3x.jpg')).toBe(true);
  });

  it('respinge tot ce nu se poate re-encoda', () => {
    // SVG is a script vector and cannot be re-encoded to itself; .doc and .js
    // are not images at all. This list is the allowlist, derived from what
    // sharp can decode - never a denylist of what we happened to think of.
    expect(EXTENSII_PERMISE).toEqual(['jpeg', 'jpg', 'png', 'webp']);
    expect(esteOriginal('/uploads/logo.svg')).toBe(false);
    expect(esteOriginal('/uploads/pliant.doc')).toBe(false);
    expect(esteOriginal('/uploads/pum/pum-site-scripts.js')).toBe(false);
  });
});

describe('numele destinatiei', () => {
  it('pastreaza anul si luna, ca sa nu se ciocneasca doua poze la fel numite', () => {
    expect(numeDestinatie('/wp-content/uploads/2024/05/hram.jpg'))
      .toBe('src/assets/continut/2024/05/hram.jpg');
  });

  it('accepta o adresa absoluta a sitului vechi', () => {
    expect(numeDestinatie('https://www.bor-zh.ch/wp-content/uploads/2024/05/hram.jpg'))
      .toBe('src/assets/continut/2024/05/hram.jpg');
  });

  it('este determinista - aceeasi intrare, acelasi rezultat', () => {
    // Spec 11: rerunning the migration must produce identical output.
    const a = numeDestinatie('/wp-content/uploads/2024/05/hram.jpg');
    const b = numeDestinatie('/wp-content/uploads/2024/05/hram.jpg');
    expect(a).toBe(b);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `rtk proxy npx vitest run migrare/media.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the pipeline**

```js
// migrare/media.mjs
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

export const RADACINA_UPLOADS =
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
export const EXTENSII_PERMISE = ['jpeg', 'jpg', 'png', 'webp'];

/** The long edge everything is downscaled to. Spec 11. */
const LATURA_MAXIMA = 2400;

/**
 * WordPress writes `name-WIDTHxHEIGHT.ext` for every generated thumbnail.
 *
 * ANCHORED TO THE END and requiring digits on BOTH sides of the `x`, because a
 * looser pattern silently eats originals: `matrix-2.jpg` and `pers-3x.jpg` are
 * real files somebody uploaded. An over-eager filter here does not fail - the
 * page just loses a picture, on a green build.
 */
const MINIATURA = /-\d+x\d+\.[A-Za-z0-9]+$/;

export function esteOriginal(cale) {
  if (MINIATURA.test(cale)) return false;
  const ext = cale.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSII_PERMISE.includes(ext);
}

/**
 * The repo path an upload becomes, keeping WordPress's year/month folders.
 *
 * The folders are kept because filenames repeat: `hram.jpg` exists under
 * several months, and flattening would have one silently overwrite another.
 */
export function numeDestinatie(srcWp) {
  const m = srcWp.match(/uploads\/(.+)$/);
  if (m === null) throw new Error(`Nu este o cale de upload: ${srcWp}`);
  return `src/assets/continut/${m[1]}`;
}

/**
 * Copies the referenced images across, sanitising each one by re-encoding it.
 *
 * Returns a map from the original `src` to its new repo path. A source that is
 * missing, or that sharp cannot decode, is reported by name and LEFT OUT of
 * the map - the caller then knows the reference is dead and can say so, rather
 * than emitting Markdown pointing at a file that was never written.
 */
export async function migreazaImagini(surse, radacinaRepo = process.cwd()) {
  const harta = new Map();
  const esuate = [];
  for (const src of [...new Set(surse)]) {
    if (!esteOriginal(src)) { esuate.push([src, 'tip nepermis']); continue; }
    const relativ = src.match(/uploads\/(.+)$/)?.[1];
    if (relativ === undefined) { esuate.push([src, 'cale straina']); continue; }
    const sursa = join(RADACINA_UPLOADS, relativ);
    const destinatieRel = numeDestinatie(src);
    const destinatie = join(radacinaRepo, destinatieRel);
    try {
      const brut = await readFile(sursa);
      // Decode -> resize -> re-encode. This is the sanitisation: whatever was
      // appended to, or hidden in, the original does not survive being turned
      // back into pixels and written out fresh.
      const imagine = sharp(brut, { failOn: 'error' }).rotate();
      const meta = await imagine.metadata();
      const redimensionata =
        Math.max(meta.width ?? 0, meta.height ?? 0) > LATURA_MAXIMA
          ? imagine.resize({ width: LATURA_MAXIMA, height: LATURA_MAXIMA, fit: 'inside' })
          : imagine;
      const iesire = await redimensionata.toBuffer();
      await mkdir(dirname(destinatie), { recursive: true });
      await writeFile(destinatie, iesire);
      harta.set(src, destinatieRel);
    } catch (e) {
      esuate.push([src, e instanceof Error ? e.message : String(e)]);
    }
  }
  // Print what was measured, not only the verdict.
  process.stdout.write(
    `\nImagini migrate: ${harta.size} din ${new Set(surse).size} referite.\n`,
  );
  for (const [src, motiv] of esuate) process.stdout.write(`  sarita: ${src} — ${motiv}\n`);
  return harta;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `rtk proxy npx vitest run migrare/media.test.mjs`
Expected: PASS, 6 tests.

- [ ] **Step 5: Prove the sanitisation fires**

Build a file that is a valid JPEG with a payload appended, run it through, and show the payload is gone:

```bash
node -e "
import('sharp').then(async ({default: sharp}) => {
  const fs = await import('node:fs/promises');
  const bun = await sharp({create:{width:10,height:10,channels:3,background:'#fff'}}).jpeg().toBuffer();
  await fs.writeFile('/tmp/otravit.jpg', Buffer.concat([bun, Buffer.from('<?php system(\$_GET[0]); ?>')]));
  const inainte = await fs.readFile('/tmp/otravit.jpg');
  console.log('inainte contine php:', inainte.includes('<?php'));
  const dupa = await sharp(inainte).toBuffer();
  console.log('dupa  contine php:', dupa.includes('<?php'));
});
"
```

Expected: `inainte contine php: true`, `dupa contine php: false`. Paste both lines into the commit message — this is the claim the whole task rests on and it should be a measurement rather than an assertion.

- [ ] **Step 6: Commit**

```bash
git add migrare/media.mjs migrare/media.test.mjs
git commit -m "feat(migrare): migrate only referenced images, sanitising each by re-encoding it"
```

---

### Task 6: The 45 posts

**Files:**
- Create: `migrare/articole.mjs`, `migrare/articole.test.mjs`
- Modify: `src/lib/diacritice-surse.test.ts` (the `BINARE` rule, below)
- Create: `src/lib/binare.itest.ts`
- Creates at run time: `src/content/articole/*.md`

**This is the task that first commits the migrated images, and the moment it
does, `src/lib/diacritice-surse.test.ts` goes red.** Its case *nu lasa afara
niciun fisier urmarit pe care nimeni nu l-a numit binar* fails every tracked
file that is not valid UTF-8 and is not listed in `BINARE` — which holds one
path, named one by one on purpose. About a hundred JPEGs and PNGs cannot be
named one by one.

Replace `BINARE.includes(cale)` with a predicate: `public/favicon.ico`, or a
path under the migrated-image directory whose extension is on a fixed
allow-list. **A prefix rule on its own is a pure weakening, so it does not ship
alone.** The "cannot fall behind" property is replaced by something stronger
than naming: a check that every file under that prefix actually DECODES as an
image through sharp. A name list is defeated by renaming a payload to `.jpg`; a
decode check is not, and it asserts from the outside exactly the guarantee
Task 5's pipeline makes from the inside. It needs sharp and around a hundred
files, so it belongs in `src/lib/binare.itest.ts`, run by `npm run test:build`,
not in the unit sweep.

Also assert that the prefix rule matches at least one real file, so it cannot
quietly become dead, and that nothing under the prefix carries an extension off
the allow-list.

**Interfaces:**
- Consumes: `interogheaza`, `laMarkdown`, `imaginiDin`, `migreazaImagini`, `articolSchema`.
- Produces: `STAMPILE_IMPORT` (the two bulk-import dates), `esteDatat(data: string)` → `boolean`, `numeFisier(slug, data)` → `string`, `extrageArticole()` → `Promise<{scrise: number, publicate: number}>`.

**The date rule is the whole task.** 32 of the 45 posts carry a bulk-import stamp rather than a publication date — 20 at `2024-06-08`, 11 at `2024-05-21`, and one more. Those import with `publicat: false`. The 13 with a genuine date import with `publicat: true`. The parish decides the rest in the CMS.

**Why the stamps are recognised by value rather than by heuristic.** "A date shared by many posts" would be a rule that changes meaning the moment the parish legitimately publishes three things on one day. The two stamps are facts about this dump, so they are named as facts, with the measured counts beside them, and a count that no longer matches fails.

- [ ] **Step 1: Write the failing test**

```js
// migrare/articole.test.mjs
import { describe, expect, it } from 'vitest';
import { esteDatat, numeFisier, STAMPILE_IMPORT } from './articole.mjs';

describe('datele de import', () => {
  it('numeste exact cele doua stampile masurate', () => {
    expect(STAMPILE_IMPORT).toEqual(['2024-05-21', '2024-06-08']);
  });

  it('trateaza o stampila ca nedatata si orice altceva ca datat', () => {
    expect(esteDatat('2024-06-08')).toBe(false);
    expect(esteDatat('2024-05-21')).toBe(false);
    expect(esteDatat('2025-11-05')).toBe(true);
    expect(esteDatat('2024-06-09')).toBe(true);
  });
});

describe('numele fisierului', () => {
  it('pune data in fata, ca ordinea din folder sa fie ordinea cronologica', () => {
    expect(numeFisier('hramul-parohiei-2024', '2024-11-04'))
      .toBe('2024-11-04-hramul-parohiei-2024.md');
  });

  it('este determinist', () => {
    expect(numeFisier('a', '2024-01-01')).toBe(numeFisier('a', '2024-01-01'));
  });

  it('nu produce doua nume egale pentru doua articole din aceeasi zi', () => {
    expect(numeFisier('a', '2024-06-08')).not.toBe(numeFisier('b', '2024-06-08'));
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `rtk proxy npx vitest run migrare/articole.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the extractor**

Key points the implementer must honour, with the code shape following `migrare/media.mjs`:

- `STAMPILE_IMPORT = ['2024-05-21', '2024-06-08']`, sorted, with a comment giving the measured counts (11 and 20) and the date measured.
- Query: `SELECT post_name, post_title, DATE(post_date), post_content, post_excerpt FROM wpoi_posts WHERE post_type='post' AND post_status='publish' ORDER BY post_name` — **ordered by slug, not by date**, so the run is deterministic and two posts sharing a date cannot swap places between runs.
- Category from `wpoi_term_relationships`; map `Noutati` to `Noutati` and `Catehismul Bisericii Ortodoxe` to `Cateheza`. **A category that maps to neither is an error that stops the run**, naming the post — never a silent fallback to `Noutati`.
- Featured image from `_thumbnail_id` where present (3 posts).
- Body through `laMarkdown`; images through `imaginiDin` then `migreazaImagini`; rewrite each `src` in the Markdown to its new path, and **report any reference the map does not contain** rather than emitting a dead link.
- Frontmatter written in a fixed key order, validated with `articolSchema.parse` **before** the file is written. A file that would not build is not written.
- Print the two counts at the end: written, and of those published.

- [ ] **Step 4: Run the test to verify it passes**

Run: `rtk proxy npx vitest run migrare/articole.test.mjs`
Expected: PASS, 5 tests.

- [ ] **Step 5: Run the extraction and check the numbers**

Expected: **45 files written, 13 published.** If either differs, stop and report — those two numbers are this plan's contract with the parish's decision.

- [ ] **Step 6: Prove it is repeatable**

Run the extraction twice and diff the tree:

```bash
node migrare/articole.mjs && cp -r src/content/articole /tmp/rulare-1
node migrare/articole.mjs && rtk proxy diff -r /tmp/rulare-1 src/content/articole; echo "exit=$?"
```

Expected: `exit=0` and no output. **Read the exit code, not the absence of output** — `rtk`'s `diff` exits 0 even when it prints a difference, which is why this uses `rtk proxy`.

- [ ] **Step 7: Verify the build accepts all 45**

Run: `TZ=Europe/Zurich npm run check && TZ=Europe/Zurich npm run test:build`
Expected: both exit 0. **A build failure here is a migration bug** (spec §11) — fix the migration, never the schema.

- [ ] **Step 8: Commit**

```bash
git add migrare/articole.mjs migrare/articole.test.mjs src/content/articole src/assets/continut
git commit -m "feat(migrare): the 45 posts, 13 published and 32 held for the parish to date"
```

---

### Task 7: The nine prose pages, and the URL map

**Files:**
- Create: `migrare/pagini.mjs`, `migrare/pagini.test.mjs`, `migrare/harta-url.mjs`, `migrare/ruleaza.mjs`
- Creates at run time: `src/content/pagini/*.md`, `docs/harta-url.csv`

**Interfaces:**
- Consumes: everything from Tasks 1, 3, 5.
- Produces: `PAGINI` (the nine, each `{ slug, cale, titlu, ordine }`), `extragePagini()`, `scrieHartaUrl()`, and `migrare/ruleaza.mjs` as the one entry point.

**The nine, with their old slug and their new route** — this table is the task's contract and the URL map's source of truth:

| WordPress slug | New route | Title | `ordine` |
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

**`ordine` is a spaced integer, not a position.** Tens leave room to insert a page between two others without renumbering nine files.

- [ ] **Step 1: Write the failing test**

```js
// migrare/pagini.test.mjs
import { describe, expect, it } from 'vitest';
import { PAGINI } from './pagini.mjs';
import { paginaSchema } from '../src/lib/schema-continut.ts';

describe('cele noua pagini', () => {
  it('sunt exact noua', () => {
    expect(PAGINI).toHaveLength(9);
  });

  it('fiecare cale trece de schema, deci fiecare ruta se va construi', () => {
    // The route is built as `/${cale}/`. Validating here rather than at build
    // time means a bad path fails in the migration, where somebody is looking,
    // instead of producing a 404 page that reads correctly.
    for (const p of PAGINI) {
      expect(() => paginaSchema.parse({ titlu: p.titlu, cale: p.cale, ordine: p.ordine }))
        .not.toThrow();
    }
  });

  it('nu are doua pagini pe aceeasi cale sau acelasi slug', () => {
    expect(new Set(PAGINI.map((p) => p.cale)).size).toBe(9);
    expect(new Set(PAGINI.map((p) => p.slug)).size).toBe(9);
  });

  it('ordinea este in zeci, ca sa se poata insera una intre altele', () => {
    for (const p of PAGINI) expect(p.ordine % 10).toBe(0);
    const ordini = PAGINI.map((p) => p.ordine);
    expect([...ordini].sort((a, b) => a - b)).toEqual(ordini);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `rtk proxy npx vitest run migrare/pagini.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `migrare/pagini.mjs`**

`PAGINI` as the table above. For each: query the page by slug, `laMarkdown` the `post_content` — **`laMarkdown` already calls `dezbracaPreambul` itself, so do NOT call it first.** Calling both strips twice, and a second strip is not guaranteed to be a no-op: it removes whatever now sits at the top if that happens to be preamble-shaped. Measured 2026-09-17 across all 71 published posts and pages: 16 carry a `<p>Layouts:` marker and 17 are changed by one strip — the difference is `pastorale`, which has only the breadcrumb — while 0 are non-idempotent under a double strip and 0 leave residue after one — so this is a latent trap rather than a present bug, which is exactly when it is cheap to close. Then migrate its images, validate with `paginaSchema`, write `src/content/pagini/<slug>.md`. **If a slug returns no row, that is an error that stops the run** — a page silently missing is the failure this project has paid for most.

- [ ] **Step 4: Write `migrare/harta-url.mjs`**

Emits `docs/harta-url.csv` with a header row `vechi,nou` and one row per redirect, sorted by old path so the file is stable across runs:

- the nine pages: `/<slug>/` to `/<cale>/`
- all 45 posts: `/<slug>/` to `/noutati/<slug>/` — **including the 32 unpublished ones**, because the old URLs exist and will be linked from elsewhere for years. A redirect to a page that does not exist yet is better than a 404 *and* it is why the unpublished posts keep their slugs.
- `/program-liturgic/` to `/program/`
- `/feed/` to `/rss.xml`

Phase 4 turns this into `_redirects`; this phase only emits it. Say that in the file's header comment, because a CSV nobody consumes looks exactly like a CSV somebody forgot to wire up.

- [ ] **Step 5: Write `migrare/ruleaza.mjs`**

One entry point, in order: `porneste()`, extract posts, extract pages, write the URL map, `opreste()`. It prints one summary block at the end — posts written, posts published, pages written, images migrated, images skipped, redirects emitted — and **exits non-zero if any count is zero**, because a migration that produced nothing must not report success.

- [ ] **Step 6: Run it and check every number**

Run: `node migrare/ruleaza.mjs`
Expected: 45 posts, 13 published, 9 pages, a non-zero image count, 56 redirects (9 + 45 + 2).

- [ ] **Step 7: Verify the build, then prove the diacritics guard actually saw this content**

```bash
TZ=Europe/Zurich npm run check && TZ=Europe/Zurich npm run test:build
```

Then the positive control that matters most in this whole phase:

```bash
node -e "
const fs=require('fs');
const f='src/content/pagini/istoric.md';
// \`node -e\` is CommonJS, so this is a .then() rather than a top-level await.
import('./src/lib/cedile.ts').then(({ CEDILE }) => {
  const t=fs.readFileSync(f,'utf8');
  fs.writeFileSync(f, t.replace('a', String.fromCodePoint(CEDILE[1])));
});
" && TZ=Europe/Zurich npm run test:build; echo "trebuie sa fie 1: $?"
git checkout src/content/pagini/istoric.md
TZ=Europe/Zurich npm run test:build; echo "trebuie sa fie 0: $?"
```

Expected: exit 1 then exit 0. Phase 1 built that sweep and this is the first time it has ever been pointed at real migrated prose — if it does not fire, the sweep is not covering `src/content/` and that is a finding, not something to work around.

- [ ] **Step 8: Commit**

```bash
git add migrare/pagini.mjs migrare/pagini.test.mjs migrare/harta-url.mjs migrare/ruleaza.mjs src/content/pagini docs/harta-url.csv src/assets/continut
git commit -m "feat(migrare): the nine prose pages, and the URL map Phase 4 will consume"
```

---

### Task 8: `/noutati`, one article, and the feed

**Files:**
- Create: `src/lib/articole.ts`, `src/lib/articole.test.ts`, `src/components/CardArticol.astro`, `src/components/ListaArticole.astro`, `src/pages/noutati/index.astro`, `src/pages/noutati/[slug].astro`, `src/pages/rss.xml.ts`

**Interfaces:**
- Consumes: the `articole` collection, `articolSchema`.
- Produces: `articolePublicate(intrari)` → sorted newest-first, `type ArticolCuId`.

**The `publicat` rule lives in one function and nowhere else.** Three surfaces filter posts — the index, the feed and the homepage — and a fourth builds the article pages. Four copies of `.filter((a) => a.data.publicat)` is four chances for one of them to be forgotten, and the one that gets forgotten is `getStaticPaths`, which is how an unpublished post ends up with a live URL.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/articole.test.ts
import { describe, expect, it } from 'vitest';
import { articolePublicate } from './articole';

const face = (id: string, data: string, publicat: boolean) => ({
  id,
  data: { titlu: id, data, publicat, categorie: 'Noutati' as const, autor: 'Parohia' },
});

describe('articolePublicate', () => {
  it('lasa afara tot ce nu este publicat', () => {
    const r = articolePublicate([face('a', '2025-01-01', true), face('b', '2025-02-01', false)]);
    expect(r.map((x) => x.id)).toEqual(['a']);
  });

  it('le da de la cel mai nou la cel mai vechi', () => {
    const r = articolePublicate([
      face('vechi', '2024-01-01', true),
      face('nou', '2025-11-05', true),
      face('mijloc', '2025-03-03', true),
    ]);
    expect(r.map((x) => x.id)).toEqual(['nou', 'mijloc', 'vechi']);
  });

  it('ordoneaza stabil doua articole din aceeasi zi, dupa id', () => {
    // Without a tiebreak the build output changes between runs for no reason,
    // which makes every diff of `dist/` untrustworthy.
    const r = articolePublicate([face('b', '2025-01-01', true), face('a', '2025-01-01', true)]);
    expect(r.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('da o lista goala fara sa arunce cand nu este niciun articol', () => {
    expect(articolePublicate([])).toEqual([]);
  });

  it('nu este o trecere goala: 32 nepublicate si 13 publicate se despart corect', () => {
    // The shape of the real corpus, asserted as a property rather than trusted.
    const multe = [
      ...Array.from({ length: 13 }, (_, i) => face(`p${i}`, `2025-01-${String(i + 1).padStart(2, '0')}`, true)),
      ...Array.from({ length: 32 }, (_, i) => face(`n${i}`, '2024-06-08', false)),
    ];
    expect(articolePublicate(multe)).toHaveLength(13);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `rtk proxy npx vitest run src/lib/articole.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/lib/articole.ts`**

```ts
import type { Articol } from './schema-continut';

export interface ArticolCuId {
  id: string;
  data: Articol;
}

/**
 * The published posts, newest first.
 *
 * THE ONLY PLACE `publicat` IS READ. `/noutati`, `/rss.xml`, the homepage and
 * `getStaticPaths` in `[slug].astro` all come through here. Four copies of the
 * same filter is four chances to forget one, and the one that gets forgotten
 * is `getStaticPaths` - which does not look wrong anywhere, it just quietly
 * gives all 32 archived posts a live URL of their own.
 *
 * The id tiebreak is not decoration: 32 of the migrated posts share one of two
 * dates, so without it the build's output order depends on filesystem order
 * and every `dist/` diff becomes noise.
 */
export function articolePublicate(intrari: ArticolCuId[]): ArticolCuId[] {
  return intrari
    .filter((a) => a.data.publicat)
    .sort((a, b) => (a.data.data === b.data.data
      ? a.id.localeCompare(b.id, 'en')
      : b.data.data.localeCompare(a.data.data, 'en')));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `rtk proxy npx vitest run src/lib/articole.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Build the three routes and two components**

- `CardArticol.astro` — date, title, category, optional summary. Colours from `ROLURI_TEXT`; no gold on text.
- `ListaArticole.astro` — takes `articole` and an optional `limita`; used by `/noutati` and by the homepage.
- `noutati/index.astro` — `Base` layout, `<h1>Noutati</h1>`, the list. When the list is empty, the same shape of sentence `/program/` uses for an unpublished schedule.
- `noutati/[slug].astro` — `getStaticPaths` **from `articolePublicate`**, never from the raw collection. Renders title, date, author, body.
- `rss.xml.ts` — follow `src/pages/program.ics.ts` for shape: a route that returns a `Response` with the right content type, built from `articolePublicate`.

- [ ] **Step 6: Assert the archive has no pages of its own**

Add to `src/lib/build-output.itest.ts`:

```ts
it('niciun articol nepublicat nu are pagina proprie in dist/', () => {
  // "Unpublished" must not mean "reachable by anyone with the link". Taken
  // from the CONTENT FILES rather than from the built output, because a guard
  // that derives its subject from the artifact it checks can only check what
  // it recognised - and what it would fail to recognise here is precisely the
  // page that should not exist.
  const nepublicate = fisiereleArticolelor()
    .filter((f) => f.frontmatter.publicat === false)
    .map((f) => f.slug);
  expect(nepublicate.length, 'niciun articol nepublicat - garda nu ar dovedi nimic')
    .toBeGreaterThan(0);
  for (const slug of nepublicate) {
    expect(existsSync(`dist/noutati/${slug}/index.html`), `${slug} nu trebuie sa aiba pagina`)
      .toBe(false);
  }
});
```

- [ ] **Step 7: Run the suite**

Run: `TZ=Europe/Zurich npm run test:all && TZ=Europe/Zurich npm run check`
Expected: both exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/lib/articole.ts src/lib/articole.test.ts src/components/CardArticol.astro src/components/ListaArticole.astro src/pages/noutati src/pages/rss.xml.ts src/lib/build-output.itest.ts
git commit -m "feat: /noutati, the article page and the feed, all filtered in one place"
```

---

### Task 9: The nine prose routes, from one file

**Files:**
- Create: `src/pages/[...pagina].astro`
- Modify: `src/components/SiteHeader.astro`
- Test: added to `src/lib/build-output.itest.ts`

**Interfaces:**
- Consumes: the `pagini` collection, `paginaSchema`.
- Produces: nine built routes.

**One dynamic route, not nine files.** The pages differ only in their content, so nine near-identical `.astro` files would be nine places to fix a heading level. `getStaticPaths` reads the collection and builds `/${cale}/` for each.

**The navigation grows from two links to five.** `Acasa`, `Program`, `Noutati`, and two groupings. The header is a flex row that already wraps; check it at 390px, where the parish mostly reads this site, and remember Chrome silently refuses a window under about 500px — `Emulation.setDeviceMetricsOverride` over CDP is the only thing that honours the request, and `scripts/a11y.mjs` already does it.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/build-output.itest.ts`:

```ts
it('fiecare pagina din colectie are exact un fisier construit', () => {
  // The expected set comes from the CONTENT FILES, which the route cannot
  // edit - not from walking `dist/`, which would only ever confirm what the
  // route already produced.
  const cai = fisierelePaginilor().map((f) => f.frontmatter.cale);
  expect(cai.length, 'nicio pagina - garda nu ar dovedi nimic').toBe(9);
  for (const cale of cai) {
    expect(existsSync(`dist/${cale}/index.html`), `lipseste /${cale}/`).toBe(true);
  }
});

it('fiecare pagina construita chiar are continut, nu doar un titlu', () => {
  // A page whose body failed to render looks completely correct: header,
  // title, footer. Measured on the real corpus, the shortest of the nine is
  // over 3,000 characters of prose, so a floor of 400 catches an empty body
  // without pinning the test to today's content.
  for (const f of fisierelePaginilor()) {
    const html = readFileSync(`dist/${f.frontmatter.cale}/index.html`, 'utf8');
    const corp = html.split('<main')[1]?.split('</main>')[0] ?? '';
    const text = corp.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    expect(text.length, `/${f.frontmatter.cale}/ pare goala`).toBeGreaterThan(400);
  }
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `TZ=Europe/Zurich npm run test:build`
Expected: FAIL — the routes do not exist.

- [ ] **Step 3: Write the route**

```astro
---
// src/pages/[...pagina].astro
import { getCollection, render } from 'astro:content';
import Base from '../layouts/Base.astro';

export async function getStaticPaths() {
  const pagini = await getCollection('pagini');
  return pagini.map((p) => ({ params: { pagina: p.data.cale }, props: { p } }));
}

const { p } = Astro.props;
const { Content } = await render(p);
---

<Base titlu={p.data.titlu} descriere={p.data.descriere}>
  <div class="container proza">
    <h1>{p.data.titlu}</h1>
    <Content />
  </div>
</Base>
```

The `.proza` styles go in this file: measure (`var(--masura)`), heading scale, list and link treatment. **Any `a { color }` declared here takes that link's interactive states with it** — Astro scopes the rule at (0,3,1) and the global `a:hover` is (0,1,1) — so declare `:hover` and `:focus-visible` alongside, or do not declare `color` at all. Do **not** declare `outline`.

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
git add src/pages/'[...pagina].astro' src/components/SiteHeader.astro src/lib/build-output.itest.ts scripts/a11y.mjs
git commit -m "feat: the nine prose pages from one route, and a navigation that reaches them"
```

---

### Task 10: The homepage news section, and the settings singleton

**Files:**
- Modify: `src/pages/index.astro`, `src/components/SiteFooter.astro`, `src/pages/program.ics.ts`
- Create: `src/lib/setari.ts`, `src/lib/setari.test.ts`

**The parish address exists in three places and this task is where that ends.**
Measured 2026-09-17: `src/content/setari/setari.yml` (`adresa`),
`src/pages/program.ics.ts:31` (`LOCATIE`, a byte-identical string) and
`src/components/SiteFooter.astro:12` (the same content, split across a `<br />`).
Converting only the footer leaves the calendar feed as a second source of truth
for the address a visitor drives to — so `program.ics.ts` reads `setari` too.
The footer's line break is a rendering choice, not a second address: decide how
one `adresa` string renders there, rather than adding a field to carry the break.
After this task, `rtk proxy grep -rn Wehntalerstrasse src/` must find it only in
`setari.yml`.

**Interfaces:**
- Consumes: `articolePublicate`, `ListaArticole`, the `setari` collection.
- Produces: `citesteSetari()` → `Promise<Setari>`.

**Spec §5 defines the homepage as hero, week band, then news.** Phase 1 built the first two and the parish has since removed the hero's address and its next-service card; the news section is the third and last part.

**Watch the budget.** `dist/index.html` is 15,913 B against a 45 KB limit, so there is room — but `scripts/check-budget.mjs` is what says so, and it must be run rather than reasoned about. Cap the homepage list at the most recent three.

**The settings singleton is what makes the footer editable.** It also has to fail loudly when it is missing: a footer that silently renders empty is worse than a build that stops.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/setari.test.ts
import { describe, expect, it } from 'vitest';
import { alegeSetari } from './setari';

describe('alegeSetari', () => {
  it('ia singura intrare', () => {
    const s = { nume: 'Parohia', adresa: 'a', telefon: 'b', email: 'c@d.ch' };
    expect(alegeSetari([{ id: 'setari', data: s }]).nume).toBe('Parohia');
  });

  it('arunca in romana cand nu este niciuna, in loc sa dea un subsol gol', () => {
    // A footer that renders blank looks like a design choice. A build that
    // stops names the file somebody has to create.
    expect(() => alegeSetari([])).toThrow(/src\/content\/setari/);
  });

  it('arunca atunci cand sunt doua, fiindca atunci nu se stie care este adevarata', () => {
    const s = { nume: 'x', adresa: 'a', telefon: 'b', email: 'c@d.ch' };
    expect(() => alegeSetari([{ id: 'a', data: s }, { id: 'b', data: s }]))
      .toThrow(/o singura/);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `rtk proxy npx vitest run src/lib/setari.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/lib/setari.ts`, then wire the footer and the homepage**

`alegeSetari` throws a Romanian message naming `src/content/setari/setari.yml` when the collection is empty, and a different one when it holds more than one entry. `SiteFooter.astro` reads it and drops its hardcoded values. `index.astro` renders `ListaArticole` with `limita={3}` under a heading, and a link to `/noutati/`. When there are no published posts the section renders nothing at all rather than an empty heading.

- [ ] **Step 4: Run the suite and the budget**

Run: `TZ=Europe/Zurich npm run test:all && TZ=Europe/Zurich npm run budget`
Expected: exit 0. **Record the homepage's new byte count in the commit message** — the number is what a later reader trusts when a comment disagrees with it.

- [ ] **Step 5: Commit**

```bash
git add src/lib/setari.ts src/lib/setari.test.ts src/components/SiteFooter.astro src/pages/index.astro
git commit -m "feat: news on the homepage, and a footer the parish can edit"
```

---

### Task 11: The CMS, which is the point of the whole phase

**Files:**
- Modify: `public/admin/config.yml`
- Modify: `src/lib/cms.test.ts`

**Interfaces:**
- Consumes: `CATEGORII`, `articolSchema`, `paginaSchema`, `setariSchema`.
- Produces: three CMS collections a volunteer can use.

**Every label, hint and description is Romanian.** The CMS chrome is English — Sveltia ships 29 UI translations and Romanian is not one of them, a trade the spec records — so the field labels are the only Romanian a volunteer sees and they carry the whole weight.

**`media_folder` must be revisited, and Phase 1 said so in a comment.** This is the first phase with a real image field. `src/assets/uploads` is where Astro's image pipeline wants files, and **a file there is not served at `/uploads`** — so `public_folder` has to match how the schema stores a path and how the components resolve it. Get this wrong and uploads work in the CMS and break on the page.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/cms.test.ts`:

```ts
it('categoriile din CMS sunt identice cu CATEGORII', () => {
  // Same mechanism, same reason as NUME_SLUJBE in Phase 1: a dropdown that
  // offers a value the build then rejects hands the volunteer a failed deploy
  // for picking an option this file gave them.
  const camp = campulColectiei('articole', 'categorie');
  expect(camp.options).toEqual([...CATEGORII]);
});

it('fiecare colectie are eticheta si descriere in romana', () => {
  for (const nume of ['articole', 'pagini', 'setari']) {
    const c = colectia(nume);
    expect(c.label, `${nume} fara eticheta`).toBeTruthy();
    expect(c.label).not.toMatch(/^[a-z_]+$/); // not the raw key
  }
});

it('campurile obligatorii din schema sunt obligatorii si in CMS', () => {
  // Otherwise the volunteer saves a valid-looking entry and the BUILD fails,
  // somewhere they will never see it.
  for (const camp of ['titlu', 'data', 'publicat', 'categorie']) {
    expect(campulColectiei('articole', camp).required).not.toBe(false);
  }
});

it('media_folder si public_folder sunt pereche, nu doua nimereli', () => {
  const cfg = configul();
  expect(cfg.media_folder).toBe('src/assets/uploads');
  expect(cfg.public_folder).toBe('/src/assets/uploads');
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `rtk proxy npx vitest run src/lib/cms.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add the three collections to `config.yml`**

`articole` (folder `src/content/articole`, `create: true`, sorted newest-first, `publicat` a boolean with a Romanian hint saying an unpublished article appears nowhere on the site), `pagini` (folder, `create: false` — the nine exist and a tenth needs a route decision), `setari` (a `files` singleton).

- [ ] **Step 4: Run the test, then look at the running CMS**

Run: `rtk proxy npx vitest run src/lib/cms.test.ts` — expect PASS.

Then **open `/admin/` and use it**, because a control found in the bundle is not a control this configuration renders. Phase 1 put three buttons that do not exist into its documentation before anyone checked. `astro dev --background`, then `/admin/`, sign in with the `test-repo` backend, and confirm: the three collections appear, `Articole` is sorted newest-first, the category dropdown holds exactly two options, and the settings singleton opens as a form rather than a list.

- [ ] **Step 5: Commit**

```bash
git add public/admin/config.yml src/lib/cms.test.ts
git commit -m "feat(cms): articole, pagini and setari, with the media pair finally settled"
```

---

### Task 12: The guards, the budget, and the handover

**Files:**
- Modify: `scripts/check-budget.mjs`, `scripts/a11y.mjs`, `src/lib/diacritice.itest.ts`, `CLAUDE.md`, `README.md`, `docs/handover.md`

- [ ] **Step 1: Bring the new pages under the budget**

`BUGET_PAGINI` currently names the visitor pages by hand. Add `/noutati/`, one article page and one prose page. **`/noutati/` grows with every post the parish publishes** — same shape as `/program/`, which is already exempt by name and still crosses its limit at 58 weeks. Decide explicitly: either the index is paginated, or it is exempt and says so with the count at which it would break, measured rather than estimated.

- [ ] **Step 2: Bring them under the audit**

`scripts/a11y.mjs` must visit an article page and a prose page in every condition it already runs — both script states, all three widths. Print the page count so a later reader can see it changed.

- [ ] **Step 3: Prove the diacritics sweep covers `src/content/`**

The corpus that lands in this phase is the first real input that sweep has ever had. Corrupt one migrated file, run `npm run test:build`, watch it exit 1, restore it, watch it exit 0. If it does not fire, the sweep's scope is the finding.

- [ ] **Step 4: Update the documentation**

`CLAUDE.md` gains the migration's rules: that `migrare/` reads from outside the repository and a fresh clone cannot run it; that re-encoding is the sanitisation; that `publicat: false` means no page at all. `README.md` gains how to add a post. `docs/handover.md` gains the Phase 2 steps — and **check every command by running it**, because this project has shipped a handover that pointed at a file which did not exist.

- [ ] **Step 5: Run everything from a clean clone**

```bash
TZ=Europe/Zurich npm run test:all && TZ=Europe/Zurich npm run check
```

Expected: both exit 0, from a fresh `git clone` of this branch into a temporary directory with `npm ci`. **A fresh clone cannot run the migration** — the backups are not in it — so the check is that the *site* builds from committed content, which is the property that matters.

- [ ] **Step 6: Commit**

```bash
git add scripts/ src/lib/diacritice.itest.ts CLAUDE.md README.md docs/handover.md
git commit -m "feat: the new pages come under the budget, the audit and the codepoint sweep"
```

---

## Self-review

**Spec coverage.** §5 IA — Tasks 7, 9, 10 build `/noutati`, the nine prose routes and the navigation; the routes this phase does not build (`/evenimente`, `/galerie`, `/pastorale`, `/contact`, `/doneaza`) are Phase 3 by the parish's decision, recorded in §19. §6.2 `articole` — Tasks 4, 6, 8. §6.4 `pagini` — Tasks 4, 7, 9. §6.7 `setari` — Tasks 4, 10, 11. §11 migration, all seven steps — Tasks 1, 2, 3, 5, 6, 7; step 7's URL map is Task 7. §12 redirects — the CSV is emitted in Task 7 and consumed in Phase 4, stated in the file's own header. §13 budget — Task 12. §14 security — Task 5's sanitisation and the SVG exclusion.

**Gaps I am leaving open, deliberately:**

1. **The 32 unpublished posts keep their old URLs in the redirect map but have no page.** A visitor following an old link reaches `/noutati/<slug>/`, which 404s until the parish publishes that post. The alternative — no redirect — 404s too, and loses the mapping. Named in Task 7.
2. **`/noutati` has no pagination.** At 13 posts it does not need any. Task 12 forces the decision rather than letting it arrive as a red build years later.
3. **Elementor image *placement* is not recovered.** `post_content`'s own `<img>` tags are used; `_elementor_data` is not walked. On a page where an image sat in a layout column rather than in the text flow, the image will be missing. This is the residue of the spec's "lossy" warning, now much smaller, and it is what the hand-review in Task 7 is for.

**Placeholder scan.** No `TBD`, no "add error handling", no "similar to Task N". Tasks 6, 7, 9, 10, 11 and 12 describe some steps in prose rather than full code — deliberately, where the shape is set by an existing file in the repository that the implementer must match (`src/lib/schema.ts`, `src/pages/program.ics.ts`, `public/admin/config.yml`). Each names that file.

**Type consistency.** `articolSchema`/`paginaSchema`/`setariSchema` defined in Task 4 and used in 6, 7, 8, 10, 11. `articolePublicate` defined in Task 8, used in 8 and 10. `laMarkdown`/`imaginiDin` defined in Task 3, used in 6 and 7. `migreazaImagini` defined in Task 5, used in 6 and 7. `CATEGORII` defined in Task 4, used in 6 and 11. `cale` has no leading or trailing slash everywhere it appears.
