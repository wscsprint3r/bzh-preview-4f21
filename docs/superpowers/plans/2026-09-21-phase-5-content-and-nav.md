# Phase 5 — Content and Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** The four content-and-navigation changes the parish asked for on 2026-09-21 — Școala
parohială replaces Evenimente in the top header, ten new photographs enter the gallery as two
albums, the school page shows two of them, and the homepage hero becomes the cross procession —
each with the guard that proves it, and the photographs imported with the migration's own
sanitising re-encode.

**Architecture:** No new subsystem. Two content collections gain entries, one component's link
list changes, one page's frontmatter and body change, and `src/pages/index.astro` points at a
new derivative asset. The photographs are imported through `reencode` from `migration/media.mjs`
(the function the migration already uses) from a scratch script outside version control; the
durable artefact is a new sweep over `src/assets/content` that proves every committed photograph
has been through that treatment. The hero keeps the Phase 4 shape — one derivative, one request,
three widths, a byte ceiling that does not move.

**Tech Stack:** Astro 7 (static), TypeScript, Vitest, sharp, selenium-webdriver + Chrome,
GitLab (MR-based merge; CI is GitHub Actions).

**Spec:** `docs/superpowers/specs/2026-09-15-parish-site-rewrite-design.md` (§5 information
architecture, §11 migration treatment, §13 budget). **Backlog:** the decision table in
`docs/superpowers/plans/2026-09-19-phase-4-backlog.md` — its A1 row chose the old hero
photograph and is amended in Task 6. **This plan is the Phase 5 scope by decision of
2026-09-21**: the items Phase 4 deferred to Phase 5 (Lighthouse automation, the Romanian
build-failure e-mail, `?p=` for other post types) are NOT in it.

**This document stays untracked until Task 6.** It names files the tasks have not created yet,
and `src/lib/referenced-paths.test.ts` sweeps every tracked file's backticked paths — the same
reason the Phase 4 plan was committed only on its final tree. Running `npm test` with the plan
untracked is green; committing it early reddens that sweep.

## Global Constraints

- **Diacritics are comma-below.** U+0218/U+0219 and U+021A/U+021B only; the Turkish cedilla
  forms are a defect. Never write a `backslash-u` escape into any file — it is decoded on the
  way to disk. Build such characters from numbers or write them directly.
- **Identifiers are English** — variables, functions, files, tests, diagnostics. Romanian is
  only for what a person reads: page copy, album titles, CMS labels and Zod messages.
- **Dates are `YYYY-MM-DD` strings, times `HH:MM` local strings.** Only `todayInZurich()` and
  `timeInZurich()` in `src/lib/week.ts` read a clock.
- **`#B08B3E` and `#C8A45C` are ornament only, never text**; the hero's text palette is
  `TEXT_ROLES_ON_OXBLOOD` in `src/lib/tokens.ts`.
- **Zod comes from `astro/zod`**, never a direct dependency.
- **No budget limit is raised.** `PAGE_BUDGET` and `REQUEST_BUDGET` in
  `scripts/check-budget.mjs` do not move, and neither does `HERO_BYTES_CEILING` (180,000 B) in
  `src/lib/hero-image.itest.ts`. A photograph that does not fit is re-cut or re-encoded.
- **The new photographs are treated exactly as the migration treats its uploads**: through
  `reencode` in `migration/media.mjs` — decode, downscale to a 2400px long edge, re-encode,
  no metadata. Nothing is copied byte-for-byte into `src/assets/content`.
- **The parent directory is not part of this repository.** The import reads
  `/Users/stefan/Work/stuff/site-bzh/new_resources` by absolute path; never `git add` anything
  from outside the root, and never weaken `.gitignore`. Scratch scripts live in .superpowers/
  (git-ignored) and are deleted after their run.
- **Test verdicts come from process exit codes**, never `.vitest/json/output.json`. Use
  `rtk proxy` for any command whose output decides something, and `process.stdout.write` for a
  number a later reader must see on a green run.
- **A guard that reads files must prove it read something**, and every "X is absent" claim
  needs a positive control showing the detector can fire.
- **Commit style:** conventional subject, body explaining the measurement, explicit pathspecs
  (`git commit -m … -- <paths>`) so nothing unrelated is swept in.
- **Gate before every commit that touches the build:** `TZ=Europe/Zurich npm test`; for tasks
  that change output, `TZ=Europe/Zurich npm run test:build`. Task 6 runs
  `TZ=Europe/Zurich npm run test:all` and `TZ=Europe/Zurich npm run check`.

---

## File Structure

