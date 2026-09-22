# Phase 6 backlog — gallery, navigation, images and prose-page furniture

> **This is a backlog, not a plan.** Five items, each with the measurement behind it and
> the decision already taken where one was taken. It is the input a Phase 6 implementation
> plan argues from. Do not execute it with `superpowers:subagent-driven-development` — write
> the plan first, from this and from the spec.

**Spec:** `docs/superpowers/specs/2026-09-15-parish-site-rewrite-design.md` (§4 design
system, §13 budget).
**Not in scope here:** the homepage banner, which has its own backlog at
`docs/superpowers/plans/2026-09-21-phase-5-1-homepage-banner.md`.

Items 1–4 were raised on 2026-09-22 against the preview deployment at
`https://wscsprint3r.github.io/bzh-preview-4f21/`; item 5 was added by the parish on the
same day, while the plan was being written. Every number below was measured, not
estimated; where a thing cannot be done, this says so rather than planning it.

---

## 1. The gallery: full resolution, and a click that enlarges

- [x] **Give an album image somewhere to go.** `src/pages/galerie/[slug].astro` renders
      derivatives and links to nothing, so a visitor who wants to see a photograph properly
      has no way to. Two levels, and they are not alternatives — the first is worth doing
      whether or not the second ever is:

      **1a. A plain link, no JavaScript.** Wrap each image in `<a href={largest}>` so a click
      opens the large derivative in the tab. No script, no new request on the album page, and
      it works with scripts off — which matters because `scripts/a11y.mjs` audits this site
      with JavaScript disabled and would otherwise audit a dead control.

      **1b. A lightbox**, if the parish wants the image to magnify in place. This would be the
      site's first non-trivial interactive component. Budget headroom exists —
      `scripts/check-budget.mjs` gives `galerie/*` 32 requests and 24 KB of HTML — but it also
      needs an `a11y.mjs` condition for the open state, focus trapping and an Escape path, so
      it is its own task with its own guard, not a rider on 1a.

      **The ceiling on "full resolution" is 2400px**, not the camera's frame: the migration's
      `reencode` in `migration/media.mjs` downscales every photograph to a 2400px long edge,
      and that treatment is the sanitisation, so it is not negotiable. Say 2400px in the plan
      rather than "full", or the first person to compare with the original will file a bug.

---

## 2. The framed lead image on a prose page

**Decision taken 2026-09-22: drop the border.**

- [x] **Remove the frame from `.page-image`.** Measured on `/comunitate/scoala/` at 1280px:

      | | |
      |---|---|
      | wrapper `.page-image` | 578 × 482 |
      | image | 576 × 432 |
      | gap left / right | 1px — the border itself |
      | gap top / bottom | **25px** |

      Two rules in `src/pages/[...page].astro` collide. Line 119 puts a hairline frame on the
      wrapper; line 133 gives every image inside `.prose` a 1.5rem (25.5px) vertical margin,
      and the lead image is inside `.prose` too. So the frame hugs the photograph at the sides
      and stands 25px off it top and bottom — an asymmetric box, which reads as a defect
      rather than as a decision. Dropping the `border` from line 119 leaves the margin doing
      ordinary spacing and needs no other change.

      **Both pages that carry a lead image are affected** — `/comunitate/scoala/` and
      `/parohia/istoric/` — so check the second by eye as well.

      **The guard does not pin the border**: `src/lib/build-output.itest.ts` asserts the
      wrapper exists and holds exactly one `<img>` whose `src` resolves, which stays true.
      Nothing needs relaxing; confirm that before changing the CSS rather than after.

      **Corrected while executing (2026-09-22):** three pages carry a lead image, not
      two — `cursuri-de-pictura` (served at `/comunitate/pictura/`) also does, and was
      checked by screenshot with the other two. The frame is gone from all three.

---

## 3. `/resurse/doxologia/`: the covers are three different sizes

- [x] **Give the magazine covers one size.** The page body carries one `![]()` per issue and
      nothing constrains their width beyond `img { max-width: 100% }` in
      `src/styles/global.css`, so each renders at its natural width. Measured across the 31
      covers in `src/content/pages/revista-doxologia.md`:

      | population | count | size |
      |---|---|---|
      | old-site thumbnails | 26 | ~250 × 353 (0.70–0.72:1) |
      | recent screenshots | 4 | 1146–1258 px wide |
      | one smaller screenshot | 1 | 814 × 1130 |
      | **not a cover at all** | 1 | 1024 × 754, **landscape at 1.36:1** |

      So a recent issue fills the 578px column and an older one renders at 250px beside it.
      The aspect ratio is consistent within the 30 real covers, which is what makes a uniform
      treatment possible at all.

      **A CSS width alone is not the fix**, and this is the part to decide first: constrain
      them all and the 26 thumbnails upscale from 250px to 578px, which is blurry. The
      covers already exist at print resolution — **page 1 of each PDF in
      `public/documente/`**. `pdftoppm` comes from the same poppler package as the `pdfinfo`
      that `migration/pdf-gate.mjs` already depends on, so generating 30 covers from the
      documents the page already links is a one-time step with no new dependency, and it
      makes the cover and the file it advertises impossible to desync.

      **The landscape outlier** — `src/assets/content/2024/05/Captura-de-ecran-din-2024-05-14-la-15.25.58.png`
      — is a screenshot of something else and is the one to look at by eye before deciding what
      replaces it.

      **Corrected while executing (2026-09-22):** the page carries 31 entry covers but
      only 30 distinct files, because the duplicate "Nr. 8" entry pairs twice to
      `doxologia-8-2014.jpg`. Every cover is now page 1 of its issue's PDF (the link when the entry has one, the heading otherwise),
      rendered at 1200px and re-encoded through the migration's `reencode`; the three
      US-Letter spread issues (1-2011, 2-2011, 3-2012) are cropped to their right half,
      which is the cover.

