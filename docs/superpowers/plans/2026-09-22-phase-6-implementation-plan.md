# Phase 6 Implementation Plan — gallery, navigation, images and prose-page furniture

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the five Phase 6 backlog items — the album link to the largest
derivative, the lead image's dropped frame, the Doxologia covers regenerated from the
issue PDFs, the founding album renamed and densified, and `Galerie` in the top bar.

**Architecture:** Four small changes to existing components/routes and one new
`migration/` tool that renders page 1 of each Doxologia PDF with poppler's `pdftoppm`
and writes it through the migration's own `reencode`, then rewrites the page's image
paths. No new runtime dependency, no JavaScript added to the site, no schema change.

**Tech Stack:** Astro 5 (static), sharp, poppler (`pdftoppm`, `pdfinfo`), vitest
(unit + integration), headless Chrome via selenium-webdriver/chromedriver.

**Spec:** `docs/superpowers/specs/2026-09-15-parish-site-rewrite-design.md` (§4 design
system, §13 budget). **Backlog:** `docs/superpowers/plans/2026-09-22-phase-6-backlog.md` —
the plan argues from both; read all three.

**Decisions taken with the parish on 2026-09-22 (before this plan):**

- **Item 1:** 1a only. Every album image becomes a plain link to its largest derivative;
  **no lightbox**, no JavaScript.
- **Item 3:** regenerate all covers from page 1 of the PDFs in `public/documente/`.
- **Item 4:** rename the **title** to "Fondarea parohiei" and keep the slug
  `/galerie/imagini-de-la-slujbe/`; migrate `17.jpg`–`25.jpg` from the 2026-08-22 backup.
- **Item 5:** `Galerie` goes into the top bar **after `Noutăți`**.

## Global Constraints

Copied from the spec and `CLAUDE.md`; every task's requirements include them.

- **Diacritics are comma-below.** The four wrong characters are named by number only in
  `src/lib/cedilla.ts`; never write them as glyphs and never write a backslash-u escape
  in any file — a quoted heredoc and the file-writing tools decode it to the character
  on disk. Build such characters with `String.fromCodePoint` when one is needed.
- **Identifiers are English; Romanian only where a person reads it** (page copy, CMS
  `label:`/`hint:`, Zod messages, `PAGE_EXPLANATION`). Build-time diagnostics are
  English. The nav link text and the new link's `aria-label` are user-facing, so they
  are Romanian.
- **Dates are `YYYY-MM-DD`; times are `HH:MM` local.** `todayInZurich()`/`timeInZurich()`
  in `src/lib/week.ts` are the only timezone-aware functions.
- **`#B08B3E` and `#C8A45C` are ornament only, never text.** Use `--gold-text` on the
  page and `--gold-lt` on the oxblood hero.
- **Import Zod as `astro/zod`**, never a direct `zod` dependency.
- **The service names in `public/admin/config.yml` must stay identical to `SERVICE_NAMES`
  in `src/lib/schema.ts`.**
- **`script-src` in `public/_headers` carries a placeholder**, substituted at
  `astro:build:done` by `scripts/csp-hash.mjs`. Never hand-write a hash, never add
  `'unsafe-inline'`.
- **The parent directory is not part of this repository.** It holds forensic backups and
  credentials; never `git add` anything from outside the root, never weaken `.gitignore`.
  Any image that enters the site goes through `reencode`.
- **Re-encoding through `sharp` is the sanitisation, and SVG is never migrated.**
- **`published: false` means no page at all**, not a draft.
- **Budgets are not raised in a task.** `PAGE_BUDGET`/`REQUEST_BUDGET` in
  `scripts/check-budget.mjs` and the hero ceiling in `src/lib/hero-image.itest.ts` move
  only on an explicit decision from the human.
- **Test verdicts come from process exit codes**, never `.vitest/json/output.json`; `rtk`
  misreports `grep`, `diff`, `git status` and piped counts — use `rtk proxy` or the
  binary at `./node_modules/.bin/vitest`, and read the exit code.
- **CI runs `npm run check` as well as the tests**; `test:all` does not include it.
- **One backtick discipline for THIS document** (the plan is tracked, and
  `src/lib/referenced-paths.test.ts` resolves every backticked path in every tracked
  file): paths that do not exist yet are named **without backticks** until the task that
  creates them has run. The deleted-by-decision covers are the exception: they are added
  to `ABSENT_ON_PURPOSE` in Task 4, and only then may the plan backtick them.

## Workspace

Work on a branch from `main`, in this checkout — the established pattern of Phases 3–5,
because `migration/` takes absolute paths into the parent directory, the dev server runs
at the repo root and the preview deployment builds from it. No worktree.

```
git checkout -b phase-6-gallery-nav
```

`npm test` is the unit gate, `npm run test:build` the integration+browser+budget gate,
`npm run check` the type gate, `npm run test:all` the whole of it. Start the dev server
for browser measurements with `npx astro dev --background` (stop with `astro dev stop`).

---

### Task 0: the plan and the backlog, committed

**Files:**
- Modify: `docs/superpowers/plans/2026-09-22-phase-6-backlog.md` (item 5, already edited
  in the working tree)
- Create: `docs/superpowers/plans/2026-09-22-phase-6-implementation-plan.md` (this file)

- [ ] **Step 1: Create the branch**

```bash
git checkout -b phase-6-gallery-nav
```

- [ ] **Step 2: Confirm the working tree carries exactly the plan and the backlog edit**

```bash
git status --short
git diff --stat docs/superpowers/plans/2026-09-22-phase-6-backlog.md
```

Expected: ` M docs/superpowers/plans/2026-09-22-phase-6-backlog.md` plus this untracked
plan file. Nothing else.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-09-22-phase-6-backlog.md docs/superpowers/plans/2026-09-22-phase-6-implementation-plan.md
git commit -m "docs(phase-6): the plan, from the backlog and the spec"
```

---

### Task 1: `Galerie` in the top bar (item 5)

**Files:**
- Modify: `src/components/SiteHeader.astro` (the `links` array and two comments)
- Modify: `src/lib/build-output.itest.ts` (the test named "the header carries exactly the
  seven primary links, and the footer still reaches the events")
- Modify: `docs/handover.md` (§L, the "Routes" bullet that says **seven**)
- Scratch: .superpowers/p6-nav-width.mjs (git-ignored; created here, code below)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing other tasks use.

- [ ] **Step 1: Write the failing integration assertion**

In `src/lib/build-output.itest.ts`, rename the test and add `/galerie/` to the
hand-written array. The comment above the test gains one sentence, because it documents
the set's history:

```ts
  /*
   * THE PRIMARY NAVIGATION, AS AN EXACT SET, AND THE PAGE IT MUST NOT ORPHAN.
   * ... (unchanged) ... The set changed again on 2026-09-22: `Galerie` joined
   * after `Noutăți` at the parish's request. The footer's `Site` menu already
   * carried it, so nothing was orphaned - the top bar is its second inbound
   * link, and the one the parish asked for.
   */
  it('the header carries exactly the eight primary links, and the footer still reaches the events', () => {
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
      '/galerie/',
      '/comunitate/scoala/',
      '/servicii-liturgice/',
      '/contact/',
      '/doneaza/',
    ]);
```

(The footer half of the test is unchanged.)

- [ ] **Step 2: Run it to verify it fails**

```bash
npm run build && ./node_modules/.bin/vitest run --config vitest.itest.config.ts -t "eight primary links"
```

Expected: FAIL, with the array missing `/galerie/` at index 3. If it passes, the test
did not run — check the `-t` string against the renamed test.

- [ ] **Step 3: Add the link**

In `src/components/SiteHeader.astro`, the array becomes:

```ts
const links = [
  { href: '/', text: 'Acasă' },
  { href: '/program/', text: 'Program' },
  { href: '/noutati/', text: 'Noutăți' },
  { href: '/galerie/', text: 'Galerie' },
  { href: '/comunitate/scoala/', text: 'Școala parohială' },
  { href: '/servicii-liturgice/', text: 'Servicii liturgice' },
  { href: '/contact/', text: 'Contact' },
  { href: '/doneaza/', text: 'Donează' },
];
```

- [ ] **Step 4: Run the assertion again**

```bash
npm run build && ./node_modules/.bin/vitest run --config vitest.itest.config.ts -t "eight primary links"
```

Expected: PASS.

- [ ] **Step 5: Re-measure at 390px and replace the stale comment**

The numbers below were measured on 2026-09-22 with the audits' own chromedriver, at
`innerWidth` 390 and 1280, via the scratch script in this step. Re-run it to confirm
they still hold after any later edit; if they differ, the comment gets the new numbers,
not these.

Create .superpowers/p6-nav-width.mjs:

```js
import { Builder } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import chromedriver from 'chromedriver';