| File | What it carries |
|---|---|
| `src/components/SiteHeader.astro` | The seven-link list and the phone-wrap measurements |
| `src/lib/build-output.itest.ts` | The header-set guard, the generalised frontmatter-image guard, the school-page replacement guard |
| `migration/media.mjs` | `reencode` becomes exported so the import cannot drift from the migration |
| `src/lib/content-assets.test.ts` | New: the sweep over every committed photograph, and the ten-file contract |
| `src/assets/content/2025/12/5.jpg` … `10.jpg` | New: the Sfântul Nicolae 2025 photographs, through `reencode` |
| `src/assets/content/2026/04/1.jpg` … `9.jpg` | New: the Paștele 2026 photographs, through `reencode` |
| `src/content/galerii/sfantul-nicolae-2025.md` | New album |
| `src/content/galerii/pastele-2026.md` | New album |
| `src/content/pages/scoala-parohiala.md` | The lead image and the body image |
| `src/assets/content/2025/12/7-hero.jpg` | New: the 2:1 homepage derivative |
| src/assets/content/2024/05/5d400e5d-4326-4ffb-ad1a-5635ca9a388d-hero.jpg | Deleted: the replaced derivative, which `src/lib/images.ts` would otherwise still ship |
| `src/pages/index.astro` | The hero import, its comment, the focal points |
| `src/lib/hero-image.itest.ts` | The measured candidate numbers in its comment |
| `docs/superpowers/plans/2026-09-19-phase-4-backlog.md` | The A1 decision row, marked superseded |
| `docs/superpowers/plans/2026-09-21-phase-5-content-and-nav.md` | This plan, committed in Task 6 |

---

## Decisions taken 2026-09-21, at plan time

| Question | Decision |
|---|---|
| Which gallery albums | **Two, by event**, because the capture dates are two events: Sfântul Nicolae (2025-12-06: 5, 6, 7, 10) and Paștele 2026 (2026-04-10/11: 1, 2, 3, 4, 8, 9). The gallery is event-based and date-sorted already. |
| Evenimente's removal | **Header link only.** The `/evenimente/` pages stay built, linked from the footer's Site menu and listed in the sitemap; the events collection is untouched. |
| Where Școala parohială sits | **In Evenimente's slot** — position four, between Noutăți and Servicii liturgice — so the parish's settled order is otherwise unchanged. |
| Asset names | **The numbered names kept**, in dated folders: the parish refers to these ten by number, and the folders make the names unambiguous. Precedent: `src/assets/content/2026/03/` holds hand-added photographs under their original names. |
| Album covers | **5** (children with Sfântul Nicolae) and **4** (the candlelit night crowd). |
| Album order | **The parish's numbering**: 5, 6, 7, 10 and 1, 2, 3, 4, 8, 9. |
| Album descriptions | **None**, matching the `sfintele-pasti-2024` album; a caption is the text alternative and nobody has written one for these. |
| School page mapping | **5 as the lead image** (frontmatter, rendered under the h1) and **6 as the body image**. |
| The hero photograph | **7** — the three priests around the cross at the altar, the parish's own photograph, already in the Sfântul Nicolae 2025 album, so no licence question. |
| The hero crop | **2:1, chosen by eye from a contact sheet**, keeping the three priests, the cross and the altar table; the derivative is cut from the imported 2400×1800 file, never from the album file in place. |

---

### Task 1: The header swaps Evenimente for Școala parohială

