# Phase 5.1 implementation — the homepage banner, B-prime

**Backlog:** `docs/superpowers/plans/2026-09-21-phase-5-1-homepage-banner.md` (the item, its
measurements and its three open questions). This plan resolves those questions and executes
the item. It does not re-derive the numbers; it cites them.

**Spec:** `docs/superpowers/specs/2026-09-15-parish-site-rewrite-design.md` §4 (design
system), §13 (budget).

**Supersedes, in geometry only:** Task 6 of
`docs/superpowers/plans/2026-09-21-phase-5-content-and-nav.md` — the photograph stays, the
band and the cut change.

## Decisions

| Question | Decision | Why |
|---|---|---|
| Which ratio ships | **3:1** desktop, **2:1** phone | The backlog's own CSS and the mock the decision table was approved against measure ≈2.9:1. The 3.5:1 alternative buys 60px of fold and is a one-number change if the real laptop disagrees. The phone ratio is a post-execution correction — see below. |
| Does the 12% wash stay | **Yes, 12%** | B-prime as approved. The opaque `color-mix` fallback line goes: under the split it would paint the photograph solid oxblood in a browser without `color-mix`, where no tint is the harmless outcome (backlog, "What this settles" 3). |
| Where is the cut | **top 300** of the 1600×1200 space | The user asked for the mock's cut "a bit higher — a bit less Altar and a bit more space above heads". The mock's window (object-position 50% 40% over the 2:1 derivative) began at 387; 300 moves it 87 rows (7.2% of the frame) up: the balcony and its underside enter the frame above the mitre, and the bottom edge leaves the altar table at its front panel instead of below it. Candidates 260/300/340/387 were cut and compared by eye; 300 is the one that reads as "a bit". |
| The contrast exemption | **Stays, corrected.** Design-only, per the human's answer on 2026-09-21 | Once the words sit on solid oxblood, axe judges the hero normally and `heroTextIncompletes` never fires; the pixel measurement keeps running over the strip and keeps printing a number. Its comments claim "text over a photograph under a scrim", which stops being true — this plan corrects those comments rather than deleting ~380 lines. Removing the machinery is a separate decision with its own proof (a positive control on a build showing axe judges the hero), and it is not taken here. |
| The privacy question | **Not resolved here** | Backlog open question 3 and spec §18 Q3. The photograph is more legible at full colour than under the 82% wash; the parish still has no privacy page. Recorded, not answered. |

## Steps

1. **Re-cut the derivative.** Overwrite `src/assets/content/2025/12/7-hero.jpg` with a 3:1 cut
   from `src/assets/content/2025/12/7.jpg` (the album file, which is the 4032×3024 original
   through `reencode`): `sharp(src).resize({ width: 1600 }).extract({ left: 0, top: 300, width:
   1600, height: 533 }).jpeg({ quality: 90 })`. Same path, so the `index.astro` import and
   `images.ts`'s eager glob are untouched and no orphan is left behind. The album file is not
   cropped in place — it is the gallery's.
2. **Split the band** in `src/pages/index.astro`: `.hero-img` becomes a flow element with
   `aspect-ratio: 3 / 1`, `object-fit: cover`; `.hero::after` becomes a 3:1 wash over the
   photograph only, 12%, no opaque fallback; `.hero-in` keeps the flow and drops to
   `padding-block: clamp(1.25rem, 2.5vw, 1.75rem)`; the phone block becomes `aspect-ratio: 2 / 1`
   on both (the backlog said 4:3 — corrected after the build, see below). The gold hairline
   stays on `.hero` and now lands under the text strip. Rewrite the two comment blocks that
   argue the old shape (the two-crop rationale, the 82% scrim) with the numbers this change
   measures.
3. **Correct the exemption's comments** where they describe a condition that no longer exists:
   `scripts/a11y.mjs` (the HONEST SCOPE bullet, the block above `heroTextIncompletes`, the block
   above `measureHeroContrast`), `src/lib/hero-contrast.ts` (header), and the hero block in
   `src/lib/a11y-passes.test.ts`. Say what is now true: the hero text is on solid oxblood, axe
   judges it in scope, the exemption is retained and does not fire, and the pixel measurement now
   samples the strip. No behaviour changes.
4. **Update the guards that describe the old shape**: `src/lib/hero-image.itest.ts` (header
   comment: the new extract command and the built candidate bytes) and `scripts/check-budget.mjs`
   (the note beside `'index.html': 12`: the banner grew, the request count did not).
5. **Fill in the measured numbers, then verify.** The itest and the browser pass print the
   numbers; the comments cite the printed ones, not this plan's estimates.

## Verification

- `npx vitest run src/lib/hero-image.itest.ts src/lib/hero-contrast.test.ts src/lib/a11y-passes.test.ts src/lib/content-assets.test.ts` — the ceiling, the widths, the exemption cases, the asset sweep (edge ≤ 2400, no metadata).
- `TZ=Europe/Zurich npm test` and `TZ=Europe/Zurich npm run check`.
- `TZ=Europe/Zurich npm run test:build` — the built candidate bytes and the hero contrast print are the numbers the comments cite; `Audit passed.` and `Budget met.`
- Screenshots at 1280 and 390 through the a11y driver's `Emulation.setDeviceMetricsOverride` (Chrome clamps a plain window under ~500px), compared by eye against the approved mock. The 4:3 phone box was rendered beside 16:9, 3:2 and 2:1 and rejected — see the correction below.

## Post-execution corrections (2026-09-21)

- **The phone box ships 2:1, not the backlog's 4:3.** The backlog's 4:3 line was written
  against the 2:1 source, where it showed 67% of the frame's width at 390 CSS px — what the
  approved mock showed. Against the 3:1 cut the same box shows 44%: rendered in the real
  banner and compared beside 16:9, 3:2 and 2:1, it cuts the left-centre priest mid-torso at
  the frame edge and loses the right priest entirely. 2:1 reproduces the approved 67% exactly
  (cover scale 195/533; the overflow is horizontal, so `object-position`'s vertical component
  is inert). Measured at 390 CSS px: `innerWidth` 390, `.hero-img` 390×195, `.hero` 390×336.
- **The exemption is not dead code, and the backlog's item-1 premise is false as written.**
  axe still reports "Element's background color could not be determined due to a pseudo
  element" for both hero nodes on the split-band build: the wash's `::after` sits on `.hero`,
  and axe treats a pseudo element there as an obstruction whatever it covers. So
  `heroTextIncompletes` still fires and `measureHeroContrast` is still what judges the hero —
  the design-only decision was the correct one, and removing the machinery would first need
  the tint moved off `.hero` and a build proving axe judges the strip. Recorded in the four
  comment blocks this change touches (`a11y.mjs`, `hero-contrast.ts`, `a11y-passes.test.ts`,
  and the style block of `index.astro`).
- **The numbers the comments cite** (all printed by the 2026-09-21 runs): candidates 480w
  21,856 B, 800w 51,936 B, 1200w 98,838 B, `src` fallback 157,508 B, ceiling 180,000 B
  unchanged; contrast h1 10.54:1 and verse 8.12:1 over the default 756×376, phone 390×336 and
  wide 1100×513 px boxes; banner 574 px at 1280 (the mock's 574) and 336 px at 390.

## What this plan does not do

- It does not remove the contrast exemption machinery (decision above).
- It does not re-open the photograph choice, the request count (12 of 12), the
  `HERO_BYTES_CEILING` (180,000 B) or any `PAGE_BUDGET`/`REQUEST_BUDGET` entry.
- It does not answer the privacy question.