const driver = await new Builder()
  .forBrowser('chrome')
  .setChromeOptions(new chrome.Options().addArguments('headless=new', 'no-sandbox', 'disable-gpu'))
  .setChromeService(new chrome.ServiceBuilder(chromedriver.path))
  .build();

for (const width of [390, 1280]) {
  await driver.sendDevToolsCommand('Emulation.setDeviceMetricsOverride', {
    width,
    height: 844,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await driver.get('http://localhost:4321/');
  await driver.sleep(500);
  const out = await driver.executeScript(`
    const links = [...document.querySelectorAll('.sh-nav a')];
    const nav = document.querySelector('.sh-nav');
    const box = (el) => {
      const b = el.getBoundingClientRect();
      return [Math.round(b.width), Math.round(b.height), Math.round(b.top)];
    };
    return {
      innerWidth: window.innerWidth,
      clientWidth: document.documentElement.clientWidth,
      links: links.map((a) => [
        a.textContent.trim(),
        a.getBoundingClientRect().width.toFixed(1),
        Math.round(a.getBoundingClientRect().top),
      ]),
      nav: box(nav),
      total: links.reduce((sum, a) => sum + a.getBoundingClientRect().width, 0).toFixed(1),
    };
  `);
  process.stdout.write(`${width}: ${JSON.stringify(out)}\n`);
}
await driver.quit();
```

Run it:

```bash
npx astro dev --background
node .superpowers/p6-nav-width.mjs
```

Measured 2026-09-22, with `Galerie` in place: eight links measuring 36.7, 54.0, 47.8,
45.1, 101.2, 102.5, 49.3 and 53.7px — **490.3px together** — wrapping **5+3** at 390
(`Școala parohială` ends the first line, `Servicii liturgice` opens the second), nav
still 358×54. `clientWidth` reads 390 in the headless runs — this Chrome draws no
layout-consuming scrollbar — so the phone's content column is **358**, not 343. At 1280
the bar is one row, 630×23. **Corrected from the run (2026-09-22): the plan's first
draft claimed 4+4 and a 375/343 column, which the measurement did not reproduce; the
numbers above are what the run printed, and the comment below is the shipped text.**

Replace the header comment's first paragraph (`src/components/SiteHeader.astro`, the
block that begins "SEVEN LINKS, AND THE SET CHANGED ON 2026-09-21") with:

```
/*
 * EIGHT LINKS, AND THE SET LAST CHANGED ON 2026-09-22: `Galerie` joined after
 * `Noutăți`, at the parish's request. The album was reachable only from the
 * footer's `Site` menu before that; it now has a second inbound link, and
 * nothing was orphaned by the addition. The rest of the list's history: the
 * five measured in Phase 1 plus `Contact` and `Donează`, settled by the parish
 * in Task 13; minus `Parohia` - removed from the top bar at the parish's
 * request (2026-09-19) and carried by the footer's `Pagini` menu, which
 * reaches `Istoric` and `Consiliul Parohial` on every page; and the 2026-09-21
 * swap where `Evenimente` left and `Școala parohială` took its place, the
 * event pages staying reachable through the footer's `Site` menu. This is the
 * primary navigation; the footer carries the rest of the sitemap - the eleven
 * prose pages plus a fixed `Site` list - and that is what makes every prose
 * page reachable from every visitor page.
 */
```

And replace the measurement paragraph (the block beginning "MEASURED AT 390px AFTER
`Școala parohială` REPLACED `Evenimente`") with:

```
   * MEASURED AT 390px AFTER `Galerie` JOINED THE BAR (2026-09-22), in headless
   * Chrome with the audits' own chromedriver and
   * `Emulation.setDeviceMetricsOverride`, because a window width under about
   * 500px is clamped silently. innerWidth 390, and this Chrome draws no
   * scrollbar at that width - the document stays 390 and the phone's content
   * column is 358px. The eight links measure 36.7, 54.0, 47.8, 45.1, 101.2,
   * 102.5, 49.3 and 53.7px - 490.3px together - so the row wraps to two lines
   * whatever the gap: measured 5+3 at this 12px gap, where the seven-link row
   * wrapped 4+3, and one 630px row at 1280. Two lines is the wrap Task 13
   * accepts, and the nav stays 54px tall: two rows of about 23px plus the 8px
   * row gap, where one row would be about 23px. What this rule still decides
   * is how tight the wrapped row reads - 12px between links on a phone - not
   * the one-line trick it was written as when the header carried five. 34rem
   * is not a new breakpoint: it is the one `DayRow` and `WeekBand` already cut
   * at, so the audit's derived breakpoint set is unchanged.
```

- [ ] **Step 6: Update the handover's count**

In `docs/handover.md` §L, the bullet that begins "**Routes**: `/galerie/` with one page
per album" says "The header carries **seven** links (`Parohia` left the top bar on
2026-09-19 and is reached through the footer's `Pagini` menu);". Replace with:

```
The header carries **eight** links (`Parohia` left the top bar on 2026-09-19 and is
reached through the footer's `Pagini` menu; `Galerie` joined on 2026-09-22, and is
also in the footer's `Site` menu);
```

- [ ] **Step 7: Run the gates**

```bash
npm test && npm run check && npm run test:build
```

Expected: exit 0 for each. `test:build` runs **one** browser pass at the default width
(the phone, wide and picker passes belong to `test:all`); because this change is a
phone-width wrap, `npm run a11y:mobile` is run beside it — a `link-name` or contrast
failure names the page and rule. The budget pass prints the per-page HTML
numbers; the header grows by roughly 50 bytes on every page and the check says whether
any page crossed its limit.

- [ ] **Step 8: Commit**

```bash
git add src/components/SiteHeader.astro src/lib/build-output.itest.ts docs/handover.md
git commit -m "feat(nav): Galerie joins the primary navigation"
```

---

### Task 2: the lead image loses its frame (item 2)

**Files:**
- Modify: `src/pages/[...page].astro` (the `.page-image` rule, one line)
- Scratch: .superpowers/p6-shot.mjs (git-ignored; created here, code below)

**Interfaces:**
- Consumes: nothing.
- Produces: the shot script, reused by Tasks 4 and 5.

- [ ] **Step 1: Confirm the guard does not pin the border**

Read the test named "renders the frontmatter image of every page that carries one,
exactly once, resolving inside dist/" in `src/lib/build-output.itest.ts`. It asserts the
wrapper exists, holds exactly one `<img>`, and that the `src` resolves — no CSS. Confirm
by running it green before the change:

```bash
npm run build && ./node_modules/.bin/vitest run --config vitest.itest.config.ts -t "frontmatter image of every page"
```

Expected: PASS. If it fails before the change, stop — the baseline is not green.

- [ ] **Step 2: Remove the border**

`src/pages/[...page].astro`, the `.page-image` rule:

```css
  .page-image { margin: 0 0 1.75rem; }
```

The `border: 1px solid var(--rule)` goes. Nothing else changes: the wrapper's bottom
margin and `.prose :global(img)`'s 1.5rem block margin are ordinary spacing once no
frame draws the 25px inset as a defect.

- [ ] **Step 3: Run the guard again, and the unit suite**

```bash
npm run build && ./node_modules/.bin/vitest run --config vitest.itest.config.ts -t "frontmatter image of every page"
npm test && npm run check
```

Expected: all PASS/exit 0.

- [ ] **Step 4: Look at both affected pages in a browser**

A visual claim needs a browser. Create .superpowers/p6-shot.mjs:

```js
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Builder } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import chromedriver from 'chromedriver';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.avif': 'image/avif',
  '.json': 'application/json',
  '.ics': 'text/calendar',
  '.txt': 'text/plain',
};

const server = createServer((req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]);
  const file = join(DIST, path.endsWith('/') ? `${path}index.html` : path);
  if (!existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404);
    res.end('404');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((done) => server.listen(0, done));
const port = server.address().port;

const [url, prefix, selector = 'main'] = process.argv.slice(2);
const driver = await new Builder()
  .forBrowser('chrome')
  .setChromeOptions(new chrome.Options().addArguments('headless=new', 'no-sandbox', 'disable-gpu'))
  .setChromeService(new chrome.ServiceBuilder(chromedriver.path))
  .build();

async function shot(width, height, name, beyondViewport = false) {
  await driver.sendDevToolsCommand('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await driver.get(`http://localhost:${port}${url}`);
  await driver.sleep(500);
  const info = await driver.executeScript(`
    const el = document.querySelector(${JSON.stringify(selector)});
    const b = el ? el.getBoundingClientRect() : null;
    return {
      innerWidth: window.innerWidth,
      docWidth: document.documentElement.clientWidth,
      rect: b ? [Math.round(b.width), Math.round(b.height)] : null,
      scrollHeight: document.documentElement.scrollHeight,
    };
  `);
  const result = await driver.sendAndGetDevToolsCommand('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: beyondViewport,
  });
  writeFileSync(`/tmp/${name}.png`, Buffer.from(result.data, 'base64'));
  process.stdout.write(`${name}: ${JSON.stringify(info)}\n`);
}

await shot(1280, 900, `${prefix}-1280`);
await shot(390, 844, `${prefix}-390`);
await shot(1280, 900, `${prefix}-full`, true);
await driver.quit();
server.close();
```

Run it on both pages and view the images:

```bash
node .superpowers/p6-shot.mjs /comunitate/scoala/ scoala
node .superpowers/p6-shot.mjs /parohia/istoric/ istoric
```

Then read `/tmp/scoala-1280.png` and `/tmp/istoric-1280.png`. Expected: the lead
photograph sits in the column with no hairline box, and the vertical gap above and below
it reads as ordinary paragraph spacing. If a box or an asymmetric inset is still
visible, the change did not land — stop and re-read the rule.

- [ ] **Step 5: Commit**

```bash
git add src/pages/[...page].astro
git commit -m "fix(prose): the lead image loses its frame"
```

---

### Task 3: every album image links to its largest derivative (item 1a)

**Files:**
- Modify: `src/components/GalleryGrid.astro` (frontmatter, template, no CSS change)
- Modify: `src/lib/build-output.itest.ts` (a new reader beside `pageImages`, a positive
  control, and one integration test in the gallery describe)

**Interfaces:**
- Consumes: `resolveImage` and `publicUpload` from `src/lib/images.ts` (existing).
- Produces: the `gg-item` markup Task 5 densifies — one `<a>` wrapping one `<ContentImage>`.

- [ ] **Step 1: Write the failing assertions**

In `src/lib/build-output.itest.ts`, beside `pageImages`, add:

```ts
/**
 * Every album item's link: the href and accessible name it declares, and how
 * many images it wraps.
 *
 * THE SUBJECT IS THE ITEM, not the anchor: an album image with no anchor is
 * the defect this reader exists to catch, and a pattern for `<a href=…>` alone
 * would report only the links that are already there.
 */
function galleryLinks(html: string): { href: string | null; label: string | null; images: number }[] {
  return [...html.matchAll(/<li\b[^>]*\bclass="gg-item(?:\s[^"]*)?"[^>]*>([\s\S]*?)<\/li>/g)].map(
    (m) => {
      const item = m[1] as string;
      const anchor = /<a\b[^>]*>/.exec(item);
      expect(anchor, `a .gg-item with no anchor: ${item}`).not.toBeNull();
      const tag = anchor?.[0] as string;
      return {
        href: /\bhref="([^"]+)"/.exec(tag)?.[1] ?? null,
        label: /\baria-label="([^"]*)"/.exec(tag)?.[1] ?? null,
        images: [...item.matchAll(/<img\b/g)].length,
      };
    },
  );
}
```

In the detector-controls describe (the one that holds "reads a .page-image wrapper and
stays quiet without one"), add:

```ts
  it('reads a gallery item link, and a missing anchor is an error', () => {
    expect(
      galleryLinks(
        '<li class="gg-item astro-x"><a href="/_astro/8.jpg" aria-label="Mărește fotografia"><img src="/_astro/8.webp" alt></a></li>',
      ),
    ).toEqual([{ href: '/_astro/8.jpg', label: 'Mărește fotografia', images: 1 }]);
    expect(() => galleryLinks('<li class="gg-item"><img src="/_astro/8.webp" alt></li>')).toThrow();
  });
