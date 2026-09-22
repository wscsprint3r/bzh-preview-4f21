# Phase 5.1 backlog — the homepage banner

> **This is a backlog, not a plan.** One item, with the measurements behind it. It is the
> input a Phase 5.1 implementation plan argues from. Do not execute it with
> `superpowers:subagent-driven-development` — write the plan first, from this and from the
> spec.

**Spec:** `docs/superpowers/specs/2026-09-15-parish-site-rewrite-design.md` (§4 design
system, §13 budget).
**Supersedes, in geometry only:** Task 6 of `docs/superpowers/plans/2026-09-21-phase-5-content-and-nav.md`,
which chose the photograph and cut the 2:1 derivative. The photograph is not in question
here; the band it sits in is.
**Related:** A1 in `docs/superpowers/plans/2026-09-19-phase-4-backlog.md`, the row that
first asked for a photographic hero.

---

## Decision taken 2026-09-21

| Question | Decision |
|---|---|
| Does the banner change? | **Yes — the split band, "B-prime" below.** Mocked against the running site at 1280px and 390px on 2026-09-21 and approved. |
| Does the photograph change? | **No.** It stays the cross procession Phase 5 Task 6 chose. |
| Does any budget limit move? | **No.** One `<img>`, one request, 12 of 12 on the homepage; `HERO_BYTES_CEILING` in `src/lib/hero-image.itest.ts` stays at 180,000 B. The re-cut below comes in *under* today's bytes. |

---

## The measurement that motivates it

Taken from the running dev server, not from reading the CSS. The banner today:

| | 1280px | 390px |
|---|---|---|
| banner height | 235px (5.45:1) | 181px |
| of which `.hero-in` padding | 144px (72 / 72) | 80px |
| photograph visible | 235 of 640 rendered rows — 37% | 36% |
| scrim | 82% oxblood flat wash | same |
| worst contrast, h1 / verse | 6.47:1 / 5.00:1 | 6.46:1 / 5.00:1 |

**The height is only half of it.** At 82% the picture reads as a maroon texture rather than a
photograph — the gold vestments, the blue phelonia and the mitre all flatten to one tone. The
wash is that heavy because the h1 and the verse are printed *on* the photograph and have to
clear 4.5:1. Lowering it is not available: measured when Task 7 of Phase 4 landed, 78% gave the
verse 4.42:1 against its 4.5:1 minimum.

Two variants were mocked by injecting CSS into the live page. Contrast for each was measured
the way the repository measures it — hide the glyphs, screenshot, sample every pixel under each
text rect through `heroContrastProblems` in `src/lib/hero-contrast.ts`:

| variant | banner @1280 | photograph band | h1 / verse | banner bottom, 820px fold |
|---|---|---|---|---|
| today | 235px | 235px under an 82% wash | 6.47 / 5.00 | 299 |
| A-prime — keep the overlay, add `aspect-ratio: 5 / 2` | 512px | 510px under an 82% wash | 6.49 / 5.53 | 576 |
| **B-prime — split band** | 574px | **427px under a 12% wash** | **10.54 / 8.12** | 638 |

A-prime doubles the picture for one line of CSS and is the fallback if the height below is
judged too much. It cannot improve the colour: the scrim has to stay at 82%.

---

## The item

