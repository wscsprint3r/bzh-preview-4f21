# Phase 4 — Cutover Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Everything Phase 4 must build before the DNS cutover — the redirects file, the
WordPress short links, the `.doc` conversion, the sitemap, the homepage hero, the page images,
the `/doneaza` content repairs, build-time uploads sanitisation, the editor documentation, and
the Romanian failure annotation — each with the guard that proves it works.

**Architecture:** Three new build-time integrations (`redirects`, `uploads-sanitise`, and the
`INDEXABLE`-gated sitemap routes) join the existing ones in `astro.config.mjs`; two new
Cloudflare Pages Function paths (`functions/index.ts` for `?p=`, plus its data file) extend the
contact Function; the migration grows two pure modules (`wp-ids.mjs`, `doc-convert.mjs`) that a
fresh clone can read but only a machine with the backups can run; and the browser guard in
`scripts/a11y.mjs` grows a pixel-sampled contrast check for the hero, because axe cannot judge
text over a photograph.

**Tech Stack:** Astro 7 (static), TypeScript, Vitest, sharp, selenium-webdriver + Chrome,
Cloudflare Pages (`_redirects`, Functions), LibreOffice (one-time, for the `.doc` conversion).

**Spec:** `docs/superpowers/specs/2026-09-15-parish-site-rewrite-design.md` (§8 calendar feed,
§11 migration, §12 redirects, §13 budget, §15 cutover, §16 editor documentation, §19 phasing).
**Backlog:** `docs/superpowers/plans/2026-09-19-phase-4-backlog.md` — the decisions and
measurements this plan argues from. **`docs/handover.md` steps A–L are the operational cutover
and are not tasks here**; this plan updates the handover where the build changes what it says.

## Global Constraints

- **Diacritics are comma-below.** U+0218/U+0219 and U+021A/U+021B only; the Turkish cedilla
  forms are a defect. Never write a `backslash-u` escape into any file — it is decoded on the
  way to disk. Build such characters from numbers or write them directly.
- **Identifiers are English** — variables, functions, files, tests, diagnostics. Romanian is
  only for what a person reads: page copy, CMS labels, Zod messages, `PAGE_EXPLANATION`, and
  the two new editor documents.
- **Dates are `YYYY-MM-DD` strings, times `HH:MM` local strings.** Only `todayInZurich()` and
  `timeInZurich()` in `src/lib/week.ts` read a clock.
- **`#B08B3E` and `#C8A45C` are ornament only, never text** on the parchment page;
  `TEXT_ROLES_ON_OXBLOOD` in `src/lib/tokens.ts` is the hero's only text palette. The hero
  ground is the one place `--gold-lt` is legible.
- **Zod comes from `astro/zod`**, never a direct dependency.
- **No budget limit is raised.** `PAGE_BUDGET` and `REQUEST_BUDGET` in
  `scripts/check-budget.mjs` may gain explanatory comments; their numbers do not move.
- **Test verdicts come from process exit codes**, never `.vitest/json/output.json`. Use
  `rtk proxy` for any command whose output decides something, and `process.stdout.write` for a
  number a later reader must see on a green run.
- **A guard that reads files must prove it read something**, and every "X is absent" claim
  needs a positive control showing the detector can fire.
- **The parent directory is not part of this repository.** `migration/` reads it by absolute
  path; never `git add` anything from outside the root, and never weaken `.gitignore`.
- **`published: false` means no page at all** — absent from lists, the feed and the sitemap.
- **Commit style:** conventional subject, body explaining the measurement, explicit pathspecs
  (`git commit -m … -- <paths>`) so nothing unrelated is swept in.
- **Gate before every commit that touches the build:** `TZ=Europe/Zurich npm test` and, for
  tasks that change output, `TZ=Europe/Zurich npm run test:build`. The final task runs
  `npm run test:all` and `npm run check`.

---

## File Structure

**New files**