```

In the gallery describe, add:

```ts
  /*
   * THE LINK IS THE ONLY WAY TO THE LARGEST DERIVATIVE. The grid renders
   * `ContentImage`, which emits responsive `.webp` variants; the original file
   * the build emitted for the asset is what a click must open, and a link to a
   * file that is not in dist/ is a 404 nobody sees in a screenshot. The
   * accessible name is asserted here and judged by axe in the browser passes:
   * an `<a>` whose only content is an `<img alt="">` has no name, which is a
   * `link-name` violation - the shape `stripEmptyAnchors` exists for.
   */
  it('links every album image to its largest derivative, with a name of its own', () => {
    const albums = galleryFiles();
    expect(albums.length, 'no gallery content file - the guard would prove nothing')
      .toBeGreaterThan(0);
    let linksChecked = 0;
    for (const f of albums) {
      const html = read(`galerie/${f.slug}/index.html`);
      const images = (f.frontmatter.images ?? []) as { file?: string }[];
      expect(images.length, `${f.file} lists no image - the count below would prove nothing`)
        .toBeGreaterThan(0);
      const links = galleryLinks(html);
      expect(links.length, `${f.slug} renders ${links.length} linked items, not ${images.length}`)
        .toBe(images.length);
      for (const link of links) {
        linksChecked += 1;
        expect(link.images, `${f.slug}: an item wraps ${link.images} images`).toBe(1);
        expect(link.href, `${f.slug}: an item has no href`).not.toBeNull();
        const href = link.href as string;
        expect(href.startsWith('/'), `${href} on /galerie/${f.slug}/ is not root-relative`).toBe(true);
        expect(existsSync(DIST + href.slice(1)), `${href} on /galerie/${f.slug}/ does not resolve inside dist/`)
          .toBe(true);
        expect((link.label ?? '').trim().length, `${f.slug}: a link has no accessible name`)
          .toBeGreaterThan(0);
      }
    }
    expect(linksChecked, 'no album image link in any built album').toBeGreaterThan(0);
    process.stdout.write(`\nGallery image links: ${linksChecked} over ${albums.length} album page(s).\n`);
  });
```

- [ ] **Step 2: Run them to verify they fail**

```bash
npm run build && ./node_modules/.bin/vitest run --config vitest.itest.config.ts -t "largest derivative"
npm test
```

Expected: the integration test FAILS ("a .gg-item with no anchor"); the unit control
PASSES (it is a pure reader). If the control fails, the reader is wrong, not the page.

- [ ] **Step 3: Implement the link**

In `src/components/GalleryGrid.astro`, the frontmatter gains the imports and two small
functions, and the template wraps the image:

```astro
---
import type { Gallery } from '../lib/content-schema';
import ContentImage from './ContentImage.astro';
import { publicUpload, resolveImage } from '../lib/images';

/**
 * ... (the existing alt-policy comment, unchanged) ...
 *
 * EVERY IMAGE IS A LINK TO ITS LARGEST DERIVATIVE. `ContentImage` renders
 * `.webp` variants sized for the grid; the href is the file the build emitted
 * for the asset itself - the 2400px ceiling the migration's `reencode`
 * guarantees - or the CMS upload's own URL, served byte-for-byte. A click
 * opens it in the tab: no script, no extra request on the album page, and it
 * works with scripts off, which is how `scripts/a11y.mjs` audits the site.
 * The link carries the accessible name because the image's alt is empty by
 * the policy above; without one an `<a>` around `<img alt="">` has no name.
 */
