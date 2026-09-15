# bor-zh.ch Phase 1 — Liturgical Schedule and CMS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a static Astro site with a program-first homepage, a `/program` page, a `.ics` feed, and a Sveltia CMS admin, so the parish can edit the weekly liturgical schedule without touching a page builder.

**Architecture:** All schedule data lives as one YAML file per service day in an Astro content collection, validated by a Zod schema so a malformed entry fails the build instead of shipping. All date arithmetic is calendar-date arithmetic in UTC on plain `YYYY-MM-DD` strings; the only timezone-aware operation in the codebase is "what is today's date in Zürich". The site renders the next three weeks server-side so it is correct without JavaScript, and ~1 KB of inline JS reveals the week containing today.

**Tech Stack:** Astro 7 (static), TypeScript strict, Vitest, Sveltia CMS 0.213.x self-hosted, sveltia-cms-auth on Cloudflare Workers, Cloudflare Pages, @fontsource (Cormorant Garamond + Spectral).

**Spec:** `docs/superpowers/specs/2026-09-15-parish-site-rewrite-design.md`

**Scope:** This plan implements **Phase 1 only** (spec §19). Phases 2 (content migration), 3 (events, galleries, donations, contact form) and 4 (redirects, DNS cutover) get their own plans. Phase 1 is independently shippable: at the end of it the parish can edit the schedule, which is the single biggest win.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Node 22.12.0 or newer** (Astro v6 dropped 18 and 20). **Astro 7.x**, `output: 'static'`.
- **Zod 4** — Astro v6 requires it. The schema in Task 4 is written in Zod 4 syntax; if a v3-only idiom creeps in (`z.string().email()` and friends), it is a defect.
- **Client JavaScript budget: ≤ 3 KB total.** In Phase 1 the only JS is the week picker. No framework, no hydration, no Astro islands.
- **Palette — exact values, copied from spec §4:**
  `--parchment:#FAF6EE` `--raised:#FFFDF8` `--rule:#E3D9C6` `--oxblood:#6B1F26` `--oxblood-dk:#54171D` `--gold-text:#8A6A28` `--gold:#B08B3E` `--gold-lt:#C8A45C` `--ink:#2A211C` `--muted:#6E5C4E` `--faint:#7E6C52`
- **`#B08B3E` and `#C8A45C` are ornament only and MUST NEVER be used for text** at any size (2.95:1 and lower — fails WCAG AA entirely). Task 7 enforces this in CI.
- **Fonts self-hosted**, `latin` + `latin-ext` subsets. `latin-ext` covers U+0100–U+024F, which includes U+0218–U+021B (Ș ș Ț ț with comma below). No Google Fonts CDN.
- **Which words actually carry comma-below**, since it is easy to assert this of the wrong ones: `Marți`, `Ț`/`ț` and `Ș`/`ș` anywhere — and in this project's vocabulary that means `Marți`, `Sfântul Maslu` has none, `Spovedanie` has none. `Sâmbătă` carries **â** and **ă** only, not a comma-below character. `Duminică`, `Înălțarea` and `Sfânta` likewise carry only â/ă/Î. Check codepoints, not appearance: ș U+0219 vs ş U+015F are near-identical in most fonts.
- **Dates are plain `YYYY-MM-DD` strings. Times are plain `HH:MM` local strings.** Never store or compute a UTC instant for a service — a Liturgy at 10:00 is at 10:00 on both sides of a DST change. The single exception is `aziLaZurich()`, which converts the real clock into a Zürich calendar date.
- **All user-facing copy is Romanian**, with correct comma-below diacritics (ș ț, not ş ţ).
- **Performance budget** (spec §13), enforced in CI by Task 13: homepage HTML ≤ 30 KB, CSS ≤ 15 KB, JS ≤ 3 KB, ≤ 12 requests. Lighthouse accessibility 100. Because `inlineStylesheets: 'always'` puts the CSS inside the document, Task 13 enforces the first two as one combined **45 KB** limit on `dist/index.html`; the reasoning is in that task.
- **Cloudflare Pages free tier:** 20,000 files/deploy, 25 MiB/file, 500 builds/month, 2,000 static redirects.
- **`data` is overloaded — beware.** In this project `data` is Romanian for *date* and is the
  service day's date string. In Astro, `entry.data` is the parsed frontmatter object. Every
  page and endpoint that reads the collection must therefore write
  `intrari.map((e) => ({ ...e.data, data: e.id }))` — spreading Astro's parsed object, then
  overwriting `data` with the entry id, which is the date from the filename.
- **A codepoint scan proves there are no cedillas. It cannot prove the Romanian is words.**
  Task 5's implementer verified a patch with `grep <sentinel>`, got zero matches, and the file
  was still wrong — part of the sentinel had itself been eaten, so the check was defeated by the
  very thing it checked for. A second defect in the same patch was plain bad grammar that no
  scanner would ever catch. So after writing any file containing Romanian: print every
  non-ASCII line and **read them**. It is about twenty lines and it catches the class that
  greps structurally cannot.
- **The escape hazard corrupts the record of the hazard.** Task 5's implementer found the decay
  had hit the *evidence section of its own report* — the escapes proving escapes survive on disk
  had themselves decoded, so the evidence asserted the opposite of what it demonstrated. Run the
  codepoint scan on **every file that quotes Romanian**: source, content, tests, reports and
  reviews alike. Three agents and two reviewers have been bitten by this so far.
- **Never trust a `\uXXXX` escape you typed into a file.** This harness has been observed
  converting escapes to the literal character before the bytes reach disk, through both a
  Bash heredoc and the Write tool — which silently rewrote a cedilla-rejecting guard into the
  very characters it rejects. Always read the file back and dump codepoints.
- **Predicted test counts in this plan are sketches, not contracts.** Each task's test block
  shows the cases that motivated the design; implementations have consistently needed more.
  Write the tests the code needs and report the real number. Where a stated count and a
  sound implementation disagree, the plan is what is wrong.
- **Commits:** conventional-commit prefixes (`feat:`, `test:`, `chore:`, `docs:`). If an AI agent makes the commit, append `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

### Deviations from the spec — read before starting

Two deliberate refinements. Both make the result better; neither changes the design.

1. **Spec §7 specifies a `/program/date.json` endpoint that client JS reads to pick the current week. This plan drops `date.json` and server-renders the next three weeks instead.** The spec's own requirement is that the site be correct without JavaScript; rendering the weeks as HTML satisfies that directly, makes the JS smaller (it only toggles `hidden`), and removes a fetch. Combined with the nightly rebuild, correctness holds for three weeks even if every build fails. `/program` server-renders the full upcoming window.
2. **Spec §8 specifies `.ics` UIDs of the form `<date>-<index>@bor-zh.ch`. This plan uses `<date>T<time>-<slug>@bor-zh.ch`.** An index-based UID changes for every service on a day when the editor inserts one at the top, which makes subscribers' calendars delete and re-add every event.

   The first draft of this deviation used `<date>T<time>` alone. That was wrong: two services can legitimately share a start time — `17:00 Spovedanie` alongside `17:00 Vecernie` is an ordinary parish arrangement, since confession runs during vespers — and identical UIDs make every subscriber's calendar silently collapse them into one event. Appending a slug of the service name keeps distinct services distinct while staying stable under reordering. Task 4's schema rejects the only remaining collision, the same service listed twice at the same time, which is a data error rather than a real arrangement.

---

## File Structure

The site becomes its own git repository at `/Users/stefan/Work/stuff/site-bzh/web/`, **separate from the enclosing folder**, which holds ~6 GB of forensic backups of the compromised server plus `NEW-DB-PASSWORD.txt`. Task 1 makes this separation. The repository that gets pushed to GitHub must not contain that material at all — a deny-by-default `.gitignore` is one `git add -f` away from leaking it, and this whole project exists because of a security incident.

```
web/                                  ← the git repo; Cloudflare Pages builds this
├── astro.config.mjs                  Astro config: static, site URL, i18n (ro default, de declared)
├── package.json
├── tsconfig.json                     strict
├── vitest.config.ts                  getViteConfig wrapper
├── docs/superpowers/
│   ├── specs/2026-09-15-parish-site-rewrite-design.md   ← moved here in Task 1
│   └── plans/2026-09-15-phase-1-schedule-and-cms.md     ← this file
├── src/
│   ├── content.config.ts             collection definitions (imports schema from lib)
│   ├── content/slujbe/               one .yml per service day — what the CMS writes
│   │   └── 2026-09-14.yml
│   ├── lib/                          all pure logic, all unit-tested
│   │   ├── schema.ts                 Zod schema for a service day
│   │   ├── date-ro.ts                Romanian day/month names and formatting
│   │   ├── week.ts                   calendar-date math, ISO weeks, aziLaZurich
│   │   ├── schedule.ts               grouping, next service, upcoming window
│   │   ├── week-picker.ts            which week to reveal (pure; the DOM part is 20 lines)
│   │   ├── ics.ts                    RFC 5545 generation
│   │   ├── contrast.ts               WCAG ratio
│   │   └── tokens.ts                 palette + role assignments (source of truth for CSS)
│   ├── styles/global.css             resets, typography, component styles
│   ├── components/
│   │   ├── SiteHeader.astro
│   │   ├── SiteFooter.astro
│   │   ├── BandaSaptamanii.astro     5-column week band (homepage)
│   │   ├── RandZi.astro              one day row (/program)
│   │   └── SelectorSaptamana.astro   the inline <script> + prev/next controls
│   ├── layouts/Base.astro
│   └── pages/
│       ├── index.astro
│       ├── program/index.astro
│       └── program.ics.ts            static endpoint
├── public/
│   ├── admin/index.html              Sveltia CMS host page
│   ├── admin/config.yml              CMS configuration
│   ├── admin/sveltia-cms.mjs         copied from node_modules at build (self-hosted)
│   └── _headers                      CSP and security headers
├── scripts/
│   ├── copy-cms.mjs                  copies the Sveltia bundle into public/admin
│   └── check-budget.mjs              fails the build if dist/ exceeds the budget
└── .github/workflows/
    ├── ci.yml                        test + build + budget on every push
    └── nightly.yml                   03:00 Europe/Zurich → Cloudflare deploy hook
```

Why `lib/` holds everything: `.astro` components cannot be unit-tested without a browser, so every decision that can be wrong lives in a plain TypeScript module with tests, and the components only arrange markup.

---

### Task 1: Site repository and toolchain

**Files:**
- Create: `web/package.json`, `web/astro.config.mjs`, `web/tsconfig.json`, `web/vitest.config.ts`, `web/src/pages/index.astro`, `web/src/lib/smoke.ts`, `web/src/lib/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a repo at `web/` where `npm run build` and `npm test` both succeed. Every later task runs its commands from `web/`.

- [ ] **Step 1: Confirm the repository layout (already done — verify only)**

The repository restructure is complete. `web/` **is** the git repository root, on branch `phase-1`, holding `docs/` and `.gitignore`. The forensic backups, `NEW-DB-PASSWORD.txt` and the SQL dumps sit in the parent directory, outside the repository entirely.

**Do not run `git init`, and never run `rm -rf .git`** — the repository already carries the spec and plan history, which relocating rather than re-initialising preserved.

- [ ] **Step 2: Verify before you build on it**

Run: `cd /Users/stefan/Work/stuff/site-bzh/web && git log --oneline && git ls-files && ls ..`

Expected: three commits ending in the relocation; `git ls-files` shows only `.gitignore` and the two files under `docs/`; the parent listing shows `compromised-bzh-backup-DANGER`, `backup-*`, `NEW-DB-PASSWORD.txt` and `localhost.sql`, none of which git can see. Confirm this before continuing.

- [ ] **Step 3: Scaffold Astro**

The directory is not empty (it holds `docs/`, `.gitignore` and `.git`), and `npm create astro` may refuse to scaffold into it. Scaffold into a temp directory and copy the files across — and **do not copy the scaffold's own `.gitignore` or `.git`** over the ones already here.

```bash
npm create astro@latest /tmp/bzh-scaffold -- --template minimal --install --no-git --typescript strict --skip-houston
cd /tmp/bzh-scaffold && rm -rf .git .gitignore
cp -R /tmp/bzh-scaffold/. /Users/stefan/Work/stuff/site-bzh/web/
rm -rf /tmp/bzh-scaffold

cd /Users/stefan/Work/stuff/site-bzh/web
npm install
npm install --save-dev vitest
npm install @fontsource/cormorant-garamond @fontsource/spectral
```

Then confirm nothing was clobbered: `git status --porcelain .gitignore docs/` must be empty.

- [ ] **Step 4: Write `web/astro.config.mjs`**

```javascript
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://www.bor-zh.ch',
  output: 'static',
  trailingSlash: 'always',
  i18n: {
    defaultLocale: 'ro',
    locales: ['ro', 'de'],
    routing: { prefixDefaultLocale: false },
  },
  build: { inlineStylesheets: 'always' },
});
```

`prefixDefaultLocale: false` keeps Romanian at `/program/` rather than `/ro/program/`, so German can be added later at `/de/program/` without moving a single existing URL. `inlineStylesheets: 'always'` removes a render-blocking request — the whole stylesheet is smaller than one HTTP round trip.

- [ ] **Step 5: Write `web/vitest.config.ts`**