**Files:**
- Modify: `src/components/SiteHeader.astro`
- Modify: `src/lib/build-output.itest.ts` (a new `it` in the `the built pages` describe, after
  the homepage-news test that ends around line 1697)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: the header link set later tasks do not touch; the footer is unchanged.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/build-output.itest.ts`, inside `describe('the built pages', …)`, directly after
the homepage-news test:

```ts
  /*
   * THE PRIMARY NAVIGATION, AS AN EXACT SET, AND THE PAGE IT MUST NOT ORPHAN.
   * The header list is the one place a link can be swapped with no other
   * symptom: the page stays built, the sitemap lists it and every other guard
   * stays green - the shape that made seven prose pages unreachable before the
   * footer menu. So the expected set is WRITTEN OUT BY HAND, in order, rather
   * than derived from the component that renders it, and each href is followed
   * into dist/ so a link to nothing fails. The footer's `Site` menu is
   * asserted beside it: `Evenimente` left the header on 2026-09-21 and that
   * menu is now its only inbound link on every page.
   */
  it('the header carries exactly the seven primary links, and the footer still reaches the events', () => {
    const html = read('index.html');
    const header =
      html.match(/<nav[^>]*aria-label="Navigare principală"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? '';
    expect(
      header.length,
      'the header nav is missing from index.html - the guard would prove nothing',
    ).toBeGreaterThan(0);
    const hrefs = [...header.matchAll(/href="([^"]+)"/g)].map((m) => m[1] as string);
    expect(hrefs).toEqual([
      '/',
      '/program/',
      '/noutati/',
      '/comunitate/scoala/',
      '/servicii-liturgice/',
      '/contact/',
      '/doneaza/',
    ]);
    for (const href of hrefs) {
      const path = href === '/' ? 'index.html' : `${href.slice(1)}index.html`;
      expect(existsSync(DIST + path), `${href} in the header does not resolve inside dist/`)
        .toBe(true);
    }
    const footer =
      html.match(/<nav[^>]*aria-label="Site"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? '';
    expect(
      footer,
      'the footer Site menu is missing - the Evenimente link below would prove nothing',
    ).toContain('href="/evenimente/"');
  });
```

- [ ] **Step 2: Run it and watch it fail**

Run: `TZ=Europe/Zurich npm run test:build`
Expected: FAIL — the header's fourth href is `/evenimente/`, not `/comunitate/scoala/`.

- [ ] **Step 3: Swap the link**

In `src/components/SiteHeader.astro`, replace the link list and rewrite the comment above it:

```ts
const links = [
  { href: '/', text: 'Acasă' },
  { href: '/program/', text: 'Program' },
  { href: '/noutati/', text: 'Noutăți' },
  { href: '/comunitate/scoala/', text: 'Școala parohială' },
  { href: '/servicii-liturgice/', text: 'Servicii liturgice' },
  { href: '/contact/', text: 'Contact' },
  { href: '/doneaza/', text: 'Donează' },
];
```

The comment's first paragraph becomes: seven links still, with `Evenimente` replaced by
`Școala parohială` at the parish's request (2026-09-21); `Evenimente` remains in the footer's
`Site` menu and the `/evenimente/` pages remain built; the footer's `Pagini` menu already
carries `Școala parohială` through the collection. Keep the "primary navigation / footer
carries the rest of the sitemap" argument.

- [ ] **Step 4: Run the test again**

Run: `TZ=Europe/Zurich npm run test:build`
Expected: PASS, and the gallery/hero/feed tests unchanged.

- [ ] **Step 5: Re-measure the phone wrap and rewrite the numbers**

The `.sh-nav` comment documents a 390px measurement for the old label set; `Școala parohială`
is longer than `Evenimente`, so the numbers are stale. With the dev server running
(`npx astro dev --background`), write this scratch script as
.superpowers/phase-5-nav-measure.mjs (git-ignored, deleted after) and run
`node .superpowers/phase-5-nav-measure.mjs`:

```js
import { Builder } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import chromedriver from 'chromedriver';

const driver = await new Builder()
  .forBrowser('chrome')
  .setChromeOptions(new chrome.Options().addArguments('headless=new', 'no-sandbox', 'disable-gpu'))
  .setChromeService(new chrome.ServiceBuilder(chromedriver.path))
  .build();

await driver.sendDevToolsCommand('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 844,
  deviceScaleFactor: 0,
  mobile: false,
});
await driver.get('http://localhost:4321/');
const measured = await driver.executeScript(
  'const nav = document.querySelector(".sh-nav");' +
    'const links = [...nav.querySelectorAll("a")];' +
    'const cs = getComputedStyle(nav);' +
    'return { innerWidth: window.innerWidth,' +
    ' navWidth: Math.round(nav.getBoundingClientRect().width),' +
    ' contentWidth: Math.round(nav.parentElement.getBoundingClientRect().width),' +
    ' linkWidths: links.map((a) => Math.round(a.getBoundingClientRect().width)),' +
    ' totalLinkWidth: links.reduce((sum, a) => sum + a.getBoundingClientRect().width, 0),' +
    ' navHeight: Math.round(nav.getBoundingClientRect().height),' +
    ' rowGap: cs.rowGap, columnGap: cs.columnGap };',
);
console.log(JSON.stringify(measured, null, 2));
await driver.quit();
```

Rewrite the comment with what it prints: the widths per link, their sum, the content column
width, the nav height (two lines if it exceeds one line-height), and the row/column gaps —
`innerWidth` beside them, because Chrome clamps a window under about 500px and only the
override honours 390. If the wrap now needs a different `.sh-nav` gap at 34rem, change it and
re-measure; do not delete the measurement sentence.

- [ ] **Step 6: Commit**

```bash
git add src/components/SiteHeader.astro src/lib/build-output.itest.ts
git commit -m "feat(nav): the header swaps Evenimente for Scoala parohiala" -- \
  src/components/SiteHeader.astro src/lib/build-output.itest.ts
```

---

### Task 2: The ten photographs are imported and sanitised

**Files:**
- Modify: `migration/media.mjs` (line 432: `async function reencode` → `export async function reencode`)
- Create: `src/lib/content-assets.test.ts`
- Create (scratch, git-ignored, deleted after): .superpowers/phase-5-import.mjs
- Create: `src/assets/content/2025/12/5.jpg`, `6.jpg`, `7.jpg`, `10.jpg`;
  `src/assets/content/2026/04/1.jpg`, `2.jpg`, `3.jpg`, `4.jpg`, `8.jpg`, `9.jpg`

**Interfaces:**
- Consumes: `reencode(source, relative): Promise<Buffer>` from `migration/media.mjs` — decode,
  rotate, downscale to the 2400px long edge, JPEG q80, no metadata.
- Produces: the ten files, by the paths Tasks 3, 4 and 5 reference.

- [ ] **Step 1: Export the migration's re-encode**

In `migration/media.mjs` change the declaration at line 432 to:

```js
export async function reencode(source, relative) {
```

One word, no behaviour change: the import in Step 4 calls the same code path the migration
does, so the two treatments cannot drift. Prove the existing tests still pass:

Run: `npx vitest run migration/media.test.mjs`
Expected: PASS, unchanged count.

- [ ] **Step 2: Write the failing test**

Create `src/lib/content-assets.test.ts`:

```ts
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';

/*
 * THE COMMITTED PHOTOGRAPHS, AND THE TREATMENT THEY MUST HAVE HAD.
 *
 * The migration's `reencode` is this project's sanitisation: decode, downscale
 * to a 2400px long edge, re-encode, and write out with no metadata, so an
 * appended payload or a GPS coordinate does not survive being turned back into
 * pixels. Every migrated file went through it; a photograph added by hand is
 * the case where the treatment can be skipped with nothing to notice, because
 * the page renders and the picture looks right.
 *
 * The subject is the DIRECTORY, not a list: every file under
 * `src/assets/content` is read, and the count is asserted non-zero so an empty
 * walk cannot pass. `process.stdout.write` rather than `console.log`, because
 * the numbers are wanted on the green run too.
 */
const CONTENT = fileURLToPath(new URL('../assets/content/', import.meta.url));

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

/** The migration's long edge (`MAX_EDGE` in `migration/media.mjs`). */
const MAX_EDGE = 2400;

describe('the committed photographs', () => {
  it('have all been through the sanitising re-encode: no EXIF, no edge over 2400', async () => {
    const files = walk(CONTENT);
    expect(files.length, 'no file under src/assets/content - the sweep would prove nothing')
      .toBeGreaterThan(0);
    let longest = 0;
    for (const file of files) {
      const meta = await sharp(file).metadata();
      expect(meta.exif, `${relative(CONTENT, file)} still carries EXIF`).toBeUndefined();
      const edge = Math.max(meta.width ?? 0, meta.height ?? 0);
      longest = Math.max(longest, edge);
      expect(edge, `${relative(CONTENT, file)} is ${meta.width}x${meta.height}, over ${MAX_EDGE}`)
        .toBeLessThanOrEqual(MAX_EDGE);
    }
    process.stdout.write(
      `\nContent assets: ${files.length} files, none with EXIF, longest edge ${longest}.\n`,
    );
  });

  it('hold the ten photographs the two Phase 5 albums were built from', () => {
    const expected = [
      '2025/12/5.jpg',
      '2025/12/6.jpg',
      '2025/12/7.jpg',
      '2025/12/10.jpg',
      '2026/04/1.jpg',
      '2026/04/2.jpg',
      '2026/04/3.jpg',
      '2026/04/4.jpg',
      '2026/04/8.jpg',
      '2026/04/9.jpg',
    ];
    const present = walk(CONTENT).map((file) => relative(CONTENT, file));
    for (const path of expected) {
      expect(present, `${path} is not under src/assets/content`).toContain(path);
    }
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run src/lib/content-assets.test.ts`
Expected: the sweep PASSES over the 90 existing files (its positive control), and the ten-file
test FAILS naming the first missing path.

- [ ] **Step 4: Run the import**

Write this scratch script as .superpowers/phase-5-import.mjs (git-ignored; delete it after
the run — the durable artefact is the test above):

```js
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { reencode } from '../migration/media.mjs';

const SOURCE = '/Users/stefan/Work/stuff/site-bzh/new_resources';
const DEST = 'src/assets/content';
const batches = [
  { dir: '2025/12', files: ['5.jpg', '6.jpg', '7.jpg', '10.JPG'] },
  { dir: '2026/04', files: ['1.jpg', '2.jpg', '3.jpg', '4.jpg', '8.jpg', '9.jpg'] },
];

for (const { dir, files } of batches) {
  await mkdir(join(DEST, dir), { recursive: true });
  for (const file of files) {
    const bytes = await reencode(join(SOURCE, file), file);
    const destination = join(DEST, dir, file.replace(/\.JPG$/, '.jpg'));
    await writeFile(destination, bytes);
    process.stdout.write(`${destination} ${bytes.length} B\n`);
  }
}
```

Run from the repository root: `node .superpowers/phase-5-import.mjs`
Expected: ten lines, each naming a destination and its bytes; the long edge of every output is
2400 and no file carries EXIF. If any line reports a decode failure, stop — the file is not an
image and is decided on by name, exactly as the migration does.

- [ ] **Step 5: Run the test again**

Run: `npx vitest run src/lib/content-assets.test.ts`
Expected: PASS, printing `Content assets: 100 files, none with EXIF, longest edge 2400.`

- [ ] **Step 6: Commit**

```bash
git add migration/media.mjs src/lib/content-assets.test.ts \
  src/assets/content/2025/12 src/assets/content/2026/04
git commit -m "feat(content): import the ten photographs through the migration's re-encode" -- \
  migration/media.mjs src/lib/content-assets.test.ts src/assets/content/2025/12 src/assets/content/2026/04
```

---

### Task 3: Two gallery albums

**Files:**
- Create: `src/content/galerii/sfantul-nicolae-2025.md`
- Create: `src/content/galerii/pastele-2026.md`

**Interfaces:**
- Consumes: the ten photographs from Task 2.
- Produces: two albums the gallery index and the sitemap pick up through the collection.

- [ ] **Step 1: Write the Sfântul Nicolae album**

`src/content/galerii/sfantul-nicolae-2025.md`, frontmatter only — no body, matching the other
albums:

```markdown
---
title: "Sfântul Nicolae 2025"
date: "2025-12-06"
cover: "../../assets/content/2025/12/5.jpg"
images:
  - file: "../../assets/content/2025/12/5.jpg"
  - file: "../../assets/content/2025/12/6.jpg"
  - file: "../../assets/content/2025/12/7.jpg"
  - file: "../../assets/content/2025/12/10.jpg"
---
```

- [ ] **Step 2: Write the Paștele album**

`src/content/galerii/pastele-2026.md`:

```markdown
---
title: "Paștele 2026"
date: "2026-04-12"
cover: "../../assets/content/2026/04/4.jpg"
images:
  - file: "../../assets/content/2026/04/1.jpg"
  - file: "../../assets/content/2026/04/2.jpg"
  - file: "../../assets/content/2026/04/3.jpg"
  - file: "../../assets/content/2026/04/4.jpg"
  - file: "../../assets/content/2026/04/8.jpg"
  - file: "../../assets/content/2026/04/9.jpg"
---
```

- [ ] **Step 3: Run the gallery guards**

Run: `TZ=Europe/Zurich npm run test:build`
Expected: PASS. `the gallery pages` prints `Gallery images: N over 4 album page(s).` and the
caption line; the index-cover count equals four because the subject is derived from the
content files. A missing photograph fails the build in `ContentImage` before any test runs,
which is why Task 2 is a prerequisite.

- [ ] **Step 4: Commit**

```bash
git add src/content/galerii/sfantul-nicolae-2025.md src/content/galerii/pastele-2026.md
git commit -m "feat(galerie): two albums, Sfantul Nicolae 2025 and Pastele 2026" -- \
  src/content/galerii/sfantul-nicolae-2025.md src/content/galerii/pastele-2026.md
```

---

### Task 4: The school page's two photographs

**Files:**
- Modify: `src/content/pages/scoala-parohiala.md` (line 5, the `image:` field; line 26, the
  body image)
- Modify: `src/lib/build-output.itest.ts` (replace the istoric-only frontmatter-image test;
  add the school-page replacement test)

**Interfaces:**
- Consumes: `src/assets/content/2025/12/5.jpg` and `6.jpg` from Task 2.
- Produces: nothing later tasks consume.

- [ ] **Step 1: Generalise the frontmatter-image guard**

In `src/lib/build-output.itest.ts`, replace the test
`renders the chosen hero image on /parohia/istoric/, exactly one, resolving inside dist/` and
its comment with:

```ts
  /*
   * THE FRONTMATTER IMAGE, FROM THE FIELD TO THE PAGE - FOR EVERY PAGE THAT
   * CARRIES ONE. `pageSchema.image` and `ContentImage` both existed before this
   * route rendered either: the CMS offered the field, the schema validated it
   * and nothing read it, which looks exactly like a working feature from the
   * CMS and from the content files. The subject is now the CONTENT FILES - the
   * pages whose frontmatter carries an `image:` - rather than the one page the
   * first version happened to name, so a page that gains or loses the field is
   * followed automatically. Each rendering is the whole claim: exactly one
   * wrapper, exactly one `<img>`, the page title as its alt, and a src that
   * resolves inside `dist/` - because an `<img>` at a path the host does not
   * serve 404s with no other symptom. An empty or whitespace-only value is
   * excluded because `pageSchema.image` is trimmed and the route renders on
   * truthiness, so `image: ""` is how a volunteer asks for none.
   */
  it('renders the frontmatter image of every page that carries one, exactly once, resolving inside dist/', () => {
    const pages = pageFiles().filter(
      (f) => typeof f.frontmatter.image === 'string' && f.frontmatter.image.trim() !== '',
    );
    expect(pages.length, 'no prose page carries an image: field - the guard would prove nothing')
      .toBeGreaterThan(0);
    for (const page of pages) {
      const html = read(`${page.slug}/index.html`);
      const wrappers = pageImages(html);
      expect(wrappers, `/${page.slug}/ does not render exactly one .page-image wrapper`)
        .toHaveLength(1);
      const images = [...(wrappers[0] as string).matchAll(/<img\b[^>]*>/g)].map((m) => m[0] as string);
      expect(images, `/${page.slug}/'s .page-image wrapper does not hold exactly one <img>`)
        .toHaveLength(1);
      expect(images[0], `/${page.slug}/'s image does not carry the page title as its alt`)
        .toContain(`alt="${String(page.frontmatter.title)}"`);
      const src = /<img\b[^>]*\bsrc="([^"]+)"/.exec(images[0] as string)?.[1];
      expect(src, `/${page.slug}/'s image has no src`).toBeDefined();
      expect((src as string).startsWith('/'), `${src} is not root-relative`).toBe(true);
      const path = (src as string).split(/[?#]/)[0] as string;
      expect(existsSync(DIST + path.slice(1)), `${src} does not resolve inside dist/`).toBe(true);
    }
    process.stdout.write(`\nFrontmatter images: ${pages.length} page(s) with a lead image.\n`);
  });
```

- [ ] **Step 2: Add the school-page replacement test**

Directly after it, still inside `describe('the prose pages', …)`:

```ts
  /*
   * THE SCHOOL PAGE'S TWO REPLACED PHOTOGRAPHS. The lead image and the body
   * image both changed on 2026-09-21. The durable half of this is the guard
   * above plus the body-image guard; this one is the red-first driver,
   * asserting the page no longer names either file it used to show. The
   * presence arm is the positive control: a page that rendered no image at all
   * would satisfy two `not.toContain` checks vacuously.
   */
  it('the school page shows the two chosen photographs, not the ones they replaced', () => {
    const html = read('comunitate/scoala/index.html');
    for (const old of ['166876765_1270252473370992', '299423305_1614472635615639']) {
      expect(html, `the school page still renders ${old}`).not.toContain(old);
    }
    const srcs = [...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1] as string);
    expect(srcs.length, 'the school page renders no image - the absence above proves nothing')
      .toBeGreaterThanOrEqual(2);
    for (const src of srcs) {
      const path = src.split(/[?#]/)[0] as string;
      expect(existsSync(DIST + path.slice(1)), `${src} does not resolve inside dist/`).toBe(true);
    }
  });
```

- [ ] **Step 3: Run it and watch it fail**

Run: `TZ=Europe/Zurich npm run test:build`
Expected: FAIL — `the school page still renders 166876765_1270252473370992` (the built page is
from the current content). The generalised guard passes over istoric, cursuri-de-pictura and
the school page, printing `Frontmatter images: 3 page(s) with a lead image.`

- [ ] **Step 4: Replace the two images**

In `src/content/pages/scoala-parohiala.md`:

- line 5 becomes `image: "../../assets/content/2025/12/5.jpg"`
- line 26 becomes `![](../../assets/content/2025/12/6.jpg)`

The alt policy is unchanged: the lead image carries the page title (the route supplies it) and
the body image stays decorative with an empty alt, exactly as before.

- [ ] **Step 5: Run the tests again**

Run: `TZ=Europe/Zurich npm run test:build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/content/pages/scoala-parohiala.md src/lib/build-output.itest.ts
git commit -m "content(scoala): the two chosen photographs" -- \
  src/content/pages/scoala-parohiala.md src/lib/build-output.itest.ts
```

---

### Task 5: The homepage hero becomes the cross procession

**Files:**
- Create: `src/assets/content/2025/12/7-hero.jpg`
- Delete: src/assets/content/2024/05/5d400e5d-4326-4ffb-ad1a-5635ca9a388d-hero.jpg — the
  replaced derivative; `src/lib/images.ts` eagerly globs every file under `src/assets/`, so an
  orphaned derivative still ships bytes. The source photograph,
  `src/assets/content/2024/05/5d400e5d-4326-4ffb-ad1a-5635ca9a388d.jpg`, stays because it is
  one of the `sfintele-pasti-2024` album's images.
- Modify: `src/pages/index.astro` (the import, the hero comment, `.hero-img` focal points)
- Modify: `src/lib/hero-image.itest.ts` (the measured numbers in the comment)
- Create (scratch, git-ignored, deleted after): .superpowers/phase-5-hero-probe.mjs,
  .superpowers/phase-5-hero-cut.mjs, .superpowers/phase-5-hero-shot.mjs

**Interfaces:**
- Consumes: `src/assets/content/2025/12/7.jpg` from Task 2.
- Produces: the hero markup the Phase 4 guards measure; `HERO_BYTES_CEILING` and
  `HERO_WIDTHS` in `src/lib/hero-image.itest.ts` are unchanged.

- [ ] **Step 1: Probe the crop windows**

Write .superpowers/phase-5-hero-probe.mjs and run `node .superpowers/phase-5-hero-probe.mjs`:

```js
import sharp from 'sharp';

const SRC = 'src/assets/content/2025/12/7.jpg';
const tops = [160, 200, 240, 280, 320];
const tiles = [];
for (let i = 0; i < tops.length; i += 1) {
  const window = await sharp(SRC)
    .resize({ width: 1600 })
    .extract({ left: 0, top: tops[i], width: 1600, height: 800 })
    .toBuffer();
  const tile = await sharp(window).resize({ width: 800 }).toBuffer();
  tiles.push({ input: tile, left: (i % 2) * 810, top: Math.floor(i / 2) * 410 });
}
await sharp({ create: { width: 1620, height: 1230, channels: 3, background: '#222222' } })
  .composite(tiles)
  .jpeg({ quality: 80 })
  .toFile('/tmp/hero-crops.jpg');
console.log('/tmp/hero-crops.jpg');
```

View `/tmp/hero-crops.jpg` (the read tool renders it). The tile downscale is a second `sharp()`
call on purpose, because two resizes in one pipeline apply the extract after the final resize.
The windows are laid out left to right,
top to bottom, in the order 160, 200, 240, 280, 320. Choose the one that keeps all three
priests, the cross and the altar table inside the frame with the least ceiling and floor;
record the chosen top — the probe's guess is 280, and the choice is by eye, never by a crop
algorithm.

- [ ] **Step 2: Cut the derivative**

Write .superpowers/phase-5-hero-cut.mjs, substituting the top chosen in Step 1 for `TOP`,
and run `node .superpowers/phase-5-hero-cut.mjs`:

```js
import sharp from 'sharp';

const TOP = 280; // the window chosen from /tmp/hero-crops.jpg

await sharp('src/assets/content/2025/12/7.jpg')
  .resize({ width: 1600 })
  .extract({ left: 0, top: TOP, width: 1600, height: 800 })
  .jpeg({ quality: 90 })
  .toFile('src/assets/content/2025/12/7-hero.jpg');
console.log('src/assets/content/2025/12/7-hero.jpg written');
```

The source is the album's photograph too, so the crop happens on a derivative and the album
file stays whole — the same reason the Phase 4 hero had its own file.

- [ ] **Step 3: Point the homepage at it**

In `src/pages/index.astro`:

- the import becomes
  `import heroImage from '../assets/content/2025/12/7-hero.jpg';`
- the comment's derivative paragraph is rewritten to name this file, the extraction
  (`sharp(src).resize({ width: 1600 }).extract({ left: 0, top: <chosen>, width: 1600, height: 800 }).jpeg({ quality: 90 })`)
  and the three measured candidate bytes once Step 4 has printed them; the old numbers
  (33,212 / 86,794 / 163,602 and the 343,872 / 237,602 comparison against the 4:3 source)
  belong to the replaced photograph and must not survive. Keep the "one source, two crops, the
  request count is why" argument and the "adjust by eye" sentence, now saying the focal points
  were re-measured for this photograph in Step 5.
- `widths={[480, 800, 1200]}` stays exactly as it is.

The replaced derivative is deleted in the same task for the same reason: `src/lib/images.ts`
eagerly globs every file under `src/assets/`, so an orphaned file still ships bytes.

- [ ] **Step 4: Run the hero guard and record the numbers**

Run: `TZ=Europe/Zurich npm run test:build`
Expected: PASS, printing `Hero candidates: 480w … B, 800w … B, 1200w … B; src fallback (not in
srcset) … B`. Every candidate must be at or under `HERO_BYTES_CEILING` (180,000 B). If the
1200w candidate is over, re-run Step 2 with `.jpeg({ quality: 85 })`, then 80, until it fits —
the ceiling does not move and the comment records the quality used. Then rewrite the MEASURED
paragraph in `src/lib/hero-image.itest.ts` with the three printed numbers, keeping the
ceiling's argument and the note that the src fallback is printed and deliberately uncapped.

- [ ] **Step 5: Re-measure the focal points in a browser**

With the dev server running, write .superpowers/phase-5-hero-shot.mjs and run
`node .superpowers/phase-5-hero-shot.mjs`:

```js
import { writeFileSync } from 'node:fs';
import { Builder } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import chromedriver from 'chromedriver';

const WIDTHS = [
  { width: 390, height: 844, name: 'phone' },
  { width: 756, height: 900, name: 'desk' },
  { width: 1280, height: 900, name: 'wide' },
];

const driver = await new Builder()
  .forBrowser('chrome')
  .setChromeOptions(new chrome.Options().addArguments('headless=new', 'no-sandbox', 'disable-gpu'))
  .setChromeService(new chrome.ServiceBuilder(chromedriver.path))
  .build();

for (const w of WIDTHS) {
  await driver.sendDevToolsCommand('Emulation.setDeviceMetricsOverride', {
    width: w.width,
    height: w.height,
    deviceScaleFactor: 0,
    mobile: false,
  });
  await driver.get('http://localhost:4321/');
  const { data } = await driver.sendAndGetDevToolsCommand('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`/tmp/hero-${w.name}-${w.width}.png`, Buffer.from(data, 'base64'));
  console.log(`/tmp/hero-${w.name}-${w.width}.png`);
}
await driver.quit();
```

View all three PNGs. The reply only comes back through the `_and_get_result` variant:
`scripts/a11y.mjs`'s comment on the difference says it is the only form that returns
`{ data: <base64 png> }`, where `sendDevToolsCommand` discards the CDP result. The desktop
band shows a slice of the 2:1 derivative chosen by
`object-position`, and the phone's taller box shows nearly the whole frame; adjust
`.hero-img { object-position: … }` and the 34rem phone rule until the priests' faces and the
cross are inside the band at all three widths, re-shooting after each change. Rewrite the
phone rule's comment to describe what the new crop actually lands on, and replace the "focal
points are the mockup's" sentence in the hero comment with the measured values. Chrome clamps
a plain window under about 500px, so only `Emulation.setDeviceMetricsOverride` is measuring
390 — say so in the comment if it quotes that width.

- [ ] **Step 6: The contrast pass, and the whole gate**

Run: `TZ=Europe/Zurich npm run test:all`
Expected: exit 0, with the hero contrast numbers printed by the a11y passes (Phase 4 measured
6.46/4.97 desktop and 6.46/5.03 phone against AA's 4.5:1). If the new photograph drops a
number under 4.5:1, adjust the crop or the focal point — or the scrim's `color-mix` percentage
in `src/pages/index.astro`, whose comment requires re-measuring — and run the pass again. Do
not touch the threshold.

- [ ] **Step 7: Delete the scratch scripts and commit**

```bash
rm .superpowers/phase-5-hero-probe.mjs .superpowers/phase-5-hero-cut.mjs .superpowers/phase-5-hero-shot.mjs
git add src/assets/content/2025/12/7-hero.jpg src/pages/index.astro src/lib/hero-image.itest.ts
git commit -m "feat(homepage): the hero becomes the cross procession" -- \
  src/assets/content/2025/12/7-hero.jpg src/pages/index.astro src/lib/hero-image.itest.ts
```

---

### Task 6: The backlog note, the plan, and the full gate

**Files:**
- Modify: `docs/superpowers/plans/2026-09-19-phase-4-backlog.md` (the A1 row)
- Add: `docs/superpowers/plans/2026-09-21-phase-5-content-and-nav.md` (this plan)

**Interfaces:**
- Consumes: every earlier task, because this is the gate over the whole tree.
- Produces: the decision record and the committed plan.

- [ ] **Step 1: Mark the A1 decision superseded**

In `docs/superpowers/plans/2026-09-19-phase-4-backlog.md`, the decisions table's first row
(Which photograph for the homepage hero) gains a sentence after its existing text:

> **Superseded 2026-09-21** — the parish chose the cross procession
> (`src/assets/content/2025/12/7-hero.jpg`, from the Sfântul Nicolae 2025 album); see the
> Phase 5 plan. The licence reasoning is unchanged: the parish's own photograph.

- [ ] **Step 2: Run the full gate**

Run, in this order, and read the exit codes:

```bash
TZ=Europe/Zurich npm test
TZ=Europe/Zurich npm run check
TZ=Europe/Zurich npm run test:all
```

Expected: unit and integration suites green; `check` 0 errors, 0 warnings, 0 hints; `test:all`
exit 0 with four `Audit passed.` lines, `Budget met.`, the hero candidates under the ceiling,
the gallery line reading four album pages, and the indexable check listing four albums. The
tracked-file sweeps run inside `npm test`: the cedilla sweep must report zero occurrences, and
the backticked-path sweep is the one that decides this plan may now be committed.

- [ ] **Step 3: Commit the backlog note and the plan**

```bash
git add docs/superpowers/plans/2026-09-19-phase-4-backlog.md \
  docs/superpowers/plans/2026-09-21-phase-5-content-and-nav.md
git commit -m "docs(phase-5): the plan, and the hero decision it supersedes" -- \
  docs/superpowers/plans/2026-09-19-phase-4-backlog.md \
  docs/superpowers/plans/2026-09-21-phase-5-content-and-nav.md
```

- [ ] **Step 4: Push and open the merge request**

```bash
git push -u origin phase-5-content-and-nav
```

Then open the MR against `main` with the gate numbers in the description, as Phase 4's was.

---

## Steps only you can run

- **The import needs the photographs.** `new_resources` lives outside this repository; a clone
  can build the site and run every test, and cannot re-run the import — the same rule the
  migration carries. The ten files are committed, so a clone has everything it needs to build.
- **The hero framing and the covers are a look, not a measurement.** The screenshots in Task 5
  and the contact sheet in Task 5 Step 1 are the two places a person's eye decides. If the
  chosen crop or cover is wrong, the fix is a re-cut and a re-run, not a code change.
- **The merge is on GitLab** (`glab mr merge`), and the source branch is deleted on merge by
  the same flow Phase 4 used.

## Self-review notes

- **Spec coverage:** the four items are Tasks 1, 3+2, 4 and 5; the guards are in the same
  tasks; the decision record is Task 6. The spec itself needs no amendment: §5's route table
  already lists `/comunitate/scoala` and `/evenimente`, both of which keep their pages, and
  nothing in it names the header's link set or the hero photograph.
- **No budget moved:** `PAGE_BUDGET`, `REQUEST_BUDGET`, `HERO_BYTES_CEILING` and the a11y
  contrast threshold are all untouched; the hero's fit is achieved by quality, not by a cap.
- **Every guard reads something:** the header guard fails on a missing nav; the asset sweep
  asserts a non-zero walk; the school-page guard asserts two rendered images before its
  absence claims; the hero guard prints every candidate.
- **Type consistency:** `reencode(source, relative)` is the same signature the migration calls;
  the album frontmatter fields (`title`, `date`, `cover`, `images[].file`) match
  `gallerySchema`; the page `image` field matches `pageSchema`; the hero consumes the same
  `Image` props as Phase 4.