interface Props {
  gallery: { id: string; data: Gallery };
}

const { gallery } = Astro.props;

/** The URL a click opens, or undefined when ContentImage will fail the build. */
function fullSize(file: string): string | undefined {
  return resolveImage(file)?.src ?? publicUpload(file) ?? undefined;
}

/** The link's accessible name; the description, when there is one. */
function linkName(description: string | undefined): string {
  return description ? `Mărește fotografia: ${description}` : 'Mărește fotografia';
}
---

<ul class="gg">
  {gallery.data.images.map((image) => (
    <li class="gg-item">
      <a href={fullSize(image.file)} aria-label={linkName(image.description)}>
        <ContentImage
          image={image.file}
          alt=""
          sizes="(max-width: 34rem) 45vw, 15rem"
        />
      </a>
      {image.description && <p class="gg-caption">{image.description}</p>}
    </li>
  ))}
</ul>
```

- [ ] **Step 4: Run the tests, then the browser passes**

```bash
npm run build && ./node_modules/.bin/vitest run --config vitest.itest.config.ts -t "largest derivative"
npm run a11y
npm run a11y:mobile
```

Expected: PASS. The two browser passes audit every album page with scripts on and off
and fail on any axe violation the policy did not expect — `link-name` is the one this
change could introduce, and it must not fire. If it does, the accessible name is wrong,
not the rule.

- [ ] **Step 5: Run the unit suite, the type check and the budget**

```bash
npm test && npm run check && npm run budget
```

Expected: exit 0. `galerie/*`'s request budget is unchanged (an href is not a fetch) and
its HTML budget has ~9KB of headroom against the added bytes.

- [ ] **Step 6: Commit**

```bash
git add src/components/GalleryGrid.astro src/lib/build-output.itest.ts
git commit -m "feat(galerie): every album image links to its largest derivative"
```

---

### Task 4: the Doxologia covers, regenerated from the issue PDFs (item 3)

**Files:**
- Create: migration/doxologia-covers.mjs (the generator and its pure functions)
- Create: migration/doxologia-covers.test.mjs
- Create: the 30 generated covers under src/assets/content/2026/09/ (31 entries; the
  duplicate Nr.8 pairs twice to one file. Not named here in backticks: they exist only
  after Step 6 runs)
- Modify: `src/content/pages/revista-doxologia.md` (30 replaced paths, one added)
- Modify: `src/lib/referenced-paths.test.ts` (29 old covers into `ABSENT_ON_PURPOSE`)
- Delete: the 29 old cover assets (listed in Step 8; the page's banner and the shared
  landscape screenshot stay)
- Modify: `migration/README.md` (a section for the tool)

**Interfaces:**
- Consumes: `reencode` from `migration/media.mjs` (exported, existing); poppler's
  `pdftoppm` and `pdfinfo` (already required by `migration/pdf-gate.mjs` and installed
  by `ci.yml`).
- Produces: `parseEntries`, `pairPdf`, `coverName`, `pageSize`, `isSpread`,
  `coverPath`, `markdownPath`, `rewriteMarkdown` — used only by this task's test.

**Measured facts this task is built on** (2026-09-22, on `main`):

- The page carries 31 images: a 814×1130 banner that is not a cover, 25 old-site
  thumbnails at ~250×353, four 1142–1258px screenshots, and one 1024×754 landscape
  screenshot that is not a cover at all.
- Every entry's image is the **previous issue's** cover: Nr. 28's entry shows
  `doxologia_27_2024.jpg`, Nr. 27's shows `doxologia_26_2023.jpg`, and so on down.
- There are 31 entries: Nr. 30 … Nr. 1 plus a duplicate "Nr. 8 (Decembrie, 2014)";
  Nr. 7 has no image and Nr. 12 has no PDF link.
- `doxologia-1-2011.pdf`, `doxologia-2-2011.pdf` and `doxologia-3-2012.pdf` are
  1224×792pt sheets: two US-Letter pages side by side, the cover on the **right** half
  (verified by eye on all three). Every other PDF is A4 portrait and page 1 is the
  cover.
- The reading column is 578px; at DPR 2 that needs 1156px, so the generator renders at
  **1200px** wide. The markdown pipeline emits one derivative per body image (no
  srcset), so this one number serves both widths.
- A rendered cover through `reencode` measures ~264KB, 1200×1698 (portrait) or
  1200×1553 (spread half), no EXIF/ICC, and two runs are byte-identical.

- [ ] **Step 1: Write the failing test**

Create migration/doxologia-covers.test.mjs:

```js
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  DOCS_DIR,
  OUT_DIR,
  PAGE_PATH,
  ROOT,
  coverName,
  isSpread,
  pageSize,
  pairPdf,
  parseEntries,
} from './doxologia-covers.mjs';

const markdown = readFileSync(join(ROOT, PAGE_PATH), 'utf8');
const pdfNames = readdirSync(join(ROOT, DOCS_DIR))
  .filter((name) => name.startsWith('doxologia-'))
  .sort();
const entries = parseEntries(markdown);
const pdfFor = (entry) => pairPdf(entry, pdfNames);

describe('the doxologia cover pairing', () => {
  it('finds every issue on the page, the duplicate included', () => {
    expect(entries.length).toBe(31);
    expect(entries.filter((e) => e.issue === 8).length).toBe(2);
  });

  it('pairs every entry with a PDF that exists', () => {
    for (const entry of entries) {
      const pdf = pdfFor(entry);
      expect(pdf, `Nr.${entry.issue} (${entry.year}) pairs with nothing`).not.toBeNull();
      expect(existsSync(join(ROOT, DOCS_DIR, pdf)), pdf).toBe(true);
    }
  });

  it('takes the linked PDF when there is one, and the heading when there is not', () => {
    const byYear = (issue, year) => entries.find((e) => e.issue === issue && e.year === year);
    expect(pdfFor(byYear(16, 2019)), 'Nr.16 links a 2018 PDF').toBe('doxologia-16-2018.pdf');
    expect(pdfFor(byYear(12, 2016)), 'Nr.12 links nothing, so the heading pairs it')
      .toBe('doxologia-12-2016.pdf');
  });

  it('names every cover doxologia-<issue>-<year>.jpg', () => {
    for (const entry of entries) {
      expect(coverName(pdfFor(entry)), `Nr.${entry.issue} (${entry.year})`)
        .toMatch(/^doxologia-\d+-\d{4}\.jpg$/);
    }
  });

  it('reads the three Letter-spread issues as spreads, and only those', () => {
    const spreads = entries
      .filter((entry) => isSpread(pageSize(join(ROOT, DOCS_DIR, pdfFor(entry)))))
      .map((entry) => pdfFor(entry));
    expect(spreads).toEqual([
      'doxologia-3-2012.pdf',
      'doxologia-2-2011.pdf',
      'doxologia-1-2011.pdf',
    ]);
  });

  it('renders every committed cover from the PDF its entry advertises', () => {
    entries.forEach((entry) => {
      const name = coverName(pdfFor(entry));
      expect(entry.image, `Nr.${entry.issue} (${entry.year})`)
        .toBe(`../../assets/content/2026/09/${name}`);
      expect(existsSync(join(ROOT, OUT_DIR, name)), name).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
./node_modules/.bin/vitest run migration/doxologia-covers.test.mjs
```

Expected: FAIL — the module does not exist yet.

- [ ] **Step 3: Write the generator**

Create migration/doxologia-covers.mjs:

```js
/*
 * ONE COVER PER DOXOLOGIA ISSUE, RENDERED FROM PAGE 1 OF THE PDF THE PAGE
 * ALREADY LINKS.
 *
 * WHY REGENERATE RATHER THAN RESIZE. The page's 31 images measure: 25 old-site
 * thumbnails at ~250x353, four 1142-1258px screenshots, one 1024x754 landscape
 * screenshot that is not a cover, and a 814x1130 banner that is not a cover
 * either. A CSS width alone would upscale the 250px thumbnails to the 578px
 * reading column - blurry. Worse, every entry currently shows the PREVIOUS
 * issue's cover: Nr.28's entry shows doxologia_27_2024.jpg, Nr.27's shows
 * doxologia_26_2023.jpg, and so on. Page 1 of each linked PDF is the cover at
 * print resolution, so rendering from there fixes the pairing and the size in
 * one step, and makes a cover and the file it advertises impossible to desync.
 *
 * THE THREE LETTER-SPREAD ISSUES. doxologia-1-2011.pdf, doxologia-2-2011.pdf
 * and doxologia-3-2012.pdf are 1224x792pt pages: each sheet carries two
 * US-Letter pages side by side, and the cover is the RIGHT half - verified by
 * eye on all three. Page 1 is rendered at twice the target width and the right
 * half extracted; every other issue's page 1 is the cover, at A4 portrait.
 *
 * PAIRING RULE. An entry with a /documente/doxologia-....pdf link uses it (that
 * is what the reader clicks, so that is what the cover must show). An entry
 * with no link is paired by its heading's issue and year - today that is only
 * Nr.12, whose link the old page never had. The heading is not authoritative
 * on its own: Nr.16's heading says 2019 and its link says 16-2018, and the
 * link wins.
 *
 * RUN BY HAND, ONCE PER COVER CHANGE, like migration/doc-convert.mjs. It reads
 * only files inside this repository, so unlike the rest of migration/ it runs
 * in a fresh clone. It rewrites the page and writes the images; commit both.
 * A migration re-run would restore the old paths, so the order after one is:
 * run the migration, then run this.
 *
 * 1200px, because the reading column is 578px and DPR 2 needs 1156. The
 * markdown image pipeline emits one derivative per body image, no srcset, so
 * this one number is the file a phone and a retina desktop both fetch.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { reencode } from './media.mjs';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const PAGE_PATH = 'src/content/pages/revista-doxologia.md';
export const DOCS_DIR = 'public/documente';
export const OUT_DIR = 'src/assets/content/2026/09';
export const COVER_WIDTH = 1200;

const HEADING = /^Nr\.?\s*(\d+)\s*\([^,]+,\s*(\d{4})\)/;
const PDF_LINK = /\]\(\/documente\/(doxologia-[^)]+\.pdf)\)/;
const IMAGE = /!\[\]\((\.\.\/\.\.\/assets\/content\/[^)]+)\)/;

/**
 * The page's entries in document order, with the lines each occupies.
 *
 * `last` is the entry's last non-empty line before the next section heading
 * (`## Revista Doxologia` opens the following entry), which is where an entry
 * with no image gets one appended. A `Nr.` heading starts an entry; nothing
 * before the first heading (the banner image) belongs to one. A `##` line is
 * a boundary and never content: counting it let Nr.7's appended cover land on
 * the NEXT entry's `## Revista Doxologia` line, inside its `<h2>`.
 */