- [x] **Split the banner: the photograph in a band of its own, the words on the oxblood strip
      beneath it.** Nothing is printed over the picture, so the wash stops being load-bearing
      and drops from 82% to 12%.

      **EXECUTED 2026-09-21** by `docs/superpowers/plans/2026-09-21-phase-5-1-homepage-banner-plan.md`,
      which carries the measurements. Two corrections to what is written above:
      the phone box ships 2:1 rather than the 4:3 in the CSS below (against the 3:1 cut, 4:3
      shows 44% of the frame's width where the approved mock showed 67%), and axe still returns
      the hero's two incompletes after the split — the wash's pseudo element on `.hero` is what
      it cannot resolve — so the exemption in "What this settles" item 1 is **not** dead code
      and cannot be removed without moving the tint off `.hero` first, with a build proving axe
      judges the strip.

      **The CSS**, in `src/pages/index.astro`. The image leaves the absolute-positioned layer
      and becomes a flow element with its own ratio; the pseudo-element stops covering the
      whole hero and covers only the photograph:

      ```css
      .hero-img {                    /* was position: absolute; inset: 0; height: 100% */
        display: block; width: 100%; height: auto;
        aspect-ratio: 3 / 1; object-fit: cover; object-position: 50% 40%;
      }
      .hero::after {                 /* a wash over the photograph only, never under text */
        content: ''; position: absolute; inset-inline: 0; top: 0;
        aspect-ratio: 3 / 1; pointer-events: none;
        background: color-mix(in srgb, var(--oxblood) 12%, transparent);
      }
      .hero-in { position: relative; z-index: 1; padding-block: clamp(1.25rem, 2.5vw, 1.75rem); }

      @media (max-width: 34rem) {
        .hero-img { aspect-ratio: 4 / 3; object-position: 50% 45%; }
        .hero::after { aspect-ratio: 4 / 3; }
      }
      ```

      The gold hairline stays on `.hero`, so it lands under the text strip rather than under
      the photograph.

      **The ratio is the one knob.** 3:1 puts the banner bottom at 638 of an 820px fold, which
      leaves about 180px of the schedule visible. 3.5:1 buys back 60px. Decide it against a
      real laptop, not against the number.

      **Re-cut the derivative.** `src/assets/content/2025/12/7-hero.jpg` is a 1600×800 (2:1)
      cut, and the CSS above would crop *that* again to 3:1 — a crop of a crop, with the mitre
      landing on the top edge at `object-position: 50% 40%`. Cut a 3:1 derivative from the
      4032×3024 original in `/Users/stefan/Work/stuff/site-bzh/new_resources`, through
      `reencode` in `migration/media.mjs` like every other photograph. Measured at webp q80,
      the 3:1 cut is **lighter than what ships today**:

      | candidate | 2:1, today | 3:1, proposed |
      |---|---|---|
      | 480w | 29,578 B | 20,122 B |
      | 800w | 69,392 B | 47,830 B |
      | 1200w | 138,782 B | 95,808 B |

      Deleting the superseded derivative matters: `src/lib/images.ts` globs
      `src/assets/**` with `eager: true`, so any file left behind is still emitted into
      `dist/_astro/` and published. Phase 5 Task 6 already had to delete one for this reason.

      **Update the guards that describe the old shape**, all of which stay green in principle
      but stop being true in their comments:
      - `src/lib/hero-image.itest.ts` — the measured candidate bytes in its header comment, and
        the derivative it names. The ceiling and the three widths do not move.
      - `src/pages/index.astro` — the comment block arguing the 82% scrim from the Task 7
        measurement. Replace it with the number this change measures, not with a claim.
      - `scripts/check-budget.mjs` — the note beside `'index.html': 12`. The request count is
        unchanged; say why the banner grew without costing one.

      **Re-run** `TZ=Europe/Zurich npm run test:all` and `TZ=Europe/Zurich npm run check`.
      The hero contrast print in the browser passes is the number that replaces the 4.97:1 in
      the current comments.

---

## What this settles beyond the picture

Three things fall out of the words no longer sitting on a photograph. None is a reason on its
own; together they are why B-prime is preferred over A-prime.

1. **The contrast exemption can go.** axe returns `color-contrast` incomplete for text over an
   image, which this project fails on, so Phase 4 added an exemption plus a pixel measurement
   to replace axe's judgement. With the text on solid `--oxblood`, axe judges it normally:
   `heroTextIncompletes` and `measureHeroContrast` in `scripts/a11y.mjs`,
   `src/lib/hero-contrast.ts`, `src/lib/hero-contrast.test.ts` and the hero cases in
   `src/lib/a11y-passes.test.ts` are then about 380 lines guarding a condition that no longer
   exists. **Removing a guard is a decision, not a tidy-up** — the plan must say so explicitly
   and prove the hero is in axe's scope afterwards, on a build, before deleting anything.
2. **It closes the fail-open found in the MR !4 review.** `heroTextIncompletes` matches any
   selector chain *containing* the substring `.hero` — probed: `.heroic-banner`,
   `footer .hero-ish` and `main > .hero2 p` are all exempted — while the measurement that
   replaces axe only walks `.hero` on `index.html`. If item 1 is not taken, that matcher needs
   the token fix and a cross-check that every exempted node carried `data-hero-contrast-text`.
3. **`color-mix` leaves the readability path.** It is the repository's only use, with no
   `@supports` and no browserslist; a browser that drops the declaration today paints no scrim
   and puts parchment text straight on the photograph. Under B-prime the same browser loses a
   12% tint and nothing else.

---

## Open questions for the plan

- **Which ratio ships** — 3:1 or 3.5:1. Needs a look on a real 900px-tall laptop, not a mock.
- **Whether the 12% wash earns its place at all.** A no-wash variant was rendered beside it;
  the tint is the only thing tying the photograph to the palette, and §4's rule is that the
  hero scrim is the one sanctioned exception to "no gradients". A flat 12% tint is not a
  gradient, but it is also not obviously necessary.
- **The privacy question, now sharper.** The photograph shows roughly two hundred identifiable
  people including children, and at full colour they are far more legible than under the 82%
  wash. The site still has no privacy page, and §18's question 3 — whether names and faces may
  be published — is still open. This item makes the answer matter more than it did.

---

## Mocks

Rendered 2026-09-21 against the dev server, session scratchpad
`…/177bbade-f752-48ef-a4cb-b22e68e0ac4d/scratchpad/review/shots/`. They are outside the
repository and will not survive the session; re-render from the banner_mock2 script beside them if
they are needed again.

| file | what it shows |
|---|---|
| `banner_wide_now.png`, `banner_phone_now.png` | the page as it is |
| `b2_wide_Aprime.png`, `b2_phone_Aprime.png` | A-prime, the overlay with a ratio |
| `b2_wide_Bprime.png`, `b2_phone_Bprime.png` | B-prime, the recommendation |
| `b2_wide_Bplain.png`, `b2_phone_Bplain.png` | B-prime with no wash at all |
