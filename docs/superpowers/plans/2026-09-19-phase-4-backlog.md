# Phase 4 backlog

> **This is a backlog, not a plan.** It is the input the Phase 4 implementation plan
> argues from: a list of work with its reasons and its measurements, not a task-by-task
> sequence. Do not execute it with `superpowers:subagent-driven-development` — write the
> plan first, from this and from the spec.

**Spec:** `docs/superpowers/specs/2026-09-15-parish-site-rewrite-design.md` (§19 names
Phase 4 as "Redirects, DNS and mail rehearsal, old-site snapshot, launch, editor
training").

**Operational cutover steps live in `docs/handover.md`**, steps A–L, and are not repeated
here. This file carries the *build* work Phase 4 owns, plus the gaps a design review on
2026-09-19 found against the spec.

---

## Decisions taken 2026-09-19

Recorded as rulings so the plan does not re-open them:

| Question | Decision |
|---|---|
| Which photograph for the homepage hero | **The chapel during a service** — `src/assets/content/2024/05/5d400e5d-4326-4ffb-ad1a-5635ca9a388d.jpg`, 1600×1200, from the `sfintele-pasti-2024` album. The parish's own photograph, already migrated and re-encoded through sharp, so no licence question. **Superseded 2026-09-21** — the parish chose the cross procession (`src/assets/content/2025/12/7-hero.jpg`, from the Sfântul Nicolae 2025 album); see the Phase 5 plan. The licence reasoning is unchanged: the parish's own photograph. |
| Its resolution | **Accept the softness.** 1600px native means a 1440px-wide hero is 1× only and will be slightly soft on a high-density display. The parish will not be asked for camera originals. |
| A CMS-editable hero (`settings.hero_image`) | **Deferred.** The first version adds no new schema field. Revisit only if the parish asks to change the picture themselves. |

---

## A. More images in the design — approved

The site carries no image on the homepage today and the hero is a flat `--oxblood` band.
Spec §4's rule — *"No drop shadows, no gradients except the hero scrim"* — presupposes a
photographic hero, so this closes a divergence from the approved mockups rather than
adding a new idea. A mockup of A1 was rendered and approved on 2026-09-19.

- [ ] **A1 · The homepage hero.** Put the approved photograph behind the existing hero
      text, under an oxblood scrim, with a 2px `--gold-lt` hairline beneath it echoing the
      feast-row rule.
      - `<picture>` with **two crops**, not one stretched: roughly 16:6 above the 34rem
        breakpoint, 3:2 below it. Measured on the mockup: a single wide crop puts the
        phone's focal point on the floor, while a 3:2 crop lands on the altar and icons.
      - It becomes the LCP element: `loading="eager"`, `fetchpriority="high"`, AVIF/WebP
        through Astro's pipeline, and a fixed `aspect-ratio` box so nothing shifts.
      - **The scrim has to hold contrast over every part of the crop**, not only its dark
        end. In the mockup the verse's second line falls on the lightest region, which is
        where AA would fail. Prefer a flatter wash to a steep gradient; `npm run a11y` over
        the built page is the check, not the eye.
      - **Budget:** `index.html` measures 11 of its 12 requests today, so this lands
        exactly on spec §13's cap. Record it as a decision in `scripts/check-budget.mjs`
        beside the existing note — **do not raise the limit.**

- [ ] **A2 · Render a prose page's `image` field.** `[...page].astro` reads the title and
      the body only; the CMS already offers **Imagine** on a **Pagină** and `pageSchema`
      already accepts it, so the control promises something the site does not do. Already
      recorded in `docs/handover.md` as a pre-existing Phase 2 gap. `ContentImage.astro`
      exists and is used by `src/pages/noutati/[slug].astro`,
      `src/pages/evenimente/[slug].astro` and `src/pages/galerie/index.astro` — this is the
      same component in one more route.

- [ ] **A3 · Choose one image per prose page, where the page has a real one.** An optional
      field used where there is a picture worth showing, not filled for the sake of it.
      The request budgets on these pages are 16–48, so there is room for one each.
      - `parohia/istoric` — already carries the St Nicholas icon
        (`icoana-Sfantul-Nicolae-scaled-e1717407098424.jpg`) in its body; decide whether it
        moves to the hero slot or stays inline.
      - `comunitate/pictura`, `comunitate/scoala`, `parohia/consiliul` — pick from each
        page's own migrated images. **Choose by eye; do not let a crop algorithm pick.**
      - The remaining pages stay text-only.

- [ ] **A4 · `/noutati` stays typographic — recorded as a decision, not an omission.**
      Thumbnails on the card list would cost one request per card against a cap of 12;
      thirteen published posts make that arithmetic impossible. The article pages already
      render their own `image` as a hero, which is where a picture earns its weight.

---

## B. Content defects on `/doneaza`

Found by looking at the rendered page on 2026-09-19. This is the page that handles money,
so these are worth more than their size suggests.

- [ ] **B1 · Two QR-bills on one page.** Above the generated Swiss QR-bill sits a migrated
      screenshot of the **old site's English-labelled bill**
      (`src/assets/content/2025/12/Screenshot-2025-12-11-at-11.23.04.png`), for the same
      account. A donor sees two payment codes and has to guess. Remove the screenshot from
      `src/content/pages/doneaza.md`.

- [ ] **B2 · The body promises an IBAN and gives none.** The prose reads
      `**Rumänisch - Orthodoxe Kirchgem, St. Nikolaus ZH Zürich IBAN:**` followed by
      nothing — the number lived inside the screenshot B1 removes. Either complete the
      sentence from `settings.accounts` or cut it, since the structured account blocks
      below already carry all three IBANs with copy buttons.

- [ ] **B3 · A stray title in the body.** `doneaza.md` line 7 is a bare `Donează`
      paragraph — the old page's title migrated as body text, rendering directly under the
      `<h1>` that already says it.

- [ ] **B4 · Both images carry empty `alt`.** Correct for the decorative church drawing;
      wrong for a screenshot carrying payment details (moot once B1 removes it). Check the
      drawing is genuinely decorative before leaving its `alt` empty.

- [ ] **B5 · Two stock images of unverified licence** are committed and about to be
      republished on a new domain:
      `src/assets/content/2024/05/istockphoto-1338836802-2048x2048-prelucrata-1.jpg` and
      `src/assets/content/2024/05/AdobeStock_298003333.jpeg`. Confirm the parish's licence
      covers this use, or replace them. Every image in section A is the parish's own
      precisely to avoid this question.

---

## C. Spec gaps found in the 2026-09-19 design review

- [ ] **C1 · `/sitemap-index.xml`** — listed in spec §5's route table, never built;
      `@astrojs/sitemap` is not a dependency and there is no `robots.txt` either. For a
      domain about to take over 144 redirected URLs, nothing tells a crawler the new
      structure. Already recorded under "Phase 4 decides" in `docs/handover.md`.

- [ ] **C2 · The editors' card does not exist.** `docs/handover.md` names it nine times —
      "put that on the editors' card" — and step **J1** says to print it. There is no such
      file in the repository. Spec §16 also asks for a short Romanian guide beside it;
      `docs/handover.md` is English and addressed to the maintainer, not the editor.

- [ ] **C3 · The Romanian build-failure e-mail (spec §16) was never built.** The spec: *"A
      GitHub Actions failure hook emails both the editor and the maintainer, in Romanian,
      naming the file and the problem."* Neither workflow has a failure hook; the fallback
      is GitHub's own English notification, and `docs/handover.md` step D asks the
      maintainer to write down what that e-mail contains. The Romanian explanation text
      already exists inside `scripts/check-budget.mjs` (`PAGE_EXPLANATION`) — nothing
      delivers it to anyone. This is the scenario §16 singles out: a volunteer presses
      Save, the build fails, and they see nothing happen.

- [x] **C4 · The per-day "add to calendar" link (spec §8).** `/program/` offers the
      whole-feed subscription only. The spec asks for both: *"Plus a per-day 'Adaugă în
      calendar' link for people who want one service rather than a subscription."*

      **Superseded 2026-09-19 — see the decisions table at the end of this file: the
      per-day link is rejected and spec §8 is amended.**

- [x] **C5 · Lighthouse is in the budget table and nothing runs it.** Spec §13 budgets
      performance ≥ 95 and accessibility 100, and LCP on 4G < 1.2s. The byte, request and
      JS budgets are enforced in CI; the Lighthouse rows exist only as manual step **H8**
      on the deployed site. Decide whether Phase 4 automates them or drops them from the
      table — the hero in A1 is the change most likely to move LCP, so measure before and
      after.

      **Superseded 2026-09-19 — see the decisions table at the end of this file: the
      Lighthouse rows are deferred to Phase 5 and spec §13 is amended.**

- [ ] **C6 · The footer links `/program/` twice** — "Program liturgic" under CONTACT and
      "Program" under SITE.

- [ ] **C7 · Two of spec §18's open questions are still open.** #3 *"May the Consiliul
      Parohial members' names be published, as they are today?"* — the page publishes names
      and portraits right now, so this needs an answer before launch rather than after.
      #5 *"Who besides the priest gets an editor account?"*

---

## D. Recorded elsewhere — do not duplicate here

`docs/handover.md` already carries these; the Phase 4 plan should reference them rather
than restate them:

- `_redirects` from `docs/url-map.csv` (144 rows), and the 32 held-back posts whose old
  URLs 404 until the parish dates them.
- `/?p=<id>` short links, which `_redirects` cannot match.
- 53 old-host prose links inventoried for Phase 4, including 8 `.doc` files the spec's
  "Not migrated" list means will never have a home.

  **Superseded 2026-09-19 — see the decisions table at the end of this file: the eight
  `.doc` files are converted once to PDF and hosted.**

- CMS uploads keeping their EXIF, including GPS, because `public/uploads/` is served as
  uploaded.
- The privacy statement being one sentence rather than a page.
- Everything unverifiable from this repository: the Turnstile/Resend round trip, the
  QR-bill test transfer, the Cloudflare rate-limit rule, PDF response headers.

---

## Decisions taken 2026-09-19, at plan time

| Question | Ruling |
|---|---|
| `?p=<id>` short links | Extend `migration/` to emit an ID→slug map and add functions/index.ts; see the plan's Task 3. |
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