export function parseEntries(markdown) {
  const lines = markdown.split('\n');
  const entries = [];
  let current = null;
  lines.forEach((line, index) => {
    const heading = HEADING.exec(line);
    if (heading) {
      current = {
        issue: Number(heading[1]),
        year: Number(heading[2]),
        link: null,
        image: null,
        start: index,
        last: index,
      };
      entries.push(current);
      return;
    }
    if (current === null) return;
    if (line.startsWith('## ')) return;
    if (line.trim() !== '') current.last = index;
    const link = PDF_LINK.exec(line);
    if (link) current.link = link[1];
    const image = IMAGE.exec(line);
    if (image) current.image = image[1];
  });
  return entries;
}

/** The PDF an entry's cover comes from: the link, or the heading. */
export function pairPdf(entry, pdfNames) {
  if (entry.link !== null) {
    if (!pdfNames.includes(entry.link)) {
      throw new Error(
        `Nr.${entry.issue} (${entry.year}) links ${entry.link}, which is not in ${DOCS_DIR}/`,
      );
    }
    return entry.link;
  }
  const pattern = new RegExp(`^doxologia-${entry.issue}-${entry.year}(?:-|\\.)`);
  return pdfNames.find((name) => pattern.test(name)) ?? null;
}

/** The one file name a PDF's cover gets: doxologia-<issue>-<year>.jpg. */
export function coverName(pdfName) {
  const match = /^(doxologia-\d+-\d{4})/.exec(pdfName);
  if (match === null) throw new Error(`${pdfName} is not a doxologia-N-YYYY name`);
  return `${match[1]}.jpg`;
}

/** Page 1's size in points, from the same poppler the PDF gate uses. */
export function pageSize(pdfPath) {
  const info = execFileSync('pdfinfo', [pdfPath], { encoding: 'utf8' });
  const match = /^Page size:\s+([\d.]+) x ([\d.]+) pts/m.exec(info);
  if (match === null) throw new Error(`pdfinfo reported no page size for ${pdfPath}`);
  return { width: Number(match[1]), height: Number(match[2]) };
}

/** A sheet wider than it is tall carries two Letter pages; the cover is right. */
export function isSpread(size) {
  return size.width > size.height;
}

/** The repository path a generated cover is written to. */
export function coverPath(name) {
  return `${OUT_DIR}/${name}`;
}

/** The path a content file uses to name the generated cover. */
export function markdownPath(name) {
  return `../../assets/${OUT_DIR.replace('src/assets/', '')}/${name}`;
}

/**
 * The page with each entry's image replaced, and Nr.7's appended.
 *
 * POSITIONAL, NOT A GLOBAL REPLACE: doxologia_24_2022.jpg appears in two
 * entries (Nr.25's and Nr.22's) and each maps to a different issue's cover, so
 * the replacement happens inside each entry's own lines.
 */
export function rewriteMarkdown(markdown, entries, names) {
  const lines = markdown.split('\n');
  entries.forEach((entry, index) => {
    const rel = markdownPath(names[index]);
    if (entry.image !== null) {
      for (let line = entry.start; line <= entry.last; line += 1) {
        lines[line] = lines[line].replace(entry.image, rel);
      }
    } else {
      lines[entry.last] = `${lines[entry.last]} ![](${rel})`;
    }
  });
  return lines.join('\n');
}