| Path | Responsibility |
|---|---|
| `src/lib/url-map.ts` | Parse `docs/url-map.csv` into rows. One parser, two importers (build script, migration). |
| `src/lib/url-map.test.ts` | The parser's unit tests. |
| `scripts/redirects.mjs` | Rule tables, `redirectRules`, the `astro:build:done` integration writing `dist/_redirects`. |
| `src/lib/redirects.test.ts` | Ordering, skip-equal, duplicate, encoding and status unit tests. |
| `src/lib/redirects.itest.ts` | The built `dist/_redirects` against the CSV and the build. |
| `migration/wp-ids.mjs` | WordPress ID → new-path map, written to `functions/wp-ids.json`. |
| `migration/wp-ids.test.mjs` | Its pure tests. |
| `src/lib/short-links.ts` | The `?p=` resolver, shared by the Function and its tests. |
| `src/lib/short-links.test.ts` | Resolver tests plus the committed-map assertions. |
| `functions/index.ts` | The `/` Pages Function that 301s `?p=<id>`. |
| `functions/wp-ids.json` | The generated map (committed; produced by the maintainer's migration run). |
| `migration/doc-convert.mjs` | The one-time `.doc` → PDF conversion and its static redirect table. |
| `src/lib/sitemap.ts` | Pure sitemap path builder and XML generator. |
| `src/lib/sitemap.test.ts` | Its tests. |
| `src/pages/sitemap-[index].xml.ts` | The route, emitted only when `INDEXABLE`. |
| `src/pages/[robots].txt.ts` | `robots.txt`, emitted only when `INDEXABLE`, no `Disallow`. |
| `scripts/indexable-check.mjs` | The scratch build with `INDEXABLE = true` — the sitemap's positive control. |
| `src/lib/hero-contrast.ts` | The pure pixel → contrast maths. |
| `src/lib/hero-contrast.test.ts` | Its tests, including synthetic pixels. |
| `scripts/uploads-sanitise.mjs` | The `astro:build:done` re-encode of `public/uploads/**` into `dist/`. |
| `src/lib/uploads.itest.ts` | Every built upload decodes and carries no EXIF/GPS, with a synthetic control. |
| `scripts/annotations.mjs` | GitHub annotation escaping and the Romanian budget annotation. |
| `src/lib/annotations.test.ts` | Its tests. |
| `docs/ghid-editor.md` | The short Romanian guide (spec §16). |
| `docs/editors-card.md` | The printable one-page card (handover J1). |

**Modified files**

`astro.config.mjs` (two integrations) · `package.json` (`test:indexable`, `test:all`) ·
`.github/workflows/ci.yml` (the new pass) · `scripts/a11y.mjs` (hero contrast, hero
incompletes) · `scripts/a11y-picker.mjs` (copy `docs/url-map.csv`) · `scripts/check-budget.mjs`
(the annotation, the hero note) · `migration/url-map.mjs` (converted rows) ·
`migration/run.mjs` (wire the two new steps) · `migration/pages.test.mjs` (the new counts) ·
`src/lib/documents.itest.ts` (87 → 95) · `src/content/pages/studii.md` (8 links) ·
`src/content/pages/doneaza.md` · `src/content/articles/2024-05-21-catehismul-…md` ·
`src/content/articles/2024-12-24-scrisoarea-pastorala-a-mitropolitului-iosif-la-nasterea-domnului-2024.md`
(the last old-host link) · `src/pages/index.astro` (the hero) · `src/pages/[...page].astro` (the
`image` field) · `src/components/SiteFooter.astro` · the four prose pages that gain an `image:`
frontmatter field (Task 8) · `docs/handover.md` · `README.md` · the spec (§8, §11, §13) ·
`docs/superpowers/plans/2026-09-19-phase-4-backlog.md`.

---

### Task 1: Recorded decisions and spec amendments

The plan argues from the spec, so the four rulings that contradict it land first.

**Files:**
- Modify: `docs/superpowers/specs/2026-09-15-parish-site-rewrite-design.md` (§8, §11, §13)
- Modify: `docs/superpowers/plans/2026-09-19-phase-4-backlog.md`
- Test: none (documents are swept by `diacritics-sources.test.ts` and `referenced-paths.test.ts`)

**Interfaces:**
- Produces: the amended spec every later task argues from.

- [ ] **Step 1: Amend spec §8** — delete the sentence `Plus a per-day "Adaugă în calendar"
link for people who want one service rather than a subscription.` and put in its place:

```markdown
The whole-feed subscription is the only calendar affordance, and a per-day
"Adaugă în calendar" link was considered and rejected on 2026-09-19: it needs
either a per-day `.ics` route (a route per service day, for a one-off need the
feed already covers) or a Google-specific template URL, and the day row already
links the feed. The rejection is recorded rather than silent because this
sentence was the requirement.
```

- [ ] **Step 2: Amend spec §11 "Not migrated"** — after the sentence about `.doc` files, add:

```markdown
**Amended 2026-09-19: the eight `.doc` study files are converted once to PDF and
hosted.** They are the only study texts on `/resurse/studii/` that a reader
cannot open in a browser, and the cutover snapshot keeps the originals alive
regardless. The conversion is a one-time manual step (`migration/doc-convert.mjs`,
LibreOffice) whose output is committed; the migration itself never re-converts,
because LibreOffice's PDF bytes are not reproducible run to run and spec §11's
determinism rule covers every file the migration writes. See
`docs/superpowers/plans/2026-09-19-phase-4-cutover-build.md`, Task 4.
```

- [ ] **Step 3: Amend spec §13's table** — add a note under the table:

```markdown
The two Lighthouse rows are **deferred to Phase 5** (ruling of 2026-09-19): the
byte, request and JS budgets are enforced in CI, and Lighthouse is measured by
hand at deployment (handover H8) until a Phase 5 decides how to automate it
against a real network rather than a runner. Deferred, not dropped.
```

- [ ] **Step 4: Amend the backlog** — append to
`docs/superpowers/plans/2026-09-19-phase-4-backlog.md`:

```markdown
---

## Decisions taken 2026-09-19, at plan time

| Question | Ruling |
|---|---|
| `?p=<id>` short links | Extend `migration/` to emit an ID→slug map and add `functions/index.ts`; see the plan's Task 3. |
| The 8 `.doc` links | Convert once to PDF, gate through `pdf-gate.mjs`, host under `/documente/`; Task 4. |
| `/sitemap-index.xml` and `robots.txt` | Custom routes, emitted only when `INDEXABLE = true`; Task 5. |
| Per-day "Adaugă în calendar" | Rejected; spec §8 amended; no code. |
| Lighthouse rows | Deferred to Phase 5; spec §13 amended. |
| The two stock images (B5) | Replaced with parish photographs; Task 9. |
| Romanian failure notice (C3) | The GitHub annotation is built (Task 13); the Romanian e-mail is deferred until K2's Resend domain exists and is recorded in the handover as a gap. |
| Privacy statement | Stays the paragraph on `/contact/`; recorded, not a page. |
| C6 footer duplicate | Fixed in Task 11. |
| A4 `/noutati` thumbnails | Recorded as a decision, not an omission — the request cap of 12 cannot carry one per card. |
| C7 open questions | Parish decisions, listed in the handover; names stay published until the parish answers. |

## Deferred to Phase 5

- Lighthouse performance ≥ 95 / accessibility 100: automate or keep manual (spec §13 note).
- The Romanian build-failure e-mail itself, once K2's `send.bor-zh.ch` is verified.
- `?p=` short links for post types outside `post`/`page` (attachments, old calendar events).
```

- [ ] **Step 5: Run the document sweeps**

Run: `TZ=Europe/Zurich npx vitest run src/lib/diacritics-sources.test.ts src/lib/referenced-paths.test.ts`
Expected: PASS. If `referenced-paths` fails, a backticked path in the new prose does not
resolve — fix the path, not the test.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-09-15-parish-site-rewrite-design.md \
  docs/superpowers/plans/2026-09-19-phase-4-backlog.md
git commit -m "docs(spec): the Phase 4 rulings, and what is deferred to Phase 5" -- \
  docs/superpowers/specs/2026-09-15-parish-site-rewrite-design.md \
  docs/superpowers/plans/2026-09-19-phase-4-backlog.md
```

---

### Task 2: `_redirects`, generated from the URL map at build time

**Files:**
- Create: `src/lib/url-map.ts`, `src/lib/url-map.test.ts`, `scripts/redirects.mjs`,
  `src/lib/redirects.test.ts`, `src/lib/redirects.itest.ts`
- Modify: `astro.config.mjs` (integrations), `scripts/a11y-picker.mjs` (copy the CSV into the
  scratch build)

**Interfaces:**
- Consumes: `docs/url-map.csv` (144 data rows, 3 of them old==new).
- Produces: `dist/_redirects`; `redirectRules(rows, extras?, gone?)` →
  `Array<{ from: string, to: string, status: 301 | 410 }>`; `writeRedirects(dir, log?)`.

- [ ] **Step 1: Write the failing parser tests** — `src/lib/url-map.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { parseUrlMap } from './url-map';

describe('the URL map parser', () => {
  it('drops comments, the header and blank lines', () => {
    const rows = parseUrlMap(
      '# a comment\nvechi,nou\n/old/,/new/\n\n/kept/,/kept/\n',
    );
    expect(rows).toEqual([
      ['/old/', '/new/'],
      ['/kept/', '/kept/'],
    ]);
  });

  it('splits on the FIRST comma, so a new path may contain one', () => {
    expect(parseUrlMap('/old/,/new/,with,commas/')).toEqual([
      ['/old/', '/new/,with,commas/'],
    ]);
  });

  it('refuses a row that is not two fields', () => {
    expect(() => parseUrlMap('/old-only\n')).toThrow(/without a comma/);
  });

  it('keeps percent-encoded tokens verbatim', () => {
    const token = '/wp-content/uploads/2025/06/Pastorala-Pogorarea-Duhului-Sfant-2025.pdf';
    expect(parseUrlMap(`${token},/documente/pastorala-pogorarea-duhului-sfant-2025.pdf`)).toEqual([
      [token, '/documente/pastorala-pogorarea-duhului-sfant-2025.pdf'],
    ]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/url-map.test.ts`
Expected: FAIL — `src/lib/url-map.ts` does not exist.

- [ ] **Step 3: Write the parser** — `src/lib/url-map.ts`

```ts
/**
 * `docs/url-map.csv`, parsed. One parser, two importers: the build-time
 * `scripts/redirects.mjs` and the migration's short-link map, so the two can
 * never disagree about what the file means.
 *
 * THE FILE IS MACHINE-WRITTEN, so this is deliberately strict about the one
 * shape it can have: `old,new`, comments starting `#`, the `vechi,nou` header.
 * A line that is not two fields stops the caller by name rather than being
 * skipped — a skipped row is an old URL that silently stops working.
 */
export type UrlMapRow = [oldPath: string, newPath: string];

export function parseUrlMap(text: string): UrlMapRow[] {
  const rows: UrlMapRow[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#') || line === 'vechi,nou') continue;
    const at = line.indexOf(',');
    if (at === -1) throw new Error(`url-map.csv row without a comma: ${line}`);
    rows.push([line.slice(0, at), line.slice(at + 1)]);
  }
  return rows;
}
```

- [ ] **Step 4: Run the parser tests** — PASS.

- [ ] **Step 5: Write the failing rule tests** — `src/lib/redirects.test.ts`

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EXTRA_RULES, GONE_RULES, redirectRules, renderRedirects } from '../../scripts/redirects.mjs';
import { parseUrlMap } from './url-map';

const ROWS: Array<[string, string]> = [
  ['/a/', '/nou/a/'],
  ['/same/', '/same/'],
  ['/wp-content/uploads/2025/06/x.pdf', '/documente/x.pdf'],
];

describe('the redirect rules', () => {
  it('skips a row whose two paths are equal', () => {
    expect(redirectRules(ROWS).some((r) => r.from === '/same/')).toBe(false);
  });

  it('keeps every specific rule ABOVE the /wp-content/* 410', () => {
    const rules = redirectRules(ROWS);
    const upload = rules.findIndex((r) => r.from === '/wp-content/uploads/2025/06/x.pdf');
    const wildcard = rules.findIndex((r) => r.from === '/wp-content/*');
    expect(upload).toBeGreaterThanOrEqual(0);
    expect(wildcard).toBeGreaterThan(upload);
    expect(rules[wildcard].status).toBe(410);
  });

  it('puts every 410 after every 301', () => {
    const rules = redirectRules(ROWS);
    const last301 = rules.map((r) => r.status).lastIndexOf(301);
    const first410 = rules.map((r) => r.status).indexOf(410);
    expect(first410).toBeGreaterThan(last301);
  });

  it('refuses two rules for one old path', () => {
    expect(() => redirectRules([...ROWS, ['/a/', '/altrove/']])).toThrow(/two rules for \/a\//);
  });

  it('carries only 301 and 410', () => {
    for (const rule of redirectRules(ROWS)) expect([301, 410]).toContain(rule.status);
  });

  it('renders one line per rule, `from to status`, with a generated header', () => {
    const text = renderRedirects(redirectRules([['/a/', '/nou/a/']]));
    expect(text).toContain('/a/ /nou/a/ 301');
    expect(text.startsWith('# Generated by scripts/redirects.mjs')).toBe(true);
    expect(text.endsWith('\n')).toBe(true);
  });

  it('maps the old album, the calendar URLs and the apex', () => {
    const froms = EXTRA_RULES.map(([from]) => from);
    expect(froms).toContain('/galerie.html');
    expect(froms).toContain('/event/*');
    expect(froms).toContain('/events/*');
    expect(froms).toContain('https://bor-zh.ch/*');
  });

  it('holds over the real map: every non-equal row becomes one 301, none duplicated', () => {
    /*
     * NO PINNED ROW COUNT. Task 4 regenerates this CSV with eight more rows,
     * so a hard `144` here would go red in the middle of the plan for a reason
     * that is not a defect. The property is "every row that is not already
     * served becomes exactly one rule", computed from the file.
     */
    const rows = parseUrlMap(readFileSync('docs/url-map.csv', 'utf8'));
    expect(rows.length).toBeGreaterThanOrEqual(144);
    const rules = redirectRules(rows);
    const expected = rows.filter(([from, to]) => from !== to);
    expect(rules.filter((r) => r.status === 301 && rows.some(([f]) => f === r.from))).toHaveLength(
      expected.length,
    );
    expect(new Set(rules.map((r) => r.from)).size).toBe(rules.length);
    expect(rules.length).toBeLessThan(2000);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run src/lib/redirects.test.ts`
Expected: FAIL — `scripts/redirects.mjs` does not exist.

- [ ] **Step 7: Write `scripts/redirects.mjs`**

```js
/*
 * The `_redirects` file, generated from `docs/url-map.csv` at `astro:build:done`.
 *
 * WHY GENERATED RATHER THAN COMMITTED. The CSV is the migration's output and
 * the single record of every old URL that keeps working; a committed
 * `public/_redirects` would be a second copy that drifts, and the drift is
 * invisible — Cloudflare never serves the file, so no test that reads the
 * deployed site can see which rules shipped. The integration reads the CSV at
 * build time, so the file and its input cannot disagree.
 *
 * THE ORDER IS THE FILE'S CONTENT, NOT A FORMATTING CHOICE. Cloudflare applies
 * the first matching rule, so the ten specific `/wp-content/uploads/…` 301s
 * must sit ABOVE the `/wp-content/*` 410 or the wildcard shadows every one of
 * them and ten migrated PDFs stop resolving. Every 301 therefore precedes every
 * 410, and the tests pin it by line index.
 *
 * WHAT THE FILE CANNOT DO, named: `_redirects` matches paths, not query
 * strings, so the WordPress `?p=<id>` short links are `functions/index.ts`'s
 * job (Task 3), and the 2,000-rule free-tier limit is far away at this size.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseUrlMap } from '../src/lib/url-map.ts';

/** The CSV, relative to the directory the build runs in. */
export const URL_MAP = 'docs/url-map.csv';

/** Rules that are not CSV rows: the old album page and the calendar URLs. */
export const EXTRA_RULES = [
  ['/galerie.html', '/galerie/', 301],
  ['/event/*', '/evenimente/', 301],
  ['/events/*', '/evenimente/', 301],
  ['https://bor-zh.ch/*', 'https://www.bor-zh.ch/:splat', 301],
];

/**
 * Spec §12's deliberate 410s. Bots probe these for years; 410 tells them to
 * stop. The destination is ignored for a 410 but the field must be present.
 */
export const GONE_RULES = [
  ['/wp-admin/*', '/', 410],
  ['/wp-login.php', '/', 410],
  ['/xmlrpc.php', '/', 410],
  ['/wp-content/*', '/', 410],
];

/**
 * The rules, in order. `rows` is the CSV's `[old, new]` pairs; `extras` and
 * `gone` are parameters so the unit tests can show the ordering without the
 * real tables, and default to the real ones.
 */
export function redirectRules(rows, extras = EXTRA_RULES, gone = GONE_RULES) {
  const rules = [];
  const seen = new Set();
  const push = ([from, to, status]) => {
    if (from === to) return;
    if (seen.has(from)) throw new Error(`two rules for ${from}`);
    seen.add(from);
    rules.push({ from, to, status });
  };
  for (const [from, to] of rows) push([from, to, 301]);
  for (const rule of extras) push(rule);
  for (const rule of gone) push(rule);
  return rules;
}

/** The file's text: a generated header, then one rule per line. */
export function renderRedirects(rules) {
  return (
    [
      '# Generated by scripts/redirects.mjs from docs/url-map.csv at astro:build:done.',
      '# Do not edit dist/_redirects by hand: edit the CSV, or the rule tables in the script.',
      ...rules.map(({ from, to, status }) => `${from} ${to} ${status}`),
    ].join('\n') + '\n'
  );
}

/**
 * Reads the CSV, writes `<dir>/_redirects`, and returns the rules. Prints what
 * it measured — the three classes of rule, not only the total — so a later
 * reader can tell which part changed.
 */
export function writeRedirects(dir, log = console.log) {
  const rows = parseUrlMap(readFileSync(join(process.cwd(), URL_MAP), 'utf8'));
  const rules = redirectRules(rows);
  writeFileSync(join(dir, '_redirects'), renderRedirects(rules));
  const fromMap = rules.filter((r) => r.status === 301 && rows.some(([f]) => f === r.from)).length;
  const extras = rules.filter((r) => r.status === 301 && !rows.some(([f]) => f === r.from)).length;
  const gone = rules.filter((r) => r.status === 410).length;
  log(`redirects: ${rules.length} rule(s) — ${fromMap} from the map, ${extras} extra, ${gone} gone`);
  return rules;
}

/** The Astro integration. Wired in `astro.config.mjs`. */
export const redirects = {
  name: 'redirects',
  hooks: {
    'astro:build:done': ({ dir, logger }) => {
      writeRedirects(fileURLToPath(dir), (message) => logger.info(message));
    },
  },
};
```

- [ ] **Step 8: Run the rule tests** — PASS.

- [ ] **Step 9: Write the failing integration test** — `src/lib/redirects.itest.ts`

```ts
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseUrlMap } from './url-map';

/*
 * `dist/_redirects` is never served by any host this repository can reach —
 * Cloudflare parses it and drops it — so the only check that can exist is
 * against the built file itself, and the live check is handover F.
 *
 * THE TARGETS THAT DO NOT RESOLVE ARE THE HELD-BACK POSTS, and their number is
 * pinned rather than allowed: 32 unpublished posts keep their old URLs and
 * their redirect targets have no page until the parish dates them, which is the
 * documented design. Any OTHER missing target is a rule pointing at a 404.
 */

const DIST = fileURLToPath(new URL('../../dist/', import.meta.url));

function read(path: string): string {
  expect(existsSync(DIST + path), `${path} is missing from dist/`).toBe(true);
  const text = readFileSync(DIST + path, 'utf8');
  expect(text.length, `${path} exists but is empty`).toBeGreaterThan(0);
  return text;
}

describe('the built _redirects', () => {
  const text = read('_redirects');
  const lines = text.split('\n').filter((l) => l !== '' && !l.startsWith('#'));
  const rules = lines.map((l) => {
    const [from, to, status] = l.split(' ');
    return { from, to, status: Number(status) };
  });

  it('holds one rule per line, only 301 and 410, no duplicate source', () => {
    expect(lines.length).toBeGreaterThan(150);
    for (const rule of rules) expect([301, 410]).toContain(rule.status);
    expect(new Set(rules.map((r) => r.from)).size).toBe(rules.length);
  });

  it('keeps every 301 above every 410', () => {
    const last301 = rules.map((r) => r.status).lastIndexOf(301);
    const first410 = rules.map((r) => r.status).indexOf(410);
    expect(first410).toBeGreaterThan(last301);
  });

  it('resolves every 301 target, except the pinned held-back posts', () => {
    const missing = rules
      .filter((r) => r.status === 301 && r.to.startsWith('/'))
      .filter((r) => !existsSync(`${DIST}${r.to}index.html`) && !existsSync(`${DIST}${r.to}`))
      .map((r) => r.from);
    expect(missing).toHaveLength(32);
    for (const from of missing) {
      const rule = rules.find((r) => r.from === from);
      expect(rule?.to.startsWith('/noutati/'), `${from} -> ${rule?.to}`).toBe(true);
    }
  });

  it('agrees with the CSV row for row', () => {
    const rows = parseUrlMap(readFileSync('docs/url-map.csv', 'utf8')).filter(([a, b]) => a !== b);
    const froms = new Set(rules.map((r) => r.from));
    for (const [oldPath] of rows) expect(froms.has(oldPath), `${oldPath} has no rule`).toBe(true);
  });

  it('carries the album, the calendar wildcards and the 410 block', () => {
    const byFrom = new Map(rules.map((r) => [r.from, r]));
    expect(byFrom.get('/galerie.html')?.to).toBe('/galerie/');
    expect(byFrom.get('/event/*')?.to).toBe('/evenimente/');
    expect(byFrom.get('/wp-content/*')?.status).toBe(410);
    expect(byFrom.get('/wp-login.php')?.status).toBe(410);
  });
});
```

- [ ] **Step 10: Run it to verify it fails**

Run: `TZ=Europe/Zurich npm run test:build`
Expected: FAIL — `dist/_redirects` is missing (the integration is not wired yet). Note: this
runs a full build; that is the price of an integration test.

- [ ] **Step 11: Wire the integration** — `astro.config.mjs`: import it and add to
`integrations`:

```js
import { redirects } from './scripts/redirects.mjs';
```

```js
integrations: [cmsCopy, cspHashes, directoryIndexes, redirects],
```

- [ ] **Step 12: Teach the picker's scratch build about the CSV** —
`scripts/a11y-picker.mjs`, after the copy loop that writes `project`:

```js
    /*
     * The scratch build runs the real `astro.config.mjs`, which includes the
     * redirects integration — and that reads `docs/url-map.csv` from the
     * build's working directory. Without this the fixture pass fails with
     * "ENOENT ... docs/url-map.csv" the first time the integration exists.
     */
    mkdirSync(join(project, 'docs'), { recursive: true });
    cpSync(join(ROOT, 'docs/url-map.csv'), join(project, 'docs/url-map.csv'));
```

- [ ] **Step 13: Run the build and the tests**

Run: `TZ=Europe/Zurich npm run test:build && npm run a11y:picker`
Expected: PASS, with the build log carrying `redirects: N rule(s) — 141 from the map, 4 extra,
4 gone` and the picker pass green.

- [ ] **Step 14: Commit**

```bash
git add src/lib/url-map.ts src/lib/url-map.test.ts scripts/redirects.mjs \
  src/lib/redirects.test.ts src/lib/redirects.itest.ts astro.config.mjs scripts/a11y-picker.mjs
git commit -m "feat(redirects): the URL map becomes dist/_redirects at build time" -- \
  src/lib/url-map.ts src/lib/url-map.test.ts scripts/redirects.mjs \
  src/lib/redirects.test.ts src/lib/redirects.itest.ts astro.config.mjs scripts/a11y-picker.mjs
```

---

### Task 3: WordPress short links — `functions/index.ts` and the ID map

**Files:**
- Create: `src/lib/short-links.ts`, `src/lib/short-links.test.ts`, `migration/wp-ids.mjs`,
  `migration/wp-ids.test.mjs`, `functions/index.ts`
- Modify: `migration/run.mjs`
- Generated + committed by the maintainer: `functions/wp-ids.json`

**Interfaces:**
- Consumes: `parseUrlMap` (Task 2), the dump's `wpoi_posts` table.
- Produces: `shortLinkTarget(p: string | null, ids: Record<string, string>): string | null`;
  `shortLinkMap(posts, mapRows): Array<[string, string]>`; `functions/wp-ids.json`.

- [ ] **Step 1: Write the failing resolver tests** — `src/lib/short-links.test.ts`

```ts
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { shortLinkTarget } from './short-links';

const MAP = fileURLToPath(new URL('../../functions/wp-ids.json', import.meta.url));

describe('the ?p= resolver', () => {
  it('resolves a numeric id present in the map', () => {
    expect(shortLinkTarget('123', { '123': '/noutati/slujbe/' })).toBe('/noutati/slujbe/');
  });

  it('passes through a missing, empty or non-numeric p', () => {
    for (const p of [null, '', 'abc', '12x', '-3', '1.5']) {
      expect(shortLinkTarget(p, { '123': '/x/' })).toBeNull();
    }
  });

  it('does not resolve inherited object properties', () => {
    for (const p of ['__proto__', 'constructor', 'toString']) {
      expect(shortLinkTarget(p, { '123': '/x/' })).toBeNull();
    }
  });

  it('passes through an unknown id', () => {
    expect(shortLinkTarget('999', { '123': '/x/' })).toBeNull();
  });

  it('has a committed map that is non-empty and points only at local paths', () => {
    expect(existsSync(MAP), 'functions/wp-ids.json is missing — run the migration (Task 3, Step 8)').toBe(true);
    const ids = JSON.parse(readFileSync(MAP, 'utf8')) as Record<string, string>;
    const entries = Object.entries(ids);
    expect(entries.length, 'the map is empty — the migration step did not run').toBeGreaterThan(100);
    for (const [id, target] of entries) {
      expect(/^\d+$/.test(id), `key ${id} is not numeric`).toBe(true);
      expect(target.startsWith('/'), `${id} -> ${target} is not a local path`).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails** — `npx vitest run src/lib/short-links.test.ts` — FAIL.

- [ ] **Step 3: Write the resolver** — `src/lib/short-links.ts`

```ts
/**
 * `/?p=<id>` — the WordPress short link form, resolved against the map the
 * migration emits from the dump.
 *
 * WHY THIS IS A PAGES FUNCTION AND NOT A REDIRECT. `_redirects` matches paths;
 * a query string is not part of the path, so no `_redirects` rule can see
 * `?p=`. The old site handed these URLs out for years (every `?p=` link anyone
 * ever pasted), and the IDs survive only in the dump — which is why the map is
 * emitted now rather than after the old host is gone.
 *
 * FAIL OPEN, DELIBERATELY. An id that is not in the map is not an error: the
 * request continues to the homepage, exactly as it does on the new site today.
 * The alternative — a 404 or a guess — is worse for a visitor with a stale
 * link. `Object.hasOwn` rather than `in`, so `__proto__` and friends cannot
 * resolve to anything.
 */
export function shortLinkTarget(p: string | null, ids: Record<string, string>): string | null {
  if (p === null || !/^\d+$/.test(p)) return null;
  return Object.hasOwn(ids, p) ? ids[p] : null;
}
```

- [ ] **Step 4: Run the resolver tests** — the first four PASS; the last FAILS until Step 8
generates the map.

- [ ] **Step 5: Write the failing migration tests** — `migration/wp-ids.test.mjs`

```js
import { describe, expect, it } from 'vitest';
import { shortLinkMap } from './wp-ids.mjs';

describe('the short-link map', () => {
  const ROWS = [
    ['/slujbe/', '/noutati/slujbe/'],
    ['/parohia/istoric/', '/parohia/istoric/'],
    ['/wp-content/uploads/2024/05/x.pdf', '/documente/x.pdf'],
  ];

  it('maps a post slug to its /noutati/ path', () => {
    expect(shortLinkMap([{ id: 12, slug: 'slujbe' }], ROWS)).toEqual([['12', '/noutati/slujbe/']]);
  });

  it('maps a page slug to its new path', () => {
    expect(shortLinkMap([{ id: 7, slug: 'parohia/istoric' }], ROWS)).toEqual([
      ['7', '/parohia/istoric/'],
    ]);
  });

  it('drops a slug the URL map does not carry', () => {
    expect(shortLinkMap([{ id: 9, slug: 'gone' }], ROWS)).toEqual([]);
  });

  it('is sorted by id and one id appears once', () => {
    const map = shortLinkMap(
      [
        { id: 30, slug: 'slujbe' },
        { id: 4, slug: 'parohia/istoric' },
      ],
      ROWS,
    );
    expect(map).toEqual([
      ['4', '/parohia/istoric/'],
      ['30', '/noutati/slujbe/'],
    ]);
  });
});
```

- [ ] **Step 6: Run it to verify it fails** — `npx vitest run migration/wp-ids.test.mjs` — FAIL.

- [ ] **Step 7: Write `migration/wp-ids.mjs`**

```js
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseUrlMap } from '../src/lib/url-map.ts';
import { query } from './db.mjs';

/**
 * `functions/wp-ids.json` — WordPress post/page IDs to their new paths.
 *
 * THE OLD SHORT LINKS ARE `/?p=<id>`, and the IDs exist only in the dump. The
 * URL map carries old paths, not IDs, so this is a second emission from the
 * same database: every published post and page whose slug has a URL-map row
 * gets an entry, and a slug with no row is dropped rather than guessed at.
 *
 * DETERMINISTIC: sorted by numeric id, LF endings, trailing newline. The file
 * is committed, so the maintainer's run is the only one that writes it; a
 * clone reads it. The unknown-id direction is deliberate — the Function falls
 * through to the homepage — so a map that is missing an entry is a stale link
 * that still lands somewhere real, not a 404.
 */
export const WP_IDS_FILE = 'functions/wp-ids.json';

/** The pure half: dump rows + URL-map rows -> sorted `[id, target]` pairs. */
export function shortLinkMap(posts, mapRows) {
  const target = new Map();
  for (const [oldPath, newPath] of mapRows) {
    const match = /^\/([^/]+)\/$/.exec(oldPath);
    if (match !== null) target.set(match[1], newPath);
  }
  const out = new Map();
  for (const { id, slug } of posts) {
    const to = target.get(slug);
    if (to !== undefined) out.set(String(id), to);
  }
  return [...out.entries()].sort((a, b) => Number(a[0]) - Number(b[0]));
}

/** The I/O edge: query the dump, read the CSV, write the JSON. */
export async function writeShortLinks() {
  const posts = await query(
    "SELECT ID, post_name FROM wpoi_posts " +
      "WHERE post_status='publish' AND post_type IN ('post','page') ORDER BY ID",
  );
  const rows = parseUrlMap(readFileSync('docs/url-map.csv', 'utf8'));
  const map = shortLinkMap(posts.map(([id, slug]) => ({ id, slug })), rows);
  await mkdir(dirname(WP_IDS_FILE), { recursive: true });
  const json = `${JSON.stringify(Object.fromEntries(map), null, 2)}\n`;
  await writeFile(WP_IDS_FILE, json);
  process.stdout.write(`\nShort links emitted: ${map.length}.\n`);
  return map.length;
}
```

- [ ] **Step 8: Run the migration (maintainer's machine)** — Docker and the backups in the
parent directory are required; a fresh clone cannot do this.

Run: `node migration/run.mjs`
Expected: the existing counts unchanged, plus `Short links emitted: N.` and `short links: N`
in the summary; `git status` shows `functions/wp-ids.json` as the only new file and no diffs
in `src/content/`, `src/assets/` or `docs/url-map.csv` (the migration is deterministic).

- [ ] **Step 9: Wire it into the summary** — `migration/run.mjs`: import `writeShortLinks`,
call it after `writeUrlMap`, add `shortLinks` to `summary`, print `  short links:        N` and
add `['short links', summary.shortLinks]` to `mustBePositive`.

- [ ] **Step 10: Write the Function** — `functions/index.ts`

```ts
/*
 * `/` — and only `/` — so the `?p=<id>` short links land on their new pages.
 *
 * A Pages Function file at `functions/index.ts` is routed to the root path
 * alone, which is exactly the surface these URLs use; `/api/contact` is
 * untouched, and every other path continues to the static asset as if this
 * file did not exist (`next()`).
 *
 * THE MAP IS A COMMITTED JSON FILE, generated by `migration/wp-ids.mjs` from
 * the dump and imported here. An id the map does not carry falls through to
 * the homepage: a stale short link lands on the parish's front page, which is
 * a better answer than a 404 and is what happens without this file at all.
 */
import { shortLinkTarget } from '../src/lib/short-links';
import WP_IDS from './wp-ids.json';

export const onRequest = async ({
  request,
  next,
}: {
  request: Request;
  next: () => Promise<Response>;
}): Promise<Response> => {
  if (request.method !== 'GET' && request.method !== 'HEAD') return next();
  const target = shortLinkTarget(new URL(request.url).searchParams.get('p'), WP_IDS);
  if (target === null) return next();
  return Response.redirect(new URL(target, request.url).toString(), 301);
};
```

- [ ] **Step 11: Run the full unit suite**

Run: `TZ=Europe/Zurich npm test`
Expected: PASS, including the committed-map assertions (which need Step 8 to have run).

- [ ] **Step 12: Commit**

```bash
git add src/lib/short-links.ts src/lib/short-links.test.ts migration/wp-ids.mjs \
  migration/wp-ids.test.mjs migration/run.mjs functions/index.ts functions/wp-ids.json
git commit -m "feat(short-links): the ?p= URLs keep working through a Pages Function" -- \
  src/lib/short-links.ts src/lib/short-links.test.ts migration/wp-ids.mjs \
  migration/wp-ids.test.mjs migration/run.mjs functions/index.ts functions/wp-ids.json
```

---

### Task 4: The eight `.doc` study files, converted once to PDF

**Files:**
- Create: `migration/doc-convert.mjs`
- Modify: `migration/url-map.mjs`, `migration/run.mjs`, `migration/pages.test.mjs`,
  `migration/README.md`, `src/content/pages/studii.md`,
  `src/content/articles/2024-12-24-scrisoarea-pastorala-a-mitropolitului-iosif-la-nasterea-domnului-2024.md`,
  `src/lib/documents.itest.ts`
- Generated + committed by the maintainer: eight PDFs under `public/documente/`,
  `docs/url-map.csv` regenerated (144 → 152 rows)

**Interfaces:**
- Consumes: `gatePdf` (`migration/pdf-gate.mjs`), `UPLOADS_ROOT` (`migration/media.mjs`).
- Produces: `DOC_SOURCES`, `docRedirects()`, `convertDocs({ force? })`.

- [ ] **Step 1: Write the failing URL-map test** — append to `migration/pages.test.mjs`'s
`describe('the URL map')`:

```js
  it('adds one row per converted .doc, and the real count is 65 for the test corpus', () => {
    const converted = docRedirects();
    expect(converted).toHaveLength(8);
    const rows = redirectRows(PAGES, POST_SLUGS, [], converted);
    expect(rows).toHaveLength(65);
    expect(new Set(rows.map(([oldPath]) => oldPath)).size).toBe(65);
    expect(rows).toContainEqual([
      '/wp-content/uploads/2024/05/Ueber_die_Taufe.doc',
      '/documente/ueber-die-taufe.pdf',
    ]);
  });
```

Add `import { docRedirects } from './doc-convert.mjs';` to the file's imports.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run migration/pages.test.mjs`
Expected: FAIL — `migration/doc-convert.mjs` does not exist.

- [ ] **Step 3: Write `migration/doc-convert.mjs`**

```js
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { mkdir, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { UPLOADS_ROOT } from './media.mjs';
import { gatePdf } from './pdf-gate.mjs';

/**
 * The eight `.doc` study files on `/resurse/studii/`, converted once to PDF.
 *
 * WHY A SEPARATE, MANUAL STEP RATHER THAN PART OF `run.mjs`. Spec §11's
 * determinism rule says a rerun produces byte-identical output; LibreOffice
 * stamps each PDF with a creation date, so re-converting on every run would
 * make `public/documente/` differ between two runs of an unchanged tree. The
 * conversion therefore happens ONCE, its output is committed like the 87
 * copied PDFs, and the migration only carries the static redirect rows.
 *
 * WHY THESE EIGHT AT ALL. Spec §11 said `.doc` files are not migrated, and the
 * migrated `studii` page then linked them at the old host — links that die
 * with the old host. The ruling of 2026-09-19 (spec §11 amended) is that a
 * reader who clicks a study text gets the text: converted, gated through the
 * same `pdfinfo` gate as every other document, and served from `/documente/`.
 */
export const DOCUMENTS_DIR = 'public/documente';

/** The eight sources, in the order `studii.md` links them. */
export const DOC_SOURCES = [
  { file: 'Ueber_die_Taufe.doc', slug: 'ueber-die-taufe' },
  { file: 'Ueber_die_Heilige_Eucharistie.doc', slug: 'ueber-die-heilige-eucharistie' },
  { file: 'Ueber_das_Gebet_Vater_unser.doc', slug: 'ueber-das-gebet-vater-unser' },
  { file: 'eminescu.doc', slug: 'eminescu' },
  { file: 'unirea.doc', slug: 'unirea' },
  { file: 'secularizare.doc', slug: 'secularizare' },
  { file: 'coruptibilitate.doc', slug: 'coruptibilitate' },
  { file: 'Sinodul-Iasi.doc', slug: 'sinodul-iasi' },
];

/** The rows the URL map gains: old uploads path -> `/documente/<slug>.pdf`. */
export function docRedirects() {
  return DOC_SOURCES.map(({ file, slug }) => [
    `/wp-content/uploads/2024/05/${file}`,
    `/documente/${slug}.pdf`,
  ]);
}

/** `soffice`, wherever this machine keeps it, or a named failure. */
function sofficeBinary() {
  const candidates = ['soffice', '/Applications/LibreOffice.app/Contents/MacOS/soffice'];
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ['--version'], { stdio: 'ignore' });
      return candidate;
    } catch {
      // try the next one
    }
  }
  throw new Error(
    'LibreOffice (soffice) is not installed, and these .doc files need it.\n' +
      'On macOS: brew install --cask libreoffice',
  );
}

/**
 * Converts every source that has no output yet. `--force` re-converts and
 * overwrites. Each output goes through `gatePdf`; a file the gate refuses is
 * deleted and stops the run by name — a converted study text is still an
 * untrusted document until the same gate that judged the other 87 has read it.
 */
export async function convertDocs({ force = false, log = console.log } = {}) {
  const binary = sofficeBinary();
  await mkdir(DOCUMENTS_DIR, { recursive: true });
  let converted = 0;
  for (const { file, slug } of DOC_SOURCES) {
    const out = join(DOCUMENTS_DIR, `${slug}.pdf`);
    if (existsSync(out) && !force) {
      log(`  ${slug}: already converted`);
      continue;
    }
    const source = join(UPLOADS_ROOT, '2024/05', file);
    if (!existsSync(source)) throw new Error(`${file}: not under ${UPLOADS_ROOT}/2024/05/`);
    const scratch = mkdtempSync(join(tmpdir(), 'doc-convert-'));
    try {
      execFileSync(binary, ['--headless', '--convert-to', 'pdf', '--outdir', scratch, source], {
        stdio: ['ignore', 'ignore', 'inherit'],
      });
      const produced = join(scratch, `${basename(file, '.doc')}.pdf`);
      if (!existsSync(produced)) throw new Error(`${file}: LibreOffice produced no PDF`);
      const verdict = gatePdf(produced);
      if (!verdict.ok) throw new Error(`${file}: the PDF gate refused it — ${verdict.reason}`);
      await rename(produced, out);
      log(`  ${slug}: converted`);
      converted += 1;
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
  log(`converted ${converted} document(s); ${DOC_SOURCES.length - converted} already present`);
  return converted;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await convertDocs({ force: process.argv.includes('--force') });
}
```

- [ ] **Step 4: Run the URL-map test** — still FAILS until Step 5 adds the fourth parameter.

- [ ] **Step 5: Add the converted rows to `redirectRows`** — `migration/url-map.mjs`:

```js
export function redirectRows(pages, postSlugs, documents = [], converted = []) {
  const rows = [
    ...pages.map((page) => [`/${page.slug}/`, `/${page.path}/`]),
    ...FIXED_REDIRECTS,
    ...postSlugs.map((slug) => [`/${slug}/`, `/noutati/${slug}/`]),
    ...documents.map(({ from, to }) => [from, to]),
    ...converted,
  ];
```

and `writeUrlMap(documents = [], converted = [])` passes it through, with the header comment
updated to mention the converted rows (they are ordinary rows to the precedence rule: nothing
else claims a `.doc` path).

- [ ] **Step 6: Run the URL-map test** — PASS.

- [ ] **Step 7: Run the conversion (maintainer's machine, LibreOffice required)**

Run: `node migration/doc-convert.mjs`
Expected: eight `converted` lines; `public/documente/` gains eight PDFs; `pdfinfo` opens each.
Then `node migration/run.mjs` to regenerate `docs/url-map.csv` (152 data rows) and
`functions/wp-ids.json`; `git status` shows the new PDFs and the two regenerated files only.

**A MIGRATION RUN REVERTS EVERY HAND EDIT TO MIGRATED CONTENT.** `run.mjs` rewrites
`src/content/pages/`, `src/content/articles/` and `src/assets/content/` from the dump, so the
layout branch's parish photographs in `src/content/pages/istoric.md` (`9e147f9`) come back as
the old ornament — measured on the Task 3 run, which restored the file by hand. After this run,
check `git status` against the branch head, restore every hand-edited content file, and only
then continue. Never commit the reverted version: the site would lose the fix silently while
the migration reported success.

- [ ] **Step 8: Update the pinned document count** — `src/lib/documents.itest.ts`: `EXPECTED`
87 → 95, and update the two comments that say "the measured 87" to say 95 with the reason
(eight converted `.doc` study files, Task 4). Run `TZ=Europe/Zurich npm run test:build`;
the PDF gate now walks 95 files.

- [ ] **Step 9: Rewrite the nine old-host links**

`src/content/pages/studii.md`: replace each
`https://www.bor-zh.ch/wp-content/uploads/2024/05/<file>.doc` with
`/documente/<slug>.pdf` per `DOC_SOURCES`.
`src/content/articles/2024-12-24-scrisoarea-…md`: replace
`https://www.bor-zh.ch/scrisoarea-pastorala-a-mitropolitului-iosif-la-nasterea-domnului-2024/`
with `/noutati/scrisoarea-pastorala-a-mitropolitului-iosif-la-nasterea-domnului-2024/`.

Then verify with node (never `grep`): no `bor-zh.ch` remains under `src/content`.

- [ ] **Step 10: Add the integration assertion** — `src/lib/build-output.itest.ts`, near the
studii page's existing cases: the built `/resurse/studii/` page contains no
`www.bor-zh.ch` and contains all eight `/documente/…pdf` hrefs (positive control: the same
`read()`-loaded page contains `Citeste mai mult`, so an empty page cannot pass).

- [ ] **Step 11: Document the manual step** — `migration/README.md`: a section saying the
`.doc` conversion is one-time, needs LibreOffice, is not part of `run.mjs`, and why
(determinism), naming `doc-convert.mjs`.

- [ ] **Step 12: Run the build and the suites**

Run: `TZ=Europe/Zurich npm run test:build`
Expected: PASS, budget met (the 8 PDFs are links, not requests).

- [ ] **Step 13: Commit**

```bash
git add migration/doc-convert.mjs migration/url-map.mjs migration/run.mjs \
  migration/pages.test.mjs migration/README.md src/lib/documents.itest.ts \
  src/lib/build-output.itest.ts src/content/pages/studii.md \
  src/content/articles/2024-12-24-scrisoarea-pastorala-a-mitropolitului-iosif-la-nasterea-domnului-2024.md \
  public/documente docs/url-map.csv functions/wp-ids.json
git commit -m "feat(documente): the eight .doc studies become gated PDFs, and the last old-host links go" -- \
  migration/doc-convert.mjs migration/url-map.mjs migration/run.mjs \
  migration/pages.test.mjs migration/README.md src/lib/documents.itest.ts \
  src/lib/build-output.itest.ts src/content/pages/studii.md \
  src/content/articles/2024-12-24-scrisoarea-pastorala-a-mitropolitului-iosif-la-nasterea-domnului-2024.md \
  public/documente docs/url-map.csv functions/wp-ids.json
```

---

### Task 5: Sitemap and robots, emitted only when `INDEXABLE`

**Files:**
- Create: `src/lib/sitemap.ts`, `src/lib/sitemap.test.ts`,
  `src/pages/sitemap-[index].xml.ts`, `src/pages/[robots].txt.ts`,
  `scripts/indexable-check.mjs`
- Modify: `package.json` (`test:indexable`, `test:all`), `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `INDEXABLE` (`src/lib/site.ts`), `publishedArticles` (`src/lib/articles.ts`),
  `articleSlug`, `eventSlug` (`src/lib/events.ts`).
- Produces: `sitemapPaths({ pages, articles, albums, events }): string[]`;
  `generateSitemap(paths, site): string`.

- [ ] **Step 1: Write the failing builder tests** — `src/lib/sitemap.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { generateSitemap, sitemapPaths } from './sitemap';

describe('the sitemap', () => {
  const pages = [{ data: { path: 'parohia/istoric' } }, { data: { path: 'contact' } }];
  const articles = [{ id: '2024-06-08-o-stire.md' }];

  it('holds the fixed routes, the prose pages and the published articles once each', () => {
    const paths = sitemapPaths({ pages, articles, albums: [], events: [] });
    expect(paths).toContain('/');
    expect(paths).toContain('/parohia/istoric/');
    expect(paths).toContain('/contact/');
    expect(paths).toContain('/noutati/o-stire/');
    expect(new Set(paths).size).toBe(paths.length);
    expect([...paths]).toEqual([...paths].sort());
  });

  it('writes absolute URLs under the site and an XML declaration', () => {
    const xml = generateSitemap(['/a/'], new URL('https://www.bor-zh.ch'));
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<loc>https://www.bor-zh.ch/a/</loc>');
    expect(xml).toContain('</urlset>');
  });
});
```

- [ ] **Step 2: Run it to verify it fails** — `npx vitest run src/lib/sitemap.test.ts` — FAIL.

- [ ] **Step 3: Write `src/lib/sitemap.ts`**

```ts
import { articleSlug } from './articles';
import { eventSlug } from './events';

/**
 * The sitemap's URL set and its XML, pure so the shapes are testable without a
 * build. The route that calls this is emitted only when `INDEXABLE` is true
 * (`src/lib/site.ts` explains the flag): before the cutover this site is served
 * from a hostname that will stop existing, and a sitemap naming
 * `https://www.bor-zh.ch/…` would point every crawler at the compromised
 * WordPress install. Absent pre-cutover is the designed state, not a gap.
 *
 * NO `lastmod` UNTIL SOMETHING CAN VOUCH FOR IT. An article's date is a
 * publication date, not a modification date, and a sitemap that claims a page
 * changed when it did not teaches crawlers to distrust the field.
 */
export const FIXED_PATHS = [
  '/',
  '/program/',
  '/noutati/',
  '/evenimente/',
  '/galerie/',
  '/pastorale/',
  '/contact/',
  '/doneaza/',
];

export interface SitemapSources {
  pages: Array<{ data: { path: string } }>;
  articles: Array<{ id: string }>;
  albums: Array<{ id: string }>;
  events: Array<{ id: string }>;
}

export function sitemapPaths({ pages, articles, albums, events }: SitemapSources): string[] {
  const paths = new Set(FIXED_PATHS);
  for (const page of pages) paths.add(`/${page.data.path}/`);
  for (const article of articles) paths.add(`/noutati/${articleSlug(article.id)}/`);
  for (const album of albums) paths.add(`/galerie/${album.id}/`);
  for (const event of events) paths.add(`/evenimente/${eventSlug(event.id)}/`);
  return [...paths].sort();
}

export function generateSitemap(paths: string[], site: URL): string {
  const urls = paths.map((path) => `  <url><loc>${new URL(path, site).toString()}</loc></url>`);
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.join('\n') +
    '\n</urlset>\n'
  );
}
```

- [ ] **Step 4: Run the builder tests** — PASS.

- [ ] **Step 5: Write the two routes**

`src/pages/sitemap-[index].xml.ts`:

```ts
/**
 * `/sitemap-index.xml`, emitted ONLY when `INDEXABLE` is true.
 *
 * `getStaticPaths` returning an empty array is what makes the file absent in a
 * pre-cutover build: a static endpoint with no path is never rendered, so
 * `dist/sitemap-index.xml` does not exist and nothing can serve it. The flag
 * flips in the same change that moves DNS (handover B6), and
 * `scripts/indexable-check.mjs` builds the flipped site in a scratch directory
 * so both states are asserted without touching this one.
 */
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { publishedArticles } from '../lib/articles';
import { INDEXABLE } from '../lib/site';
import { generateSitemap, sitemapPaths } from '../lib/sitemap';

export function getStaticPaths() {
  return INDEXABLE ? [{ params: { index: 'index' } }] : [];
}

export const GET: APIRoute = async ({ site }) => {
  if (site === undefined) {
    throw new Error('Astro.site is not configured, so the sitemap cannot write absolute URLs.');
  }
  const paths = sitemapPaths({
    pages: await getCollection('pages'),
    articles: publishedArticles(await getCollection('articles')),
    albums: await getCollection('galerii'),
    events: await getCollection('events'),
  });
  return new Response(generateSitemap(paths, site), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
```

`src/pages/[robots].txt.ts`:

```ts
/**
 * `/robots.txt`, emitted ONLY when `INDEXABLE` is true.
 *
 * NO `Disallow`, EVER — `src/lib/site.ts` explains why in full: disallowing a
 * path stops a crawler fetching it, so it never reads the `noindex` the page
 * was sent to obey. The file exists for one line: the sitemap's address.
 */
import type { APIRoute } from 'astro';
import { INDEXABLE } from '../lib/site';

export function getStaticPaths() {
  return INDEXABLE ? [{ params: { robots: 'robots' } }] : [];
}

export const GET: APIRoute = ({ site }) => {
  if (site === undefined) throw new Error('Astro.site is not configured.');
  return new Response(`User-agent: *\nSitemap: ${new URL('/sitemap-index.xml', site)}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
```

- [ ] **Step 6: Write the positive control** — `scripts/indexable-check.mjs`

```js
/*
 * The sitemap's positive control: a scratch build with `INDEXABLE = true`.
 *
 * The flag is `false` in this repository by design, so the normal build
 * contains no sitemap and no robots.txt — and a guard that only checked their
 * absence would pass just as well if the routes never existed. This copies the
 * project the way `a11y-picker.mjs` does, flips the one line, builds, and
 * asserts the files are there, absolute, and correct; then asserts the real
 * `dist/` has neither. Both directions, one run.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = process.cwd();

function fail(message) {
  console.error(`\n${message}\n`);
  process.exitCode = 1;
}

const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'indexable-')));
try {
  const project = join(scratch, 'project');
  mkdirSync(project);
  for (const name of ['src', 'public', 'scripts', 'astro.config.mjs', 'tsconfig.json', 'package.json']) {
    cpSync(join(ROOT, name), join(project, name), { recursive: true });
  }
  mkdirSync(join(project, 'docs'), { recursive: true });
  cpSync(join(ROOT, 'docs/url-map.csv'), join(project, 'docs/url-map.csv'));
  symlinkSync(join(ROOT, 'node_modules'), join(project, 'node_modules'));
  const cache = join(project, 'cache');
  mkdirSync(cache, { recursive: true });
  const sharedAssets = join(ROOT, 'node_modules/.astro/assets');
  if (existsSync(sharedAssets)) symlinkSync(sharedAssets, join(cache, 'assets'));
  writeFileSync(
    join(project, 'astro.indexable.config.mjs'),
    `import base from './astro.config.mjs';\n` +
      `export default { ...base, cacheDir: ${JSON.stringify(cache)} };\n`,
  );

  const siteFile = join(project, 'src/lib/site.ts');
  const before = readFileSync(siteFile, 'utf8');
  const after = before.replace('export const INDEXABLE = false;', 'export const INDEXABLE = true;');
  if (after === before) {
    fail('site.ts no longer carries `export const INDEXABLE = false;` — this check patched nothing.');
    process.exit(1);
  }
  writeFileSync(siteFile, after);

  execFileSync(
    process.execPath,
    [join(ROOT, 'node_modules/astro/bin/astro.mjs'), 'build', '--root', project, '--config', 'astro.indexable.config.mjs'],
    { stdio: 'inherit', cwd: project },
  );

  const sitemap = join(project, 'dist/sitemap-index.xml');
  const robots = join(project, 'dist/robots.txt');
  if (!existsSync(sitemap) || !existsSync(robots)) {
    fail('INDEXABLE=true produced no sitemap-index.xml and/or robots.txt — the routes are dead.');
    process.exit(1);
  }
  const xml = readFileSync(sitemap, 'utf8');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  if (locs.length < 10 || !locs.every((l) => l.startsWith('https://www.bor-zh.ch/'))) {
    fail(`the sitemap names ${locs.length} URLs and not all are absolute www URLs.`);
    process.exit(1);
  }
  const robotsText = readFileSync(robots, 'utf8');
  if (!robotsText.includes('Sitemap: https://www.bor-zh.ch/sitemap-index.xml') || /Disallow/.test(robotsText)) {
    fail('robots.txt is missing its Sitemap line, or carries a Disallow that must never exist.');
    process.exit(1);
  }

  for (const name of ['sitemap-index.xml', 'robots.txt']) {
    if (existsSync(join(ROOT, 'dist', name))) {
      fail(`dist/${name} exists while INDEXABLE is false — the flag does not gate it.`);
      process.exit(1);
    }
  }
  console.log(`indexable check: ${locs.length} URLs, robots.txt clean, both absent from dist/`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
```

- [ ] **Step 7: Wire the script and the pass**

`package.json`:

```json
"test:indexable": "node scripts/indexable-check.mjs",
"test:all": "npm run test && npm run test:build && npm run a11y:mobile && npm run a11y:wide && npm run a11y:picker && npm run test:indexable",
```

`.github/workflows/ci.yml`: add `- run: npm run test:indexable` after `a11y:picker`, with a
comment saying it is the sitemap's positive control (a scratch build with the flag flipped).

- [ ] **Step 8: Run it**

Run: `TZ=Europe/Zurich npm run test:build && npm run test:indexable`
Expected: PASS, printing `indexable check: N URLs, robots.txt clean, both absent from dist/`.

- [ ] **Step 9: Commit**

```bash
git add src/lib/sitemap.ts src/lib/sitemap.test.ts src/pages/sitemap-\[index\].xml.ts \
  src/pages/\[robots\].txt.ts scripts/indexable-check.mjs package.json .github/workflows/ci.yml
git commit -m "feat(seo): the sitemap and robots.txt exist only where they point at the real host" -- \
  src/lib/sitemap.ts src/lib/sitemap.test.ts 'src/pages/sitemap-[index].xml.ts' \
  'src/pages/[robots].txt.ts' scripts/indexable-check.mjs package.json .github/workflows/ci.yml
```

---

### Task 6: The homepage hero — one image, two crops, a scrim

**Files:**
- Modify: `src/pages/index.astro`, `scripts/check-budget.mjs` (a note, no number)
- Asset: `src/assets/content/2024/05/5d400e5d-4326-4ffb-ad1a-5635ca9a388d.jpg` (already migrated)

**Interfaces:**
- Consumes: `Image` from `astro:assets`; the token roles in `src/lib/tokens.ts`.
- Produces: the hero markup Task 7 measures.

- [ ] **Step 1: Add the image and the markup** — `src/pages/index.astro`

Frontmatter:

```ts
import { Image } from 'astro:assets';
import heroImage from '../assets/content/2024/05/5d400e5d-4326-4ffb-ad1a-5635ca9a388d.jpg';
```

Markup, replacing the `<section class="hero">` block:

```astro
  <section class="hero">
    {/*
      ONE SOURCE, TWO CROPS, AND THE REQUEST COUNT IS WHY. The approved mockup
      asked for a <picture> with a 16:6 source and a 3:2 source; measured
      against `check-budget.mjs`, every <source> is a possible fetch and the
      homepage has exactly one request left (11 of 12 today). Two sources plus
      the fallback measure 14/12 — a red build with no room to raise the limit.
      A single 1600×1200 photograph cropped by `object-fit`/`object-position`
      gives the same two framings for one request: the wide hero box shows the
      16:6 band, the phone's tall box shows the 3:2 one. The focal points below
      are the mockup's; adjust them by eye against `npm run dev`, never by a
      crop algorithm.
    */}
    <Image
      class="hero-img"
      src={heroImage}
      alt=""
      widths={[480, 800, 1200, 1600]}
      sizes="100vw"
      loading="eager"
      fetchpriority="high"
      decoding="async"
    />
    <div class="container hero-in">
      <h1>Bine ați venit</h1>
      <p class="hero-verse">„Căutați mai întâi împărăția lui Dumnezeu și dreptatea Lui” — Matei 6:33</p>
    </div>
  </section>
```

- [ ] **Step 2: The styles** — replace the `.hero`/`.hero-in` rules with:

```css
  .hero { position: relative; background: var(--oxblood); color: var(--parchment); overflow: hidden; }
  /*
   * THE SCRIM IS A FLAT WASH, not a gradient: the verse's second line falls on
   * the photograph's lightest region, and a gradient's thin end is where AA
   * fails. `color-mix` rather than `rgba(107, 31, 38, …)`: the literal would
   * restate `--oxblood`'s channels, and a token change would desync the scrim
   * with no test to notice. The percentage is the one measured by the pixel
   * guard in a11y.mjs (Task 7) — do not lower it without re-measuring, and do
   * not raise it to make the picture "read better"; the guard's number is the
   * requirement.
   */
  .hero::after {
    content: '';
    position: absolute;
    inset: 0;
    background: color-mix(in srgb, var(--oxblood) 78%, transparent);
  }
  .hero-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 50% 42%; }
  /* The phone crop lands on the altar and the icons, not the floor. */
  @media (max-width: 34rem) { .hero-img { object-position: 50% 62%; } }
  .hero-in { position: relative; z-index: 1; padding-block: clamp(2.5rem, 7vw, 4.5rem); }
  /* A 2px gold-lt hairline echoing the feast-row rule. Ornament, never text. */
  .hero { border-bottom: 2px solid var(--gold-lt); }
```

- [ ] **Step 3: Measure the requests and the bytes**

Run: `TZ=Europe/Zurich npm run test:build`
Expected: PASS; the budget's homepage line reads `requests (upper bound) for index.html: 12 / 12`
and the byte budget still under 45 KB. Record the two numbers in the commit message.

- [ ] **Step 4: Put the measurement beside the limit** — `scripts/check-budget.mjs`, in the
`REQUEST_BUDGET` comment beside `'index.html': 12`:

```js
  /*
   * THE HERO LANDED HERE ON 2026-09-19 and this is the note the backlog asked
   * for: one photograph, one <img>, 11 -> 12 of the spec's 12. The approved
   * mockup's two-source <picture> would have measured 14 (each <source> is a
   * possible fetch, and the counter charges every one), which is why the two
   * crops are CSS `object-position` on one source. A second image on this page
   * is a red build; that is the budget asking whether it belongs, not a limit
   * to raise.
   */
```

- [ ] **Step 5: Check the page by eye at both widths**

Run: `npm run dev`, then open `http://localhost:4321/` at a phone width and a desktop width.
Expected: two different framings, the altar visible on the phone, the scrim uniform, the
hairline under the hero.

- [ ] **Step 6: Commit**

```bash
git add src/pages/index.astro scripts/check-budget.mjs
git commit -m "feat(home): the chapel photograph behind the hero, one request, two crops" -- \
  src/pages/index.astro scripts/check-budget.mjs
```

---

### Task 7: The hero's contrast, measured in pixels

axe returns an `incomplete` for text over a background image — it cannot compute the
background — and this project fails on every in-scope incomplete. So the hero needs both an
exemption and the check that replaces it.

**Files:**
- Create: `src/lib/hero-contrast.ts`, `src/lib/hero-contrast.test.ts`
- Modify: `scripts/a11y.mjs` (imports, `heroTextIncompletes`, `measureHeroContrast`, the
  incomplete loop, the condition loop)
- Modify: `src/lib/a11y-passes.test.ts` (the exemption's unit tests)

**Interfaces:**
- Consumes: `sharp` (already a devDependency), the driver's `Page.captureScreenshot`.
- Produces: `contrastRatio(a, b): number`; `heroContrastProblems({ texts, shot, min? }):
  string[]`; `heroTextIncompletes(rule)`.

- [ ] **Step 1: Write the failing maths tests** — `src/lib/hero-contrast.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { contrastRatio, heroContrastProblems, parseRgb } from './hero-contrast';

const shot = (pixels: number[][], channels = 4) => ({
  width: pixels[0].length,
  height: pixels.length,
  channels,
  data: Uint8Array.from(pixels.flat()),
});

describe('contrast maths', () => {
  it('parses the computed rgb() strings a browser returns', () => {
    expect(parseRgb('rgb(250, 246, 238)')).toEqual([250, 246, 238]);
    expect(parseRgb('rgba(250, 246, 238, 0.5)')).toEqual([250, 246, 238]);
    expect(parseRgb('not a colour')).toBeNull();
  });

  it('measures the WCAG extremes', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 1);
    expect(contrastRatio([255, 255, 255], [255, 255, 255])).toBeCloseTo(1, 5);
  });
});

describe('the hero measurement', () => {
  const text = { selector: '.hero-verse', rect: { left: 0, top: 0, width: 2, height: 2 }, color: 'rgb(250, 246, 238)' };

  it('passes when every pixel under the text keeps the ratio', () => {
    const dark = shot([
      [60, 20, 24, 255], [70, 25, 30, 255],
      [80, 30, 34, 255], [75, 28, 32, 255],
    ]);
    expect(heroContrastProblems({ texts: [text], shot: dark })).toEqual([]);
  });

  it('fails naming the selector and the worst ratio when a pixel is too light', () => {
    const mixed = shot([
      [60, 20, 24, 255], [230, 210, 190, 255],
      [70, 25, 30, 255], [75, 28, 32, 255],
    ]);
    const problems = heroContrastProblems({ texts: [text], shot: mixed });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('.hero-verse');
    expect(problems[0]).toMatch(/3\.\d|2\.\d|1\.\d/);
  });

  it('clamps a rect to the screenshot and fails a rect wholly outside it', () => {
    const outside = { ...text, rect: { left: 99, top: 99, width: 2, height: 2 } };
    expect(heroContrastProblems({ texts: [outside], shot: shot([[0, 0, 0, 255]]) })[0]).toContain(
      'outside',
    );
  });

  it('reads three-channel screenshots too', () => {
    const rgb = shot([[60, 20, 24], [70, 25, 30]], 3);
    expect(heroContrastProblems({ texts: [text], shot: rgb })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails** — `npx vitest run src/lib/hero-contrast.test.ts` — FAIL.

- [ ] **Step 3: Write `src/lib/hero-contrast.ts`**

```ts
/**
 * The hero's contrast, computed from the pixels a browser really paints.
 *
 * WHY THIS EXISTS AT ALL. The hero is text over a photograph under an oxblood
 * scrim; axe's color-contrast rule cannot determine a background image and
 * returns an `incomplete`, and this project fails on every in-scope incomplete.
 * The exemption in `scripts/a11y.mjs` says "axe cannot judge this"; this module
 * is the judgement that replaces it, on the same pixels.
 *
 * THE TEXT IS HIDDEN FOR THE SCREENSHOT. Sampling the hero with the glyphs
 * painted in would include the text's own colour — a 1:1 ratio — and every
 * measurement would fail. The browser half hides the text with a style, takes
 * the screenshot, and restores; the pixels under each text rect are therefore
 * the composited scrim-over-photograph, which is exactly what a reader sees
 * behind the glyphs.
 */
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface HeroText {
  selector: string;
  rect: Rect;
  color: string;
}

export interface Screenshot {
  width: number;
  height: number;
  channels: number;
  data: Uint8Array;
}

export function parseRgb(value: string): [number, number, number] | null {
  const match = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(value.trim());
  if (match === null) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function channelLuminance(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

export function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The problems, one line each: a text whose worst pixel under it falls below
 * `min`. A rect with no pixels inside the screenshot is a problem in its own
 * right — a measurement that measured nothing must not pass.
 */
export function heroContrastProblems({
  texts,
  shot,
  min = 4.5,
}: {
  texts: HeroText[];
  shot: Screenshot;
  min?: number;
}): string[] {
  const problems: string[] = [];
  for (const text of texts) {
    const colour = parseRgb(text.color);
    if (colour === null) {
      problems.push(`${text.selector}: the browser reported a colour this check cannot parse: ${text.color}`);
      continue;
    }
    const left = Math.max(0, Math.floor(text.rect.left));
    const top = Math.max(0, Math.floor(text.rect.top));
    const right = Math.min(shot.width, Math.ceil(text.rect.left + text.rect.width));
    const bottom = Math.min(shot.height, Math.ceil(text.rect.top + text.rect.height));
    if (right <= left || bottom <= top) {
      problems.push(`${text.selector}: the text box is outside the screenshot — nothing was measured.`);
      continue;
    }
    let worst = Number.POSITIVE_INFINITY;
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        const at = (y * shot.width + x) * shot.channels;
        const ratio = contrastRatio(colour, [shot.data[at], shot.data[at + 1], shot.data[at + 2]]);
        if (ratio < worst) worst = ratio;
      }
    }
    if (worst < min) {
      problems.push(
        `${text.selector}: worst contrast under the text is ${worst.toFixed(2)}:1 (needs ${min}:1) — ` +
          'darken the scrim or move the crop.',
      );
    }
  }
  return problems;
}
```

- [ ] **Step 4: Run the maths tests** — PASS.

- [ ] **Step 5: Write the failing exemption tests** — append to
`src/lib/a11y-passes.test.ts`:

```ts
import { heroTextIncompletes } from '../../scripts/a11y.mjs';

describe('the hero contrast exemption', () => {
  it('exempts a node whose every selector chain names the hero', () => {
    const rule = {
      id: 'color-contrast',
      nodes: [{ target: ['section.hero > div.hero-in > h1'] }],
    };
    expect(heroTextIncompletes(rule)).toHaveLength(1);
  });

  it('keeps a node that is not clearly the hero in scope', () => {
    const rule = {
      id: 'color-contrast',
      nodes: [{ target: ['section.hero > h1'] }, { target: ['main p'] }],
    };
    expect(heroTextIncompletes(rule)).toHaveLength(1);
  });

  it('returns nothing for another rule, or a target it cannot read', () => {
    expect(heroTextIncompletes({ id: 'image-alt', nodes: [{ target: ['section.hero > h1'] }] })).toEqual([]);
    expect(heroTextIncompletes({ id: 'color-contrast', nodes: [{ target: [] }] })).toEqual([]);
  });
});
```

- [ ] **Step 6: Run it to verify it fails** — FAIL.

- [ ] **Step 7: Add `heroTextIncompletes` and the measurement to `scripts/a11y.mjs`**

Import at the top:

```js
import sharp from 'sharp';
import { heroContrastProblems } from '../src/lib/hero-contrast.ts';
```

After `svgTextIncompletes`, add the exemption:

```js
/*
 * THE HERO'S DECLARED GAP, RECONCILED THE SAME WAY AS THE SVG TEXT. axe cannot
 * resolve a background image, so the hero's h1 and verse arrive as
 * `color-contrast` incompletes whatever their real contrast is. They are
 * exempted here and judged by `measureHeroContrast` below, on the pixels. The
 * matcher is fail-closed: every selector chain in a target must contain
 * `.hero`, or the node stays in scope and fails.
 */
export function heroTextIncompletes(rule) {
  if (rule?.id !== 'color-contrast') return [];
  return (rule.nodes ?? []).filter((node) => {
    const chains = node?.target;
    return (
      Array.isArray(chains) &&
      chains.length > 0 &&
      chains.every((chain) => typeof chain === 'string' && chain.includes('.hero'))
    );
  });
}
```

The browser half, before `runAudit`:

```js
/*
 * The hero, measured the way a reader sees it. One navigation to `/`, the
 * text's rects and computed colours read from the DOM, the text hidden with an
 * injected style, one clipped screenshot of the hero, then the pixels judged
 * by `heroContrastProblems`. The style is removed in a `finally`, so a failure
 * cannot leave the page altered for the axe pass that follows.
 *
 * IT FAILS WHEN IT FINDS NOTHING TO MEASURE. A `.hero` with no text, or a
 * screenshot that comes back empty, is a guard that measured nothing and must
 * not report a pass — the same rule every file-reading guard in this project
 * follows.
 */
async function measureHeroContrast(driver, url, log) {
  await driver.get(url('index.html'));
  const hero = await driver.executeScript(`
    const section = document.querySelector('.hero');
    if (section === null) return null;
    const r = section.getBoundingClientRect();
    const texts = [...section.querySelectorAll('h1, p')].map((el) => {
      const b = el.getBoundingClientRect();
      return {
        selector: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ').join('.') : ''),
        rect: { left: b.left, top: b.top, width: b.width, height: b.height },
        color: getComputedStyle(el).color,
      };
    });
    return { hero: { left: r.left, top: r.top, width: r.width, height: r.height }, texts };
  `);
  if (hero === null) return ['the homepage has no .hero section — the contrast guard measured nothing.'];
  if (hero.texts.length === 0) return ['the .hero section has no text — the contrast guard measured nothing.'];
  const problems = [];
  let shot = null;
  try {
    await driver.executeScript(`
      const style = document.createElement('style');
      style.id = 'hero-contrast-probe';
      style.textContent = '.hero h1, .hero p { visibility: hidden !important; }';
      document.head.append(style);
    `);
    const result = await driver.sendDevToolsCommand('Page.captureScreenshot', {
      format: 'png',
      clip: { x: hero.hero.left, y: hero.hero.top, width: hero.hero.width, height: hero.hero.height, scale: 1 },
    });
    shot = await sharp(Buffer.from(result.data, 'base64')).raw().toBuffer({ resolveWithObject: true });
  } finally {
    await driver.executeScript("document.getElementById('hero-contrast-probe')?.remove()");
  }
  const texts = hero.texts.map((t) => ({
    ...t,
    rect: {
      left: t.rect.left - hero.hero.left,
      top: t.rect.top - hero.hero.top,
      width: t.rect.width,
      height: t.rect.height,
    },
  }));
  problems.push(
    ...heroContrastProblems({
      texts,
      shot: { width: shot.info.width, height: shot.info.height, channels: shot.info.channels, data: shot.data },
    }),
  );
  for (const text of texts) {
    log(`  hero contrast ${text.selector}: measured against ${shot.info.width}x${shot.info.height} px`);
  }
  return problems;
}
```

Then in `runAudit`'s condition loop, after the page loop and before `extraCheck`:

```js
      /*
       * The hero's crop differs by width (16:6 at desk, 3:2 at phone), so this
       * runs per condition, not once per pass like the reading column.
       */
      if (toAudit.includes('index.html')) {
        const heroProblems = await measureHeroContrast(driver, url, log);
        for (const problem of heroProblems) fail(`  ${problem}`);
        await prepare(driver, condition);
      }
```

and in the incomplete loop, extend the exemption:

```js
          const exempt = [...svgTextIncompletes(undecided), ...heroTextIncompletes(undecided)];
```

with the printed label changed to say which declared gap (SVG text or the hero's photographed
ground) each exempt node belongs to.

- [ ] **Step 8: Run the browser passes**

Run: `TZ=Europe/Zurich npm run a11y && npm run a11y:mobile`
Expected: PASS, with `hero contrast .h1: measured against …` and `hero contrast .p.hero-verse: …`
printed in each. If the verse fails, raise the scrim's alpha in `index.astro` (Task 6) and
re-run — the number is the requirement, not the mockup.

- [ ] **Step 9: Commit**

```bash
git add src/lib/hero-contrast.ts src/lib/hero-contrast.test.ts scripts/a11y.mjs \
  src/lib/a11y-passes.test.ts
git commit -m "feat(a11y): the hero's contrast is measured in pixels, since axe cannot see it" -- \
  src/lib/hero-contrast.ts src/lib/hero-contrast.test.ts scripts/a11y.mjs src/lib/a11y-passes.test.ts
```

---

### Task 8: A page's `image` field renders, and four pages choose one

**Files:**
- Modify: `src/pages/[...page].astro`
- Content (only the pages the pick chooses): `src/content/pages/istoric.md`,
  `src/content/pages/cursuri-de-pictura.md`, `src/content/pages/scoala-parohiala.md`,
  `src/content/pages/consiliul-parohial.md` — add `image:` to a chosen page only; a page with
  no picture worth showing stays text-only

**Interfaces:**
- Consumes: `ContentImage.astro` (existing), `pageSchema.image` (existing).
- Produces: a prose page with `image:` renders exactly one hero image above the body.

- [ ] **Step 1: Write the failing integration assertion** — `src/lib/build-output.itest.ts`:
add a case that reads the built `/parohia/istoric/` page (which does not set `image` today) and
asserts the page has no `.page-image` wrapper; and a case reading the first prose page that
does set `image` after Step 3, asserting the wrapper and one `<img` inside it. Write the
second case after choosing the image, against the real page.

- [ ] **Step 2: Render the field** — `src/pages/[...page].astro`: import `ContentImage` and add
above `<Content />`:

```astro
    {entry.data.image && (
      <div class="page-image">
        <ContentImage
          image={entry.data.image}
          alt={title}
          sizes="(max-width: 34rem) 90vw, 68ch"
          loading="eager"
        />
      </div>
    )}
```

and in the styles:

```css
  .page-image { margin: 0 0 1.75rem; border: 1px solid var(--rule); }
```

The `alt` is the page title: a CMS image on a prose page is a lead picture, not an ornament —
a volunteer who wants it decorative can leave the field empty, which renders nothing.

- [ ] **Step 3: Choose the pictures by eye** — with `npm run dev` running, the user picks one
image per page from the page's own migrated images:

- `comunitate/pictura` — from `src/assets/content/2024/05/` (the painting-course photographs).
- `comunitate/scoala` — the school/children photographs.
- `parohia/consiliul` — the council group photograph, not a portrait (portraits are inline).
- `parohia/istoric` — decide whether the St Nicholas icon moves to the hero slot; if it stays
  inline, set no `image`.

Then add the `image:` frontmatter field to each chosen page only. **Do not fill the field for
the sake of it** — a page with no picture worth showing stays text-only.

- [ ] **Step 4: Run the build and the browser pass**

Run: `TZ=Europe/Zurich npm run test:build && npm run a11y`
Expected: PASS; the chosen pages' request counts stay inside their budgets (the prose-page
limits carry room for three to six more images).

- [ ] **Step 5: Commit**

```bash
git add src/pages/\[...page\].astro src/lib/build-output.itest.ts src/content/pages
git commit -m "feat(pages): a prose page's image renders, and four pages carry one" -- \
  'src/pages/[...page].astro' src/lib/build-output.itest.ts src/content/pages
```

---

### Task 9: `/doneaza` repairs, and the two stock images leave

**Files:**
- Modify: `src/content/pages/doneaza.md`,
  `src/content/articles/2024-05-21-catehismul-bisericii-ortodoxecatehismul-bisericii-ortodoxe.md`
- Assets: choose replacements from `src/assets/content/2024/05/`

**Interfaces:**
- Consumes: nothing new.
- Produces: `/doneaza` with one payment code; no unlicensed stock imagery.

- [ ] **Step 1: Remove the duplicate QR-bill screenshot (B1)** — `doneaza.md` line 30's first
image, `Screenshot-2025-12-11-at-11.23.04.png`, goes. The generated QR-bill below the prose is
the only payment code on the page. The asset file stays in `src/assets/content/` (the
migration would re-add it; unreferenced files are not built).

- [ ] **Step 2: Fix the dangling IBAN sentence (B2)** — remove these two paragraphs:

```markdown
**Rumänisch - Orthodoxe Kirchgem, St. Nikolaus ZH Zürich IBAN:** 

**Bank: UBS(Schweiz) AG**
```

The structured `AccountBlock`s below carry all three IBANs, the holder and the bank with copy
buttons; the prose sentence promised a number that lived in the screenshot Step 1 removes.

- [ ] **Step 3: Remove the stray body title (B3)** — delete the bare `Donează` paragraph at
line 7; the `<h1>` already says it.

- [ ] **Step 4: Replace the two stock images (B5)** — the user picks parish photographs (the
same by-eye step as Task 8):

- `doneaza.md`'s remaining image (the istockphoto drawing) → a parish photograph, or nothing if
  the page reads better with the prose alone. If kept, it is decorative: empty `![]()` alt.
- the catehism article's `image:` frontmatter (AdobeStock) → a photograph from the catechesis
  or school images. This article is `published: false`; the replacement matters for the day the
  parish publishes it.

- [ ] **Step 5: Verify the page**

Run: `TZ=Europe/Zurich npm run test:build`
Expected: PASS; `/doneaza`'s request count drops (the screenshot is gone) and its byte count
drops below the previous measurement. Read the built `/doneaza/` page with node and confirm
exactly one `qr-bill` SVG and no `Screenshot-2025-12-11` string.

- [ ] **Step 6: Commit**

```bash
git add src/content/pages/doneaza.md \
  src/content/articles/2024-05-21-catehismul-bisericii-ortodoxecatehismul-bisericii-ortodoxe.md
git commit -m "content(doneaza): one payment code, no dangling IBAN, no stock imagery" -- \
  src/content/pages/doneaza.md \
  src/content/articles/2024-05-21-catehismul-bisericii-ortodoxecatehismul-bisericii-ortodoxe.md
```

---

### Task 10: CMS uploads are re-encoded at build time

**Files:**
- Create: `scripts/uploads-sanitise.mjs`, `src/lib/uploads.itest.ts`
- Modify: `astro.config.mjs` (integration), `scripts/a11y-picker.mjs` and
  `scripts/indexable-check.mjs` (nothing to change: empty uploads copy fine)

**Interfaces:**
- Consumes: `sharp`.
- Produces: `sanitiseUploads({ src?, out?, log? }): Promise<number>`;
  `uploadsSanitise` integration.

- [ ] **Step 1: Write the failing integration test** — `src/lib/uploads.itest.ts`

```ts
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { sanitiseUploads } from '../../scripts/uploads-sanitise.mjs';

/*
 * THE POSITIVE CONTROL IS SYNTHETIC, because `public/uploads/` is empty on
 * every fresh clone — the CMS creates it on the first upload. A guard that
 * walks an empty tree proves nothing, so the test manufactures an image that
 * carries EXIF, runs the sanitiser over it, and shows the metadata is gone.
 * Only then does it assert the built tree.
 */
const DIST_UPLOADS = fileURLToPath(new URL('../../dist/uploads/', import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), 'uploads-itest-'));

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe('uploads sanitisation', () => {
  it('strips EXIF from a synthetic tagged image', async () => {
    const source = join(scratch, 'src');
    const out = join(scratch, 'out');
    const dir = join(source, '2024/05');
    mkdirSync(dir, { recursive: true });
    const tagged = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#808080' },
    })
      .withExif({ IFD0: { Copyright: 'a name', Software: 'a camera' } })
      .jpeg()
      .toBuffer();
    writeFileSync(join(dir, 'tagged.jpg'), tagged);
    expect((await sharp(join(dir, 'tagged.jpg')).metadata()).exif).toBeDefined();

    await sanitiseUploads({ src: source, out, log: () => {} });

    expect((await sharp(join(out, '2024/05/tagged.jpg')).metadata()).exif).toBeUndefined();
  });

  it('every built upload decodes and carries no EXIF', async () => {
    if (!existsSync(DIST_UPLOADS)) return; // no uploads in this build is a legitimate state
    for (const file of readdirSync(DIST_UPLOADS, { recursive: true }) as string[]) {
      const full = join(DIST_UPLOADS, file);
      const metadata = await sharp(full).metadata();
      expect(metadata.format, `${file} does not decode as an image`).toBeDefined();
      expect(metadata.exif, `${file} still carries EXIF`).toBeUndefined();
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/uploads.itest.ts --config vitest.itest.config.ts` (after a build)
Expected: FAIL — `scripts/uploads-sanitise.mjs` does not exist.

- [ ] **Step 3: Write `scripts/uploads-sanitise.mjs`**

```js
/*
 * Every file the CMS uploads is re-encoded into the build, so what ships
 * carries pixels and nothing else.
 *
 * WHY THE BUILD AND NOT THE CMS. `public/uploads/` is committed and served
 * as-is (public/admin/config.yml explains the pair), so a photograph a
 * volunteer uploads ships with whatever the camera wrote into it — EXIF, and
 * GPS inside it. The migration's `src/assets/content/` is safe because sharp
 * re-encoded it; this gives the CMS path the same treatment at the only point
 * the project controls: the build. `astro:build:done` runs after `public/` is
 * copied, so the files are rewritten in `dist/` and the committed originals
 * are untouched.
 *
 * A FILE THAT DOES NOT DECODE STOPS THE BUILD, BY NAME. The migration DROPS a
 * file that fails to decode, because the source came off a compromised server
 * and a dropped file is a success. An upload is different: it is a volunteer's
 * file, a page may reference it, and silently dropping it would 404 a page
 * that looked fine at save time. Failing names the file and the reason.
 */
import { readdirSync, statSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import sharp from 'sharp';

export const UPLOADS_SRC = 'public/uploads';
export const UPLOADS_OUT = 'dist/uploads';

/** Every file under `dir`, recursively, as paths relative to it. */
function filesUnder(dir, found = [], base = dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) filesUnder(path, found, base);
    else found.push(relative(base, path));
  }
  return found;
}

/**
 * Re-encodes every file from `src` into `out`, returning how many it wrote.
 * `rotate()` with no argument applies the EXIF orientation and then discards
 * it; no `withMetadata()` call means no EXIF, no GPS, no ICC profile — the
 * same "decode and re-encode is the sanitisation" ruling the migration follows.
 */
export async function sanitiseUploads({ src = UPLOADS_SRC, out = UPLOADS_OUT, log = console.log } = {}) {
  let written = 0;
  if (statSync(src, { throwIfNoEntry: false }) === undefined) {
    log(`uploads: ${src}/ does not exist — nothing to sanitise`);
    return 0;
  }
  for (const file of filesUnder(src)) {
    const from = join(src, file);
    const to = join(out, file);
    let buffer;
    try {
      buffer = await sharp(from).rotate().toBuffer();
    } catch (error) {
      throw new Error(
        `${from} is not an image this build can decode (${error.message}).\n` +
          'A CMS upload must be a raster image; SVG is not re-encodable and is not accepted here.',
      );
    }
    await mkdir(dirname(to), { recursive: true });
    await writeFile(to, buffer);
    written += 1;
  }
  log(`uploads: ${written} file(s) re-encoded into ${out}/, metadata dropped`);
  return written;
}

/** The Astro integration. Wired in `astro.config.mjs`. */
export const uploadsSanitise = {
  name: 'uploads-sanitise',
  hooks: {
    'astro:build:done': async ({ logger }) => {
      await sanitiseUploads({ log: (message) => logger.info(message) });
    },
  },
};
```

- [ ] **Step 4: Wire it** — `astro.config.mjs`: import and add to `integrations` (after
`redirects`).

- [ ] **Step 5: Run the build and the itest**

Run: `TZ=Europe/Zurich npm run test:build`
Expected: PASS, with `uploads: 0 file(s) re-encoded` on this tree (the directory is empty) and
the synthetic control proving the sanitiser strips EXIF.

- [ ] **Step 6: Commit**

```bash
git add scripts/uploads-sanitise.mjs src/lib/uploads.itest.ts astro.config.mjs
git commit -m "feat(security): CMS uploads are re-encoded at build time, GPS included" -- \
  scripts/uploads-sanitise.mjs src/lib/uploads.itest.ts astro.config.mjs
```

---

### Task 11: The footer links `/program/` once

**Files:**
- Modify: `src/components/SiteFooter.astro`
- Test: `src/lib/build-output.itest.ts` if it pins the footer labels

**Interfaces:** none new.

- [ ] **Step 1: Remove the duplicate** — in the Contact block, delete the line
`<a href="/program/">Program liturgic</a>`; the Site menu keeps `Program`. The Calendar block's
`Abonare la program (.ics)` is a different target and stays.

- [ ] **Step 2: Run the suite**

Run: `TZ=Europe/Zurich npm run test:build`
Expected: PASS. If a test pinned the old label, update the pin to the surviving one — never
loosen the assertion.

- [ ] **Step 3: Commit**

```bash
git add src/components/SiteFooter.astro src/lib/build-output.itest.ts
git commit -m "fix(footer): one Program link, not two" -- \
  src/components/SiteFooter.astro src/lib/build-output.itest.ts
```

---

### Task 12: The editors' guide and card

**Files:**
- Create: `docs/ghid-editor.md`, `docs/editors-card.md`
- Modify: `docs/handover.md` (J1 names the card), `README.md` (points at the guide)

**Interfaces:** none — documents, swept by the tracked-file guards.

- [ ] **Step 1: Write `docs/ghid-editor.md`** — Romanian, short, one section per question in
spec §16, each with the measured behaviour:

- **Cum adaug o știre** — `/admin/` → Articole → Create New Entry; `Save` publishes;
  `Publicat` unchecked keeps it off the site entirely (no page, no list, no feed).
- **Cum actualizez programul săptămânii** — add days; the ⋮ menu's **Duplicate** copies last
  week; the date is the file name and does not change by itself (delete and re-add a wrong
  date; write down H5's observed behaviour here once it is known).
- **Cum adaug poze** — the media library; uploads keep their metadata until the build-time
  sanitiser is live, so strip location data before uploading.
- **Cum schimb datele de contact** — Setări, the singleton.
- **Ce fac dacă ceva nu apare pe site** — wait a few minutes; the GitHub failure e-mail names
  no file; open its link and read the Romanian text at the top of the run page; if it is not
  about your file, forward it to whoever maintains the site.

- [ ] **Step 2: Write `docs/editors-card.md`** — one printable page, Romanian, the rows the
handover says belong on it:

- `Save` publică. Nu există buton „Publish”.
- Meniul ⋮ de lângă `Save`: **Duplicate · Delete · Edit Slug · Revert All Changes**.
- Miniaturile din biblioteca media pot apărea goale (`blob:` oprit de politică); fișierele
  sunt intacte.
- Un e-mail roșu de la GitHub nu numește niciun fișier; textul în românește e sus, pe pagina
  rulării.
- Pozele păstrează metadatele camerei până la reconstrucție; scoateți locația înainte de
  încărcare.

- [ ] **Step 3: Point the handover and README at them**

`docs/handover.md` J1: replace "Print the editors' card" with the path
`docs/editors-card.md`. `README.md`: the section for editors gains one line naming
`docs/ghid-editor.md`.

- [ ] **Step 4: Run the document sweeps**

Run: `TZ=Europe/Zurich npx vitest run src/lib/diacritics-sources.test.ts src/lib/referenced-paths.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/ghid-editor.md docs/editors-card.md docs/handover.md README.md
git commit -m "docs(editors): the Romanian guide and the printable card" -- \
  docs/ghid-editor.md docs/editors-card.md docs/handover.md README.md
```

---

### Task 13: The Romanian failure annotation

**Files:**
- Create: `scripts/annotations.mjs`, `src/lib/annotations.test.ts`
- Modify: `scripts/check-budget.mjs`

**Interfaces:**
- Consumes: `PAGE_EXPLANATION` (stays in `check-budget.mjs`).
- Produces: `escapeAnnotation(text): string`; `budgetAnnotation(pages, explanation): string`.

- [ ] **Step 1: Write the failing tests** — `src/lib/annotations.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { budgetAnnotation, escapeAnnotation } from '../../scripts/annotations.mjs';

describe('the GitHub annotation', () => {
  it('escapes the three characters GitHub requires', () => {
    expect(escapeAnnotation('a%\nb\rc')).toBe('a%25%0Ab%0Dc');
  });

  it('names every failing page and carries the Romanian explanation', () => {
    const text = budgetAnnotation(['program/index.html', 'noutati/index.html'], 'EXPLICAȚIE');
    expect(text.startsWith('::error::')).toBe(true);
    expect(text).toContain('program/index.html');
    expect(text).toContain('noutati/index.html');
    expect(text).toContain('EXPLICAȚIE');
    expect(text).not.toContain('\n');
  });
});
```

- [ ] **Step 2: Run it to verify it fails** — `npx vitest run src/lib/annotations.test.ts` — FAIL.

- [ ] **Step 3: Write `scripts/annotations.mjs`**

```js
/*
 * The Romanian failure notice, as a GitHub workflow annotation.
 *
 * WHAT THIS CAN AND CANNOT DO, said plainly because the difference is the
 * whole design. Spec §16 asks for a failure hook that e-mails the editor in
 * Romanian; the only e-mail GitHub sends is its own, in English, and this
 * repository cannot change it. What it CAN do is put the Romanian text at the
 * top of the run page the e-mail links to — `::error::` annotations render
 * there — so README's instruction ("open the link and read what is at the top")
 * is true. The e-mail itself is a Phase 5 item once K2's Resend domain is
 * verified; `docs/handover.md` carries it as a gap.
 *
 * ESCAPING IS GITHUB'S, NOT OURS: `%` becomes `%25`, newline `%0A`, carriage
 * return `%0D`. An annotation is one line; an unescaped newline truncates it.
 */
export function escapeAnnotation(text) {
  return text.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

/** The one annotation a failed budget prints. `pages` are dist-relative paths. */
export function budgetAnnotation(pages, explanation) {
  const named = pages.length > 0 ? `Pagini: ${pages.join(', ')}.` : '';
  return `::error::${escapeAnnotation(
    ['Bugetul de performanță a fost depășit.', named, explanation].filter(Boolean).join('\n'),
  )}`;
}
```

- [ ] **Step 4: Run the tests** — PASS.

- [ ] **Step 5: Emit it from `check-budget.mjs`** — import the helper, record failing pages in
`report`, and at the end (before `process.exit(1)`) write the annotation when
`process.env.GITHUB_ACTIONS` is set:

```js
import { budgetAnnotation } from './annotations.mjs';
```

```js
const failedPages = new Set();
function report(label, value, limit, unit = 'bytes', explanation = '') {
  const ok = value <= limit;
  if (!ok) {
    failed = true;
    /*
     * The labels are not all page paths: the JS report is called as
     * `  visitor JS on <page>`. Normalise to the page path, so the annotation
     * names pages a volunteer can recognise rather than a sentence fragment.
     */
    failedPages.add(label.trim().replace(/^visitor JS on\s+/, ''));
  }
  ...
}
```

```js
if (failed) {
  if (process.env.GITHUB_ACTIONS) {
    process.stdout.write(`\n${budgetAnnotation([...failedPages], PAGE_EXPLANATION)}\n`);
  }
  console.error('\nThe performance budget was exceeded (spec §13).');
  process.exit(1);
}
```

The byte and request reports are called with the page path as the label; the JS report's label
is a sentence (`visitor JS on <page>`), which is why the normalisation above exists. If another
report call site is added, normalise its label the same way rather than adding a second
mechanism.

- [ ] **Step 6: Prove it fires without breaking the build** — temporarily set
`PAGE_BUDGET['program/index.html']` to `1024`, run `GITHUB_ACTIONS=true node scripts/check-budget.mjs`
against the existing `dist/`, and confirm the `::error::` line names the `/program/` page and
carries the Romanian text. Revert the limit; never commit it.

- [ ] **Step 7: Commit**

```bash
git add scripts/annotations.mjs src/lib/annotations.test.ts scripts/check-budget.mjs
git commit -m "feat(ci): the Romanian budget explanation reaches the run page" -- \
  scripts/annotations.mjs src/lib/annotations.test.ts scripts/check-budget.mjs
```

---

### Task 14: The documentation truth pass

**Files:**
- Modify: `docs/handover.md`, `README.md`

**Interfaces:** none.

- [ ] **Step 1: Fix the stale old-link count** — handover §I's "53 absolute links" paragraph:
replace with the measured state after Task 4: the migration rewrote most in `d73b49e`; the 8
`.doc` links and the 1 pastoral-letter page link were the last 9, rewritten in this branch, and
`src/content` now carries zero `bor-zh.ch` links (verify with node before writing the number).

- [ ] **Step 2: Update what the build now does** — handover §L's hand-off bullets:

- `docs/url-map.csv` is now served: `scripts/redirects.mjs` emits `dist/_redirects` at build
  time; add a live sample check to section F (`curl -sI` on an old PDF path expecting 301, and
  on `/wp-content/anything` expecting 410) — F is where "Cloudflare never serves the file"
  already lives.
- `?p=` is now a Function; add it to the unverified list (nothing here can run it).
- `/sitemap-index.xml` and `robots.txt` now exist **only when `INDEXABLE` flips**; the cutover
  section gains the line "flip the flag and the sitemap and robots.txt appear; submit the
  sitemap" beside B6.
- CMS uploads are re-encoded at build; the "tell editors to strip metadata" sentence becomes
  "this is now enforced at build time; the guide still says it for the CMS's own previews".
- The editors' card and guide exist at their paths; J1 prints the card.
- The `.doc` conversion is a one-time maintainer step; note it beside the migration section.
- **Any future `node migration/run.mjs` reverts hand edits to migrated content** (measured: the
  layout branch's `istoric.md` photographs came back as the old ornament on the Task 3 run).
  Write this into the migration section with the restore-after-run rule, because a reverted
  hand edit is invisible in the migration's success output.

- [ ] **Step 3: Correct README's claim** — the line saying the e-mail names no file now
continues "...dar pagina rulării are sus textul în românește" — which Task 13 makes true. Keep
the sentence about the e-mail naming no file; it is still accurate.

- [ ] **Step 4: Run the document sweeps**

Run: `TZ=Europe/Zurich npx vitest run src/lib/diacritics-sources.test.ts src/lib/referenced-paths.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/handover.md README.md
git commit -m "docs(handover): what Phase 4 changed, and the live checks that go with it" -- \
  docs/handover.md README.md
```

---

### Task 15: The full gate

- [ ] **Step 1: Run everything**

Run: `TZ=Europe/Zurich npm run test:all && TZ=Europe/Zurich npm run check`
Expected: exit 0 for both. `test:all` now runs 817+ unit tests, 307+ integration tests, four
browser passes (each printing its reading-column and hero measurements), the picker pass, and
`test:indexable`; the budget prints `Budget met.`; `check` prints 0 errors, 0 warnings,
0 hints.

- [ ] **Step 2: Verify the tree**

Run: `git status` then `git diff-index --quiet HEAD -- src scripts public functions migration docs README.md astro.config.mjs package.json .github`; expected exit 0 (the index refresh first, per the handover's caveat).

- [ ] **Step 3: Commit the plan document itself** (if not already committed) and finish the
branch through `superpowers:finishing-a-development-branch`.

---

## Steps only you can run

1. **Task 3, Step 8** and **Task 4, Step 7**: `node migration/run.mjs` (Docker + the backups in
   the parent directory), and `node migration/doc-convert.mjs` after
   `brew install --cask libreoffice`. These regenerate `docs/url-map.csv`,
   `functions/wp-ids.json` and the eight PDFs; a fresh clone cannot do them.
2. **Tasks 6, 8 and 9**: the by-eye image choices, with `npm run dev` running.
3. **Task 12**: printing `docs/editors-card.md` for J1.
4. **After deployment**: handover F's new redirect samples, the short-link check, and the
   sitemap submission at the cutover — all in `docs/handover.md`.

## Self-review notes

- **Spec coverage:** §8's per-day link (rejected, Task 1); §11's `.doc` amendment (Task 1/4);
  §12's redirects and 410s (Task 2), the `?p=` form (Task 3), apex→www (Task 2);
  §13's budget (Tasks 6, 7); §15's sitemap submission and snapshot links (Tasks 4, 5, 14);
  §16's guide, card and failure notice (Tasks 12, 13); §19's "redirects, DNS and mail
  rehearsal, old-site snapshot, launch, editor training" — the DNS/mail/snapshot/training
  steps are handover A–L, and this plan updates what they say.
- **Deliberately not built:** Lighthouse automation (Phase 5), the Romanian e-mail (Phase 5,
  after K2), attachment short links (Phase 5), `/events` inventory from the dump (the
  wildcards cover the measured shapes; a live 404 report after cutover is the backstop).
- **Known risks carried:** Cloudflare's `_redirects` 410 support is spec §12's assumption and
  is only verifiable live (handover F); LibreOffice's output is not byte-reproducible, which
  is why conversion is one-time; axe's hero incompletes are exempted by a fail-closed matcher
  and the pixel guard is the replacement.