```typescript
/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

export default getViteConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 6: Add scripts to `web/package.json`**

Merge into the existing `"scripts"` block:

```json
{
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "check": "astro check",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 7: Write the failing smoke test**

Create `web/src/lib/smoke.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { numeleParohiei } from './smoke';

describe('toolchain', () => {
  it('runs TypeScript from src/lib', () => {
    expect(numeleParohiei()).toBe('Parohia Ortodoxă Română Sfântul Nicolae');
  });
});
```

- [ ] **Step 8: Run it to verify it fails**

Run: `cd /Users/stefan/Work/stuff/site-bzh/web && npm test`
Expected: FAIL — `Failed to resolve import "./smoke"`.

- [ ] **Step 9: Make it pass**

Create `web/src/lib/smoke.ts`:

```typescript
export function numeleParohiei(): string {
  return 'Parohia Ortodoxă Română Sfântul Nicolae';
}
```

- [ ] **Step 10: Run tests and build**

Run: `cd /Users/stefan/Work/stuff/site-bzh/web && npm test && npm run build`
Expected: 1 test passes; `astro build` completes and writes `dist/index.html`.

- [ ] **Step 11: Commit**

```bash
cd /Users/stefan/Work/stuff/site-bzh/web
git add -A
git commit -m "chore: scaffold Astro site with Vitest

The site is its own repository, separate from the enclosing folder that
holds forensic backups of the compromised server."
```

---

### Task 2: Romanian calendar vocabulary

**Files:**
- Create: `web/src/lib/date-ro.ts`
- Test: `web/src/lib/date-ro.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `NUME_ZILE: readonly string[]` — 7 entries, index 0 = Monday.
  - `NUME_LUNI: readonly string[]` — 12 entries, index 0 = January.
  - `numeZi(data: string): string` — `'2026-09-20'` → `'Duminică'`.
  - `numeLuna(data: string): string` — `'2026-09-20'` → `'septembrie'`.
  - `ziuaDinLuna(data: string): number` — `'2026-09-20'` → `20`.
  - `formatIntervalSaptamana(luni: string, duminica: string): string` — `'14 – 20 septembrie 2026'`.

Names are a hardcoded table rather than `Intl.DateTimeFormat('ro-RO')`. ICU data differs between Node versions and between your machine and the CI container, so `Intl` would make the rendered site depend on the build environment. A table is deterministic and testable.

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/date-ro.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  NUME_LUNI,
  NUME_ZILE,
  formatIntervalSaptamana,
  numeLuna,
  numeZi,
  ziuaDinLuna,
} from './date-ro';

describe('vocabular', () => {
  it('are șapte zile începând cu luni', () => {
    expect(NUME_ZILE).toEqual([
      'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă', 'Duminică',
    ]);
  });

  it('are douăsprezece luni', () => {
    expect(NUME_LUNI).toHaveLength(12);
    expect(NUME_LUNI[8]).toBe('septembrie');
  });

  it('folosește virgulă dedesubt, nu sedilă', () => {
    const tot = [...NUME_ZILE, ...NUME_LUNI].join('');
    expect(tot).not.toMatch(/[şţŞŢ]/);
    expect(tot).toMatch(/ț/);
  });
});

describe('numeZi', () => {
  it('recunoaște o luni', () => {
    expect(numeZi('2026-09-14')).toBe('Luni');
  });

  it('recunoaște o duminică', () => {
    expect(numeZi('2026-09-20')).toBe('Duminică');
  });

  it('funcționează peste granița de an', () => {
    expect(numeZi('2026-01-01')).toBe('Joi');
  });
});

describe('numeLuna și ziuaDinLuna', () => {
  it('întoarce luna cu literă mică', () => {
    expect(numeLuna('2026-09-20')).toBe('septembrie');
  });

  it('întoarce ziua ca număr', () => {
    expect(ziuaDinLuna('2026-09-07')).toBe(7);
  });
});

describe('formatIntervalSaptamana', () => {
  it('comprimă o săptămână din aceeași lună', () => {
    expect(formatIntervalSaptamana('2026-09-14', '2026-09-20'))
      .toBe('14 – 20 septembrie 2026');
  });

  it('scrie ambele luni când săptămâna le traversează', () => {
    expect(formatIntervalSaptamana('2026-09-28', '2026-10-04'))
      .toBe('28 septembrie – 4 octombrie 2026');
  });

  it('scrie ambii ani când săptămâna traversează anul', () => {
    expect(formatIntervalSaptamana('2025-12-29', '2026-01-04'))
      .toBe('29 decembrie 2025 – 4 ianuarie 2026');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run src/lib/date-ro.test.ts`
Expected: FAIL — `Failed to resolve import "./date-ro"`.

- [ ] **Step 3: Implement**

Create `web/src/lib/date-ro.ts`:

```typescript
export const NUME_ZILE = [
  'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă', 'Duminică',
] as const;

export const NUME_LUNI = [
  'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
  'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
] as const;

/** Splits a plain YYYY-MM-DD string. No Date object, no timezone. */
function parti(data: string): { an: number; luna: number; zi: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  if (!m) throw new Error(`Dată invalidă: ${data}`);
  return { an: Number(m[1]), luna: Number(m[2]), zi: Number(m[3]) };
}

/** 0 = Monday … 6 = Sunday. */
export function indiceZi(data: string): number {
  const { an, luna, zi } = parti(data);
  const jsDay = new Date(Date.UTC(an, luna - 1, zi)).getUTCDay(); // 0 = Sunday
  return (jsDay + 6) % 7;
}

export function numeZi(data: string): string {
  return NUME_ZILE[indiceZi(data)];
}

export function numeLuna(data: string): string {
  return NUME_LUNI[parti(data).luna - 1];
}

export function ziuaDinLuna(data: string): number {
  return parti(data).zi;
}

export function formatIntervalSaptamana(luni: string, duminica: string): string {
  const a = parti(luni);
  const b = parti(duminica);

  if (a.an !== b.an) {
    return `${a.zi} ${NUME_LUNI[a.luna - 1]} ${a.an} – ${b.zi} ${NUME_LUNI[b.luna - 1]} ${b.an}`;
  }
  if (a.luna !== b.luna) {
    return `${a.zi} ${NUME_LUNI[a.luna - 1]} – ${b.zi} ${NUME_LUNI[b.luna - 1]} ${b.an}`;
  }
  return `${a.zi} – ${b.zi} ${NUME_LUNI[b.luna - 1]} ${b.an}`;
}
```

- [ ] **Step 4: Run tests**

Run: `cd web && npx vitest run src/lib/date-ro.test.ts`
Expected: PASS. Do not hold the implementation to a predicted test count — the impossible-date validation and a full `toEqual` on `NUME_LUNI` push this well past the block shown here (23 as built).

- [ ] **Step 5: Commit**

```bash
git add src/lib/date-ro.ts src/lib/date-ro.test.ts
git commit -m "feat: Romanian day and month names with comma-below diacritics"
```

---

### Task 3: Calendar-date arithmetic and ISO weeks

**Files:**
- Create: `web/src/lib/week.ts`
- Test: `web/src/lib/week.test.ts`

**Interfaces:**
- Consumes: `indiceZi` and **`partiData`** from `./date-ro`. `partiData` parses *and validates* a `YYYY-MM-DD` string, rejecting dates that do not exist (month 13, 30 February). **Use it in `laUtc` instead of writing a second regex parse** — duplicating the parse would leave the impossible-date hole open on this side, which is what Task 2's fix round closed.
- Produces:
  - `adaugaZile(data: string, n: number): string`
  - `inceputSaptamana(data: string): string` — the Monday of that date's week.
  - `sfarsitSaptamana(data: string): string` — the Sunday.
  - `cheieSaptamana(data: string): string` — ISO week key, e.g. `'2026-W38'`.
  - `aziLaZurich(acum?: Date): string` — the current calendar date in Europe/Zurich.
  - `oraLaZurich(acum?: Date): string` — the current `HH:MM` in Europe/Zurich.

`aziLaZurich` and `oraLaZurich` are the **only** functions in the codebase that touch timezones. Everything downstream takes their output as plain strings.

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/week.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  adaugaZile,
  aziLaZurich,
  cheieSaptamana,
  inceputSaptamana,
  oraLaZurich,
  sfarsitSaptamana,
} from './week';