async function renderCover(pdfPath, spread) {
  const dir = mkdtempSync(join(tmpdir(), 'doxologia-cover-'));
  try {
    execFileSync('pdftoppm', [
      '-f', '1', '-l', '1',
      '-jpeg', '-jpegopt', 'quality=90',
      '-scale-to-x', String(spread ? COVER_WIDTH * 2 : COVER_WIDTH),
      '-scale-to-y', '-1',
      pdfPath, join(dir, 'page'),
    ]);
    const rendered = join(dir, readdirSync(dir)[0]);
    let source = rendered;
    if (spread) {
      const meta = await sharp(rendered).metadata();
      const width = meta.width ?? 0;
      const height = meta.height ?? 0;
      source = join(dir, 'half.jpg');
      writeFileSync(
        source,
        await sharp(rendered)
          .extract({ left: width / 2, top: 0, width: width / 2, height })
          .jpeg({ quality: 90 })
          .toBuffer(),
      );
    }
    return await reencode(source, 'cover.jpg');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  const pdfNames = readdirSync(join(ROOT, DOCS_DIR))
    .filter((name) => name.startsWith('doxologia-'))
    .sort();
  const markdown = readFileSync(join(ROOT, PAGE_PATH), 'utf8');
  const entries = parseEntries(markdown);
  const names = [];
  const report = [];
  for (const entry of entries) {
    const pdf = pairPdf(entry, pdfNames);
    if (pdf === null) {
      throw new Error(`Nr.${entry.issue} (${entry.year}) pairs with no PDF - fix the heading or add the file`);
    }
    const name = coverName(pdf);
    const spread = isSpread(pageSize(join(ROOT, DOCS_DIR, pdf)));
    const bytes = await renderCover(join(ROOT, DOCS_DIR, pdf), spread);
    mkdirSync(join(ROOT, OUT_DIR), { recursive: true });
    writeFileSync(join(ROOT, coverPath(name)), bytes);
    names.push(name);
    report.push(`${pdf} -> ${name}${spread ? ' (spread: right half)' : ''} ${bytes.length} B`);
  }
  writeFileSync(join(ROOT, PAGE_PATH), rewriteMarkdown(markdown, entries, names));
  process.stdout.write(
    `\n${report.join('\n')}\n\n${entries.length} covers written to ${OUT_DIR}/, page rewritten.\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
```

- [ ] **Step 4: Run the pairing test**

```bash
./node_modules/.bin/vitest run migration/doxologia-covers.test.mjs
```

Expected: the first five tests PASS; the last one ("renders every committed cover…")
FAILS, because the page still names the old covers. That is the red state this task
starts from — do not "fix" the test.

- [ ] **Step 5: Confirm the module's pairing report before rendering anything**

```bash
node -e "import('./migration/doxologia-covers.mjs').then(async (m) => { const { readFileSync, readdirSync } = await import('node:fs'); const { join } = await import('node:path'); const md = readFileSync(join(m.ROOT, m.PAGE_PATH), 'utf8'); const pdfs = readdirSync(join(m.ROOT, m.DOCS_DIR)).filter((n) => n.startsWith('doxologia-')).sort(); for (const e of m.parseEntries(md)) { const pdf = m.pairPdf(e, pdfs); console.log('Nr.' + e.issue, e.year, '->', pdf, '->', pdf ? m.coverName(pdf) : '(none)'); } })" dummy
```

The trailing `dummy` argument is not decoration: the generator's main guard compares
`import.meta.url` against `pathToFileURL(process.argv[1])`, and under `node -e` that
argument is undefined, so the import would throw before printing anything.

Expected: 31 lines, Nr.16 → `doxologia-16-2018.pdf`, Nr.12 → `doxologia-12-2016.pdf`,
and two lines for Nr.8 mapping to `doxologia-8-2014.pdf`. If any line says `(none)`,
stop: a PDF the page needs is not in `public/documente/`.

- [ ] **Step 6: Run the generator**

```bash
node migration/doxologia-covers.mjs
```

Expected: 31 report lines, three of them marked "(spread: right half)", each around
264,000 bytes, then "31 covers written to src/assets/content/2026/09/, page rewritten."
The generator's summary counts entries, not files: 30 files exist, because the
duplicate Nr.8 entry pairs twice to doxologia-8-2014.jpg and the second write replaces
the first.
Confirm idempotence by running it a second time and checking the page did not change:

```bash
git diff --stat src/content/pages/revista-doxologia.md
node migration/doxologia-covers.mjs
git diff --stat src/content/pages/revista-doxologia.md
```

Expected: the second run's stat is identical to the first — same line count, no new
hunks.

- [ ] **Step 7: Look at every cover by eye**

Create .superpowers/p6-contact-sheet.mjs:

```js
import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const md = readFileSync('src/content/pages/revista-doxologia.md', 'utf8');
const names = [...new Set([...md.matchAll(/2026\/09\/(doxologia-\d+-\d{4}\.jpg)/g)].map((m) => m[1]))];
const THUMB = 200;
const GAP = 8;
const COLS = 6;
const rows = Math.ceil(names.length / COLS);
const tiles = [];
for (let i = 0; i < names.length; i += 1) {
  const input = await sharp(`src/assets/content/2026/09/${names[i]}`)
    .resize({ width: THUMB, height: THUMB, fit: 'contain', background: '#ffffff' })
    .toBuffer();
  tiles.push({ input, left: (i % COLS) * (THUMB + GAP), top: Math.floor(i / COLS) * (THUMB + GAP) });
}
await sharp({
  create: {
    width: COLS * (THUMB + GAP),
    height: rows * (THUMB + GAP),
    channels: 3,
    background: '#ffffff',
  },
})
  .composite(tiles)
  .png()
  .toFile('/tmp/p6-covers-sheet.png');
process.stdout.write(`${names.length} covers, ${COLS} per row -> /tmp/p6-covers-sheet.png\n`);
```

```bash
node .superpowers/p6-contact-sheet.mjs
```

Then read `/tmp/p6-covers-sheet.png`. Expected: 30 tiles (the sheet dedupes the
repeated Nr.8 file name), each a magazine cover with
its masthead and issue number, in page order (Nr.30 first). **If any tile is a text
page, a table of contents or a two-page spread, stop and report which** — the pairing
or the crop is wrong for that issue, and shipping it would put a non-cover on the page.
The three spreads are the tiles for Nr.3, Nr.2 and Nr.1: each must show a single cover,
not two pages.

- [ ] **Step 8: Add the deleted covers to the absent-on-purpose list, and delete them**

Add a new group to `ABSENT_ON_PURPOSE` in `src/lib/referenced-paths.test.ts`:

```ts
  'replaced by decision: the Doxologia covers were regenerated from the issue PDFs on 2026-09-22, and the build publishes every file under src/assets whether a page links it or not': [
    'src/assets/content/2024/05/doxologia_22_2021.jpg',
    'src/assets/content/2024/05/doxologia_23_2022.jpg',
    'src/assets/content/2024/05/doxologia_24_2022.jpg',
    'src/assets/content/2024/05/doxologia_26_2023.jpg',
    'src/assets/content/2024/05/doxologia_27_2024.jpg',
    'src/assets/content/2024/06/doxologia_1_2011.jpg',
    'src/assets/content/2024/06/doxologia_2_2011-1.jpg',
    'src/assets/content/2024/06/doxologia_3_2012.jpg',
    'src/assets/content/2024/06/doxologia_4_2012.jpg',
    'src/assets/content/2024/06/doxologia_5_2013.jpg',
    'src/assets/content/2024/06/doxologia_6_2013.jpg',
    'src/assets/content/2024/06/doxologia_8_2014.jpg',
    'src/assets/content/2024/06/doxologia_9_2015.jpg',
    'src/assets/content/2024/06/doxologia_10_2015-1.jpg',
    'src/assets/content/2024/06/doxologia_11_2016.jpg',
    'src/assets/content/2024/06/doxologia_12_2016.jpg',
    'src/assets/content/2024/06/doxologia_13_2017.jpg',
    'src/assets/content/2024/06/doxologia_14_2017.jpg',
    'src/assets/content/2024/06/doxologia_15_2018.jpg',
    'src/assets/content/2024/06/doxologia_16_2018-1.jpg',
    'src/assets/content/2024/06/doxologia_17_2019.jpg',
    'src/assets/content/2024/06/doxologia_18_2019.jpg',
    'src/assets/content/2024/06/doxologia_19_2020.jpg',
    'src/assets/content/2024/06/doxologia_20_2020.jpg',
    'src/assets/content/2024/06/doxologia_24_2022.jpg',
    'src/assets/content/2024/09/doxologia_25_2023.png',
    'src/assets/content/2024/11/Screenshot-2024-11-25-at-11.58.27.png',
    'src/assets/content/2025/04/Screenshot-2025-04-06-at-23.19.24.png',
    'src/assets/content/2025/06/Screenshot-2025-06-21-at-21.35.12.png',
  ],
```

That is 29 files; the same list is deleted in the same commit, so the exemption is
never stale. **Two files are deliberately NOT in the list**: the 814×1130 banner
(`src/assets/content/2025/11/Screenshot-2025-11-24-at-15.29.35-1.png`) stays on the
page, and `src/assets/content/2024/05/Captura-de-ecran-din-2024-05-14-la-15.25.58.png`
is still used by `consiliul-parohial`, `link-uri-utile` and `studii` (and keeps its
doxologia page mention nowhere, but its three other pages).

```bash
git rm src/assets/content/2025/04/Screenshot-2025-04-06-at-23.19.24.png \
  src/assets/content/2024/05/doxologia_22_2021.jpg \
  src/assets/content/2024/05/doxologia_23_2022.jpg \
  src/assets/content/2024/05/doxologia_24_2022.jpg \
  src/assets/content/2024/05/doxologia_26_2023.jpg \
  src/assets/content/2024/05/doxologia_27_2024.jpg \
  src/assets/content/2024/06/doxologia_1_2011.jpg \
  src/assets/content/2024/06/doxologia_2_2011-1.jpg \
  src/assets/content/2024/06/doxologia_3_2012.jpg \
  src/assets/content/2024/06/doxologia_4_2012.jpg \
  src/assets/content/2024/06/doxologia_5_2013.jpg \
  src/assets/content/2024/06/doxologia_6_2013.jpg \
  src/assets/content/2024/06/doxologia_8_2014.jpg \
  src/assets/content/2024/06/doxologia_9_2015.jpg \
  src/assets/content/2024/06/doxologia_10_2015-1.jpg \
  src/assets/content/2024/06/doxologia_11_2016.jpg \
  src/assets/content/2024/06/doxologia_12_2016.jpg \
  src/assets/content/2024/06/doxologia_13_2017.jpg \
  src/assets/content/2024/06/doxologia_14_2017.jpg \
  src/assets/content/2024/06/doxologia_15_2018.jpg \
  src/assets/content/2024/06/doxologia_16_2018-1.jpg \
  src/assets/content/2024/06/doxologia_17_2019.jpg \
  src/assets/content/2024/06/doxologia_18_2019.jpg \
  src/assets/content/2024/06/doxologia_19_2020.jpg \
  src/assets/content/2024/06/doxologia_20_2020.jpg \
  src/assets/content/2024/06/doxologia_24_2022.jpg \
  src/assets/content/2024/09/doxologia_25_2023.png \
  src/assets/content/2024/11/Screenshot-2024-11-25-at-11.58.27.png \
  src/assets/content/2025/06/Screenshot-2025-06-21-at-21.35.12.png
```

- [ ] **Step 9: Run the unit suite — the cover test, the sweep and the asset treatment**

```bash
npm test
```

Expected: PASS, and printed: the content-asset sweep covering 102 files (101 existing
plus 30 unique new minus 29 deleted), none with EXIF/ICC/XMP/IPTC, longest edge 2400. `referenced-paths.test.ts` now reports
the new exemption group and finds no stale one.

- [ ] **Step 10: Document the tool in the migration README**

In `migration/README.md`, after the "The `.doc` study files, converted once" section,
add a section:

```markdown
## The Doxologia covers, rendered once

`revista-doxologia.md` is a shelf of 31 magazine covers, and every one of them is
rendered from page 1 of the PDF the entry links, by the one-time tool below. It is a
one-time manual step like the `.doc` conversion, not part of `run.mjs`, and unlike the
rest of this directory it reads only files inside the repository, so a fresh clone can
re-run it:

```
node migration/doxologia-covers.mjs
```

It needs `pdftoppm` and `pdfinfo` from poppler (the same package the PDF gate needs),
renders at 1200px through the migration's own `reencode`, rewrites the page's image
paths, and prints every pairing. The three US-Letter spread issues (1-2011, 2-2011,
3-2012) are detected by page shape and cropped to their right half, which is the
cover. **After a migration re-run, run this again**: the migration would restore the
old cover paths, and the unit test on the pairing fails until this runs.
```

- [ ] **Step 11: Run the build gate and look at the built page**

```bash
npm run test:build
node .superpowers/p6-shot.mjs /resurse/doxologia/ dox
```

Expected: exit 0 — the default-width browser pass audits the page with all 31 covers
(`test:build` runs that one pass; add `npm run a11y:mobile`, because the cover column's
phone rendering changes with the images), and the
integration test "a body image on a prose page resolves to a real file in dist/"
proves each new cover is emitted. Then read `/tmp/dox-full.png`: the covers form one
uniform column, all the same width, no thumbnail-sized stragglers and no landscape
screenshot.

- [ ] **Step 12: Commit**

```bash
git add migration/doxologia-covers.mjs migration/doxologia-covers.test.mjs \
  src/content/pages/revista-doxologia.md src/assets/content/2026/09 \
  src/lib/referenced-paths.test.ts migration/README.md
git commit -m "feat(doxologia): the covers are rendered from the issues' own PDFs"
```

---

### Task 5: the founding album — renamed, and densified (item 4)

**Files:**
- Create: nine images under src/assets/content/galleries/legacy/ (17.jpg–25.jpg; not
  named in backticks until they exist)
- Modify: `src/content/galerii/imagini-de-la-slujbe.md`
- Modify: `src/components/GalleryGrid.astro` (the dense variant)
- Modify: `src/lib/build-output.itest.ts` (one test in the gallery describe)
- Modify: `docs/handover.md` (§L, one bullet)
- Scratch: .superpowers/p6-legacy-import.mjs (git-ignored; code below)

**Interfaces:**
- Consumes: `reencode` from `migration/media.mjs`; the anchor markup from Task 3.
- Produces: nothing later tasks use.

**Measured facts this task is built on** (2026-09-22):

- The album's nine committed images are 160×129, ~5KB each; the backup's `17.jpg`–`25.jpg`
  are 300×242 and are not on the old page (the old gallery has 8–16 only), but read as
  the same era: I viewed 17, 20 and 23 — services in the first chapel, vestments, a
  procession.
- The album page renders 160px images left-aligned in 328px cells at 1280 (the grid is
  three columns of `minmax(0, 1fr)` in a 1016px container) — sparse, and the backlog's
  dense-plates reading of it is right.
- At 390 the grid is two columns of 171px; `auto-fill` with `minmax(9rem, 1fr)` gives
  163px cells there and 156px cells (six columns) at 1280.
- **No `/galerie/*` path exists in `docs/url-map.csv`** — the old album was one
  WordPress page at `/evenimente/`, and `/galerie.html` → `/galerie/` is a hand-written
  rule in `scripts/redirects.mjs`'s `EXTRA_RULES`. The backlog's "already in the 152"
  premise is wrong; the title-only rename needs no redirect work, and a slug rename
  would not have needed a CSV row either. Record the correction in the backlog at the
  end of this task.

- [ ] **Step 1: Import the nine images through the migration's sanitiser**

Create .superpowers/p6-legacy-import.mjs:

```js
/*
 * One-time import of the nine founding-era photographs the old page never
 * carried. Reads the 2026-08-22 backup, which is OUTSIDE the repository and
 * never committed; writes only the re-encoded pixels under
 * src/assets/content/galleries/legacy/.
 */
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { reencode } from '../migration/media.mjs';

const BACKUP = '/Users/stefan/Work/stuff/site-bzh/backup-2026-08-22/web01/htdocs/galerie';
const OUT = 'src/assets/content/galleries/legacy';

for (let n = 17; n <= 25; n += 1) {
  const source = `${BACKUP}/${n}.jpg`;
  const bytes = await reencode(source, `${n}.jpg`);
  const dest = `${OUT}/${n}.jpg`;
  writeFileSync(dest, bytes);
  const meta = await sharp(dest).metadata();
  const before = statSync(source).size;
  process.stdout.write(`${n}.jpg: ${meta.width}x${meta.height}, ${before} B -> ${bytes.length} B\n`);
}
```

```bash
node .superpowers/p6-legacy-import.mjs
```

Expected: nine lines, each `300x2xx`, and the written file non-zero. The source paths
are read, never copied; nothing from the backup is committed as-is.

- [ ] **Step 2: Rename the album and add the nine images**

`src/content/galerii/imagini-de-la-slujbe.md`: the title becomes `Fondarea parohiei`
(the slug and file name stay), and the `images:` list gains nine entries after `16.jpg`,
with no `description` — the old page never captioned them and inventing one is worse
than leaving it empty. The frontmatter ends:

```yaml
title: "Fondarea parohiei"
date: "2001-12-20"
cover: "../../assets/content/galleries/legacy/8.jpg"
images:
  # ... the nine existing entries 8.jpg–16.jpg, unchanged ...
  - file: "../../assets/content/galleries/legacy/17.jpg"
  - file: "../../assets/content/galleries/legacy/18.jpg"
  - file: "../../assets/content/galleries/legacy/19.jpg"
  - file: "../../assets/content/galleries/legacy/20.jpg"
  - file: "../../assets/content/galleries/legacy/21.jpg"
  - file: "../../assets/content/galleries/legacy/22.jpg"
  - file: "../../assets/content/galleries/legacy/23.jpg"
  - file: "../../assets/content/galleries/legacy/24.jpg"
  - file: "../../assets/content/galleries/legacy/25.jpg"
```

The CMS `Galerii foto` collection edits this file, so the shape must stay what
`gallerySchema` validates (a `file`, optional `description`).

- [ ] **Step 3: Write the failing layout assertion**

In `src/lib/build-output.itest.ts`'s gallery describe, add. If `sharp` is not already
imported at the top of the file, add `import sharp from 'sharp';`.

```ts
  /*
   * SMALL PLATES GET A DENSE GRID. The founding album's photographs are
   * 160-300px; at three columns of a 1016px container each sits in a 328px
   * cell, which reads as broken rather than as an archive. `GalleryGrid`
   * derives the dense class from the images themselves - every asset at most
   * 400px on its long edge - so a future album of small scans gets it too, and
   * a photograph album never does. The threshold is duplicated here on
   * purpose: a component that changes its rule without changing this test is
   * the defect the assertion exists to catch.
   */
  it('lays an album of small plates out densely and a photograph album three-up', async () => {
    const albums = galleryFiles();
    expect(albums.length, 'no gallery content file - the guard would prove nothing')
      .toBeGreaterThan(1);
    for (const f of albums) {
      const images = (f.frontmatter.images ?? []) as { file?: string }[];
      expect(images.length, `${f.file} lists no image`).toBeGreaterThan(0);
      let small = true;
      for (const image of images) {
        const rel = (image.file ?? '').replace('../../assets/', 'src/assets/');
        if (!existsSync(rel)) {
          small = false;
          continue;
        }
        const meta = await sharp(rel).metadata();
        if (Math.max(meta.width ?? 0, meta.height ?? 0) > 400) small = false;
      }
      const html = read(`galerie/${f.slug}/index.html`);
      const dense = /<ul\b[^>]*\bclass="[^"]*\bgg-dense\b/.test(html);
      expect(dense, `${f.slug}: dense=${dense} but small=${small}`).toBe(small);
    }
  });
```

- [ ] **Step 4: Run it to verify it fails**

```bash
npm run build && ./node_modules/.bin/vitest run --config vitest.itest.config.ts -t "small plates"
```

Expected: FAIL on `imagini-de-la-slujbe` — `dense=false but small=true`.

- [ ] **Step 5: Implement the dense variant**

`src/components/GalleryGrid.astro`, frontmatter gains (below `linkName`):

```ts
/*
 * AN ALBUM OF SMALL PLATES GETS A DENSER GRID. The founding album's nine
 * committed photographs are 160px and the nine imported ones 300px; three
 * columns of a 1016px container put each in a 328px cell. Every asset at most
 * 400px on its long edge means the album is an archive of small plates, and
 * `auto-fill` fits six of them per row at 1280 and two at 390. A CMS upload
 * (`publicUpload`, no asset) is not measured and keeps the photograph layout.
 */
const dense =
  gallery.data.images.length > 0 &&
  gallery.data.images.every((image) => {
    const asset = resolveImage(image.file);
    return asset !== null && Math.max(asset.width, asset.height) <= 400;
  });
```

The `<ul>` becomes:

```astro
<ul class:list={['gg', { 'gg-dense': dense }]}>
  {gallery.data.images.map((image) => (
    <li class="gg-item">
      <a href={fullSize(image.file)} aria-label={linkName(image.description)}>
        <ContentImage
          image={image.file}
          alt=""
          sizes={dense ? '(max-width: 34rem) 45vw, 9rem' : '(max-width: 34rem) 45vw, 15rem'}
        />
      </a>
      {image.description && <p class="gg-caption">{image.description}</p>}
    </li>
  ))}
</ul>
```

And the style block's grid rules become:

```css
  .gg {
    list-style: none;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1rem;
    margin: 2rem 0 0;
    padding: 0;
  }
  /*
   * DENSE: as many ~9rem plates as fit. The rule is repeated inside the media
   * query on purpose - the query's `.gg` rule has equal specificity and comes
   * later, so a dense album would otherwise fall back to two fixed columns.
   */
  .gg-dense { grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr)); }
  .gg-dense :global(img) { width: 100%; height: auto; }
  /* The same `34rem` boundary `SiteHeader` and `DayRow` use, so the grid adds
     no width band the browser passes do not already audit. */
  @media (max-width: 34rem) {
    .gg { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .gg-dense { grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr)); }
  }
```

- [ ] **Step 6: Run the assertion, the unit suite and the browser passes**

```bash
npm run build && ./node_modules/.bin/vitest run --config vitest.itest.config.ts -t "small plates"
npm test && npm run check
npm run a11y && npm run a11y:mobile
```

Expected: PASS. `npm test` sweeps the nine new images for EXIF/ICC/XMP/IPTC and the
2400 edge, and the caption test still expects nine captions (the new nine have no
description, so they render no caption).

- [ ] **Step 7: Look at the album at both widths**

```bash
node .superpowers/p6-shot.mjs /galerie/imagini-de-la-slujbe/ legacy
```

Then read `/tmp/legacy-1280.png` and `/tmp/legacy-390.png`. Expected: the title reads
**Fondarea parohiei**; the eighteen plates sit in a dense grid at roughly equal size,
six per row at 1280 and two at 390; no plate is a blurred enlargement, and no row is
dominated by empty space.

- [ ] **Step 8: The handover sentence**

`docs/handover.md` §L, in the "What now exists" list after the Routes bullet, add:

```
- **The founding album is as large as this repository can make it.** `/galerie/imagini-de-la-slujbe/`
  (titled **Fondarea parohiei**) is eighteen photographs, the captioned ones from
  2001–2003, the largest
  300px. The old server's own `galerie/` folder holds nothing wider, so ask the parish
  for prints or negatives before anyone promises a sharper version — a scan would beat
  anything in the backup.
```

- [ ] **Step 9: Commit**

```bash
git add src/assets/content/galleries/legacy src/content/galerii/imagini-de-la-slujbe.md \
  src/components/GalleryGrid.astro src/lib/build-output.itest.ts docs/handover.md
git commit -m "feat(galerie): the founding album, renamed and densified"
```

---

### Task 6: the full gate, and the backlog closed

**Files:**
- Modify: `docs/superpowers/plans/2026-09-22-phase-6-backlog.md` (the five checkboxes,
  and the item 4 correction)

- [ ] **Step 1: Mark the backlog and record the corrections**

Tick the five checkboxes in `docs/superpowers/plans/2026-09-22-phase-6-backlog.md`
(`- [x]`), and append to item 4:

```
      **Corrected while executing (2026-09-22):** the premise above that the old path
      "is already in the 152" is wrong — no `/galerie/*` path exists in
      `docs/url-map.csv`. The old album was one WordPress page at `/evenimente/`, and
      `/galerie.html` → `/galerie/` is a hand-written rule in `scripts/redirects.mjs`'s
      `EXTRA_RULES`. The title-only rename needed no redirect work, and a slug rename
      would not have needed a CSV row either. Item 4 also gained the nine 300px images
      from the backup (17–25) and the dense grid, and the page's 2001 photographs are
      now as large as anything this repository can reach.
```

- [ ] **Step 2: Run everything**

```bash
npm run test:all && npm run check
```

Expected: exit 0 for both. `test:all` prints the unit counts, the integration counts,
four "Audit passed." lines, and "Budget met."; `check` prints 0 errors, 0 warnings,
0 hints. A red pass here is not shippable — fix and re-run before the final commit.

- [ ] **Step 3: Commit the backlog**

```bash
git add docs/superpowers/plans/2026-09-22-phase-6-backlog.md
git commit -m "docs(phase-6): the backlog is executed, with its corrections"
```

- [ ] **Step 4: Hand off to the finishing skill**

Announce and use superpowers:finishing-a-development-branch: verify the tree is clean
(`git status` first, then `git diff-index --quiet HEAD`), present the merge options to
the human, and follow the choice.