---

## 4. The legacy album

- [x] **Rename it, and stop calling the images small a bug.**

      **The rename.** `src/content/galerii/imagini-de-la-slujbe.md` is titled "Imagini de la
      slujbe", and its own captions are the parish's founding: *20.12.2001 — Deschiderea
      oficiala a parohiei*, *20.12.2001 — Prima slujba la Zürich*, a baptism in June 2002. The
      instruction of 2026-09-22 was "remove the old album, rename to Fondarea parohiei", and
      the reading taken here is **rename this album's title to "Fondarea parohiei"** — the
      content is exactly that. *If what was meant was to delete the album outright, this item
      is wrong and must be re-decided before anyone executes it.*

      **Decide whether the slug moves with the title.** Changing only `title:` leaves the URL
      `/galerie/imagini-de-la-slujbe/` intact and costs nothing. Renaming the file changes the
      URL and needs a row in `docs/url-map.csv`, because the old path is already in the 152
      the redirects are generated from.

      **The images cannot be made bigger, and this is measured.** The nine committed files in
      `src/assets/content/galleries/legacy/` are **160 × 129 px, about 5 KB each**. The old
      server's own `galerie/` folder in `backup-2026-08-22` holds 18 files and **nothing wider
      than 300px** — there is no larger original anywhere the project can reach. So "resize"
      cannot mean "enlarge": upscaling 160px to column width is a blurred photograph presented
      as a restoration.

      What can be done instead:
      - **Lay them out at a size that suits 160px** — a dense grid of small plates rather than
        one column-wide image each, so they read as an archive from 2001 rather than as broken
        photographs. This is the actual fix.
      - **Nine more images were never migrated.** `17.jpg` to `25.jpg` in the same backup
        folder are 300 × 242 — nearly four times the area of the committed nine. Look at them:
        if they belong to this album, migrating them through `reencode` doubles its size and
        raises its ceiling to 300px.
      - **Ask the parish for the prints or negatives.** These are 2001 photographs; a scan
        would beat anything in the backup. Out of scope for a build, worth one sentence in the
        handover.

      **The parent directory is not part of this repository.** The backup was read to answer
      the question and nothing from it may be committed; any image that ends up in the site
      goes through `reencode` like every other photograph.

      **Corrected while executing (2026-09-22):** the premise above that the old path
      "is already in the 152" is wrong — no `/galerie/*` path exists in
      `docs/url-map.csv`. The old album was one WordPress page at `/evenimente/`, and
      `/galerie.html` → `/galerie/` is a hand-written rule in `scripts/redirects.mjs`'s
      `EXTRA_RULES`. The title-only rename needed no redirect work, and a slug rename
      would not have needed a CSV row either. Item 4 also gained the nine 300px images
      from the backup (17–25) and the dense grid, and the page's 2001 photographs are
      now as large as anything this repository can reach.

---

## 5. `Galerie` in the top bar

- [x] **Add `/galerie/` to the primary navigation, after `Noutăți`.** The eight links become
      Acasă, Program, Noutăți, Galerie, Școala parohială, Servicii liturgice, Contact,
      Donează. The footer's `Site` menu already carries `Galerie`
      (`src/components/SiteFooter.astro:48`), so nothing is orphaned by the move — today
      `/galerie/` is reachable only from the footer, and the top bar becomes its second
      inbound link.

      **Two hand-written records name the seven, and both move with the change.**
      `src/lib/build-output.itest.ts:1764` pins the header's hrefs **in order, written out
      by hand**, under the name "exactly the seven primary links" — the expected array and
      the test name change together, and the footer half of the same test stays as it is.
      `src/components/SiteHeader.astro:3-17` is the comment that narrates the seven and
      their history, and `:69-85` carries the 390px measurement — the per-link widths
      (37, 54, 48, 101, 103, 49, 54 = 445.2px) and the 4+3 wrap are facts about seven
      links, so they are re-measured for eight in headless Chrome with the audits' own
      chromedriver rather than left standing.

      **The row is already 445.2px against a 343px phone column**, so a second line is
      certain and what needs measuring is the new break (4+4? 5+3?) and the nav's height,
      not whether it wraps.

      **The budget is checked rather than assumed**: the link adds bytes to the header of
      every page, and `npm run budget` is what says whether any page crosses its limit.

      **Corrected while executing (2026-09-22):** nothing else moved — the footer's
      `Site` menu already carried `Galerie`, so the bar is its second inbound link.
      Measured after the change at 390px: the eight links total 490.3px and wrap 5+3.

---

## Open questions for the plan

- **Item 1:** does 1b (the lightbox) happen at all, or is 1a enough? It is the only item here
  that adds JavaScript to the site.
- **Item 3:** confirm that regenerating covers from the PDFs is wanted before building it —
  it replaces 26 committed images and changes what the page looks like for every old issue.
- **Item 4:** confirm the rename reading, and whether the slug moves.