describe('adaugaZile', () => {
  it('adună în interiorul lunii', () => {
    expect(adaugaZile('2026-09-14', 6)).toBe('2026-09-20');
  });

  it('trece peste granița de lună', () => {
    expect(adaugaZile('2026-09-28', 6)).toBe('2026-10-04');
  });

  it('trece peste granița de an', () => {
    expect(adaugaZile('2025-12-29', 6)).toBe('2026-01-04');
  });

  it('scade cu numere negative', () => {
    expect(adaugaZile('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('respectă anii bisecți', () => {
    expect(adaugaZile('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('nu este afectată de trecerea la ora de vară', () => {
    // 2026-03-29 is the European DST switch. A naive local-time
    // implementation adding 24h in milliseconds lands back on the 29th.
    expect(adaugaZile('2026-03-28', 1)).toBe('2026-03-29');
    expect(adaugaZile('2026-03-29', 1)).toBe('2026-03-30');
  });

  it('nu este afectată de trecerea la ora de iarnă', () => {
    expect(adaugaZile('2026-10-25', 1)).toBe('2026-10-26');
  });
});

describe('inceputSaptamana și sfarsitSaptamana', () => {
  it('o luni este propriul început de săptămână', () => {
    expect(inceputSaptamana('2026-09-14')).toBe('2026-09-14');
  });

  it('o duminică aparține săptămânii care începe luni', () => {
    expect(inceputSaptamana('2026-09-20')).toBe('2026-09-14');
    expect(sfarsitSaptamana('2026-09-20')).toBe('2026-09-20');
  });

  it('o miercuri se ancorează corect', () => {
    expect(inceputSaptamana('2026-09-16')).toBe('2026-09-14');
    expect(sfarsitSaptamana('2026-09-16')).toBe('2026-09-20');
  });
});

describe('cheieSaptamana', () => {
  it('numerotează o săptămână obișnuită', () => {
    expect(cheieSaptamana('2026-09-14')).toBe('2026-W38');
    expect(cheieSaptamana('2026-09-20')).toBe('2026-W38');
  });

  it('atribuie zilele de la finalul lui decembrie anului ISO următor', () => {
    // 2026-01-01 is a Thursday, so ISO week 1 of 2026 starts Mon 2025-12-29.
    expect(cheieSaptamana('2025-12-29')).toBe('2026-W01');
    expect(cheieSaptamana('2026-01-04')).toBe('2026-W01');
  });

  it('atribuie 1 ianuarie anului ISO precedent când cade la finalul săptămânii', () => {
    // 2027-01-01 is a Friday, so it belongs to the week starting Mon 2026-12-28,
    // which is ISO week 53 of 2026.
    expect(cheieSaptamana('2027-01-01')).toBe('2026-W53');
  });

  it('completează cu zero săptămânile cu o cifră', () => {
    expect(cheieSaptamana('2026-02-02')).toBe('2026-W06');
  });
});

describe('aziLaZurich', () => {
  it('întoarce data din Zürich, nu din UTC', () => {
    // 22:30 UTC on 14 Sept is already 00:30 on 15 Sept in Zürich (CEST, UTC+2).
    const acum = new Date('2026-09-14T22:30:00Z');
    expect(aziLaZurich(acum)).toBe('2026-09-15');
  });

  it('întoarce data curentă în formatul așteptat', () => {
    expect(aziLaZurich()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('oraLaZurich', () => {
  it('convertește UTC în ora locală de vară', () => {
    expect(oraLaZurich(new Date('2026-09-14T08:30:00Z'))).toBe('10:30');
  });

  it('convertește UTC în ora locală de iarnă', () => {
    expect(oraLaZurich(new Date('2026-12-14T08:30:00Z'))).toBe('09:30');
  });

  it('scrie miezul nopții ca 00:xx, nu 24:xx', () => {
    // 22:30 UTC is 00:30 the next day in Zürich (CEST). Some ICU builds format
    // this as "24:30" under hour12:false — which would break time comparison.
    expect(oraLaZurich(new Date('2026-09-14T22:30:00Z'))).toBe('00:30');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run src/lib/week.test.ts`
Expected: FAIL — `Failed to resolve import "./week"`.

- [ ] **Step 3: Implement**

Create `web/src/lib/week.ts`:

```typescript
import { indiceZi, partiData } from './date-ro';

const MS_PE_ZI = 86_400_000;

function laUtc(data: string): number {
  // partiData validates as well as parses — a second regex here would let
  // 2026-02-30 through on this side of the codebase.
  const { an, luna, zi } = partiData(data);
  return Date.UTC(an, luna - 1, zi);
}

function dinUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Adds days to a calendar date. Arithmetic happens in UTC, where every day is
 * exactly 24h, so daylight saving cannot shift the result.
 */
export function adaugaZile(data: string, n: number): string {
  return dinUtc(laUtc(data) + n * MS_PE_ZI);
}

export function inceputSaptamana(data: string): string {
  return adaugaZile(data, -indiceZi(data));
}

export function sfarsitSaptamana(data: string): string {
  return adaugaZile(inceputSaptamana(data), 6);
}

/**
 * ISO 8601 week key, e.g. "2026-W38". The ISO year is the year of the Thursday
 * in that week, which is why it can differ from the calendar year in late
 * December and early January.
 */
export function cheieSaptamana(data: string): string {
  const joi = adaugaZile(inceputSaptamana(data), 3);
  const anIso = Number(joi.slice(0, 4));
  const primaJoi = adaugaZile(inceputSaptamana(`${anIso}-01-04`), 3);
  const numar = Math.round((laUtc(joi) - laUtc(primaJoi)) / (7 * MS_PE_ZI)) + 1;
  return `${anIso}-W${String(numar).padStart(2, '0')}`;
}

/**
 * The current calendar date in Europe/Zurich. This and oraLaZurich are the only
 * timezone-aware functions in the codebase. en-CA formats as YYYY-MM-DD.
 */
export function aziLaZurich(acum: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Zurich',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(acum);
}

/**
 * The current HH:MM in Europe/Zurich, 24-hour.
 *
 * `hourCycle: 'h23'` rather than `hour12: false`: the latter selects the h24
 * cycle in some ICU builds, which formats midnight as "24:30" instead of
 * "00:30" — and urmatoareaSlujba compares that string, so a late-night visitor
 * would be shown the wrong next service.
 */
export function oraLaZurich(acum: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Zurich',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(acum);
}
```

- [ ] **Step 4: Run tests**

Run: `cd web && npx vitest run src/lib/week.test.ts`
Expected: PASS, 19 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/week.ts src/lib/week.test.ts
git commit -m "feat: calendar-date arithmetic and ISO week keys

All schedule math is UTC calendar arithmetic on YYYY-MM-DD strings, so
daylight saving cannot move a service. Only aziLaZurich/oraLaZurich are
timezone-aware."
```

---

### Task 4: Service-day schema and content collection

**Files:**
- Create: `web/src/lib/schema.ts`, `web/src/content.config.ts`, `web/src/content/slujbe/2026-09-14.yml`, `web/src/content/slujbe/2026-09-16.yml`, `web/src/content/slujbe/2026-09-18.yml`, `web/src/content/slujbe/2026-09-19.yml`, `web/src/content/slujbe/2026-09-20.yml`
- Test: `web/src/lib/schema.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `ziSchema` — the Zod object schema for one service day.
  - `type ZiSlujba = z.infer<typeof ziSchema> & { data: string }` — the shape every later task consumes.
  - Collection name `'slujbe'`, queried with `getCollection('slujbe')`; each entry's `id` is the filename stem, i.e. the date.

The schema lives in `lib/` rather than inline in `content.config.ts` so it can be unit-tested without booting Astro.

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/schema.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { ziSchema } from './schema';

const valid = {
  praznic: 'Înălțarea Sfintei Cruci',
  praznic_mare: true,
  zi_de_post: true,
  slujbe: [
    { ora: '07:30', slujba: 'Utrenia' },
    { ora: '08:30', slujba: 'Sfânta Liturghie' },
  ],
};

describe('ziSchema', () => {
  it('acceptă o zi completă', () => {
    expect(ziSchema.safeParse(valid).success).toBe(true);
  });

  it('acceptă o zi minimă', () => {
    const r = ziSchema.safeParse({ slujbe: [{ ora: '10:00', slujba: 'Sfânta Liturghie' }] });
    expect(r.success).toBe(true);
  });

  it('pune valori implicite pentru steaguri', () => {
    const r = ziSchema.parse({ slujbe: [{ ora: '10:00', slujba: 'Sfânta Liturghie' }] });
    expect(r.zi_de_post).toBe(false);
    expect(r.praznic_mare).toBe(false);
    expect(r.anulat).toBe(false);
  });

  it('respinge o oră fără două puncte', () => {
    const r = ziSchema.safeParse({ slujbe: [{ ora: '0830', slujba: 'Utrenia' }] });
    expect(r.success).toBe(false);
  });

  it('respinge o oră imposibilă', () => {
    const r = ziSchema.safeParse({ slujbe: [{ ora: '25:00', slujba: 'Utrenia' }] });
    expect(r.success).toBe(false);
  });

  it('acceptă ora fără zero la început', () => {
    const r = ziSchema.safeParse({ slujbe: [{ ora: '7:30', slujba: 'Utrenia' }] });
    expect(r.success).toBe(true);
  });

  it('respinge o zi fără slujbe care nu este anulată', () => {
    const r = ziSchema.safeParse({ slujbe: [] });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toContain('cel puțin o slujbă');
    }
  });

  it('acceptă o zi fără slujbe dacă este anulată', () => {
    const r = ziSchema.safeParse({ slujbe: [], anulat: true, note: 'Părintele este plecat' });
    expect(r.success).toBe(true);
  });

  it('respinge praznic_mare fără praznic', () => {
    const r = ziSchema.safeParse({
      praznic_mare: true,
      slujbe: [{ ora: '10:00', slujba: 'Sfânta Liturghie' }],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toContain('numele praznicului');
    }
  });

  it('respinge o slujbă necunoscută', () => {
    const r = ziSchema.safeParse({ slujbe: [{ ora: '10:00', slujba: 'Brunch' }] });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run src/lib/schema.test.ts`
Expected: FAIL — `Failed to resolve import "./schema"`.

- [ ] **Step 3: Implement the schema**

Create `web/src/lib/schema.ts`:

```typescript
import { z } from 'astro/zod';

/**
 * The list the CMS offers as a dropdown. Keeping it closed is what stops
 * "Sf. Liturghie", "Sfanta Liturghie" and "Sfânta Liturghie" from all appearing
 * on the same page. "Altceva" plus `detaliu` is the escape hatch.
 */
export const NUME_SLUJBE = [
  'Utrenia',
  'Sfânta Liturghie',
  'Vecernie',
  'Spovedanie',
  'Acatist',
  'Paraclisul Maicii Domnului',
  'Sfântul Maslu',
  'Litie',
  'Parastas',
  'Priveghere',
  'Denie',
  'Liturghia Darurilor mai înainte sfințite',
  'Botez',
  'Cununie',
  'Altceva',
] as const;

const ORA = /^([01]?\d|2[0-3]):[0-5]\d$/;

export const slujbaSchema = z.object({
  ora: z.string().regex(ORA, 'Ora trebuie scrisă ca 08:30'),
  slujba: z.enum(NUME_SLUJBE),
  detaliu: z.string().optional(),
});

export const ziSchema = z
  .object({
    praznic: z.string().optional(),
    praznic_mare: z.boolean().default(false),
    zi_de_post: z.boolean().default(false),
    anulat: z.boolean().default(false),
    note: z.string().optional(),
    locatie: z.string().optional(),
    slujbe: z.array(slujbaSchema),
  })
  .refine((z_) => z_.anulat || z_.slujbe.length > 0, {
    message: 'Ziua trebuie să aibă cel puțin o slujbă, sau să fie marcată ca anulată.',
    path: ['slujbe'],
  })
  .refine((z_) => !z_.praznic_mare || Boolean(z_.praznic?.trim()), {
    message: 'Un praznic mare trebuie să aibă și numele praznicului completat.',
    path: ['praznic'],
  });

export type Slujba = z.infer<typeof slujbaSchema>;
export type ZiSlujba = z.infer<typeof ziSchema> & { data: string };
```

- [ ] **Step 4: Run tests**

Run: `cd web && npx vitest run src/lib/schema.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Wire the collection**

Create `web/src/content.config.ts`:

```typescript
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { ziSchema } from './lib/schema';

const slujbe = defineCollection({
  loader: glob({
    pattern: '**/*.yml',
    base: './src/content/slujbe',
    // The filename is the date, so use the stem verbatim rather than letting
    // github-slugger rewrite it.
    generateId: ({ entry }) => entry.replace(/\.yml$/, ''),
  }),
  schema: ziSchema,
});

export const collections = { slujbe };
```

- [ ] **Step 6: Seed the real current week**

These are the actual services from `bor-zh.ch/program-liturgic/` for 14–20 September 2026. Create five files under `web/src/content/slujbe/`.

`2026-09-14.yml`:

```yaml
praznic: Înălțarea Sfintei Cruci
praznic_mare: true
zi_de_post: true
slujbe:
  - ora: "07:30"
    slujba: Utrenia
  - ora: "08:30"
    slujba: Sfânta Liturghie
```

`2026-09-16.yml`:

```yaml
slujbe:
  - ora: "17:00"
    slujba: Spovedanie
  - ora: "18:30"
    slujba: Paraclisul Maicii Domnului
```

`2026-09-18.yml`:

```yaml
slujbe:
  - ora: "17:00"
    slujba: Spovedanie
  - ora: "18:30"
    slujba: Acatist
```

`2026-09-19.yml`:

```yaml
slujbe:
  - ora: "15:30"
    slujba: Spovedanie
  - ora: "17:00"
    slujba: Vecernie
```

`2026-09-20.yml`:

```yaml
praznic: Duminica după Înălțarea Sfintei Cruci
slujbe:
  - ora: "08:45"
    slujba: Utrenia
  - ora: "10:00"
    slujba: Sfânta Liturghie
    detaliu: și Parastas
```

- [ ] **Step 7: Verify Astro loads and validates the collection**

Run: `cd web && npm run check && npm run build`
Expected: both succeed with no schema errors.

Then deliberately break one to confirm the guarantee holds. Change `ora: "07:30"` to `ora: "0730"` in `2026-09-14.yml` and run `npm run build`.
Expected: **build FAILS** with `Ora trebuie scrisă ca 08:30`. Restore the file and rebuild to green.

This step is the whole argument for the schema — confirm it with your own eyes rather than trusting it.

- [ ] **Step 8: Commit**

```bash
git add src/lib/schema.ts src/lib/schema.test.ts src/content.config.ts src/content/slujbe/
git commit -m "feat: service-day schema and slujbe collection

A malformed entry fails the build instead of shipping."
```

---

### Task 5: Schedule queries

**Files:**
- Create: `web/src/lib/schedule.ts`
- Test: `web/src/lib/schedule.test.ts`

**Interfaces:**
- Consumes: `ZiSlujba` and `Slujba` from `./schema`; `cheieSaptamana`, `inceputSaptamana`, `sfarsitSaptamana` and `partiData` from `./week` / `./date-ro`. (`adaugaZile` is **not** needed — an earlier draft listed it and importing it would fail `astro check` as unused.)
- Produces:
  - `type Saptamana = { cheie: string; luni: string; duminica: string; zile: ZiSlujba[] }`
  - `minute(ora: string): number` — minutes since midnight; `ics.ts` imports this.
  - `etichetaSlujba(s: Slujba): string` — the display label. **Every** place that shows a service name uses this: `RandZi`, `BandaSaptamanii` and the `.ics` `SUMMARY`. Without it, the `Altceva` escape hatch renders three different ways and the feed emits `Altceva Cerc de studiu`.
  - `grupeazaPeSaptamani(zile: ZiSlujba[]): Saptamana[]` — sorted ascending, weeks with no entries omitted.
  - `urmatoareaSlujba(zile, azi: string, ora: string): (Slujba & { data: string }) | null` — returning `Slujba` rather than a loose object is what lets the homepage pass the result straight to `etichetaSlujba`.
  - `saptamaniViitoare(zile, azi: string, nr: number): Saptamana[]` — the week containing `azi` plus the following `nr - 1` weeks that have entries.

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/schedule.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import type { ZiSlujba } from './schema';
import { etichetaSlujba, grupeazaPeSaptamani, saptamaniViitoare, urmatoareaSlujba } from './schedule';

describe('etichetaSlujba', () => {
  it('întoarce numele slujbei', () => {
    expect(etichetaSlujba({ ora: '10:00', slujba: 'Sfânta Liturghie' })).toBe('Sfânta Liturghie');
  });

  it('adaugă detaliul la numele slujbei', () => {
    expect(etichetaSlujba({ ora: '10:00', slujba: 'Sfânta Liturghie', detaliu: 'și Parastas' }))
      .toBe('Sfânta Liturghie și Parastas');
  });

  it('pentru „Altceva" folosește detaliul ca nume', () => {
    expect(etichetaSlujba({ ora: '19:00', slujba: 'Altceva', detaliu: 'Cerc de studiu biblic' }))
      .toBe('Cerc de studiu biblic');
  });

  it('nu lasă „Altceva" să apară pe site fără detaliu', () => {
    expect(etichetaSlujba({ ora: '19:00', slujba: 'Altceva' })).toBe('Slujbă');
    expect(etichetaSlujba({ ora: '19:00', slujba: 'Altceva', detaliu: '   ' })).toBe('Slujbă');
  });
});

function zi(data: string, slujbe: Array<[string, string]>, extra: Partial<ZiSlujba> = {}): ZiSlujba {
  return {
    data,
    praznic_mare: false,
    zi_de_post: false,
    anulat: false,
    slujbe: slujbe.map(([ora, slujba]) => ({ ora, slujba: slujba as never })),
    ...extra,
  } as ZiSlujba;
}

const date = [
  zi('2026-09-14', [['07:30', 'Utrenia'], ['08:30', 'Sfânta Liturghie']]),
  zi('2026-09-16', [['17:00', 'Spovedanie'], ['18:30', 'Acatist']]),
  zi('2026-09-20', [['08:45', 'Utrenia'], ['10:00', 'Sfânta Liturghie']]),
  zi('2026-09-23', [['18:30', 'Acatist']]),
  zi('2026-10-04', [['10:00', 'Sfânta Liturghie']]),
];

describe('grupeazaPeSaptamani', () => {
  it('grupează zilele în săptămâni ISO', () => {
    const s = grupeazaPeSaptamani(date);
    expect(s.map((x) => x.cheie)).toEqual(['2026-W38', '2026-W39', '2026-W40']);
  });

  it('pune limitele corecte pe fiecare săptămână', () => {
    const [prima] = grupeazaPeSaptamani(date);
    expect(prima.luni).toBe('2026-09-14');
    expect(prima.duminica).toBe('2026-09-20');
    expect(prima.zile).toHaveLength(3);
  });

  it('sortează zilele în interiorul săptămânii', () => {
    const s = grupeazaPeSaptamani([date[2], date[0], date[1]]);
    expect(s[0].zile.map((z) => z.data)).toEqual(['2026-09-14', '2026-09-16', '2026-09-20']);
  });

  it('omite săptămânile fără intrări', () => {
    const s = grupeazaPeSaptamani(date);
    expect(s.map((x) => x.cheie)).not.toContain('2026-W41');
  });

  it('întoarce o listă goală pentru date goale', () => {
    expect(grupeazaPeSaptamani([])).toEqual([]);
  });
});

describe('urmatoareaSlujba', () => {
  it('alege următoarea slujbă din ziua curentă', () => {
    expect(urmatoareaSlujba(date, '2026-09-14', '08:00')).toMatchObject({
      data: '2026-09-14',
      ora: '08:30',
      slujba: 'Sfânta Liturghie',
    });
  });

  it('trece la ziua următoare când ziua curentă s-a încheiat', () => {
    expect(urmatoareaSlujba(date, '2026-09-14', '09:00')).toMatchObject({
      data: '2026-09-16',
      ora: '17:00',
    });
  });

  it('compară orele numeric, nu alfabetic', () => {
    const d = [zi('2026-09-14', [['09:00', 'Utrenia'], ['10:00', 'Sfânta Liturghie']])];
    // Lexicographically '9:00' > '10:00'; numerically it is not.
    expect(urmatoareaSlujba(d, '2026-09-14', '9:30')).toMatchObject({ ora: '10:00' });
  });

  it('sare peste zilele anulate', () => {
    const d = [
      zi('2026-09-16', [['18:30', 'Acatist']], { anulat: true }),
      zi('2026-09-20', [['10:00', 'Sfânta Liturghie']]),
    ];
    expect(urmatoareaSlujba(d, '2026-09-15', '12:00')).toMatchObject({ data: '2026-09-20' });
  });

  it('întoarce null când nu mai urmează nimic', () => {
    expect(urmatoareaSlujba(date, '2027-01-01', '00:00')).toBeNull();
  });

  it('întoarce null pentru date goale', () => {
    expect(urmatoareaSlujba([], '2026-09-14', '08:00')).toBeNull();
  });
});

describe('saptamaniViitoare', () => {
  it('începe cu săptămâna care conține ziua curentă', () => {
    const s = saptamaniViitoare(date, '2026-09-16', 3);
    expect(s[0].cheie).toBe('2026-W38');
  });

  it('limitează numărul de săptămâni', () => {
    expect(saptamaniViitoare(date, '2026-09-16', 2)).toHaveLength(2);
  });

  it('exclude săptămânile complet trecute', () => {
    const s = saptamaniViitoare(date, '2026-09-23', 3);
    expect(s.map((x) => x.cheie)).toEqual(['2026-W39', '2026-W40']);
  });

  it('întoarce o listă goală când totul este în trecut', () => {
    expect(saptamaniViitoare(date, '2027-01-01', 3)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run src/lib/schedule.test.ts`
Expected: FAIL — `Failed to resolve import "./schedule"`.

- [ ] **Step 3: Implement**

Create `web/src/lib/schedule.ts`:

```typescript
import type { Slujba, ZiSlujba } from './schema';
import { adaugaZile } from './week';
import { cheieSaptamana, inceputSaptamana, sfarsitSaptamana } from './week';

export type Saptamana = {
  cheie: string;
  luni: string;
  duminica: string;
  zile: ZiSlujba[];
};

/** Minutes since midnight. '9:30' and '09:30' both yield 570. */
export function minute(ora: string): number {
  const [h, m] = ora.split(':');
  return Number(h) * 60 + Number(m);
}

/**
 * The label shown to a visitor. `Altceva` is the CMS escape hatch for a service
 * not on the dropdown: the editor types the real name into `detaliu`, so the
 * word "Altceva" itself must never reach the page or the calendar feed.
 */
export function etichetaSlujba(s: Slujba): string {
  const detaliu = s.detaliu?.trim() ?? '';
  if (s.slujba === 'Altceva') return detaliu || 'Slujbă';
  return detaliu ? `${s.slujba} ${detaliu}` : s.slujba;
}

export function grupeazaPeSaptamani(zile: ZiSlujba[]): Saptamana[] {
  const cos = new Map<string, ZiSlujba[]>();

  for (const z of zile) {
    const cheie = cheieSaptamana(z.data);
    const lista = cos.get(cheie);
    if (lista) lista.push(z);
    else cos.set(cheie, [z]);
  }

  return [...cos.values()]
    .map((grup) => {
      const sortate = [...grup].sort((a, b) => a.data.localeCompare(b.data));
      const orice = sortate[0].data;
      return {
        cheie: cheieSaptamana(orice),
        luni: inceputSaptamana(orice),
        duminica: sfarsitSaptamana(orice),
        zile: sortate,
      };
    })
    .sort((a, b) => a.luni.localeCompare(b.luni));
}

export function urmatoareaSlujba(
  zile: ZiSlujba[],
  azi: string,
  ora: string,
): (Slujba & { data: string }) | null {
  const acum = minute(ora);
  const candidate = [...zile]
    .filter((z) => !z.anulat && z.data >= azi)
    .sort((a, b) => a.data.localeCompare(b.data));

  for (const z of candidate) {
    const slujbe = [...z.slujbe].sort((a, b) => minute(a.ora) - minute(b.ora));
    for (const s of slujbe) {
      if (z.data > azi || minute(s.ora) >= acum) {
        return { ...s, data: z.data };
      }
    }
  }
  return null;
}

export function saptamaniViitoare(zile: ZiSlujba[], azi: string, nr: number): Saptamana[] {
  const lunea = inceputSaptamana(azi);
  return grupeazaPeSaptamani(zile)
    .filter((s) => s.luni >= lunea)
    .slice(0, nr);
}
```

- [ ] **Step 4: Run tests**

Run: `cd web && npx vitest run src/lib/schedule.test.ts`
Expected: PASS, 19 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/schedule.ts src/lib/schedule.test.ts
git commit -m "feat: week grouping, next-service lookup and upcoming window

etichetaSlujba is the single place that renders a service name, so the
Altceva escape hatch cannot leak the word 'Altceva' onto the page."
```

---

### Task 6: iCalendar feed generation

**Files:**
- Create: `web/src/lib/ics.ts`
- Test: `web/src/lib/ics.test.ts`

**Interfaces:**
- Consumes: `ZiSlujba` from `./schema`; `minute` from `./schedule`.
- Produces: `genereazaIcs(zile: ZiSlujba[], opts: { dtstamp: string; locatie: string }): string` — a complete RFC 5545 document with CRLF line endings.

Three things are easy to get wrong here and each has a test: **line folding must count octets, not characters** (`Înălțarea` is 9 characters but 11 bytes, so a character-based fold produces lines that exceed 75 octets and some clients reject them); **text must be escaped** (`,` `;` `\` and newlines); and **UIDs must be stable** across rebuilds and across reordering, or every subscriber's calendar churns.

`dtstamp` is a parameter rather than `new Date()` so output is deterministic and testable.

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/ics.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import type { ZiSlujba } from './schema';
import { NUME_SLUJBE } from './schema';
import { genereazaIcs } from './ics';

function zi(data: string, slujbe: Array<[string, string]>, extra: Partial<ZiSlujba> = {}): ZiSlujba {
  return {
    data,
    praznic_mare: false,
    zi_de_post: false,
    anulat: false,
    slujbe: slujbe.map(([ora, slujba]) => ({ ora, slujba: slujba as never })),
    ...extra,
  } as ZiSlujba;
}

const opts = { dtstamp: '20260915T060000Z', locatie: 'Wehntalerstrasse 451, 8046 Zürich' };

const ics = (zile: ZiSlujba[]) => genereazaIcs(zile, opts);

describe('structura documentului', () => {
  it('se deschide și se închide corect', () => {
    const out = ics([zi('2026-09-20', [['10:00', 'Sfânta Liturghie']])]);
    expect(out.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(out.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('folosește terminatori de linie CRLF', () => {
    const out = ics([zi('2026-09-20', [['10:00', 'Sfânta Liturghie']])]);
    expect(out.split('\n').every((l) => l === '' || l.endsWith('\r'))).toBe(true);
  });

  it('include fusul orar Europe/Zurich', () => {
    const out = ics([zi('2026-09-20', [['10:00', 'Sfânta Liturghie']])]);
    expect(out).toContain('BEGIN:VTIMEZONE');
    expect(out).toContain('TZID:Europe/Zurich');
  });

  it('emite un VEVENT pentru fiecare slujbă', () => {
    const out = ics([zi('2026-09-14', [['07:30', 'Utrenia'], ['08:30', 'Sfânta Liturghie']])]);
    expect(out.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });
});

describe('ora de început și de sfârșit', () => {
  it('scrie DTSTART cu fusul orar local', () => {
    const out = ics([zi('2026-09-20', [['10:00', 'Sfânta Liturghie']])]);
    expect(out).toContain('DTSTART;TZID=Europe/Zurich:20260920T100000');
  });

  it('completează ora cu zero la început', () => {
    const out = ics([zi('2026-09-14', [['7:30', 'Utrenia']])]);
    expect(out).toContain('DTSTART;TZID=Europe/Zurich:20260914T073000');
  });

  it('termină o slujbă când începe următoarea din aceeași zi', () => {
    const out = ics([zi('2026-09-16', [['17:00', 'Spovedanie'], ['18:30', 'Acatist']])]);
    expect(out).toContain('DTEND;TZID=Europe/Zurich:20260916T183000');
  });

  it('dă ultimei slujbe din zi durata implicită de 90 de minute', () => {
    const out = ics([zi('2026-09-20', [['10:00', 'Sfânta Liturghie']])]);
    expect(out).toContain('DTEND;TZID=Europe/Zurich:20260920T113000');
  });
});

describe('UID', () => {
  it('derivă UID din dată, oră și numele slujbei, nu din poziție', () => {
    const out = ics([zi('2026-09-14', [['07:30', 'Utrenia']])]);
    expect(out).toContain('UID:20260914T0730-utrenia@bor-zh.ch');
  });

  it('păstrează UID-urile stabile când se inserează o slujbă mai devreme', () => {
    const inainte = ics([zi('2026-09-14', [['08:30', 'Sfânta Liturghie']])]);
    const dupa = ics([zi('2026-09-14', [['07:30', 'Utrenia'], ['08:30', 'Sfânta Liturghie']])]);
    expect(inainte).toContain('UID:20260914T0830-sfanta-liturghie@bor-zh.ch');
    expect(dupa).toContain('UID:20260914T0830-sfanta-liturghie@bor-zh.ch');
  });

  it('dă UID-uri distincte la două slujbe care încep la aceeași oră', () => {
    // Spovedanie în timpul Vecerniei — o seară obișnuită de parohie.
    const out = ics([zi('2026-09-19', [['17:00', 'Spovedanie'], ['17:00', 'Vecernie']])]);
    const uids = [...out.matchAll(/UID:(\S+)/g)].map((m) => m[1]);
    expect(uids).toHaveLength(2);
    expect(new Set(uids).size).toBe(2);
  });

  it('pliază diacriticele în slug, nu le șterge', () => {
    const a = ics([zi('2026-09-20', [['10:00', 'Sfânta Liturghie']])]);
    expect(a).toContain('-sfanta-liturghie@bor-zh.ch');
  });

  it('niciun nume de slujbă nu produce un UID care se împăturește', () => {
    // Asserted against NUME_SLUJBE, not against today's longest name, so adding
    // a longer service in future fails here instead of quietly folding a UID.
    for (const nume of NUME_SLUJBE) {
      const out = ics([zi('2026-09-20', [['10:00', nume]], {
        slujbe: [{ ora: '10:00', slujba: nume, detaliu: nume === 'Altceva' ? 'Cerc biblic' : undefined }],
      })]);
      for (const linie of out.split('\r\n')) {
        if (linie.startsWith('UID:')) {
          expect(new TextEncoder().encode(linie).length).toBeLessThanOrEqual(75);
        }
      }
      expect(out).not.toMatch(/UID:[^\r\n]*\r\n /);
    }
  });
});

describe('conținut', () => {
  it('pune numele slujbei în SUMMARY', () => {
    const out = ics([zi('2026-09-20', [['10:00', 'Sfânta Liturghie']])]);
    expect(out).toContain('SUMMARY:Sfânta Liturghie');
  });

  it('adaugă detaliul la SUMMARY', () => {
    const z = zi('2026-09-20', [['10:00', 'Sfânta Liturghie']]);
    z.slujbe[0].detaliu = 'și Parastas';
    expect(ics([z])).toContain('SUMMARY:Sfânta Liturghie și Parastas');
  });

  it('nu scrie niciodată cuvântul „Altceva" în SUMMARY', () => {
    const z = zi('2026-09-20', [['19:00', 'Altceva']]);
    z.slujbe[0].detaliu = 'Cerc de studiu biblic';
    const out = ics([z]);
    expect(out).toContain('SUMMARY:Cerc de studiu biblic');
    expect(out).not.toContain('Altceva');
  });

  it('pune praznicul în DESCRIPTION', () => {
    const z = zi('2026-09-14', [['08:30', 'Sfânta Liturghie']], {
      praznic: 'Înălțarea Sfintei Cruci',
      zi_de_post: true,
    });
    const out = ics([z]);
    expect(out).toContain('Înălțarea Sfintei Cruci');
    expect(out).toContain('zi de post');
  });

  it('marchează zilele anulate în loc să le omită', () => {
    const z = zi('2026-09-16', [['18:30', 'Acatist']], { anulat: true });
    expect(ics([z])).toContain('STATUS:CANCELLED');
  });
});

describe('escaping și folding', () => {
  it('escapează virgule, punct-virgule și backslash', () => {
    const z = zi('2026-09-20', [['10:00', 'Altceva']], { praznic: 'Unu, doi; trei\\patru' });
    const out = ics([z]);
    expect(out).toContain('Unu\\, doi\\; trei\\\\patru');
  });

  it('transformă newline-urile în \\n literal', () => {
    const z = zi('2026-09-20', [['10:00', 'Altceva']], { note: 'rândul unu\nrândul doi' });
    expect(ics([z])).toContain('rândul unu\\nrândul doi');
  });

  it('nu depășește 75 de octeți pe linie, nici cu diacritice', () => {
    const z = zi('2026-09-14', [['08:30', 'Sfânta Liturghie']], {
      praznic: 'Înălțarea Sfintei Cruci și pomenirea tuturor sfinților părinți români '
        + 'care au strălucit în credință de-a lungul veacurilor în Țara Românească',
    });
    const linii = ics([z]).split('\r\n');
    for (const linie of linii) {
      expect(new TextEncoder().encode(linie).length).toBeLessThanOrEqual(75);
    }
  });

  it('continuă liniile împăturite cu un spațiu', () => {
    const z = zi('2026-09-14', [['08:30', 'Sfânta Liturghie']], {
      praznic: 'x'.repeat(200),
    });
    const linii = ics([z]).split('\r\n');
    const continuari = linii.filter((l) => l.startsWith(' '));
    expect(continuari.length).toBeGreaterThan(0);
  });

  it('nu rupe un caracter multi-octet în două linii', () => {
    const z = zi('2026-09-14', [['08:30', 'Sfânta Liturghie']], {
      praznic: 'ă'.repeat(120),
    });
    const out = ics([z]);
    // If a fold split a 2-byte character, re-joining would not round-trip.
    const dezimpaturit = out.replace(/\r\n /g, '');
    expect(dezimpaturit).toContain('ă'.repeat(120));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run src/lib/ics.test.ts`
Expected: FAIL — `Failed to resolve import "./ics"`.

- [ ] **Step 3: Implement**

Create `web/src/lib/ics.ts`:

```typescript
import { etichetaSlujba, inainte, minute } from './schedule';
import type { Slujba, ZiSlujba } from './schema';
import { adaugaZile } from './week';

const CRLF = '\r\n';
const DURATA_IMPLICITA = 90; // minutes, for the last service of a day

/** RFC 5545 §3.3.11 text escaping. Backslash first, or it doubles the others. */
function escapeaza(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * RFC 5545 §3.1 line folding. The limit is 75 *octets*, not characters, and a
 * multi-byte character must not be split across the fold — so we walk the UTF-8
 * encoding and cut on character boundaries.
 */
function impatureste(linie: string): string {
  const enc = new TextEncoder();
  if (enc.encode(linie).length <= 75) return linie;

  const bucati: string[] = [];
  let curenta = '';
  let octeti = 0;

  for (const ch of linie) {
    const n = enc.encode(ch).length;
    if (octeti + n > 75) {
      bucati.push(curenta);
      curenta = ch;
      octeti = n + 1; // the leading space on a continuation line counts
    } else {
      curenta += ch;
      octeti += n;
    }
  }
  bucati.push(curenta);
  return bucati.join(`${CRLF} `);
}

/**
 * ASCII slug of the service name, for the UID.
 *
 * Diacritics are FOLDED (Sfânta -> sfanta), which deliberately maps a name and
 * its unaccented spelling to the same slug. That is the right trade: an ASCII
 * slug is stable however the YAML is normalised, readable inside a UID, and safe
 * in every client. Distinguishing Sfânta from Sfanta is not a property anyone
 * should want — they are the same service, one of them misspelled.
 *
 * What actually prevents two different services colliding is Task 4's schema:
 * NUME_SLUJBE is a closed list, and no day may carry the same `slujba` twice at
 * the same `ora`.
 *
 * COUPLING: the residual gap is two `Altceva` entries whose `detaliu` values fold
 * to the same slug. The schema rejects those today because both carry
 * slujba: 'Altceva' — but that rejection has been flagged as a narrow
 * over-rejection, so if it is ever relaxed to key on `detaliu`, this slug must
 * join the same key.
 *
 * The 40-character cap is LOAD-BEARING. The longest name in NUME_SLUJBE,
 * "Liturghia Darurilor mai înainte sfințite", yields a 40-character slug and a
 * 68-octet UID line, which keeps UIDs under the 75-octet fold. A folded UID would
 * break clients and silently break the /UID:(\S+)/ assertions. A test asserts this
 * against NUME_SLUJBE itself, so adding a longer service name fails loudly.
 */
function slugSlujba(s: Slujba): string {
  const nume = s.slujba === 'Altceva' ? (s.detaliu ?? '') : s.slujba;
  return nume
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 40) || 'slujba';
}

function laOraIcs(ora: string): string {
  const [h, m] = ora.split(':');
  return `${h.padStart(2, '0')}${m}00`;
}

function laDataIcs(data: string): string {
  return data.replace(/-/g, '');
}

function adaugaMinute(data: string, ora: string, n: number): { data: string; ora: string } {
  const total = minute(ora) + n;
  const zileInPlus = Math.floor(total / 1440);
  const ramas = ((total % 1440) + 1440) % 1440;
  const h = String(Math.floor(ramas / 60)).padStart(2, '0');
  const m = String(ramas % 60).padStart(2, '0');
  if (zileInPlus === 0) return { data, ora: `${h}:${m}` };
  // adaugaZile, not a third hand-rolled Date path. partiData is the one parser
  // and adaugaZile the one arithmetic; both are tested far harder than anything
  // inlined here, and an unvalidated third path is how 30 February got through.
  return { data: adaugaZile(data, zileInPlus), ora: `${h}:${m}` };
}

const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Zurich',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

export function genereazaIcs(
  zile: ZiSlujba[],
  opts: { dtstamp: string; locatie: string },
): string {
  const linii: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Parohia Ortodoxa Romana Sfantul Nicolae Zurich//Program//RO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Program liturgic — Sfântul Nicolae Zürich',
    'X-WR-TIMEZONE:Europe/Zurich',
    ...VTIMEZONE,
  ];

  // `inainte`, not localeCompare: ICU collation varies between Node builds and
  // treats hyphens as variable-weight. schedule.ts exports one comparison
  // semantics for these strings; this module uses it rather than a second.
  const sortate = [...zile].sort(inainte);

  for (const z of sortate) {
    const slujbe = [...z.slujbe].sort((a, b) => minute(a.ora) - minute(b.ora));

    slujbe.forEach((s, i) => {
      // The next service that starts STRICTLY later — not simply the next by
      // index. Two services can share a start time (17:00 Spovedanie during
      // 17:00 Vecernie), and `slujbe[i + 1]` would give the first of them a
      // DTEND equal to its DTSTART. RFC 5545 §3.6.1 requires DTEND to be later
      // than DTSTART, and a zero-length VEVENT renders unpredictably — for a
      // parish, as a service that looks like it is not happening.
      const urmatoarea = slujbe.slice(i + 1).find((u) => minute(u.ora) > minute(s.ora));
      const sfarsit = urmatoarea
        ? { data: z.data, ora: urmatoarea.ora }
        : adaugaMinute(z.data, s.ora, DURATA_IMPLICITA);

      const descriere = [
        z.praznic,
        z.zi_de_post ? 'zi de post' : undefined,
        z.note,
      ].filter(Boolean).join(' · ');

      linii.push(
        'BEGIN:VEVENT',
        // HHMM, not HHMMSS — laOraIcs returns HHMM00, so the first four suffice.
        // The slug is what keeps two services that share a start time apart:
        // 17:00 Spovedanie and 17:00 Vecernie are one ordinary parish evening,
        // and identical UIDs would make subscribers' calendars merge them.
        `UID:${laDataIcs(z.data)}T${laOraIcs(s.ora).slice(0, 4)}-${slugSlujba(s)}@bor-zh.ch`,
        `DTSTAMP:${opts.dtstamp}`,
        `DTSTART;TZID=Europe/Zurich:${laDataIcs(z.data)}T${laOraIcs(s.ora)}`,
        `DTEND;TZID=Europe/Zurich:${laDataIcs(sfarsit.data)}T${laOraIcs(sfarsit.ora)}`,
        `SUMMARY:${escapeaza(etichetaSlujba(s))}`,
        `LOCATION:${escapeaza(z.locatie || opts.locatie)}`,
      );
      if (descriere) linii.push(`DESCRIPTION:${escapeaza(descriere)}`);
      if (z.anulat) linii.push('STATUS:CANCELLED');
      linii.push('END:VEVENT');
    });
  }

  linii.push('END:VCALENDAR');

  // Fold once, uniformly, at the end. Folding as lines are pushed would leave
  // the header lines unfolded and make the 75-octet guarantee depend on nobody
  // ever lengthening X-WR-CALNAME. No raw line contains CRLF at this point,
  // because escapeaza has already turned newlines into a literal \n.
  return linii.map(impatureste).join(CRLF) + CRLF;
}
```

- [ ] **Step 4: Run tests**

Run: `cd web && npx vitest run src/lib/ics.test.ts`
Expected: PASS, 20 tests.

- [ ] **Step 5: Verify against a real calendar client**

Passing tests prove the bytes are right; only a calendar application proves the file is *usable*. Add this test temporarily at the end of `src/lib/ics.test.ts`:

```typescript
import { writeFileSync } from 'node:fs';

it('scrie un fișier de probă pentru verificare manuală', () => {
  const z = zi('2026-09-14', [['07:30', 'Utrenia'], ['08:30', 'Sfânta Liturghie']], {
    praznic: 'Înălțarea Sfintei Cruci',
    praznic_mare: true,
    zi_de_post: true,
  });
  writeFileSync('/tmp/proba.ics', genereazaIcs([z], opts));
});
```

Run: `cd web && npx vitest run src/lib/ics.test.ts && open /tmp/proba.ics`

Expected: macOS Calendar offers to import two events on 14 September 2026, at 07:30 and 08:30, titled `Utrenia` and `Sfânta Liturghie`, with `Înălțarea Sfintei Cruci · zi de post` in the notes and correct diacritics throughout.

Then delete that test — it writes a file and asserts nothing, so it does not belong in the suite.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ics.ts src/lib/ics.test.ts
git commit -m "feat: RFC 5545 calendar feed with octet-safe folding

UIDs derive from date and time rather than list position, so inserting an
earlier service does not churn every subscriber's calendar."
```

---

### Task 7: Design tokens, contrast enforcement, and the base layout

**Files:**
- Create: `web/src/lib/contrast.ts`, `web/src/lib/tokens.ts`, `web/src/styles/global.css`, `web/src/layouts/Base.astro`, `web/src/components/SiteHeader.astro`, `web/src/components/SiteFooter.astro`
- Test: `web/src/lib/contrast.test.ts`, `web/src/lib/tokens.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `raportContrast(a: string, b: string): number` — WCAG 2.1 contrast ratio between two hex colours.
  - `PALETA: Record<string, string>` — the hex values.
  - `ROLURI_TEXT: readonly string[]` — token names permitted for text.
  - `Base.astro` — props `{ titlu: string; descriere?: string }`, renders `<slot />`.

The contrast test is not ceremony. The approved mockups used `#B08B3E` for service times, which is 2.95:1 and fails WCAG AA at every size. This test is what stops that colour coming back.

- [ ] **Step 1: Write the failing contrast test**

Create `web/src/lib/contrast.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { raportContrast } from './contrast';

describe('raportContrast', () => {
  it('dă 21 pentru negru pe alb', () => {
    expect(raportContrast('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
  });

  it('dă 1 pentru o culoare cu ea însăși', () => {
    expect(raportContrast('#6B1F26', '#6B1F26')).toBeCloseTo(1, 5);
  });

  it('este simetric', () => {
    expect(raportContrast('#6B1F26', '#FAF6EE'))
      .toBeCloseTo(raportContrast('#FAF6EE', '#6B1F26'), 5);
  });

  it('acceptă hex scurt', () => {
    expect(raportContrast('#000', '#fff')).toBeCloseTo(21, 1);
  });

  it('confirmă că aurul ornamental pică testul', () => {
    expect(raportContrast('#B08B3E', '#FAF6EE')).toBeLessThan(3);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run src/lib/contrast.test.ts`
Expected: FAIL — `Failed to resolve import "./contrast"`.

- [ ] **Step 3: Implement contrast**

Create `web/src/lib/contrast.ts`:

```typescript
function canale(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`Culoare invalidă: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
}

/** WCAG 2.1 relative luminance. */
function luminanta(hex: string): number {
  const [r, g, b] = canale(hex).map((c) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function raportContrast(a: string, b: string): number {
  const la = luminanta(a);
  const lb = luminanta(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
```

- [ ] **Step 4: Run the contrast test**

Run: `cd web && npx vitest run src/lib/contrast.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the failing tokens test**

Create `web/src/lib/tokens.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { raportContrast } from './contrast';
import { PALETA, ROLURI_TEXT, cssTokens } from './tokens';

describe('paleta', () => {
  it('folosește valorile din specificație', () => {
    expect(PALETA.parchment).toBe('#FAF6EE');
    expect(PALETA.oxblood).toBe('#6B1F26');
    expect(PALETA['gold-text']).toBe('#8A6A28');
    expect(PALETA.gold).toBe('#B08B3E');
  });
});

describe('contrast pe fundalul de pergament', () => {
  it.each(ROLURI_TEXT)('%s trece WCAG AA pentru text normal', (rol) => {
    expect(raportContrast(PALETA[rol], PALETA.parchment)).toBeGreaterThanOrEqual(4.5);
  });

  it('aurul ornamental nu este trecut ca rol de text', () => {
    expect(ROLURI_TEXT).not.toContain('gold');
    expect(ROLURI_TEXT).not.toContain('gold-lt');
  });
});

describe('cssTokens', () => {
  it('emite fiecare culoare ca proprietate personalizată', () => {
    const css = cssTokens();
    expect(css).toContain('--parchment: #FAF6EE;');
    expect(css).toContain('--gold-text: #8A6A28;');
    expect(css.startsWith(':root {')).toBe(true);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `cd web && npx vitest run src/lib/tokens.test.ts`
Expected: FAIL — `Failed to resolve import "./tokens"`.

- [ ] **Step 7: Implement tokens**

Create `web/src/lib/tokens.ts`:

```typescript
export const PALETA: Record<string, string> = {
  parchment: '#FAF6EE',
  raised: '#FFFDF8',
  rule: '#E3D9C6',
  oxblood: '#6B1F26',
  'oxblood-dk': '#54171D',
  'gold-text': '#8A6A28',
  gold: '#B08B3E',
  'gold-lt': '#C8A45C',
  ink: '#2A211C',
  muted: '#6E5C4E',
  faint: '#7E6C52',
};

/**
 * Tokens allowed for text. `gold` (#B08B3E, 2.95:1) and `gold-lt` are
 * deliberately absent: they are ornament only — hairlines, borders, the ✝ glyph
 * and the feast-row top rule. The approved mockups used `gold` for service
 * times; tokens.test.ts is what stops that regressing.
 */
export const ROLURI_TEXT = ['oxblood', 'oxblood-dk', 'gold-text', 'ink', 'muted', 'faint'] as const;

export function cssTokens(): string {
  const linii = Object.entries(PALETA).map(([k, v]) => `  --${k}: ${v};`);
  return `:root {\n${linii.join('\n')}\n}`;
}
```

- [ ] **Step 8: Run the tokens test**

Run: `cd web && npx vitest run src/lib/tokens.test.ts`
Expected: PASS, 9 tests (6 parameterised contrast cases plus 3).

- [ ] **Step 9: Write the stylesheet**

Create `web/src/styles/global.css`. The `:root` block is transcribed from `cssTokens()` — the test guarantees they agree in value.

```css
@import '@fontsource/cormorant-garamond/latin-400.css';
@import '@fontsource/cormorant-garamond/latin-600.css';
@import '@fontsource/cormorant-garamond/latin-ext-400.css';
@import '@fontsource/cormorant-garamond/latin-ext-600.css';
@import '@fontsource/spectral/latin-300.css';
@import '@fontsource/spectral/latin-400.css';
@import '@fontsource/spectral/latin-ext-300.css';
@import '@fontsource/spectral/latin-ext-400.css';

:root {
  --parchment: #FAF6EE;
  --raised: #FFFDF8;
  --rule: #E3D9C6;
  --oxblood: #6B1F26;
  --oxblood-dk: #54171D;
  --gold-text: #8A6A28;
  --gold: #B08B3E;
  --gold-lt: #C8A45C;
  --ink: #2A211C;
  --muted: #6E5C4E;
  --faint: #7E6C52;

  --display: 'Cormorant Garamond', Georgia, serif;
  --body: 'Spectral', Georgia, serif;
  --gutter: clamp(1rem, 4vw, 2.25rem);
  --masura: 68ch;
}

*, *::before, *::after { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--parchment);
  color: var(--ink);
  font-family: var(--body);
  font-weight: 400;
  font-size: clamp(1rem, 0.96rem + 0.2vw, 1.0625rem);
  line-height: 1.65;
  -webkit-text-size-adjust: 100%;
}

h1, h2, h3, h4 {
  font-family: var(--display);
  font-weight: 600;
  line-height: 1.12;
  margin: 0 0 0.5rem;
  color: var(--oxblood);
}

a { color: var(--gold-text); }
a:hover { color: var(--oxblood-dk); }

img { max-width: 100%; height: auto; display: block; }

.container {
  max-width: 68rem;
  margin-inline: auto;
  padding-inline: var(--gutter);
}

.eyebrow {
  font-size: 0.6875rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--faint);
}

/* The ornament rule. --gold-lt may be used here because it is not text. */
.rule { border: 0; border-top: 1px solid var(--rule); margin: 1.5rem 0; }

.skip-link {
  position: absolute;
  left: -9999px;
}
.skip-link:focus {
  left: var(--gutter);
  top: 0.5rem;
  background: var(--oxblood);
  color: var(--parchment);
  padding: 0.5rem 1rem;
  z-index: 10;
}

:where(a, button, [tabindex]):focus-visible {
  outline: 2px solid var(--oxblood);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
```

- [ ] **Step 10: Write the base layout, header and footer**

Create `web/src/layouts/Base.astro`:

```astro
---
import '../styles/global.css';
import SiteHeader from '../components/SiteHeader.astro';
import SiteFooter from '../components/SiteFooter.astro';

interface Props {
  titlu: string;
  descriere?: string;
}

const { titlu, descriere = 'Parohia Ortodoxă Română Sfântul Nicolae din Zürich — program liturgic, noutăți și informații parohiale.' } = Astro.props;
---

<!doctype html>
<html lang="ro">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>{titlu} · Parohia Sfântul Nicolae Zürich</title>
    <meta name="description" content={descriere} />
    <link rel="canonical" href={new URL(Astro.url.pathname, Astro.site)} />
    <link rel="alternate" type="text/calendar" href="/program.ics" title="Program liturgic" />
  </head>
  <body>
    <a class="skip-link" href="#continut">Sari la conținut</a>
    <SiteHeader />
    <main id="continut">
      <slot />
    </main>
    <SiteFooter />
  </body>
</html>
```

Create `web/src/components/SiteHeader.astro`:

```astro
---
const cale = Astro.url.pathname;
const linkuri = [
  { href: '/', text: 'Acasă' },
  { href: '/program/', text: 'Program' },
];
---

<header class="sh">
  <div class="container sh-in">
    <a class="sh-brand" href="/">
      <span class="sh-cross" aria-hidden="true">✝</span>
      <span class="sh-wm">
        <b>Sfântul Nicolae</b>
        <span>Parohia Ortodoxă Română · Zürich</span>
      </span>
    </a>
    <nav aria-label="Navigare principală">
      <ul class="sh-nav">
        {linkuri.map((l) => (
          <li>
            <a href={l.href} aria-current={cale === l.href ? 'page' : undefined}>{l.text}</a>
          </li>
        ))}
      </ul>
    </nav>
  </div>
</header>

<style>
  .sh { border-bottom: 1px solid var(--rule); }
  .sh-in { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding-block: 0.75rem; flex-wrap: wrap; }
  .sh-brand { display: flex; align-items: center; gap: 0.625rem; text-decoration: none; }
  .sh-cross { color: var(--gold-lt); font-size: 1.5rem; line-height: 1; }
  .sh-wm b { display: block; font-family: var(--display); font-size: 1.125rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--oxblood); line-height: 1.1; }
  .sh-wm > span { display: block; font-size: 0.625rem; letter-spacing: 0.18em; text-transform: uppercase; color: var(--faint); margin-top: 0.15rem; }
  .sh-nav { display: flex; gap: 1.25rem; list-style: none; margin: 0; padding: 0; font-size: 0.875rem; }
  .sh-nav a { color: var(--muted); text-decoration: none; }
  .sh-nav a[aria-current='page'] { color: var(--oxblood); border-bottom: 1.5px solid var(--gold-lt); padding-bottom: 2px; }
</style>
```

Create `web/src/components/SiteFooter.astro`:

```astro
---
// Contact details are hardcoded in Phase 1 and move to a CMS-editable
// settings singleton in Phase 2 (spec §6.7). The live site's footer currently
// shows `info@website.com` and a French phone number, both Athos theme demo
// leftovers — they are deliberately not carried over.
---

<footer class="sf">
  <div class="container sf-in">
    <div>
      <p class="eyebrow">Unde ne găsiți</p>
      <p>Capela Sf. Katharina<br />Wehntalerstrasse 451, 8046 Zürich</p>
    </div>
    <div>
      <p class="eyebrow">Contact</p>
      <p>
        <a href="tel:+41765120452">076 512 04 52</a><br />
        <a href="/program/">Program liturgic</a>
      </p>
    </div>
    <div>
      <p class="eyebrow">Calendar</p>
      <p><a href="/program.ics">Abonare la program (.ics)</a></p>
    </div>
  </div>
</footer>

<style>
  .sf { border-top: 1px solid var(--rule); background: var(--raised); margin-top: 3rem; }
  .sf-in { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: 1.5rem; padding-block: 2rem; }
  .sf p { margin: 0.35rem 0 0; font-size: 0.875rem; color: var(--muted); }
</style>
```

- [ ] **Step 11: Verify the build and the diacritics**

Run: `cd web && npm test && npm run build && ls dist/_astro/*.woff2 | head -5`
Expected: all tests pass; the build emits woff2 files including `latin-ext` variants.

Then run `npm run dev` and open `http://localhost:4321/`. Confirm by eye that the header renders `Sfântul Nicolae` with **â** and that no glyph shows as a box. The reference string for the full check, used again in Task 8: `Înălțarea Sfintei Cruci · Sfânta Liturghie · Duminică · Spovedanie · Sâmbătă`.

- [ ] **Step 12: Commit**

```bash
git add src/lib/contrast.ts src/lib/contrast.test.ts src/lib/tokens.ts src/lib/tokens.test.ts src/styles/global.css src/layouts/Base.astro src/components/SiteHeader.astro src/components/SiteFooter.astro
git commit -m "feat: design tokens with CI-enforced contrast, base layout

Text-role tokens are asserted at 4.5:1 against the parchment ground. The
ornamental gold from the mockups (2.95:1) is excluded from text roles."
```

---

### Task 8: The /program page

**Files:**
- Create: `web/src/components/RandZi.astro`, `web/src/pages/program/index.astro`

**Interfaces:**
- Consumes: `getCollection('slujbe')`; `grupeazaPeSaptamani`, `saptamaniViitoare` from `lib/schedule`; `aziLaZurich` from `lib/week`; `formatIntervalSaptamana`, `numeZi`, `numeLuna`, `ziuaDinLuna` from `lib/date-ro`.
- Produces: `RandZi.astro` with props `{ zi: ZiSlujba }`. Each week section carries `data-saptamana={cheie}` — Task 10's script depends on that attribute name.

- [ ] **Step 1: Write the day row component**

Create `web/src/components/RandZi.astro`:

```astro
---
import type { ZiSlujba } from '../lib/schema';
import { numeLuna, numeZi, ziuaDinLuna } from '../lib/date-ro';
import { etichetaSlujba } from '../lib/schedule';

interface Props { zi: ZiSlujba }
const { zi } = Astro.props;
const praznic = Boolean(zi.praznic_mare || zi.praznic);
---

<div class:list={['rz', praznic && 'rz-praznic', zi.anulat && 'rz-anulat']}>
  <div class="rz-data">
    <span class="rz-zi">{numeZi(zi.data)}</span>
    <span class="rz-nr">{ziuaDinLuna(zi.data)}</span>
    <span class="rz-luna">{numeLuna(zi.data)}</span>
  </div>
  <div>
    {zi.anulat && <p class="rz-anulat-txt">Slujbele acestei zile sunt anulate.</p>}
    {zi.slujbe.map((s) => (
      <div class="rz-slujba">
        <b>{s.ora}</b>
        <span>{etichetaSlujba(s)}</span>
      </div>
    ))}
    {zi.praznic && (
      <p class="rz-praznic-txt">
        {zi.praznic_mare && <span aria-hidden="true">† </span>}{zi.praznic}
        {zi.zi_de_post && <span class="rz-post">Zi de post</span>}
      </p>
    )}
    {!zi.praznic && zi.zi_de_post && <p class="rz-praznic-txt"><span class="rz-post">Zi de post</span></p>}
    {zi.note && <p class="rz-note">{zi.note}</p>}
  </div>
</div>

<style>
  .rz { display: grid; grid-template-columns: 7rem 1fr; gap: 1.25rem; padding-block: 1rem; border-bottom: 1px solid var(--rule); }
  /* Feast days are marked by background AND a rule, never by colour alone. */
  .rz-praznic { background: linear-gradient(90deg, var(--raised) 0%, transparent 70%); box-shadow: inset 0 2px 0 var(--gold-lt); }
  .rz-anulat { opacity: 0.75; }
  .rz-zi { display: block; font-family: var(--display); font-size: 0.6875rem; letter-spacing: 0.2em; text-transform: uppercase; color: var(--faint); }
  .rz-nr { display: block; font-family: var(--display); font-size: 1.875rem; line-height: 1.05; color: var(--ink); }
  .rz-luna { display: block; font-size: 0.6875rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--faint); }
  .rz-slujba { display: grid; grid-template-columns: 3.5rem 1fr; gap: 0.75rem; padding-block: 0.15rem; align-items: baseline; }
  .rz-slujba b { font-family: var(--display); font-size: 1.0625rem; font-weight: 600; color: var(--gold-text); }
  .rz-praznic-txt { font-family: var(--display); font-style: italic; font-size: 1.0625rem; color: var(--oxblood); margin: 0.5rem 0 0; }
  .rz-post { display: inline-block; font-family: var(--body); font-style: normal; font-size: 0.625rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--oxblood); border: 1px solid var(--rule); padding: 0.05rem 0.4rem; margin-left: 0.5rem; vertical-align: middle; }
  .rz-note, .rz-anulat-txt { font-size: 0.875rem; color: var(--muted); margin: 0.4rem 0 0; }
  @media (max-width: 34rem) {
    .rz { grid-template-columns: 4rem 1fr; gap: 0.75rem; }
    .rz-luna { display: none; }
  }
</style>
```

- [ ] **Step 2: Write the page**

Create `web/src/pages/program/index.astro`:

```astro
---
import { getCollection } from 'astro:content';
import Base from '../../layouts/Base.astro';
import RandZi from '../../components/RandZi.astro';
import { formatIntervalSaptamana } from '../../lib/date-ro';
import { grupeazaPeSaptamani } from '../../lib/schedule';
import { aziLaZurich, inceputSaptamana } from '../../lib/week';

const intrari = await getCollection('slujbe');
const zile = intrari.map((e) => ({ ...e.data, data: e.id }));

const lunea = inceputSaptamana(aziLaZurich());
const saptamani = grupeazaPeSaptamani(zile).filter((s) => s.duminica >= lunea);
---

<Base titlu="Program liturgic" descriere="Programul slujbelor la Parohia Ortodoxă Română Sfântul Nicolae din Zürich.">
  <div class="container">
    <p class="eyebrow" style="margin-top:2rem">Informații parohiale</p>
    <h1>Program liturgic</h1>

    {saptamani.length === 0 ? (
      <p class="gol">Programul următoarei perioade nu a fost încă publicat.</p>
    ) : (
      saptamani.map((s) => (
        <section data-saptamana={s.cheie} aria-label={`Săptămâna ${formatIntervalSaptamana(s.luni, s.duminica)}`}>
          <h2 class="sapt">{formatIntervalSaptamana(s.luni, s.duminica)}</h2>
          {s.zile.map((z) => <RandZi zi={z} />)}
        </section>
      ))
    )}

    <p class="abonare"><a href="/program.ics">✝ Adaugă programul în calendarul telefonului</a></p>
  </div>
</Base>

<style>
  .sapt { font-size: 1.375rem; margin-block: 2rem 0.75rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--rule); }
  .gol { color: var(--muted); font-style: italic; }
  .abonare { margin-block: 2rem; }
  .abonare a { display: inline-block; border: 1px solid var(--gold-lt); color: var(--oxblood); text-decoration: none; font-size: 0.8125rem; letter-spacing: 0.1em; text-transform: uppercase; padding: 0.75rem 1.25rem; }
</style>
```

- [ ] **Step 3: Verify**

Every week is visible at this point; Task 10 adds the week selector that narrows it to one. That order is deliberate — the page must be correct and complete *before* JavaScript is introduced, because that no-JS rendering is the baseline the site guarantees.

Run: `cd web && npm run build && npm run preview` and open `/program/`.
Expected: the five seeded days render, 14 September shows the gold top rule, the `† Înălțarea Sfintei Cruci` line and the `Zi de post` tag. Check the page at 375px width — the month name hides and the layout does not scroll horizontally.

Confirm diacritics with the reference string from Task 7: `Înălțarea`, `Sfânta`, `Duminică`, `Sâmbătă` all render without boxes.

- [ ] **Step 4: Commit**

```bash
git add src/components/RandZi.astro src/pages/program/index.astro
git commit -m "feat: /program page with feast and fast-day marking"
```

---

### Task 9: The program-first homepage

**Files:**
- Create: `web/src/components/BandaSaptamanii.astro`
- Modify: `web/src/pages/index.astro` (replace the scaffold contents entirely)

**Interfaces:**
- Consumes: the same helpers as Task 8, plus `urmatoareaSlujba` from `lib/schedule`.
- Produces: `BandaSaptamanii.astro` with props `{ saptamana: Saptamana }`. The homepage renders **three** weeks, each in a `<section data-saptamana>`.

Three weeks, not the full window: the homepage has a 30 KB HTML budget (Global Constraints) and three weeks is roughly 3 KB. `/program` carries the full list.

- [ ] **Step 1: Write the week band**

Create `web/src/components/BandaSaptamanii.astro`:

```astro
---
import type { Saptamana } from '../lib/schedule';
import { etichetaSlujba } from '../lib/schedule';
import { numeZi, ziuaDinLuna } from '../lib/date-ro';

interface Props { saptamana: Saptamana }
const { saptamana } = Astro.props;
---

<div class="bs">
  {saptamana.zile.map((z) => (
    <div class:list={['bs-zi', (z.praznic_mare || z.praznic) && 'bs-praznic']}>
      <div class="bs-cap">
        <span class="bs-nume">{numeZi(z.data)}</span>
        <span class="bs-nr">{ziuaDinLuna(z.data)}</span>
      </div>
      {z.anulat ? (
        <p class="bs-anulat">Anulat</p>
      ) : (
        z.slujbe.map((s) => (
          <p class="bs-slujba"><b>{s.ora}</b>{etichetaSlujba(s)}</p>
        ))
      )}
      {z.praznic && <p class="bs-praznic-txt">{z.praznic_mare && <span aria-hidden="true">† </span>}{z.praznic}</p>}
      {z.zi_de_post && <p class="bs-post">Zi de post</p>}
    </div>
  ))}
</div>

<style>
  .bs { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); border-top: 1px solid var(--rule); }
  .bs-zi { padding: 0.875rem 0.875rem 1.125rem; border-right: 1px solid var(--rule); border-bottom: 1px solid var(--rule); }
  .bs-praznic { background: var(--raised); box-shadow: inset 0 2px 0 var(--gold-lt); }
  .bs-nume { font-family: var(--display); font-size: 0.625rem; letter-spacing: 0.18em; text-transform: uppercase; color: var(--faint); display: block; }
  .bs-nr { font-family: var(--display); font-size: 1.5rem; line-height: 1.05; color: var(--oxblood); display: block; margin-bottom: 0.4rem; }
  .bs-slujba { margin: 0; font-size: 0.8125rem; line-height: 1.5; }
  .bs-slujba b { color: var(--gold-text); font-weight: 600; margin-right: 0.4rem; }
  .bs-praznic-txt { font-family: var(--display); font-style: italic; font-size: 0.8125rem; color: var(--oxblood); margin: 0.4rem 0 0; }
  .bs-post { font-size: 0.5625rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--oxblood); border: 1px solid var(--rule); padding: 0.05rem 0.35rem; display: inline-block; margin: 0.4rem 0 0; }
  .bs-anulat { margin: 0; font-size: 0.8125rem; color: var(--muted); font-style: italic; }
</style>
```

- [ ] **Step 2: Write the homepage**

Replace `web/src/pages/index.astro` entirely:

```astro
---
import { getCollection } from 'astro:content';
import Base from '../layouts/Base.astro';
import BandaSaptamanii from '../components/BandaSaptamanii.astro';
import { formatIntervalSaptamana, numeLuna, numeZi, ziuaDinLuna } from '../lib/date-ro';
import { etichetaSlujba, saptamaniViitoare, urmatoareaSlujba } from '../lib/schedule';
import { aziLaZurich, oraLaZurich } from '../lib/week';

const intrari = await getCollection('slujbe');
const zile = intrari.map((e) => ({ ...e.data, data: e.id }));

const azi = aziLaZurich();
const saptamani = saptamaniViitoare(zile, azi, 3);
const urmatoarea = urmatoareaSlujba(zile, azi, oraLaZurich());
---

<Base titlu="Bine ați venit">
  <section class="hero">
    <div class="container hero-in">
      <p class="hero-kick">Wehntalerstrasse 451 · 8046 Zürich</p>
      <h1>Bine ați venit în casa Domnului</h1>
      <p class="hero-verset">„Căutați mai întâi împărăția lui Dumnezeu și dreptatea Lui” — Matei 6:33</p>
    </div>
  </section>

  <div class="container">
    {urmatoarea && (
      <p class="urm">
        <span class="eyebrow">Următoarea slujbă</span>
        <b>{numeZi(urmatoarea.data)}, {ziuaDinLuna(urmatoarea.data)} {numeLuna(urmatoarea.data)}</b>
        <span>{urmatoarea.ora} — {etichetaSlujba(urmatoarea)}</span>
      </p>
    )}

    <h2 class="titlu-sect">Programul săptămânii</h2>

    {saptamani.length === 0 ? (
      <p class="gol">Programul următoarei perioade nu a fost încă publicat. <a href="/program/">Vezi programul complet</a>.</p>
    ) : (
      saptamani.map((s) => (
        <section data-saptamana={s.cheie} aria-label={`Săptămâna ${formatIntervalSaptamana(s.luni, s.duminica)}`}>
          <p class="interval">{formatIntervalSaptamana(s.luni, s.duminica)}</p>
          <BandaSaptamanii saptamana={s} />
        </section>
      ))
    )}

    <p class="tot"><a href="/program/">Programul complet →</a></p>
  </div>
</Base>

<style>
  .hero { background: var(--oxblood); color: var(--parchment); }
  .hero-in { padding-block: clamp(2.5rem, 7vw, 4.5rem); }
  .hero-kick { font-size: 0.625rem; letter-spacing: 0.28em; text-transform: uppercase; color: var(--gold-lt); margin: 0 0 0.75rem; }
  .hero h1 { color: var(--parchment); font-size: clamp(1.875rem, 5vw, 2.75rem); font-weight: 500; }
  .hero-verset { font-style: italic; color: #E4D7C4; max-width: var(--masura); margin: 0.75rem 0 0; }
  .urm { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.35rem 1rem; border: 1px solid var(--gold-lt); background: var(--raised); padding: 1rem 1.25rem; margin-block: 1.75rem 0; }
  .urm b { font-family: var(--display); font-size: 1.25rem; color: var(--oxblood); }
  .urm > span:last-child { color: var(--muted); }
  .titlu-sect { font-size: 1.375rem; margin-block: 2rem 0.25rem; }
  .interval { font-family: var(--display); font-size: 1.0625rem; color: var(--faint); margin: 0 0 0.75rem; }
  .gol { color: var(--muted); font-style: italic; }
  .tot { margin-block: 1.75rem 0; }
</style>
```

- [ ] **Step 3: Verify**

Run: `cd web && npm run build && npm run preview`
Expected: the homepage shows the hero, the "Următoarea slujbă" card and the week band for 14–20 September, with 14 September marked as a feast. At 375px the band stacks to one column per day and does not scroll sideways.

Check the HTML budget now, before Task 13 automates it:

Run: `cd web && wc -c dist/index.html`
Expected: under 46,080 bytes. The stylesheet is inlined into the document by `inlineStylesheets: 'always'`, so this one number covers both the HTML and CSS budgets from spec §13.

- [ ] **Step 4: Commit**

```bash
git add src/components/BandaSaptamanii.astro src/pages/index.astro
git commit -m "feat: program-first homepage with next-service card"
```

---

### Task 10: Week selection without a rebuild

**Files:**
- Create: `web/src/lib/week-picker.ts`, `web/src/components/SelectorSaptamana.astro`
- Test: `web/src/lib/week-picker.test.ts`
- Modify: `web/src/pages/index.astro`, `web/src/pages/program/index.astro`

**Interfaces:**
- Consumes: `cheieSaptamana`, `aziLaZurich` from `lib/week`.
- Produces: `alegeSaptamana(chei: string[], cheieAzi: string): number` — index of the week to reveal, or `-1` if every week is in the past.

This is the answer to spec §7. The pure decision lives in a tested function; the DOM wiring is short enough to read at a glance. See "Deviations from the spec" for why there is no `date.json`.

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/week-picker.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { alegeSaptamana } from './week-picker';

const chei = ['2026-W38', '2026-W39', '2026-W40'];

describe('alegeSaptamana', () => {
  it('alege săptămâna curentă când există', () => {
    expect(alegeSaptamana(chei, '2026-W39')).toBe(1);
  });

  it('alege prima săptămână viitoare când cea curentă lipsește', () => {
    expect(alegeSaptamana(['2026-W38', '2026-W41'], '2026-W39')).toBe(1);
  });

  it('alege prima săptămână când toate sunt în viitor', () => {
    expect(alegeSaptamana(chei, '2026-W30')).toBe(0);
  });

  it('întoarce -1 când toate săptămânile sunt în trecut', () => {
    expect(alegeSaptamana(chei, '2026-W45')).toBe(-1);
  });

  it('întoarce -1 pentru o listă goală', () => {
    expect(alegeSaptamana([], '2026-W39')).toBe(-1);
  });

  it('compară corect peste granița de an', () => {
    // String comparison works because the key is zero-padded ISO year + week.
    expect(alegeSaptamana(['2026-W52', '2027-W01'], '2027-W01')).toBe(1);
    expect(alegeSaptamana(['2026-W52', '2027-W01'], '2026-W53')).toBe(1);
  });

  it('compară corect săptămânile cu o cifră', () => {
    expect(alegeSaptamana(['2026-W06', '2026-W10'], '2026-W07')).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run src/lib/week-picker.test.ts`
Expected: FAIL — `Failed to resolve import "./week-picker"`.

- [ ] **Step 3: Implement**

Create `web/src/lib/week-picker.ts`:

```typescript
/**
 * Index of the week to reveal: the one containing today, else the earliest
 * future one, else -1 when every rendered week has passed.
 *
 * Keys are `YYYY-Www` with a zero-padded week number, so lexical comparison is
 * chronological — that is why cheieSaptamana pads.
 */
export function alegeSaptamana(chei: string[], cheieAzi: string): number {
  for (let i = 0; i < chei.length; i += 1) {
    if (chei[i] >= cheieAzi) return i;
  }
  return -1;
}
```

- [ ] **Step 4: Run tests**

Run: `cd web && npx vitest run src/lib/week-picker.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Write the component**

Create `web/src/components/SelectorSaptamana.astro`:

```astro
---
// No props: the component reads the week sections already in the DOM, so it
// cannot fall out of sync with what the page rendered.
---

<div class="ss" hidden>
  <button type="button" data-ss-prev aria-label="Săptămâna precedentă">‹</button>
  <span data-ss-eticheta aria-live="polite"></span>
  <button type="button" data-ss-next aria-label="Săptămâna următoare">›</button>
</div>

<script>
  import { alegeSaptamana } from '../lib/week-picker';
  import { aziLaZurich, cheieSaptamana } from '../lib/week';

  const bara = document.querySelector<HTMLElement>('.ss');
  const sectiuni = [...document.querySelectorAll<HTMLElement>('section[data-saptamana]')];

  if (bara && sectiuni.length > 0) {
    const chei = sectiuni.map((s) => s.dataset.saptamana!);
    const start = alegeSaptamana(chei, cheieSaptamana(aziLaZurich()));

    // Every week stays visible when all of them are in the past, and when
    // JavaScript never runs at all. Hiding is the enhancement, not the baseline.
    if (start !== -1) {
      let i = start;
      const eticheta = bara.querySelector<HTMLElement>('[data-ss-eticheta]')!;
      const prev = bara.querySelector<HTMLButtonElement>('[data-ss-prev]')!;
      const next = bara.querySelector<HTMLButtonElement>('[data-ss-next]')!;

      const arata = () => {
        sectiuni.forEach((s, j) => { s.hidden = j !== i; });
        const titlu = sectiuni[i].getAttribute('aria-label') ?? '';
        eticheta.textContent = titlu.replace(/^Săptămâna\s*/, '');
        prev.disabled = i === 0;
        next.disabled = i === sectiuni.length - 1;
      };

      prev.addEventListener('click', () => { if (i > 0) { i -= 1; arata(); } });
      next.addEventListener('click', () => { if (i < sectiuni.length - 1) { i += 1; arata(); } });

      bara.hidden = false;
      arata();
    }
  }
</script>

<style>
  .ss { display: flex; align-items: center; gap: 1rem; padding-block: 0.75rem; border-bottom: 1px solid var(--rule); }
  .ss span { font-family: var(--display); font-size: 1.125rem; font-weight: 600; color: var(--oxblood); }
  .ss button { background: none; border: 1px solid var(--rule); color: var(--oxblood); font-size: 1rem; line-height: 1; padding: 0.35rem 0.7rem; cursor: pointer; }
  .ss button:disabled { color: var(--rule); cursor: default; }
</style>
```

- [ ] **Step 6: Wire it into both pages**

The component finds the week sections itself via `section[data-saptamana]`, so it takes no props — it only needs to be placed above them.

In `web/src/pages/program/index.astro`, add the import after the `RandZi` import:

```astro
import SelectorSaptamana from '../../components/SelectorSaptamana.astro';
```

and insert the component immediately before the `saptamani.map(...)` block, changing:

```astro
    ) : (
      saptamani.map((s) => (
```

to:

```astro
    ) : (
      <>
        <SelectorSaptamana />
        {saptamani.map((s) => (
```

and closing the fragment after the map — the block ends `))}</>`  instead of `))`:

```astro
        ))}
      </>
    )}
```

Apply the identical three changes to `web/src/pages/index.astro`, with the import path `'../components/SelectorSaptamana.astro'`.

- [ ] **Step 7: Verify both paths**

Run: `cd web && npm run build && npm run preview`

With JavaScript on: only one week section is visible, and ‹ › move between them.

With JavaScript off (DevTools → Command Palette → "Disable JavaScript", then reload): **all three** week sections are visible and the ‹ › bar is absent. This is the requirement — confirm it rather than assuming it.

Check the JS budget:

Run: `cd web && du -b dist/_astro/*.js | sort -n | tail -3`
Expected: the total is under 3,072 bytes.

- [ ] **Step 8: Commit**

```bash
git add src/lib/week-picker.ts src/lib/week-picker.test.ts src/components/SelectorSaptamana.astro src/pages/index.astro src/pages/program/index.astro
git commit -m "feat: reveal the current week client-side, correct without JS

All rendered weeks are in the HTML; the script hides the irrelevant ones.
Combined with the nightly rebuild the site stays correct for three weeks
even if every build fails."
```

---

### Task 11: The /program.ics endpoint

**Files:**
- Create: `web/src/pages/program.ics.ts`
- Test: `web/src/lib/build-output.itest.ts`

**Interfaces:**
- Consumes: `genereazaIcs` from `lib/ics`; `getCollection`.
- Produces: `dist/program.ics` at build time.

The test here reads `dist/`, so it runs only after a build. It is the one integration test in Phase 1: it proves the collection, the schema and the generator are wired together, which no unit test can.

**Do not assert a specific week key in the HTML.** The homepage and `/program/` render only the current and future weeks, so `expect(html).toContain('data-saptamana="2026-W38"')` would pass today and start failing on 21 September 2026 — a test that fails for a reason unrelated to any change anyone made. Date-specific assertions belong on the `.ics`, which emits every seeded day regardless of the build date.

- [ ] **Step 1: Write the endpoint**

Create `web/src/pages/program.ics.ts`:

```typescript
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { genereazaIcs } from '../lib/ics';

const LOCATIE = 'Capela Sf. Katharina, Wehntalerstrasse 451, 8046 Zürich';

export const GET: APIRoute = async () => {
  const intrari = await getCollection('slujbe');
  const zile = intrari.map((e) => ({ ...e.data, data: e.id }));

  const dtstamp = `${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;

  return new Response(genereazaIcs(zile, { dtstamp, locatie: LOCATIE }), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="program-liturgic.ics"',
    },
  });
};
```

- [ ] **Step 2: Write the failing build-output test**

Create `web/src/lib/build-output.itest.ts`:

```typescript
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const DIST = new URL('../../dist/', import.meta.url).pathname;

describe('ieșirea build-ului', () => {
  it('a fost generată', () => {
    expect(existsSync(`${DIST}index.html`)).toBe(true);
  });

  it('emite feed-ul de calendar', () => {
    expect(existsSync(`${DIST}program.ics`)).toBe(true);
  });

  // The .ics carries every service day regardless of the build date, so these
  // assertions are safe to pin to the seeded content. The HTML pages show only
  // current and future weeks, so asserting a specific week there would make the
  // suite start failing on 21 September 2026 — see the note below.
  it('feed-ul conține slujbele din colecție', () => {
    const ics = readFileSync(`${DIST}program.ics`, 'utf8');
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('DTSTART;TZID=Europe/Zurich:20260914T073000');
    expect(ics).toContain('SUMMARY:Sfânta Liturghie și Parastas');
  });

  it('feed-ul păstrează diacriticele cu virgulă dedesubt', () => {
    const ics = readFileSync(`${DIST}program.ics`, 'utf8');
    expect(ics).toContain('Înălțarea Sfintei Cruci');
    expect(ics).not.toMatch(/[şţŞŢ]/); // cedilla forms
  });

  it('feed-ul respectă limita de 75 de octeți pe linie', () => {
    const ics = readFileSync(`${DIST}program.ics`, 'utf8');
    for (const linie of ics.split('\r\n')) {
      expect(new TextEncoder().encode(linie).length).toBeLessThanOrEqual(75);
    }
  });

  it('pagina de pornire are secțiunea de program', () => {
    const html = readFileSync(`${DIST}index.html`, 'utf8');
    expect(html).toContain('Programul săptămânii');
    expect(html).toContain('Bine ați venit în casa Domnului');
  });

  it('paginile declară limba română și diacritice corecte', () => {
    for (const p of ['index.html', 'program/index.html']) {
      const html = readFileSync(`${DIST}${p}`, 'utf8');
      expect(html).toContain('<html lang="ro"');
      expect(html).toContain('Sfântul Nicolae');
      expect(html).not.toMatch(/[şţŞŢ]/);
    }
  });

  it('pagina de program oferă abonarea la calendar', () => {
    const html = readFileSync(`${DIST}program/index.html`, 'utf8');
    expect(html).toContain('/program.ics');
  });
});
```

- [ ] **Step 3: Add a second Vitest config for integration tests**

`vitest.config.ts` includes only `src/**/*.test.ts`, and `build-output.itest.ts` does not match that glob (the character before `test.ts` is `i`, not `.`), so the integration test is invisible to the default suite. That is what we want — it needs `dist/` to exist — but it also means we need a way to run it deliberately.

**Do not reach for `vitest run --include <glob>`: Vitest 5 has no `--include` flag.** It has `--exclude` and `--dir`, and the only `--include`-prefixed option is the unrelated `--includeTaskLocation`. Use a second config instead, which is explicit and does not depend on CLI surface that moves between majors.

Create `web/vitest.itest.config.ts`:

```typescript
/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

export default getViteConfig({
  test: {
    include: ['src/**/*.itest.ts'],
  },
});
```

- [ ] **Step 4: Wire up the scripts**

Change the scripts in `package.json`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:build": "astro build && vitest run --config vitest.itest.config.ts",
    "test:all": "npm run test && npm run test:build"
  }
}
```

- [ ] **Step 5: Run it to verify it fails, then passes**

Run: `cd web && rm -rf dist && npx vitest run --config vitest.itest.config.ts`
Expected: FAIL — `dist/index.html` does not exist.

Run: `cd web && npm run test:build`
Expected: the build runs, then PASS, 8 tests.

- [ ] **Step 6: Confirm the split holds**

Run: `cd web && rm -rf dist && npm test && npm run test:all`
Expected: `npm test` passes on a clean checkout with no `dist/` present (proving the integration test really is out of the default suite); `npm run test:all` then builds and passes everything.

- [ ] **Step 7: Commit**

```bash
git add src/pages/program.ics.ts src/lib/build-output.itest.ts vitest.itest.config.ts package.json
git commit -m "feat: /program.ics endpoint with build-output integration test"
```

---

### Task 12: Sveltia CMS, self-hosted

**Files:**
- Create: `web/public/admin/index.html`, `web/public/admin/config.yml`, `web/scripts/copy-cms.mjs`
- Modify: `web/package.json` (prebuild hook), `web/.gitignore`

**Interfaces:**
- Consumes: the `slujbe` collection layout from Task 4 — the CMS writes files that `content.config.ts` reads, so the field names must match the Zod schema exactly.
- Produces: a working `/admin/` that commits to `main`.

Sveltia is loaded from the repo, not a CDN, so the CSP in Task 13 can stay at `script-src 'self'`. The bundle is copied from `node_modules` at build time and is git-ignored.

**Version note:** `@sveltia/cms` is at 0.213.0 — pre-1.0, single maintainer. Pin the exact version rather than using a caret range, and re-read the changelog before upgrading. The escape hatch, per spec §17, is that this config is Decap-compatible.

- [ ] **Step 1: Install and pin**

```bash
cd /Users/stefan/Work/stuff/site-bzh/web
npm install --save-exact @sveltia/cms@0.213.0
```

- [ ] **Step 2: Write the copy script**

Create `web/scripts/copy-cms.mjs`:

```javascript
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sursa = require.resolve('@sveltia/cms');

mkdirSync('public/admin', { recursive: true });
copyFileSync(sursa, 'public/admin/sveltia-cms.mjs');

console.log(`CMS copiat din ${sursa}`);
```

- [ ] **Step 3: Hook it into the build**

Add to `web/package.json` scripts:

```json
{
  "scripts": {
    "prebuild": "node scripts/copy-cms.mjs",
    "predev": "node scripts/copy-cms.mjs"
  }
}
```

Add to `web/.gitignore`:

```
public/admin/sveltia-cms.mjs
```

- [ ] **Step 4: Write the admin page**

Create `web/public/admin/index.html`:

```html
<!doctype html>
<html lang="ro">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>Administrare · Parohia Sfântul Nicolae</title>
  </head>
  <body>
    <script type="module" src="/admin/sveltia-cms.mjs"></script>
  </body>
</html>
```

- [ ] **Step 5: Write the CMS configuration**

Create `web/public/admin/config.yml`. Replace `<OWNER>/<REPO>` and the worker URL in Step 8.

```yaml
backend:
  name: github
  repo: <OWNER>/<REPO>
  branch: main
  base_url: https://sveltia-cms-auth.<SUBDOMAIN>.workers.dev

publish_mode: simple
media_folder: src/assets/uploads
public_folder: /uploads
locale: ro

collections:
  - name: slujbe
    label: Program liturgic
    label_singular: Zi de slujbă
    folder: src/content/slujbe
    extension: yml
    format: yaml
    create: true
    delete: true
    slug: '{{fields.data}}'
    identifier_field: data
    sortable_fields: [data]
    summary: '{{data}} — {{praznic}}'
    description: >
      Fiecare intrare este o zi cu slujbe. Pentru o săptămână obișnuită,
      deschideți ziua din săptămâna trecută, apăsați „Duplicate" și schimbați
      data. Zilele trecute dispar singure de pe site.
    fields:
      - name: data
        label: Data
        widget: datetime
        date_format: YYYY-MM-DD
        time_format: false
        picker_utc: false
      - name: praznic
        label: Praznic sau sărbătoare
        widget: string
        required: false
        hint: Lăsați gol pentru o zi obișnuită.
      - name: praznic_mare
        label: Praznic mare
        widget: boolean
        default: false
        required: false
        hint: Marchează ziua cu cruce și chenar auriu. Necesită numele praznicului.
      - name: zi_de_post
        label: Zi de post
        widget: boolean
        default: false
        required: false
      - name: anulat
        label: Slujbele sunt anulate
        widget: boolean
        default: false
        required: false
      - name: note
        label: Observații
        widget: text
        required: false
      - name: locatie
        label: Alt loc decât capela obișnuită
        widget: string
        required: false
      - name: slujbe
        label: Slujbe
        label_singular: Slujbă
        widget: list
        summary: '{{fields.ora}} {{fields.slujba}}'
        fields:
          - name: ora
            label: Ora
            widget: string
            pattern: ['^([01]?\d|2[0-3]):[0-5]\d$', 'Scrieți ora ca 08:30']
          - name: slujba
            label: Slujba
            widget: select
            options:
              - Utrenia
              - Sfânta Liturghie
              - Vecernie
              - Spovedanie
              - Acatist
              - Paraclisul Maicii Domnului
              - Sfântul Maslu
              - Litie
              - Parastas
              - Priveghere
              - Denie
              - Liturghia Darurilor mai înainte sfințite
              - Botez
              - Cununie
              - Altceva
          - name: detaliu
            label: Detaliu
            widget: string
            required: false
            hint: 'De exemplu „și Parastas". Pentru „Altceva", scrieți aici numele slujbei.'
```

The `options` list must stay identical to `NUME_SLUJBE` in `src/lib/schema.ts`. If they drift, the CMS will happily write a value the build then rejects.

- [ ] **Step 6: Guard the drift with a test**

Append to `web/src/lib/schema.test.ts`:

```typescript
import { readFileSync } from 'node:fs';
import { NUME_SLUJBE } from './schema';

/**
 * Reads the `options:` list out of config.yml without a YAML parser: take the
 * lines after `options:` that are more deeply indented and start with `- `.
 * Indentation-agnostic, so reformatting the file does not break the test.
 */
function optiuniDinConfig(yml: string): string[] {
  const linii = yml.split('\n');
  const start = linii.findIndex((l) => l.trim() === 'options:');
  if (start === -1) throw new Error('config.yml nu conține o listă `options:`');
  const adancime = linii[start].search(/\S/);

  const out: string[] = [];
  for (const linie of linii.slice(start + 1)) {
    if (linie.trim() === '') continue;
    if (linie.search(/\S/) <= adancime) break;
    const m = /^\s*-\s+(.*?)\s*$/.exec(linie);
    if (!m) break;
    out.push(m[1]);
  }
  return out;
}

describe('configurația CMS', () => {
  it('oferă exact aceleași slujbe ca schema', () => {
    const yml = readFileSync(
      new URL('../../public/admin/config.yml', import.meta.url).pathname,
      'utf8',
    );
    expect(optiuniDinConfig(yml)).toEqual([...NUME_SLUJBE]);
  });
});
```

A single `toEqual` catches every drift that matters: a missing option, an extra one, a typo, and a reordering.

Run: `cd web && npx vitest run src/lib/schema.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 7: Verify the CMS loads locally**

Run: `cd web && npm run dev`, then open `http://localhost:4321/admin/`.
Expected: the Sveltia login screen renders. It cannot sign in yet — the OAuth worker does not exist. Confirm there is no 404 on `/admin/sveltia-cms.mjs` in the network panel.

- [ ] **Step 8: Deploy the OAuth worker**

This is the one manual, out-of-repo step in Phase 1. Per the `sveltia-cms-auth` README, the authenticator is needed precisely when **non-technical users** sign in with GitHub, which is this project's case.

1. Push the repo to GitHub (`gh repo create` or the web UI), then deploy the worker:
   ```bash
   git clone https://github.com/sveltia/sveltia-cms-auth /tmp/sveltia-cms-auth
   cd /tmp/sveltia-cms-auth && npm install && npx wrangler deploy
   ```
   Note the resulting `https://sveltia-cms-auth.<SUBDOMAIN>.workers.dev` URL.
2. Register a GitHub OAuth app at <https://github.com/settings/developers>:
   - Application name: `Sveltia CMS — Parohia Sfântul Nicolae`
   - Homepage URL: `https://www.bor-zh.ch`
   - Authorization callback URL: `<WORKER_URL>/callback`
3. In the Cloudflare dashboard, on the `sveltia-cms-auth` worker, Settings → Variables, add:
   - `GITHUB_CLIENT_ID` — from step 2
   - `GITHUB_CLIENT_SECRET` — from step 2, click **Encrypt**
   - `ALLOWED_DOMAINS` — `www.bor-zh.ch, *.pages.dev`
     Setting this is both an anti-abuse and a security measure: the worker releases a token only to a page served from one of these hostnames.
4. Fill the real values into `config.yml`: `repo: <OWNER>/<REPO>` and `base_url: <WORKER_URL>`.

- [ ] **Step 9: End-to-end check**

After Task 13 deploys a preview, open `https://<preview>.pages.dev/admin/`, sign in with GitHub, add a service day for next Sunday, and press Publish.

Expected: a commit appears on `main` adding `src/content/slujbe/<date>.yml`; Cloudflare Pages rebuilds; the new day appears on `/program/` within about a minute. **This round trip is the deliverable of Phase 1** — verify it before calling the phase done.

- [ ] **Step 10: Commit**

```bash
git add public/admin/index.html public/admin/config.yml scripts/copy-cms.mjs package.json .gitignore src/lib/schema.test.ts
git commit -m "feat: self-hosted Sveltia CMS for the liturgical schedule

Service names are a closed dropdown mirroring the Zod enum; a test fails
if the two lists drift."
```

---

### Task 13: Headers, CI, nightly rebuild, and deployment

**Files:**
- Create: `web/public/_headers`, `web/scripts/check-budget.mjs`, `web/.github/workflows/ci.yml`, `web/.github/workflows/nightly.yml`, `web/README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: a deployed preview site, CI that fails on a budget breach, and a nightly rebuild.

- [ ] **Step 1: Write the security headers**

Create `web/public/_headers`:

```
/*
  Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self'; connect-src 'self' https://api.github.com; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), microphone=(), camera=(), payment=(), interest-cohort=()

/program.ics
  Content-Type: text/calendar; charset=utf-8
  Cache-Control: public, max-age=3600

/admin/*
  X-Robots-Tag: noindex
```

`connect-src` allows `api.github.com` because Sveltia talks to the GitHub GraphQL API from `/admin/`. `style-src 'unsafe-inline'` is required by Astro's `inlineStylesheets: 'always'`; it is a far smaller concession than inline script would be, and `script-src` stays strict.

- [ ] **Step 2: Write the budget check**

Create `web/scripts/check-budget.mjs`:

```javascript
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/*
 * Spec §13 budgets the homepage at 30 KB of HTML and 15 KB of CSS. Because
 * astro.config.mjs sets `inlineStylesheets: 'always'`, the CSS is *inside* the
 * HTML — so a separate CSS check would measure an empty set and always pass,
 * while the HTML check would fail for carrying weight the spec had allotted to
 * CSS. The honest translation of those two numbers under inlining is one
 * combined 45 KB limit on the document.
 */
const BUGET_PAGINI = {
  'index.html': 45 * 1024,
  'program/index.html': 135 * 1024,
};
const BUGET_JS = 3 * 1024;

// The Sveltia CMS bundle lives under dist/admin/. It is a few hundred KB of
// third-party code that only a signed-in editor ever loads, and it is not part
// of what a visitor downloads — so it is excluded from the visitor JS budget.
const EXCLUSE = ['admin'];

let esec = false;

function raporteaza(eticheta, octeti, limita) {
  const ok = octeti <= limita;
  if (!ok) esec = true;
  console.log(`${ok ? 'OK       ' : 'PREA MARE'} ${eticheta}: ${octeti} / ${limita} octeți`);
}

for (const [cale, limita] of Object.entries(BUGET_PAGINI)) {
  raporteaza(cale, statSync(join('dist', cale)).size, limita);
}

function totalJs(dir) {
  let total = 0;
  for (const nume of readdirSync(dir, { withFileTypes: true })) {
    if (nume.isDirectory()) {
      if (dir === 'dist' && EXCLUSE.includes(nume.name)) continue;
      total += totalJs(join(dir, nume.name));
    } else if (/\.m?js$/.test(nume.name)) {
      total += statSync(join(dir, nume.name)).size;
    }
  }
  return total;
}

raporteaza('JS pentru vizitatori', totalJs('dist'), BUGET_JS);

if (esec) {
  console.error('\nBugetul de performanță a fost depășit (specificație §13).');
  process.exit(1);
}
```

`/\.m?js$/` rather than `endsWith('.js')`: the CMS bundle is a `.mjs` file, and an extension test that misses it would leave the exclusion above looking effective while doing nothing.

Add to `package.json` scripts: `"budget": "node scripts/check-budget.mjs"`.

Run: `cd web && npm run build && npm run budget`
Expected: every line reads `OK`, exit code 0.

- [ ] **Step 3: Write CI**

Create `web/.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  verifica:
    runs-on: ubuntu-latest
    env:
      TZ: Europe/Zurich
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
      - run: npm ci
      - run: npm run check
      - run: npm test
      - run: npm run test:build   # builds, then runs the dist/ integration tests
      - run: npm run budget
```

`TZ: Europe/Zurich` matters: `aziLaZurich` is explicit about its timezone, but pinning the runner removes any doubt about what "today" meant during a build.

- [ ] **Step 4: Set up Cloudflare Pages**

In the Cloudflare dashboard, Workers & Pages → Create → Pages → Connect to Git:

- Repository: the one pushed in Task 12
- Production branch: `main`
- Framework preset: **Astro**
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: leave blank — `web/` *is* the repository root
- Environment variables: `NODE_VERSION=22`, `TZ=Europe/Zurich`

Then Settings → Builds & deployments → Deploy hooks → create one named `nightly`, and copy its URL.

- [ ] **Step 5: Write the nightly rebuild**

Add the deploy hook URL as a GitHub repository secret named `CF_DEPLOY_HOOK` (Settings → Secrets and variables → Actions).

Create `web/.github/workflows/nightly.yml`:

```yaml
name: Reconstrucție nocturnă

# 01:00 UTC is 03:00 in Zürich during summer time and 02:00 in winter — both
# comfortably after midnight, which is all that matters: the rebuild only needs
# to happen after the date has rolled over.
on:
  schedule:
    - cron: '0 1 * * *'
  workflow_dispatch:

jobs:
  reconstruieste:
    runs-on: ubuntu-latest
    steps:
      - name: Declanșează build-ul Cloudflare Pages
        run: curl -fsS -X POST "${{ secrets.CF_DEPLOY_HOOK }}"
```

This consumes about 30 of the 500 monthly builds.

- [ ] **Step 6: Replace the scaffold's agent instructions**

`npm create astro` left a `CLAUDE.md` and an `AGENTS.md`, each 22 lines about running the dev server. They load automatically into every agent session that touches this repo, so they read as the project's instructions while containing none of its actual rules — which is worse than having no file. Replace **both** with the same content (keep them identical; `AGENTS.md` is the vendor-neutral name):

```markdown
# bor-zh.ch — working rules

Static Astro site for the Romanian Orthodox parish of St Nicholas, Zürich.
Design authority: `docs/superpowers/specs/2026-09-15-parish-site-rewrite-design.md`.

## Rules that are not negotiable

- **Diacritics are comma-below.** ș U+0219 and ț U+021B, never the Turkish cedilla
  forms ş U+015F and ţ U+0163. Check any Romanian string you add.
- **Dates are `YYYY-MM-DD` strings; times are `HH:MM` local strings.** Never a UTC
  instant for a service — a Liturgy at 10:00 is at 10:00 across a DST change.
  `aziLaZurich()` and `oraLaZurich()` in `src/lib/week.ts` are the only
  timezone-aware functions; everything downstream takes plain strings.
- **`#B08B3E` and `#C8A45C` are ornament only — never text** at any size. They fail
  WCAG AA (2.95:1). Use `--gold-text` (#8A6A28). `src/lib/tokens.test.ts` enforces it.
- **The parent directory is not part of this repository.** It holds ~6 GB of forensic
  backups of the compromised server and a file of database credentials. Never `git add`
  anything from outside this root, and never weaken `.gitignore`.
- **Import Zod as `astro/zod`**, never a direct `zod` dependency — a second copy
  breaks `instanceof` checks.
- The service names in `public/admin/config.yml` must stay identical to `NUME_SLUJBE`
  in `src/lib/schema.ts`. A test fails if they drift.

## Commands

`npm run dev` · `npm test` · `npm run test:all` (build + integration) · `npm run check`
· `npm run budget`. Use `astro dev --background`, then `astro dev stop|status|logs`.
```

- [ ] **Step 7: Write the README**

Create `web/README.md`:

```markdown
# bor-zh.ch

Site-ul Parohiei Ortodoxe Române Sfântul Nicolae din Zürich.

Astro (static) · Sveltia CMS · Cloudflare Pages.
Spec: `docs/superpowers/specs/2026-09-15-parish-site-rewrite-design.md`

## Dezvoltare

```bash
npm install
npm run dev        # http://localhost:4321
npm test           # teste unitare
npm run test:all   # build + teste de integrare
npm run budget     # verifică bugetul de performanță
```

## Pentru cei care actualizează programul

Deschideți <https://www.bor-zh.ch/admin/> și intrați cu contul GitHub.

Pentru o săptămână obișnuită: deschideți o zi din săptămâna trecută,
apăsați **Duplicate**, schimbați data și ora dacă e nevoie, apoi **Publish**.
Site-ul se actualizează singur în aproximativ un minut. Zilele trecute
dispar automat.

Dacă ceva nu apare pe site după câteva minute, build-ul a eșuat — verificați
e-mailul primit de la GitHub, care spune ce fișier are problema.

## Reguli care nu se încalcă

- `#B08B3E` și `#C8A45C` sunt doar ornament. Nu se folosesc niciodată pentru
  text — pică testul de contrast WCAG (2,95:1). Vezi `src/lib/tokens.ts`.
- Datele se păstrează ca `YYYY-MM-DD`, orele ca `HH:MM`, ora locală. Niciodată
  ca momente UTC.
- Lista de slujbe din `public/admin/config.yml` trebuie să rămână identică cu
  `NUME_SLUJBE` din `src/lib/schema.ts`.
```

- [ ] **Step 8: Push and verify the deployment**

```bash
cd /Users/stefan/Work/stuff/site-bzh/web
git add public/_headers scripts/check-budget.mjs .github/ README.md CLAUDE.md AGENTS.md package.json
git commit -m "chore: security headers, CI with performance budget, nightly rebuild"
git push -u origin main
```

Expected: CI goes green; Cloudflare Pages deploys; `https://<project>.pages.dev/` serves the homepage.

- [ ] **Step 9: Verify the headers and the whole phase**

```bash
curl -sI https://<project>.pages.dev/ | grep -i -E 'content-security|strict-transport|x-content-type'
curl -s https://<project>.pages.dev/program.ics | head -20
```

Expected: the CSP and HSTS headers are present; the `.ics` begins with `BEGIN:VCALENDAR`.

Then run the acceptance checks for Phase 1:

1. Lighthouse on the deployed homepage — accessibility **100**, performance **≥95**.
2. Subscribe to `https://<project>.pages.dev/program.ics` from a phone calendar; confirm the services appear at the right local times.
3. Complete Task 12 Step 9: publish a service day through `/admin/` and watch it reach the live page.
4. Load the homepage with JavaScript disabled; confirm all three weeks are visible.

- [ ] **Step 10: Commit any fixes and tag**

```bash
git tag -a phase-1 -m "Phase 1: liturgical schedule and CMS"
git push --tags
```

---

## Phase 1 Acceptance

Phase 1 is done when a person who has never seen the repository can:

1. Open `/admin/`, sign in with a GitHub account, and publish next Sunday's services in under a minute.
2. See those services on the homepage and `/program/` about a minute later.
3. Subscribe to the calendar feed from a phone and get the right times.

And when CI enforces: the schema (a bad `ora` fails the build), the contrast rules (ornamental gold cannot become text), and the performance budget.

---

## What Phase 1 deliberately leaves out

News posts, the 48-post migration, events, galleries, PDFs, donations, the contact form, redirects from the old URLs, and the DNS cutover. The CMS-editable settings singleton (spec §6.7) is Phase 2, so the footer's contact details are hardcoded for now. The printed one-page editor card (spec §16) is Phase 4, with the training session; the README covers the same ground in the meantime.

The site runs on `*.pages.dev` throughout Phase 1; `www.bor-zh.ch` still points at WordPress. Nothing in this phase touches DNS, so parish email cannot break.

Phases 2–4 get their own plans, written against the same spec.
