# bor-zh.ch Phase 1 — Liturgical Schedule and CMS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a static Astro site with a program-first homepage, a `/program` page, a `.ics` feed, and a Sveltia CMS admin, so the parish can edit the weekly liturgical schedule without touching a page builder.

**Architecture:** All schedule data lives as one YAML file per service day in an Astro content collection, validated by a Zod schema so a malformed entry fails the build instead of shipping. All date arithmetic is calendar-date arithmetic in UTC on plain `YYYY-MM-DD` strings; the only timezone-aware operation in the codebase is "what is today's date in Zürich". The site renders the next three weeks server-side so it is correct without JavaScript, and ~1 KB of inline JS reveals the week containing today.

**Tech Stack:** Astro 7 (static), TypeScript strict, Vitest, Sveltia CMS 0.213.x self-hosted, sveltia-cms-auth on Cloudflare Workers, Cloudflare Pages, @fontsource (Cormorant Garamond + Spectral).

**Spec:** `docs/superpowers/specs/2026-09-15-parish-site-rewrite-design.md`

> **Amended after Phase 1, on the rule this document itself states.** The Global Constraints below
> say the four Turkish cedilla forms must be named by codepoint and never written as glyphs, because
> a file that spells them out cannot be swept for them. This document broke that rule in the very
> paragraph stating it, and in three test sketches copied from it — seventeen occurrences, which for
> the whole of Phase 1 made the repo-wide sweep the rule exists to enable impossible to run. They
> have been rewritten by codepoint. Nothing else about the plan has been changed, and
> `src/lib/diacritics-sources.test.ts` now fails on any tracked file that writes one again.

**Scope:** This plan implements **Phase 1 only** (spec §19). Phases 2 (content migration), 3 (events, galleries, donations, contact form) and 4 (redirects, DNS cutover) get their own plans. Phase 1 is independently shippable: at the end of it the parish can edit the schedule, which is the single biggest win.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Node 22.12.0 or newer** (Astro v6 dropped 18 and 20). **Astro 7.x**, `output: 'static'`.
- **Zod 4** — Astro v6 requires it. The schema in Task 4 is written in Zod 4 syntax; if a v3-only idiom creeps in (`z.string().email()` and friends), it is a defect.
- **Client JavaScript budget: ≤ 3,800 bytes total** — deliberately just under Astro's ~4,096-byte inline threshold, so the script is always inlined and the request count stays predictable. In Phase 1 the only JS is the week picker. No framework, no hydration, no Astro islands.
- **Palette — exact values, copied from spec §4:**
  `--parchment:#FAF6EE` `--raised:#FFFDF8` `--rule:#E3D9C6` `--oxblood:#6B1F26` `--oxblood-dk:#54171D` `--gold-text:#8A6A28` `--gold:#B08B3E` `--gold-lt:#C8A45C` `--ink:#2A211C` `--muted:#6E5C4E` `--faint:#7E6C52`
- **`#B08B3E` and `#C8A45C` are ornament only and MUST NEVER be used for text** at any size (2.95:1 and lower — fails WCAG AA entirely). Task 7 enforces this in CI.
- **Fonts self-hosted**, `latin` + `latin-ext` subsets. `latin-ext` covers U+0100–U+024F, which includes U+0218–U+021B (Ș ș Ț ț with comma below). No Google Fonts CDN.
- **Which words actually carry comma-below**, since it is easy to assert this of the wrong ones: `Marți`, `Ț`/`ț` and `Ș`/`ș` anywhere — and in this project's vocabulary that means `Marți`, `Sfântul Maslu` has none, `Spovedanie` has none. `Sâmbătă` carries **â** and **ă** only, not a comma-below character. `Duminică`, `Înălțarea` and `Sfânta` likewise carry only â/ă/Î. Check codepoints, not appearance: ș U+0219 and the Turkish form U+015F are near-identical in most fonts — which is why the wrong one is named by number here and never written out.
- **Dates are plain `YYYY-MM-DD` strings. Times are plain `HH:MM` local strings.** Never store or compute a UTC instant for a service — a Liturgy at 10:00 is at 10:00 on both sides of a DST change. The single exception is `todayInZurich()`, which converts the real clock into a Zürich calendar date.
- **All user-facing copy is Romanian**, with correct comma-below diacritics — ș U+0219 and ț U+021B, never the Turkish cedilla forms U+015F and U+0163.
- **Performance budget** (spec §13), enforced in CI by Task 13: homepage HTML ≤ 30 KB, CSS ≤ 15 KB, JS ≤ 3,800 B (just under Astro's inline threshold), ≤ 12 requests. Lighthouse accessibility 100. Because `inlineStylesheets: 'always'` puts the CSS inside the document, Task 13 enforces the first two as one combined **45 KB** limit on `dist/index.html`; the reasoning is in that task.
- **Cloudflare Pages free tier:** 20,000 files/deploy, 25 MiB/file, 500 builds/month, 2,000 static redirects.
- **`data` and `date` are one letter apart — beware.** In Astro, `entry.data` is the parsed
  frontmatter object; in this project `date` is the service day's own date string. Every
  page and endpoint that reads the collection must therefore write
  `entries.map((e) => ({ ...e.data, date: e.id }))` — spreading Astro's parsed object, then
  overwriting `date` with the entry id, which is the date from the filename.
- **Identifiers, filenames and test names are English.** Romanian is for what a person reads:
  page copy, CMS labels and hints, and the schema's validation messages. Everything a
  developer reads — variables, functions, types, constants, object and YAML field keys, file
  and directory names, `it()`/`describe()` names, and build-time diagnostics — is English.
  Code comments were always English; this extends the same split to names.
- **Never read a pass/fail verdict from `.vitest/json/output.json`. Use the process exit code.**
  The `rtk` wrapper intercepts `vitest` and writes that file **whether or not anyone asked for a
  JSON reporter** — verified by running with no reporter flag and watching it be rewritten. And
  because every `Bash` call here is a pipe, stdout is *never* unredirected, so the wrapper's
  parse-failure path (`vitest parser: All parsing tiers failed`) is the normal case rather than
  the exception. When it fails to parse, the previous file remains — and a stale green report
  has already inverted every mutation verdict once on this project, for an agent who had opted
  into a reporter. It can now do the same to one who never did.
  The exit code is the only verdict no wrapper staleness can touch. For human-readable output,
  use `rtk proxy npx vitest run …`, which bypasses the filter. If something must persist
  results, delete `.vitest/json/output.json` before each run.
- **axe must audit with JavaScript disabled as well as enabled.** `a11y.mjs` drives Chrome with
  JS on, so from Task 10 onward it audits only the one week the picker leaves visible and
  silently stops seeing the rest — the guarantee narrowing inside the task whose job is
  hiding things. The site already supplies the fix: with JS off every week renders, which is
  Task 10's no-JS baseline. Run both passes; the disabled one covers what the enabled one
  cannot see — and they are not redundant in the other direction either, since the JS-on pass
  is the only one that ever sees the week picker itself. Neither pass alone is the guarantee.
- **Opacity on text is not dimming, it is contrast reduction.** The plan's `.dr-cancelled`
  `opacity: 0.75` produced six `color-contrast` violations on a genuinely cancelled day —
  times falling 4.67:1 to 2.96:1 — and `--gold-text` is unusable below opacity 0.981. Every
  static guard passed it; axe caught it. Say "not happening" with a strike or a label, never
  by fading the text.
- **A scoped component rule defeats a global one only where both set the same property.**
  Astro's scoping attribute puts a component rule at (0,3,1), outranking a global `a:hover`
  at (0,1,1) — so a scoped `.x a { color }` silently loses its hover colour, with no test, no
  axe violation and no build failure to say so. **Focus rings are not affected** where the
  component never declares `outline`: measured, `:focus-visible` still matches and the global
  ring still lands. So the rule is narrower than "own every state" — a component that sets a
  property on a link owns that property's interactive states, and only those.
  **But that survival is luck, not design:** `outline` is declared nowhere except
  `global.css`, and the global rule is only `(0,1,0)`. The first component to declare its own
  `outline` defeats the ring silently. Task 10's `.picker button` is the first non-link the focus
  rule has to defend, and a swept audit found only four scoped link-colour rules in the whole
  project — so the margin here is thin rather than comfortable.
- **`hidden` does not hide when the author sets `display`.** An author `display: flex` beats the
  UA stylesheet's `[hidden]` by origin, so a `hidden` element stays visible. Task 10's week
  picker shipped its navigation bar — two dead arrows — to every no-JS visitor while looking
  correct to anyone testing with JavaScript on, which is the state nobody checks. Any
  component that both sets `display` and relies on `hidden` needs its own `[hidden]` rule.
- **A comment quoting a number the code prints will go stale — so have it say which to trust.**
  `check-budget.mjs` ended up quoting `0 / 3072` against a run printing `0 / 3800`, in the file
  whose whole job is making numbers traceable. The fix that generalises is not vigilance: the
  comment now names the printed figure as authoritative *if the sentence ever disagrees with
  it*. Write the precedence into the comment.
- **A timing figure from one machine is not a property.** `27 ms before first paint` was
  measured repeatedly and agreed with itself every time — on one machine. A reviewer on
  another got 21.7. Runs that agree with each other are not evidence of a property; state a
  range, and say which part is the invariant (here, the ordering) and which is merely the
  margin observed.
- **Check each claim in a comment separately; a true half makes a false half look verified.**
  Three comments here fused two claims into one sentence — "spreading in the other order, *or
  dropping the override*, leaves `day.date` undefined". Reversing the spread does nothing at
  all (byte-identical output); dropping the override kills the build. Fused, the sentence read
  as checked because half of it was, and was unfalsifiable as written.
- **Deleting an overclaim is not the fix if it takes a true warning with it.** The first
  correction removed both halves, leaving the endpoint with no record that dropping the
  override breaks the build — the failure a reader most needs warned about. **Under-claiming
  leaves the same wrong model as over-claiming and is harder to spot, because nothing in it is
  false.**
- **Quote failures from a run, not from memory.** The three files fail differently — `Dată
  invalidă: undefined` from `partiData` on the pages, `TypeError: Cannot read properties of
  undefined (reading 'replace')` inside `laDataIcs` for the feed — and two of the three
  original comments named the wrong one.
- **An accessible name is not what a sighted person sees.** Sveltia renders no tooltips, and
  several of its controls are icon-only: the navigation button's visible text is the ligature
  `article`, and "Contents" exists only as its aria-label. Three rows of the printed card named
  labels no volunteer will ever read. Documentation for a sighted reader must describe
  **positions and icons**; aria-labels are what a screen-reader user has, and the two audiences
  need different words.
- **Configuration can put phantom controls into every document you own, and there is usually
  more than one cause.** Three documents each confidently described a control this build never
  renders — `Save and Publish` on the printed card, `Publish` in `config.yml`, `Discard` in the
  spec — and no test caught any of them, because none of them is code.
  **Two different dead branches, not one.** `Save and Publish` and `Publish` live in a branch
  gated by the *backend block* (`skip_ci` / `automatic_deployments`, neither of which we
  declare). Only `Discard` sits on the editorial-workflow path that `publish_mode: simple`
  blocks. An earlier draft of this very bullet blamed `publish_mode` for all three — a wrong
  cause inside the paragraph about causes, which would have sent a future reader to watch the
  wrong line. A control found in a locale table or in one branch of a bundle is not a control
  this configuration shows: open it and look.
- **`test-repo` cannot test backend-specific behaviour.** It is the right tool for reading
  labels, menus and flows off a running CMS with no credentials — but `TestBackend` declares
  no `skip_ci` or `automatic_deployments`, and the validator reads those only for git backends,
  so a scratch config setting them proves nothing either way. Know which claims it can settle.
- **Static reading is the wrong tool for a claim about what a person sees.** Task 12's card named
  a button that does not exist, because the bundle was read rather than run: the first pass
  found a `Save and Publish` branch and missed the branch selector two hundred characters
  later that makes it unreachable in this configuration. Reading the right branch would have
  been luck. **Sveltia's `test-repo` backend needs no credentials**, so a scratch copy of the
  built admin page pointed at it opens the real editor — and against a running CMS, five of
  the card's rows were wrong, not one. Any claim about a label, a menu or a flow must be read
  off a running interface.
- **A guard that derives its subject from the artifact it is checking can only check the subset
  it recognised.** This is the general shape behind most of the defects found on this project.
  Any corruption that breaks *recognition* removes the subject rather than failing the check,
  and the guard then reports success for having found nothing wrong with nothing. Three
  generations of one bug showed it: the href's text exists (subject = a string, referent
  unchecked) → the href is followed to bytes, but the artifact still nominates which hrefs
  count → **the expected set comes from a source the defect cannot edit**, and the guard
  asserts *that* set resolves. Take the expected set from the content collection, a fixed list
  of pages, or a declared count — never from a pattern match over the thing under test.
- **Assert that a link resolves, not that its href appears.** `expect(html).toContain('/program.ics')`
  was green for the entire period that link was dead on every page: the attribute existed and
  the file did not. Follow the href to its target and read bytes from it. The same shape —
  asserting a reference rather than its referent — is worth hunting wherever Tasks 12 and 13
  check that something is wired up.
- **A check that prints the problem and exits 0 is a check that ships it.** Task 10's budget
  detected the script flipping from inlined to emitted, reported the flip as prose, and
  returned success. Detecting a condition and failing on it are different features; write the
  second. Where a tolerance is wanted, make it an explicit opt-in, never a silent pass.
- **Print what was measured, not only the verdict.** A responsive check was caught measuring
  nothing only because it printed the viewport it actually got — Chrome had clamped a 375px
  window to 500px. A verdict alone would have hidden that.
- **The schema validates shape, not theology — and nothing here can.** Three fabricated seed
  files passed every guard in this project: valid dates, valid times, service names from the
  closed list, correct diacritics, a green build. What gave them away was that each was a
  Sunday carrying only Spovedanie and Vecernie, **with no Sfânta Liturghie** — impossible for
  an Orthodox parish, and invisible to every test we have. This is a gap to know about rather
  than close: the only guard against liturgically wrong content is a reader who knows what a
  Sunday looks like, which is an argument for the parish reviewing what the CMS publishes,
  not for more validation.
- **Coverage that depends on what the parish published is not coverage.** Three fabricated
  Sundays briefly made the week picker visible to axe by accident. Content changes; a guarantee
  resting on today's content is not a guarantee. Use a fixture build.
- **A verification command that matches no files is a check that always passes.** The plan's
  JS budget step globbed `dist/_astro/*.js`, which matches nothing once Astro inlines the
  script — so the budget was never measured. Assert the number, not the absence of an error.
- **Normalise for presentation at presentation time; never mutate stored data to fix how it
  reads.** Canonicalising `time` to `HH:MM` is the legitimate case — one value, one spelling,
  no information lost. Stripping a trailing full stop from a free-text `location` is the other
  kind: it turns `Capela Sf.` into `Capela Sf`, and it changes what ships in the `.ics`
  `LOCATION`, which a calendar client stores as data rather than prose. Trim whitespace in the
  schema, because whitespace carries no meaning; compose punctuation where the sentence is
  built.
- **A guard that names forbidden characters as glyphs cannot be scanned for them.** It lights
  up every future sweep for the thing it forbids and trains people to wave that sweep through
  — worse than no rule. Name them by codepoint.
- **`location` must render wherever the schedule renders.** It is in the schema, exposed by the
  CMS, and written into the `.ics` `LOCATION`. A day held in a different chapel would
  otherwise produce a calendar that says so and a website that does not — sending a
  parishioner to the wrong building, which is worse than the field not existing.
- **Do not re-implement the cascade. Assert contrast with a real engine.** Task 7 spent three
  fix rounds on a guard parsing CSS for unsafe text colours. Nine escapes were found across
  three reviews, the last four proven with `getComputedStyle` in headless Chrome:
  `html:root` winning on specificity, an unlayered rule beating `@layer`, a `@media` nested
  inside `:root`, and a `<link>` after the inline `<style>`. "Document order, later wins" is
  not the cascade. Worse, the guard covered 2 of the 12 colour rules shipping — the other 10
  take their ground from an ancestor — while reading as the project's central safety
  guarantee. A guard at 17% coverage presenting as 100% is worse than none.
  The guarantee belongs to axe over the built pages. What static tests legitimately own:
  the palette's own contrast maths, and the source-hygiene rule that colours come from tokens.
- **State what a guard proves, where it is defined.** Every failure in this task was a guard
  whose stated scope exceeded its real one.
- **Derive the forbidden set; never enumerate it.** A denylist can only list what someone
  remembered. Task 7 shipped a derived *allowlist* of safe text colours beside a hardcoded
  two-item denylist of forbidden golds — so footer text at `var(--rule)` (1.30:1) and a raw
  `rgb(176,139,62)` both passed a green suite. Where a set can be derived from measurement,
  derive it: a colour is legal for text if and only if it is in a text role set for that
  surface. This codebase has been bitten three times by exactly this gap.
- **Assert resolution, not presence.** `toContain` on a stylesheet line proves the line exists,
  not that it means anything. Appending `--gold-text: var(--gold);` inside `:root` kept every
  asserted line present, added no hex, was not a `color:` declaration — and shipped every link
  at 2.95:1 with 60/60 green, because the minifier collapsed the duplicate and kept the alias.
  Parse, resolve, and assert the resolved map `toEqual` the source of truth.
- **"No boxes rendered" is never evidence about diacritics.** U+015F and U+0163 are present in
  the shipped fonts, so a Turkish cedilla draws perfectly. Only a codepoint scan can tell you
  which character you have.
- **A guard that reads a file must prove it read something.** Task 7's first CSS guard passed
  while entirely inert: `import.meta.glob(…, { query: '?raw' })` returns an *empty string* for
  `.css` in this pipeline, so the guard scanned nothing and found nothing wrong. Only a
  mutation caught it. Read with `node:fs` and assert the content is non-empty before
  asserting anything about it. Task 11 reads `dist/` the same way.
- **The gold roles invert between the parchment and oxblood surfaces.** `--gold-text`
  (#8A6A28) is 4.7:1 on parchment but **2.26:1 on oxblood**; `--gold-lt` (#C8A45C) is
  ornament-only on parchment at 2.95:1 but **4.82:1 on oxblood**. Each is safe exactly where
  the other is not, so copying the global `a` rule into Task 9's dark hero ships a worse
  failure than the mockup bug this project started with. `tokens.test.ts` enforces a role set
  per surface; never pick a text colour for a dark surface from the parchment set.
- **Assert the property, not an example — three green suites have hidden live bugs here.**
  Task 2's diacritics guard passed with `august` corrupted to `aușust`. Task 6's feed passed
  22/22 while emitting a zero-length calendar event. Task 6's day sort passed 25/25 while
  being a literal no-op (a mistyped comparator coerced objects to `"[object Object]"`, so
  every comparison returned 0). In each case the test block was complete in every respect
  except asserting the thing that was broken. For any code whose job is ordering, uniqueness,
  normalisation or a format invariant, assert the invariant across the whole input — not one
  more example of it.
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
- **Never trust a backslash sequence you typed into a file.** This harness has been observed
  converting escapes to the literal character before the bytes reach disk, through both a
  Bash heredoc and the Write tool — which silently rewrote a cedilla-rejecting guard into the
  very characters it rejects. Always read the file back and dump codepoints.
  It is not limited to `\uXXXX`. A **doubled backslash has been silently halved on write**,
  turning `/\\;/g` into `/\;/g` — which produces a *false test failure against correct code*,
  sending someone to debug working code. That is a more expensive failure than a false pass,
  and it has bitten the same agent twice in one task. Treat every backslash sequence as
  suspect until you have read the bytes back.
- **Predicted test counts in this plan are sketches, not contracts.** Each task's test block
  shows the cases that motivated the design; implementations have consistently needed more.
  Write the tests the code needs and report the real number. Where a stated count and a
  sound implementation disagree, the plan is what is wrong.
- **Commits:** conventional-commit prefixes (`feat:`, `test:`, `chore:`, `docs:`). If an AI agent makes the commit, append `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

### Deviations from the spec — read before starting

Two deliberate refinements. Both make the result better; neither changes the design.

1. **Spec §7 specifies a `/program/data.json` endpoint that client JS reads to pick the current week. This plan drops `data.json` and server-renders the next three weeks instead.** The spec's own requirement is that the site be correct without JavaScript; rendering the weeks as HTML satisfies that directly, makes the JS smaller (it only toggles `hidden`), and removes a fetch. Combined with the nightly rebuild, correctness holds for three weeks even if every build fails. `/program` server-renders the full upcoming window.

   > **Amended after Phase 1: this deviation stopped being true and nobody revisited it.** Task 10 needed the next-service card recomputed in the browser, so it reinstated the very payload this paragraph had dropped — inline in the homepage rather than as a separate file. The justification above ("it only toggles `hidden`") no longer held, and the spec's sizing came with the data unexamined: §7 sized it at "60 days past to 365 days future, roughly 2–3 KB gzipped", which is arithmetic about a SEPARATE, CACHEABLE, GZIPPED file. Inline and uncompressed it is about 133 bytes per future service day, so the homepage grew without bound with how far ahead the parish publishes and crossed §13's 45 KB budget at 48 weeks published — on content that is entirely valid. The island is now bounded by a COUNT of days (`ISLAND_DAYS` in `src/lib/schedule.ts`), because a date window bounds calendar reach and not bytes. The lesson is the deviation rather than the number: a justification that names a property of the code ("the JS only does X") expires when the code changes, and nothing here pointed back at it.
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
│   ├── content/services/               one .yml per service day — what the CMS writes
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
│   │   ├── WeekBand.astro     5-column week band (homepage)
│   │   ├── DayRow.astro              one day row (/program)
│   │   └── WeekPicker.astro   the inline <script> + prev/next controls
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
import { parishName } from './smoke';

describe('toolchain', () => {
  it('runs TypeScript from src/lib', () => {
    expect(parishName()).toBe('Parohia Ortodoxă Română Sfântul Nicolae');
  });
});
```

- [ ] **Step 8: Run it to verify it fails**

Run: `cd /Users/stefan/Work/stuff/site-bzh/web && npm test`
Expected: FAIL — `Failed to resolve import "./smoke"`.

- [ ] **Step 9: Make it pass**

Create `web/src/lib/smoke.ts`:

```typescript
export function parishName(): string {
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
  MONTH_NAMES,
  DAY_NAMES,
  formatWeekRange,
  monthName,
  dayName,
  dayOfMonth,
} from './date-ro';

describe('vocabular', () => {
  it('are șapte zile începând cu luni', () => {
    expect(DAY_NAMES).toEqual([
      'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă', 'Duminică',
    ]);
  });

  it('are douăsprezece luni', () => {
    expect(MONTH_NAMES).toHaveLength(12);
    expect(MONTH_NAMES[8]).toBe('septembrie');
  });

  it('folosește virgulă dedesubt, nu sedilă', () => {
    const allText = [...DAY_NAMES, ...MONTH_NAMES].join('');
    expect(cedillasIn(allText)).toEqual([]);
    expect(hasCommaBelow(allText)).toBe(true);
  });
});

describe('numeZi', () => {
  it('recunoaște o luni', () => {
    expect(dayName('2026-09-14')).toBe('Luni');
  });

  it('recunoaște o duminică', () => {
    expect(dayName('2026-09-20')).toBe('Duminică');
  });

  it('funcționează peste granița de an', () => {
    expect(dayName('2026-01-01')).toBe('Joi');
  });
});

describe('numeLuna și ziuaDinLuna', () => {
  it('întoarce luna cu literă mică', () => {
    expect(monthName('2026-09-20')).toBe('septembrie');
  });

  it('întoarce ziua ca număr', () => {
    expect(dayOfMonth('2026-09-07')).toBe(7);
  });
});

describe('formatIntervalSaptamana', () => {
  it('comprimă o săptămână din aceeași lună', () => {
    expect(formatWeekRange('2026-09-14', '2026-09-20'))
      .toBe('14 – 20 septembrie 2026');
  });

  it('scrie ambele luni când săptămâna le traversează', () => {
    expect(formatWeekRange('2026-09-28', '2026-10-04'))
      .toBe('28 septembrie – 4 octombrie 2026');
  });

  it('scrie ambii ani când săptămâna traversează anul', () => {
    expect(formatWeekRange('2025-12-29', '2026-01-04'))
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
export const DAY_NAMES = [
  'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă', 'Duminică',
] as const;

export const MONTH_NAMES = [
  'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
  'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
] as const;

/** Splits a plain YYYY-MM-DD string. No Date object, no timezone. */
function parts(date: string): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`Dată invalidă: ${date}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/** 0 = Monday … 6 = Sunday. */
export function dayIndex(date: string): number {
  const { year, month, day } = parts(date);
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = Sunday
  return (jsDay + 6) % 7;
}

export function dayName(date: string): string {
  return DAY_NAMES[dayIndex(date)];
}

export function monthName(date: string): string {
  return MONTH_NAMES[parts(date).month - 1];
}

export function dayOfMonth(date: string): number {
  return parts(date).day;
}

export function formatWeekRange(monday: string, sunday: string): string {
  const a = parts(monday);
  const b = parts(sunday);

  if (a.year !== b.year) {
    return `${a.day} ${MONTH_NAMES[a.month - 1]} ${a.year} – ${b.day} ${MONTH_NAMES[b.month - 1]} ${b.year}`;
  }
  if (a.month !== b.month) {
    return `${a.day} ${MONTH_NAMES[a.month - 1]} – ${b.day} ${MONTH_NAMES[b.month - 1]} ${b.year}`;
  }
  return `${a.day} – ${b.day} ${MONTH_NAMES[b.month - 1]} ${b.year}`;
}
```

- [ ] **Step 4: Run tests**

Run: `cd web && npx vitest run src/lib/date-ro.test.ts`
Expected: PASS. Do not hold the implementation to a predicted test count — the impossible-date validation and a full `toEqual` on `MONTH_NAMES` push this well past the block shown here (23 as built).

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
- Consumes: `dayIndex` and **`dateParts`** from `./date-ro`. `dateParts` parses *and validates* a `YYYY-MM-DD` string, rejecting dates that do not exist (month 13, 30 February). **Use it in `toUtc` instead of writing a second regex parse** — duplicating the parse would leave the impossible-date hole open on this side, which is what Task 2's fix round closed.
- Produces:
  - `adaugaZile(data: string, n: number): string`
  - `inceputSaptamana(data: string): string` — the Monday of that date's week.
  - `sfarsitSaptamana(data: string): string` — the Sunday.
  - `cheieSaptamana(data: string): string` — ISO week key, e.g. `'2026-W38'`.
  - `aziLaZurich(acum?: Date): string` — the current calendar date in Europe/Zurich.
  - `oraLaZurich(acum?: Date): string` — the current `HH:MM` in Europe/Zurich.

`todayInZurich` and `timeInZurich` are the **only** functions in the codebase that touch timezones. Everything downstream takes their output as plain strings.

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/week.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  addDays,
  todayInZurich,
  weekKey,
  weekStart,
  timeInZurich,
  weekEnd,
} from './week';

describe('adaugaZile', () => {
  it('adună în interiorul lunii', () => {
    expect(addDays('2026-09-14', 6)).toBe('2026-09-20');
  });

  it('trece peste granița de lună', () => {
    expect(addDays('2026-09-28', 6)).toBe('2026-10-04');
  });

  it('trece peste granița de an', () => {
    expect(addDays('2025-12-29', 6)).toBe('2026-01-04');
  });

  it('scade cu numere negative', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('respectă anii bisecți', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('nu este afectată de trecerea la ora de vară', () => {
    // 2026-03-29 is the European DST switch. A naive local-time
    // implementation adding 24h in milliseconds lands back on the 29th.
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
  });

  it('nu este afectată de trecerea la ora de iarnă', () => {
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
  });
});

describe('inceputSaptamana și sfarsitSaptamana', () => {
  it('o luni este propriul început de săptămână', () => {
    expect(weekStart('2026-09-14')).toBe('2026-09-14');
  });

  it('o duminică aparține săptămânii care începe luni', () => {
    expect(weekStart('2026-09-20')).toBe('2026-09-14');
    expect(weekEnd('2026-09-20')).toBe('2026-09-20');
  });

  it('o miercuri se ancorează corect', () => {
    expect(weekStart('2026-09-16')).toBe('2026-09-14');
    expect(weekEnd('2026-09-16')).toBe('2026-09-20');
  });
});

describe('cheieSaptamana', () => {
  it('numerotează o săptămână obișnuită', () => {
    expect(weekKey('2026-09-14')).toBe('2026-W38');
    expect(weekKey('2026-09-20')).toBe('2026-W38');
  });

  it('atribuie zilele de la finalul lui decembrie anului ISO următor', () => {
    // 2026-01-01 is a Thursday, so ISO week 1 of 2026 starts Mon 2025-12-29.
    expect(weekKey('2025-12-29')).toBe('2026-W01');
    expect(weekKey('2026-01-04')).toBe('2026-W01');
  });

  it('atribuie 1 ianuarie anului ISO precedent când cade la finalul săptămânii', () => {
    // 2027-01-01 is a Friday, so it belongs to the week starting Mon 2026-12-28,
    // which is ISO week 53 of 2026.
    expect(weekKey('2027-01-01')).toBe('2026-W53');
  });

  it('completează cu zero săptămânile cu o cifră', () => {
    expect(weekKey('2026-02-02')).toBe('2026-W06');
  });
});

describe('aziLaZurich', () => {
  it('întoarce data din Zürich, nu din UTC', () => {
    // 22:30 UTC on 14 Sept is already 00:30 on 15 Sept in Zürich (CEST, UTC+2).
    const now = new Date('2026-09-14T22:30:00Z');
    expect(todayInZurich(now)).toBe('2026-09-15');
  });

  it('întoarce data curentă în formatul așteptat', () => {
    expect(todayInZurich()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('oraLaZurich', () => {
  it('convertește UTC în ora locală de vară', () => {
    expect(timeInZurich(new Date('2026-09-14T08:30:00Z'))).toBe('10:30');
  });

  it('convertește UTC în ora locală de iarnă', () => {
    expect(timeInZurich(new Date('2026-12-14T08:30:00Z'))).toBe('09:30');
  });

  it('scrie miezul nopții ca 00:xx, nu 24:xx', () => {
    // 22:30 UTC is 00:30 the next day in Zürich (CEST). Some ICU builds format
    // this as "24:30" under hour12:false — which would break time comparison.
    expect(timeInZurich(new Date('2026-09-14T22:30:00Z'))).toBe('00:30');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run src/lib/week.test.ts`
Expected: FAIL — `Failed to resolve import "./week"`.

- [ ] **Step 3: Implement**

Create `web/src/lib/week.ts`:

```typescript
import { dayIndex, dateParts } from './date-ro';

const MS_PER_DAY = 86_400_000;

function toUtc(date: string): number {
  // dateParts validates as well as parses — a second regex here would let
  // 2026-02-30 through on this side of the codebase.
  const { year, month, day } = dateParts(date);
  return Date.UTC(year, month - 1, day);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Adds days to a calendar date. Arithmetic happens in UTC, where every day is
 * exactly 24h, so daylight saving cannot shift the result.
 */
export function addDays(date: string, n: number): string {
  return fromUtc(toUtc(date) + n * MS_PER_DAY);
}

export function weekStart(date: string): string {
  return addDays(date, -dayIndex(date));
}

export function weekEnd(date: string): string {
  return addDays(weekStart(date), 6);
}

/**
 * ISO 8601 week key, e.g. "2026-W38". The ISO year is the year of the Thursday
 * in that week, which is why it can differ from the calendar year in late
 * December and early January.
 */
export function weekKey(date: string): string {
  const thursday = addDays(weekStart(date), 3);
  const isoYear = Number(thursday.slice(0, 4));
  const firstThursday = addDays(weekStart(`${isoYear}-01-04`), 3);
  const number = Math.round((toUtc(thursday) - toUtc(firstThursday)) / (7 * MS_PER_DAY)) + 1;
  return `${isoYear}-W${String(number).padStart(2, '0')}`;
}

/**
 * The current calendar date in Europe/Zurich. This and timeInZurich are the only
 * timezone-aware functions in the codebase. en-CA formats as YYYY-MM-DD.
 */
export function todayInZurich(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Zurich',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * The current HH:MM in Europe/Zurich, 24-hour.
 *
 * `hourCycle: 'h23'` rather than `hour12: false`: the latter selects the h24
 * cycle in some ICU builds, which formats midnight as "24:30" instead of
 * "00:30" — and nextService compares that string, so a late-night visitor
 * would be shown the wrong next service.
 */
export function timeInZurich(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Zurich',
    hour: '2-digit',
    minutes: '2-digit',
    hourCycle: 'h23',
  }).format(now);
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
- Create: `web/src/lib/schema.ts`, `web/src/content.config.ts`, `web/src/content/services/2026-09-14.yml`, `web/src/content/services/2026-09-16.yml`, `web/src/content/services/2026-09-18.yml`, `web/src/content/services/2026-09-19.yml`, `web/src/content/services/2026-09-20.yml`
- Test: `web/src/lib/schema.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `daySchema` — the Zod object schema for one service day.
  - `type ZiSlujba = z.infer<typeof ziSchema> & { data: string }` — the shape every later task consumes.
  - Collection name `'services'`, queried with `getCollection('services')`; each entry's `id` is the filename stem, i.e. the date.

The schema lives in `lib/` rather than inline in `content.config.ts` so it can be unit-tested without booting Astro.

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/schema.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { daySchema } from './schema';

const valid = {
  feast: 'Înălțarea Sfintei Cruci',
  great_feast: true,
  fast_day: true,
  services: [
    { time: '07:30', service: 'Utrenia' },
    { time: '08:30', service: 'Sfânta Liturghie' },
  ],
};

describe('ziSchema', () => {
  it('acceptă o zi completă', () => {
    expect(daySchema.safeParse(valid).success).toBe(true);
  });

  it('acceptă o zi minimă', () => {
    const r = daySchema.safeParse({ services: [{ time: '10:00', service: 'Sfânta Liturghie' }] });
    expect(r.success).toBe(true);
  });

  it('pune valori implicite pentru steaguri', () => {
    const r = daySchema.parse({ services: [{ time: '10:00', service: 'Sfânta Liturghie' }] });
    expect(r.fast_day).toBe(false);
    expect(r.great_feast).toBe(false);
    expect(r.cancelled).toBe(false);
  });

  it('respinge o oră fără două puncte', () => {
    const r = daySchema.safeParse({ services: [{ time: '0830', service: 'Utrenia' }] });
    expect(r.success).toBe(false);
  });

  it('respinge o oră imposibilă', () => {
    const r = daySchema.safeParse({ services: [{ time: '25:00', service: 'Utrenia' }] });
    expect(r.success).toBe(false);
  });

  it('acceptă ora fără zero la început', () => {
    const r = daySchema.safeParse({ services: [{ time: '7:30', service: 'Utrenia' }] });
    expect(r.success).toBe(true);
  });

  it('respinge o zi fără slujbe care nu este anulată', () => {
    const r = daySchema.safeParse({ services: [] });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toContain('cel puțin o slujbă');
    }
  });

  it('acceptă o zi fără slujbe dacă este anulată', () => {
    const r = daySchema.safeParse({ services: [], cancelled: true, notes: 'Părintele este plecat' });
    expect(r.success).toBe(true);
  });

  it('respinge praznic_mare fără praznic', () => {
    const r = daySchema.safeParse({
      great_feast: true,
      services: [{ time: '10:00', service: 'Sfânta Liturghie' }],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toContain('numele praznicului');
    }
  });

  it('respinge o slujbă necunoscută', () => {
    const r = daySchema.safeParse({ services: [{ time: '10:00', service: 'Brunch' }] });
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
 * on the same page. "Altceva" plus `detail` is the escape hatch.
 */
export const SERVICE_NAMES = [
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

const TIME = /^([01]?\d|2[0-3]):[0-5]\d$/;

export const serviceSchema = z.object({
  time: z.string().regex(TIME, 'Ora trebuie scrisă ca 08:30'),
  service: z.enum(SERVICE_NAMES),
  detail: z.string().optional(),
});

export const daySchema = z
  .object({
    feast: z.string().optional(),
    great_feast: z.boolean().default(false),
    fast_day: z.boolean().default(false),
    cancelled: z.boolean().default(false),
    notes: z.string().optional(),
    location: z.string().optional(),
    services: z.array(serviceSchema),
  })
  .refine((z_) => z_.cancelled || z_.services.length > 0, {
    message: 'Ziua trebuie să aibă cel puțin o slujbă, sau să fie marcată ca anulată.',
    path: ['services'],
  })
  .refine((z_) => !z_.great_feast || Boolean(z_.feast?.trim()), {
    message: 'Un praznic mare trebuie să aibă și numele praznicului completat.',
    path: ['feast'],
  });

export type Service = z.infer<typeof serviceSchema>;
export type ServiceDay = z.infer<typeof daySchema> & { date: string };
```

- [ ] **Step 4: Run tests**

Run: `cd web && npx vitest run src/lib/schema.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Wire the collection**

Create `web/src/content.config.ts`:

```typescript
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { daySchema } from './lib/schema';

const services = defineCollection({
  loader: glob({
    pattern: '**/*.yml',
    base: './src/content/services',
    // The filename is the date, so use the stem verbatim rather than letting
    // github-slugger rewrite it.
    generateId: ({ entry }) => entry.replace(/\.yml$/, ''),
  }),
  schema: daySchema,
});

export const collections = { services };
```

- [ ] **Step 6: Seed the real current week**

These are the actual services from `bor-zh.ch/program-liturgic/` for 14–20 September 2026. Create five files under `web/src/content/services/`.

`2026-09-14.yml`:

```yaml
feast: Înălțarea Sfintei Cruci
great_feast: true
fast_day: true
services:
  - time: "07:30"
    service: Utrenia
  - time: "08:30"
    service: Sfânta Liturghie
```

`2026-09-16.yml`:

```yaml
services:
  - time: "17:00"
    service: Spovedanie
  - time: "18:30"
    service: Paraclisul Maicii Domnului
```

`2026-09-18.yml`:

```yaml
services:
  - time: "17:00"
    service: Spovedanie
  - time: "18:30"
    service: Acatist
```

`2026-09-19.yml`:

```yaml
services:
  - time: "15:30"
    service: Spovedanie
  - time: "17:00"
    service: Vecernie
```

`2026-09-20.yml`:

```yaml
feast: Duminica după Înălțarea Sfintei Cruci
services:
  - time: "08:45"
    service: Utrenia
  - time: "10:00"
    service: Sfânta Liturghie
    detail: și Parastas
```

- [ ] **Step 7: Verify Astro loads and validates the collection**

Run: `cd web && npm run check && npm run build`
Expected: both succeed with no schema errors.

Then deliberately break one to confirm the guarantee holds. Change `ora: "07:30"` to `ora: "0730"` in `2026-09-14.yml` and run `npm run build`.
Expected: **build FAILS** with `Ora trebuie scrisă ca 08:30`. Restore the file and rebuild to green.

This step is the whole argument for the schema — confirm it with your own eyes rather than trusting it.

- [ ] **Step 8: Commit**

```bash
git add src/lib/schema.ts src/lib/schema.test.ts src/content.config.ts src/content/services/
git commit -m "feat: service-day schema and slujbe collection

A malformed entry fails the build instead of shipping."
```

---

### Task 5: Schedule queries

**Files:**
- Create: `web/src/lib/schedule.ts`
- Test: `web/src/lib/schedule.test.ts`

**Interfaces:**
- Consumes: `ServiceDay` and `Service` from `./schema`; `weekKey`, `weekStart`, `weekEnd` and `dateParts` from `./week` / `./date-ro`. (`addDays` is **not** needed — an earlier draft listed it and importing it would fail `astro check` as unused.)
- Produces:
  - `type Saptamana = { cheie: string; luni: string; duminica: string; zile: ZiSlujba[] }`
  - `minute(ora: string): number` — minutes since midnight; `ics.ts` imports this.
  - `etichetaSlujba(s: Slujba): string` — the display label. **Every** place that shows a service name uses this: `DayRow`, `WeekBand` and the `.ics` `SUMMARY`. Without it, the `Altceva` escape hatch renders three different ways and the feed emits `Altceva Cerc de studiu`.
  - `grupeazaPeSaptamani(zile: ZiSlujba[]): Saptamana[]` — sorted ascending, weeks with no entries omitted.
  - `urmatoareaSlujba(zile, azi: string, ora: string): (Slujba & { data: string }) | null` — returning `Service` rather than a loose object is what lets the homepage pass the result straight to `serviceLabel`.
  - `saptamaniViitoare(zile, azi: string, nr: number): Saptamana[]` — the week containing `today` plus the following `nr - 1` weeks that have entries.

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/schedule.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import type { ServiceDay } from './schema';
import { serviceLabel, groupIntoWeeks, upcomingWeeks, nextService } from './schedule';

describe('etichetaSlujba', () => {
  it('întoarce numele slujbei', () => {
    expect(serviceLabel({ time: '10:00', service: 'Sfânta Liturghie' })).toBe('Sfânta Liturghie');
  });

  it('adaugă detaliul la numele slujbei', () => {
    expect(serviceLabel({ time: '10:00', service: 'Sfânta Liturghie', detail: 'și Parastas' }))
      .toBe('Sfânta Liturghie și Parastas');
  });

  it('pentru „Altceva" folosește detaliul ca nume', () => {
    expect(serviceLabel({ time: '19:00', service: 'Altceva', detail: 'Cerc de studiu biblic' }))
      .toBe('Cerc de studiu biblic');
  });

  it('nu lasă „Altceva" să apară pe site fără detaliu', () => {
    expect(serviceLabel({ time: '19:00', service: 'Altceva' })).toBe('Slujbă');
    expect(serviceLabel({ time: '19:00', service: 'Altceva', detail: '   ' })).toBe('Slujbă');
  });
});

function day(date: string, services: Array<[string, string]>, extra: Partial<ServiceDay> = {}): ServiceDay {
  return {
    date,
    great_feast: false,
    fast_day: false,
    cancelled: false,
    services: services.map(([time, service]) => ({ time, service: service as never })),
    ...extra,
  } as ServiceDay;
}

const sampleDays = [
  day('2026-09-14', [['07:30', 'Utrenia'], ['08:30', 'Sfânta Liturghie']]),
  day('2026-09-16', [['17:00', 'Spovedanie'], ['18:30', 'Acatist']]),
  day('2026-09-20', [['08:45', 'Utrenia'], ['10:00', 'Sfânta Liturghie']]),
  day('2026-09-23', [['18:30', 'Acatist']]),
  day('2026-10-04', [['10:00', 'Sfânta Liturghie']]),
];

describe('grupeazaPeSaptamani', () => {
  it('grupează zilele în săptămâni ISO', () => {
    const s = groupIntoWeeks(sampleDays);
    expect(s.map((x) => x.key)).toEqual(['2026-W38', '2026-W39', '2026-W40']);
  });

  it('pune limitele corecte pe fiecare săptămână', () => {
    const [first] = groupIntoWeeks(sampleDays);
    expect(first.monday).toBe('2026-09-14');
    expect(first.sunday).toBe('2026-09-20');
    expect(first.days).toHaveLength(3);
  });

  it('sortează zilele în interiorul săptămânii', () => {
    const s = groupIntoWeeks([sampleDays[2], sampleDays[0], sampleDays[1]]);
    expect(s[0].days.map((z) => z.date)).toEqual(['2026-09-14', '2026-09-16', '2026-09-20']);
  });

  it('omite săptămânile fără intrări', () => {
    const s = groupIntoWeeks(sampleDays);
    expect(s.map((x) => x.key)).not.toContain('2026-W41');
  });

  it('întoarce o listă goală pentru date goale', () => {
    expect(groupIntoWeeks([])).toEqual([]);
  });
});

describe('urmatoareaSlujba', () => {
  it('alege următoarea slujbă din ziua curentă', () => {
    expect(nextService(sampleDays, '2026-09-14', '08:00')).toMatchObject({
      date: '2026-09-14',
      time: '08:30',
      service: 'Sfânta Liturghie',
    });
  });

  it('trece la ziua următoare când ziua curentă s-a încheiat', () => {
    expect(nextService(sampleDays, '2026-09-14', '09:00')).toMatchObject({
      date: '2026-09-16',
      time: '17:00',
    });
  });

  it('compară orele numeric, nu alfabetic', () => {
    const d = [day('2026-09-14', [['09:00', 'Utrenia'], ['10:00', 'Sfânta Liturghie']])];
    // Lexicographically '9:00' > '10:00'; numerically it is not.
    expect(nextService(d, '2026-09-14', '9:30')).toMatchObject({ time: '10:00' });
  });

  it('sare peste zilele anulate', () => {
    const d = [
      day('2026-09-16', [['18:30', 'Acatist']], { cancelled: true }),
      day('2026-09-20', [['10:00', 'Sfânta Liturghie']]),
    ];
    expect(nextService(d, '2026-09-15', '12:00')).toMatchObject({ date: '2026-09-20' });
  });

  it('întoarce null când nu mai urmează nimic', () => {
    expect(nextService(sampleDays, '2027-01-01', '00:00')).toBeNull();
  });

  it('întoarce null pentru date goale', () => {
    expect(nextService([], '2026-09-14', '08:00')).toBeNull();
  });
});

describe('saptamaniViitoare', () => {
  it('începe cu săptămâna care conține ziua curentă', () => {
    const s = upcomingWeeks(sampleDays, '2026-09-16', 3);
    expect(s[0].key).toBe('2026-W38');
  });

  it('limitează numărul de săptămâni', () => {
    expect(upcomingWeeks(sampleDays, '2026-09-16', 2)).toHaveLength(2);
  });

  it('exclude săptămânile complet trecute', () => {
    const s = upcomingWeeks(sampleDays, '2026-09-23', 3);
    expect(s.map((x) => x.key)).toEqual(['2026-W39', '2026-W40']);
  });

  it('întoarce o listă goală când totul este în trecut', () => {
    expect(upcomingWeeks(sampleDays, '2027-01-01', 3)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run src/lib/schedule.test.ts`
Expected: FAIL — `Failed to resolve import "./schedule"`.

- [ ] **Step 3: Implement**

Create `web/src/lib/schedule.ts`:

```typescript
import type { Service, ServiceDay } from './schema';
import { addDays } from './week';
import { weekKey, weekStart, weekEnd } from './week';

export type Week = {
  key: string;
  monday: string;
  sunday: string;
  days: ServiceDay[];
};

/** Minutes since midnight. '9:30' and '09:30' both yield 570. */
export function minutes(time: string): number {
  const [h, m] = time.split(':');
  return Number(h) * 60 + Number(m);
}

/**
 * The label shown to a visitor. `Altceva` is the CMS escape hatch for a service
 * not on the dropdown: the editor types the real name into `detail`, so the
 * word "Altceva" itself must never reach the page or the calendar feed.
 */
export function serviceLabel(s: Service): string {
  const detail = s.detail?.trim() ?? '';
  if (s.service === 'Altceva') return detail || 'Slujbă';
  return detail ? `${s.service} ${detail}` : s.service;
}

export function groupIntoWeeks(days: ServiceDay[]): Week[] {
  const buckets = new Map<string, ServiceDay[]>();

  for (const z of days) {
    const key = weekKey(z.date);
    const list = buckets.get(key);
    if (list) list.push(z);
    else buckets.set(key, [z]);
  }

  return [...buckets.values()]
    .map((group) => {
      const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date));
      const anyDate = sorted[0].date;
      return {
        key: weekKey(anyDate),
        monday: weekStart(anyDate),
        sunday: weekEnd(anyDate),
        days: sorted,
      };
    })
    .sort((a, b) => a.monday.localeCompare(b.monday));
}

export function nextService(
  days: ServiceDay[],
  today: string,
  time: string,
): (Service & { date: string }) | null {
  const now = minutes(time);
  const candidate = [...days]
    .filter((z) => !z.cancelled && z.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  for (const z of candidate) {
    const services = [...z.services].sort((a, b) => minutes(a.time) - minutes(b.time));
    for (const s of services) {
      if (z.date > today || minutes(s.time) >= now) {
        return { ...s, date: z.date };
      }
    }
  }
  return null;
}

export function upcomingWeeks(days: ServiceDay[], today: string, count: number): Week[] {
  const monday = weekStart(today);
  return groupIntoWeeks(days)
    .filter((s) => s.monday >= monday)
    .slice(0, count);
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
- Consumes: `ServiceDay` from `./schema`; `minutes` from `./schedule`.
- Produces: `genereazaIcs(zile: ZiSlujba[], opts: { dtstamp: string; locatie: string }): string` — a complete RFC 5545 document with CRLF line endings.

Three things are easy to get wrong here and each has a test: **line folding must count octets, not characters** (`Înălțarea` is 9 characters but 11 bytes, so a character-based fold produces lines that exceed 75 octets and some clients reject them); **text must be escaped** (`,` `;` `\` and newlines); and **UIDs must be stable** across rebuilds and across reordering, or every subscriber's calendar churns.

`dtstamp` is a parameter rather than `new Date()` so output is deterministic and testable.

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/ics.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import type { ServiceDay } from './schema';
import { SERVICE_NAMES } from './schema';
import { generateIcs } from './ics';

function day(date: string, services: Array<[string, string]>, extra: Partial<ServiceDay> = {}): ServiceDay {
  return {
    date,
    great_feast: false,
    fast_day: false,
    cancelled: false,
    services: services.map(([time, service]) => ({ time, service: service as never })),
    ...extra,
  } as ServiceDay;
}

const opts = { dtstamp: '20260915T060000Z', location: 'Wehntalerstrasse 451, 8046 Zürich' };

const ics = (days: ServiceDay[]) => generateIcs(days, opts);

describe('structura documentului', () => {
  it('se deschide și se închide corect', () => {
    const out = ics([day('2026-09-20', [['10:00', 'Sfânta Liturghie']])]);
    expect(out.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(out.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('folosește terminatori de linie CRLF', () => {
    const out = ics([day('2026-09-20', [['10:00', 'Sfânta Liturghie']])]);
    expect(out.split('\n').every((l) => l === '' || l.endsWith('\r'))).toBe(true);
  });

  it('include fusul orar Europe/Zurich', () => {
    const out = ics([day('2026-09-20', [['10:00', 'Sfânta Liturghie']])]);
    expect(out).toContain('BEGIN:VTIMEZONE');
    expect(out).toContain('TZID:Europe/Zurich');
  });

  it('emite un VEVENT pentru fiecare slujbă', () => {
    const out = ics([day('2026-09-14', [['07:30', 'Utrenia'], ['08:30', 'Sfânta Liturghie']])]);
    expect(out.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });
});

describe('ora de început și de sfârșit', () => {
  it('scrie DTSTART cu fusul orar local', () => {
    const out = ics([day('2026-09-20', [['10:00', 'Sfânta Liturghie']])]);
    expect(out).toContain('DTSTART;TZID=Europe/Zurich:20260920T100000');
  });

  it('completează ora cu zero la început', () => {
    const out = ics([day('2026-09-14', [['7:30', 'Utrenia']])]);
    expect(out).toContain('DTSTART;TZID=Europe/Zurich:20260914T073000');
  });

  it('termină o slujbă când începe următoarea din aceeași zi', () => {
    const out = ics([day('2026-09-16', [['17:00', 'Spovedanie'], ['18:30', 'Acatist']])]);
    expect(out).toContain('DTEND;TZID=Europe/Zurich:20260916T183000');
  });

  it('dă ultimei slujbe din zi durata implicită de 90 de minute', () => {
    const out = ics([day('2026-09-20', [['10:00', 'Sfânta Liturghie']])]);
    expect(out).toContain('DTEND;TZID=Europe/Zurich:20260920T113000');
  });
});

describe('UID', () => {
  it('derivă UID din dată, oră și numele slujbei, nu din poziție', () => {
    const out = ics([day('2026-09-14', [['07:30', 'Utrenia']])]);
    expect(out).toContain('UID:20260914T0730-utrenia@bor-zh.ch');
  });

  it('păstrează UID-urile stabile când se inserează o slujbă mai devreme', () => {
    const before = ics([day('2026-09-14', [['08:30', 'Sfânta Liturghie']])]);
    const after = ics([day('2026-09-14', [['07:30', 'Utrenia'], ['08:30', 'Sfânta Liturghie']])]);
    expect(before).toContain('UID:20260914T0830-sfanta-liturghie@bor-zh.ch');
    expect(after).toContain('UID:20260914T0830-sfanta-liturghie@bor-zh.ch');
  });

  it('dă UID-uri distincte la două slujbe care încep la aceeași oră', () => {
    // Spovedanie în timpul Vecerniei — o seară obișnuită de parohie.
    const out = ics([day('2026-09-19', [['17:00', 'Spovedanie'], ['17:00', 'Vecernie']])]);
    const uids = [...out.matchAll(/UID:(\S+)/g)].map((m) => m[1]);
    expect(uids).toHaveLength(2);
    expect(new Set(uids).size).toBe(2);
  });

  it('pliază diacriticele în slug, nu le șterge', () => {
    const a = ics([day('2026-09-20', [['10:00', 'Sfânta Liturghie']])]);
    expect(a).toContain('-sfanta-liturghie@bor-zh.ch');
  });

  it('niciun nume de slujbă nu produce un UID care se împăturește', () => {
    // Asserted against SERVICE_NAMES, not against today's longest name, so adding
    // a longer service in future fails here instead of quietly folding a UID.
    for (const name of SERVICE_NAMES) {
      const out = ics([day('2026-09-20', [['10:00', name]], {
        services: [{ time: '10:00', service: name, detail: name === 'Altceva' ? 'Cerc biblic' : undefined }],
      })]);
      for (const line of out.split('\r\n')) {
        if (line.startsWith('UID:')) {
          expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
        }
      }
      expect(out).not.toMatch(/UID:[^\r\n]*\r\n /);
    }
  });
});

describe('conținut', () => {
  it('pune numele slujbei în SUMMARY', () => {
    const out = ics([day('2026-09-20', [['10:00', 'Sfânta Liturghie']])]);
    expect(out).toContain('SUMMARY:Sfânta Liturghie');
  });

  it('adaugă detaliul la SUMMARY', () => {
    const z = day('2026-09-20', [['10:00', 'Sfânta Liturghie']]);
    z.services[0].detail = 'și Parastas';
    expect(ics([z])).toContain('SUMMARY:Sfânta Liturghie și Parastas');
  });

  it('nu scrie niciodată cuvântul „Altceva" în SUMMARY', () => {
    const z = day('2026-09-20', [['19:00', 'Altceva']]);
    z.services[0].detail = 'Cerc de studiu biblic';
    const out = ics([z]);
    expect(out).toContain('SUMMARY:Cerc de studiu biblic');
    expect(out).not.toContain('Altceva');
  });

  it('pune praznicul în DESCRIPTION', () => {
    const z = day('2026-09-14', [['08:30', 'Sfânta Liturghie']], {
      feast: 'Înălțarea Sfintei Cruci',
      fast_day: true,
    });
    const out = ics([z]);
    expect(out).toContain('Înălțarea Sfintei Cruci');
    expect(out).toContain('zi de post');
  });

  it('marchează zilele anulate în loc să le omită', () => {
    const z = day('2026-09-16', [['18:30', 'Acatist']], { cancelled: true });
    expect(ics([z])).toContain('STATUS:CANCELLED');
  });
});

describe('escaping și folding', () => {
  it('escapează virgule, punct-virgule și backslash', () => {
    const z = day('2026-09-20', [['10:00', 'Altceva']], { feast: 'Unu, doi; trei\\patru' });
    const out = ics([z]);
    expect(out).toContain('Unu\\, doi\\; trei\\\\patru');
  });

  it('transformă newline-urile în \\n literal', () => {
    const z = day('2026-09-20', [['10:00', 'Altceva']], { notes: 'rândul unu\nrândul doi' });
    expect(ics([z])).toContain('rândul unu\\nrândul doi');
  });

  it('nu depășește 75 de octeți pe linie, nici cu diacritice', () => {
    const z = day('2026-09-14', [['08:30', 'Sfânta Liturghie']], {
      feast: 'Înălțarea Sfintei Cruci și pomenirea tuturor sfinților părinți români '
        + 'care au strălucit în credință de-a lungul veacurilor în Țara Românească',
    });
    const lines = ics([z]).split('\r\n');
    for (const line of lines) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it('continuă liniile împăturite cu un spațiu', () => {
    const z = day('2026-09-14', [['08:30', 'Sfânta Liturghie']], {
      feast: 'x'.repeat(200),
    });
    const lines = ics([z]).split('\r\n');
    const continuations = lines.filter((l) => l.startsWith(' '));
    expect(continuations.length).toBeGreaterThan(0);
  });

  it('nu rupe un caracter multi-octet în două linii', () => {
    const z = day('2026-09-14', [['08:30', 'Sfânta Liturghie']], {
      feast: 'ă'.repeat(120),
    });
    const out = ics([z]);
    // If a fold split a 2-byte character, re-joining would not round-trip.
    const unfolded = out.replace(/\r\n /g, '');
    expect(unfolded).toContain('ă'.repeat(120));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run src/lib/ics.test.ts`
Expected: FAIL — `Failed to resolve import "./ics"`.

- [ ] **Step 3: Implement**

Create `web/src/lib/ics.ts`:

```typescript
import { serviceLabel, compareDates, minutes } from './schedule';
import type { Service, ServiceDay } from './schema';
import { addDays } from './week';

const CRLF = '\r\n';
const DEFAULT_DURATION = 90; // minutes, for the last service of a day

/** RFC 5545 §3.3.11 text escaping. Backslash first, or it doubles the others. */
function escapeText(text: string): string {
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
function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;

  const pieces: string[] = [];
  let current = '';
  let bytes = 0;

  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > 75) {
      pieces.push(current);
      current = ch;
      bytes = n + 1; // the leading space on a continuation line counts
    } else {
      current += ch;
      bytes += n;
    }
  }
  pieces.push(current);
  return pieces.join(`${CRLF} `);
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
 * SERVICE_NAMES is a closed list, and no day may carry the same `service` twice at
 * the same `time`.
 *
 * COUPLING: the residual gap is two `Altceva` entries whose `detail` values fold
 * to the same slug. The schema rejects those today because both carry
 * slujba: 'Altceva' — but that rejection has been flagged as a narrow
 * over-rejection, so if it is ever relaxed to key on `detail`, this slug must
 * join the same key.
 *
 * The 40-character cap is LOAD-BEARING. The longest name in SERVICE_NAMES,
 * "Liturghia Darurilor mai înainte sfințite", yields a 40-character slug and a
 * 68-octet UID line, which keeps UIDs under the 75-octet fold. A folded UID would
 * break clients and silently break the /UID:(\S+)/ assertions. A test asserts this
 * against SERVICE_NAMES itself, so adding a longer service name fails loudly.
 */
function serviceSlug(s: Service): string {
  const name = s.service === 'Altceva' ? (s.detail ?? '') : s.service;
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 40) || 'slujba';
}

function toIcsTime(time: string): string {
  const [h, m] = time.split(':');
  return `${h.padStart(2, '0')}${m}00`;
}

function toIcsDate(date: string): string {
  return date.replace(/-/g, '');
}

function addMinutes(date: string, time: string, n: number): { date: string; time: string } {
  const total = minutes(time) + n;
  const extraDays = Math.floor(total / 1440);
  const leftover = ((total % 1440) + 1440) % 1440;
  const h = String(Math.floor(leftover / 60)).padStart(2, '0');
  const m = String(leftover % 60).padStart(2, '0');
  if (extraDays === 0) return { date, time: `${h}:${m}` };
  // addDays, not a third hand-rolled Date path. dateParts is the one parser
  // and addDays the one arithmetic; both are tested far harder than anything
  // inlined here, and an unvalidated third path is how 30 February got through.
  return { date: addDays(date, extraDays), time: `${h}:${m}` };
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

export function generateIcs(
  days: ServiceDay[],
  opts: { dtstamp: string; location: string },
): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Parohia Ortodoxa Romana Sfantul Nicolae Zurich//Program//RO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Program liturgic — Sfântul Nicolae Zürich',
    'X-WR-TIMEZONE:Europe/Zurich',
    ...VTIMEZONE,
  ];

  // `compareDates`, not localeCompare: ICU collation varies between Node builds and
  // treats hyphens as variable-weight. schedule.ts exports one comparison
  // semantics for these strings; this module uses it rather than a second.
  const sorted = [...days].sort((a, b) => compareDates(a.date, b.date));

  for (const z of sorted) {
    const services = [...z.services].sort((a, b) => minutes(a.time) - minutes(b.time));

    services.forEach((s, i) => {
      // The next service that starts STRICTLY later — not simply the next by
      // index. Two services can share a start time (17:00 Spovedanie during
      // 17:00 Vecernie), and `services[i + 1]` would give the first of them a
      // DTEND equal to its DTSTART. RFC 5545 §3.6.1 requires DTEND to be later
      // than DTSTART, and a zero-length VEVENT renders unpredictably — for a
      // parish, as a service that looks like it is not happening.
      const nextLater = services.slice(i + 1).find((u) => minutes(u.time) > minutes(s.time));
      const end = nextLater
        ? { date: z.date, time: nextLater.time }
        : addMinutes(z.date, s.time, DEFAULT_DURATION);

      const description = [
        z.feast,
        z.fast_day ? 'zi de post' : undefined,
        z.notes,
      ].filter(Boolean).join(' · ');

      lines.push(
        'BEGIN:VEVENT',
        // HHMM, not HHMMSS — toIcsTime returns HHMM00, so the first four suffice.
        // The slug is what keeps two services that share a start time apart:
        // 17:00 Spovedanie and 17:00 Vecernie are one ordinary parish evening,
        // and identical UIDs would make subscribers' calendars merge them.
        `UID:${toIcsDate(z.date)}T${toIcsTime(s.time).slice(0, 4)}-${serviceSlug(s)}@bor-zh.ch`,
        `DTSTAMP:${opts.dtstamp}`,
        `DTSTART;TZID=Europe/Zurich:${toIcsDate(z.date)}T${toIcsTime(s.time)}`,
        `DTEND;TZID=Europe/Zurich:${toIcsDate(end.date)}T${toIcsTime(end.time)}`,
        `SUMMARY:${escapeText(serviceLabel(s))}`,
        `LOCATION:${escapeText(z.location || opts.location)}`,
      );
      if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
      if (z.cancelled) lines.push('STATUS:CANCELLED');
      lines.push('END:VEVENT');
    });
  }

  lines.push('END:VCALENDAR');

  // Fold once, uniformly, at the end. Folding as lines are pushed would leave
  // the header lines unfolded and make the 75-octet guarantee depend on nobody
  // ever lengthening X-WR-CALNAME. No raw line contains CRLF at this point,
  // because escapeaza has already turned newlines into a literal \n.
  return lines.map(fold).join(CRLF) + CRLF;
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
  const z = day('2026-09-14', [['07:30', 'Utrenia'], ['08:30', 'Sfânta Liturghie']], {
    feast: 'Înălțarea Sfintei Cruci',
    great_feast: true,
    fast_day: true,
  });
  writeFileSync('/tmp/proba.ics', generateIcs([z], opts));
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
import { contrastRatio } from './contrast';

describe('raportContrast', () => {
  it('dă 21 pentru negru pe alb', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
  });

  it('dă 1 pentru o culoare cu ea însăși', () => {
    expect(contrastRatio('#6B1F26', '#6B1F26')).toBeCloseTo(1, 5);
  });

  it('este simetric', () => {
    expect(contrastRatio('#6B1F26', '#FAF6EE'))
      .toBeCloseTo(contrastRatio('#FAF6EE', '#6B1F26'), 5);
  });

  it('acceptă hex scurt', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 1);
  });

  it('confirmă că aurul ornamental pică testul', () => {
    expect(contrastRatio('#B08B3E', '#FAF6EE')).toBeLessThan(3);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run src/lib/contrast.test.ts`
Expected: FAIL — `Failed to resolve import "./contrast"`.

- [ ] **Step 3: Implement contrast**

Create `web/src/lib/contrast.ts`:

```typescript
function channels(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`Culoare invalidă: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
}

/** WCAG 2.1 relative luminance. */
function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
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
import { contrastRatio } from './contrast';
import { PALETTE, TEXT_ROLES, cssTokens } from './tokens';

describe('paleta', () => {
  it('folosește valorile din specificație', () => {
    expect(PALETTE.parchment).toBe('#FAF6EE');
    expect(PALETTE.oxblood).toBe('#6B1F26');
    expect(PALETTE['gold-text']).toBe('#8A6A28');
    expect(PALETTE.gold).toBe('#B08B3E');
  });
});

describe('contrast pe fundalul de pergament', () => {
  it.each(TEXT_ROLES)('%s trece WCAG AA pentru text normal', (role) => {
    expect(contrastRatio(PALETTE[role], PALETTE.parchment)).toBeGreaterThanOrEqual(4.5);
  });

  it('aurul ornamental nu este trecut ca rol de text', () => {
    expect(TEXT_ROLES).not.toContain('gold');
    expect(TEXT_ROLES).not.toContain('gold-lt');
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
export const PALETTE: Record<string, string> = {
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
 * deliberately absent: they are ornament only — hairlines, borders, the † glyph
 * and the feast-row top rule. The approved mockups used `gold` for service
 * times; tokens.test.ts is what stops that regressing.
 */
export const TEXT_ROLES = ['oxblood', 'oxblood-dk', 'gold-text', 'ink', 'muted', 'faint'] as const;

export function cssTokens(): string {
  const lines = Object.entries(PALETTE).map(([k, v]) => `  --${k}: ${v};`);
  return `:root {\n${lines.join('\n')}\n}`;
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
  title: string;
  description?: string;
}

const { title, description = 'Parohia Ortodoxă Română Sfântul Nicolae din Zürich — program liturgic, noutăți și informații parohiale.' } = Astro.props;
---

<!doctype html>
<html lang="ro">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>{title} · Parohia Sfântul Nicolae Zürich</title>
    <meta name="description" content={description} />
    <link rel="canonical" href={new URL(Astro.url.pathname, Astro.site)} />
    <link rel="alternate" type="text/calendar" href="/program.ics" title="Program liturgic" />
  </head>
  <body>
    <a class="skip-link" href="#content">Sari la conținut</a>
    <SiteHeader />
    <main id="content">
      <slot />
    </main>
    <SiteFooter />
  </body>
</html>
```

Create `web/src/components/SiteHeader.astro`:

```astro
---
const path = Astro.url.pathname;
const links = [
  { href: '/', text: 'Acasă' },
  { href: '/program/', text: 'Program' },
];
---

<header class="sh">
  <div class="container sh-in">
    <a class="sh-brand" href="/">
      <span class="sh-cross" aria-hidden="true">†</span>
      <span class="sh-wm">
        <b>Sfântul Nicolae</b>
        <span>Parohia Ortodoxă Română · Zürich</span>
      </span>
    </a>
    <nav aria-label="Navigare principală">
      <ul class="sh-nav">
        {links.map((l) => (
          <li>
            <a href={l.href} aria-current={path === l.href ? 'page' : undefined}>{l.text}</a>
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
- Create: `web/src/components/DayRow.astro`, `web/src/pages/program/index.astro`

**Interfaces:**
- Consumes: `getCollection('services')`; `groupIntoWeeks`, `upcomingWeeks` from `lib/schedule`; `todayInZurich` from `lib/week`; `formatWeekRange`, `dayName`, `monthName`, `dayOfMonth` from `lib/date-ro`.
- Produces: `DayRow.astro` with props `{ zi: ZiSlujba }`. Each week section carries `date-week={key}` — Task 10's script depends on that attribute name.

- [ ] **Step 1: Write the day row component**

Create `web/src/components/DayRow.astro`:

```astro
---
import type { ServiceDay } from '../lib/schema';
import { monthName, dayName, dayOfMonth } from '../lib/date-ro';
import { serviceLabel } from '../lib/schedule';

interface Props { day: ServiceDay }
const { day } = Astro.props;
const feast = Boolean(day.great_feast || day.feast);
---

<div class:list={['dr', feast && 'dr-feast', day.cancelled && 'dr-cancelled']}>
  <div class="dr-date">
    <span class="dr-day">{dayName(day.date)}</span>
    <span class="dr-num">{dayOfMonth(day.date)}</span>
    <span class="dr-month">{monthName(day.date)}</span>
  </div>
  <div>
    {day.cancelled && <p class="dr-cancelled-txt">Slujbele acestei days sunt cancelled.</p>}
    {day.services.map((s) => (
      <div class="dr-service">
        <b>{s.time}</b>
        <span>{serviceLabel(s)}</span>
      </div>
    ))}
    {day.feast && (
      <p class="dr-feast-txt">
        {day.great_feast && <span aria-hidden="true">† </span>}{zi.praznic}
        {day.fast_day && <span class="dr-fast">Zi de post</span>}
      </p>
    )}
    {!day.feast && day.fast_day && <p class="dr-feast-txt"><span class="dr-fast">Zi de post</span></p>}
    {day.notes && <p class="dr-note">{day.notes}</p>}
  </div>
</div>

<style>
  .dr { display: grid; grid-template-columns: 7rem 1fr; gap: 1.25rem; padding-block: 1rem; border-bottom: 1px solid var(--rule); }
  /* Feast days are marked by background AND a rule, never by colour alone.
     Flat, not a gradient: axe cannot determine contrast over a gradient and reports
     `incomplete`, which `npm run a11y` treats as a failure — so a gradient here would
     turn the feast row, the one row that matters most, into an unverifiable surface.
     The gradient's own contribution measured 1.06:1 against the page, so nothing is lost. */
  .dr-feast { background: var(--raised); box-shadow: inset 0 2px 0 var(--gold-lt); }
  .dr-cancelled { opacity: 0.75; }
  .dr-day { display: block; font-family: var(--display); font-size: 0.6875rem; letter-spacing: 0.2em; text-transform: uppercase; color: var(--faint); }
  .dr-num { display: block; font-family: var(--display); font-size: 1.875rem; line-height: 1.05; color: var(--ink); }
  .dr-month { display: block; font-size: 0.6875rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--faint); }
  .dr-service { display: grid; grid-template-columns: 3.5rem 1fr; gap: 0.75rem; padding-block: 0.15rem; align-items: baseline; }
  .dr-service b { font-family: var(--display); font-size: 1.0625rem; font-weight: 600; color: var(--gold-text); }
  .dr-feast-txt { font-family: var(--display); font-style: italic; font-size: 1.0625rem; color: var(--oxblood); margin: 0.5rem 0 0; }
  .dr-fast { display: inline-block; font-family: var(--body); font-style: normal; font-size: 0.625rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--oxblood); border: 1px solid var(--rule); padding: 0.05rem 0.4rem; margin-left: 0.5rem; vertical-align: middle; }
  .dr-note, .dr-cancelled-txt { font-size: 0.875rem; color: var(--muted); margin: 0.4rem 0 0; }
  @media (max-width: 34rem) {
    .dr { grid-template-columns: 4rem 1fr; gap: 0.75rem; }
    .dr-month { display: none; }
  }
</style>
```

- [ ] **Step 2: Write the page**

Create `web/src/pages/program/index.astro`:

```astro
---
import { getCollection } from 'astro:content';
import Base from '../../layouts/Base.astro';
import DayRow from '../../components/DayRow.astro';
import { formatWeekRange } from '../../lib/date-ro';
import { groupIntoWeeks } from '../../lib/schedule';
import { todayInZurich, weekStart } from '../../lib/week';

const entries = await getCollection('slujbe');
const days = entries.map((e) => ({ ...e.date, date: e.id }));

const monday = weekStart(todayInZurich());
const weeks = groupIntoWeeks(days).filter((s) => s.sunday >= monday);
---

<Base title="Program liturgic" description="Programul slujbelor la Parohia Ortodoxă Română Sfântul Nicolae din Zürich.">
  <div class="container">
    <p class="eyebrow" style="margin-top:2rem">Informații parohiale</p>
    <h1>Program liturgic</h1>

    {weeks.length === 0 ? (
      <p class="empty">Programul următoarei perioade nu a fost încă publicat.</p>
    ) : (
      weeks.map((s) => (
        <section date-week={s.key} aria-label={`Săptămâna ${formatWeekRange(s.monday, s.sunday)}`}>
          <h2 class="week-title">{formatWeekRange(s.monday, s.sunday)}</h2>
          {s.days.map((z) => <DayRow day={z} />)}
        </section>
      ))
    )}

    <p class="subscribe"><a href="/program.ics">† Adaugă programul în calendarul telefonului</a></p>
  </div>
</Base>

<style>
  .week-title { font-size: 1.375rem; margin-block: 2rem 0.75rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--rule); }
  .empty { color: var(--muted); font-style: italic; }
  .subscribe { margin-block: 2rem; }
  .subscribe a { display: inline-block; border: 1px solid var(--gold-lt); color: var(--oxblood); text-decoration: none; font-size: 0.8125rem; letter-spacing: 0.1em; text-transform: uppercase; padding: 0.75rem 1.25rem; }
</style>
```

- [ ] **Step 3: Verify**

Every week is visible at this point; Task 10 adds the week selector that narrows it to one. That order is deliberate — the page must be correct and complete *before* JavaScript is introduced, because that no-JS rendering is the baseline the site guarantees.

Run: `cd web && npm run build && npm run preview` and open `/program/`.
Expected: the five seeded days render, 14 September shows the gold top rule, the `† Înălțarea Sfintei Cruci` line and the `Zi de post` tag. Check the page at 375px width — the month name hides and the layout does not scroll horizontally.

Confirm diacritics with the reference string from Task 7: `Înălțarea`, `Sfânta`, `Duminică`, `Sâmbătă` all render without boxes.

- [ ] **Step 4: Commit**

```bash
git add src/components/DayRow.astro src/pages/program/index.astro
git commit -m "feat: /program page with feast and fast-day marking"
```

---

### Task 9: The program-first homepage

**Files:**
- Create: `web/src/components/WeekBand.astro`
- Modify: `web/src/pages/index.astro` (replace the scaffold contents entirely)

**Interfaces:**
- Consumes: the same helpers as Task 8, plus `nextService` from `lib/schedule`.
- Produces: `WeekBand.astro` with props `{ saptamana: Saptamana }`. The homepage renders **three** weeks, each in a `<section data-week>`.

Three weeks, not the full window: the homepage has a 30 KB HTML budget (Global Constraints) and three weeks is roughly 3 KB. `/program` carries the full list.

- [ ] **Step 1: Write the week band**

Create `web/src/components/WeekBand.astro`:

```astro
---
import type { Week } from '../lib/schedule';
import { serviceLabel } from '../lib/schedule';
import { dayName, dayOfMonth } from '../lib/date-ro';

interface Props { week: Week }
const { week } = Astro.props;
---

<div class="bs">
  {week.days.map((z) => (
    <div class:list={['wb-day', (z.great_feast || z.feast) && 'wb-feast']}>
      <div class="wb-head">
        <span class="wb-name">{dayName(z.date)}</span>
        <span class="wb-num">{dayOfMonth(z.date)}</span>
      </div>
      {z.cancelled ? (
        <p class="wb-cancelled">Anulat</p>
      ) : (
        z.services.map((s) => (
          <p class="wb-service"><b>{s.time}</b>{etichetaSlujba(s)}</p>
        ))
      )}
      {z.feast && <p class="wb-feast-txt">{z.great_feast && <span aria-hidden="true">† </span>}{z.praznic}</p>}
      {z.fast_day && <p class="wb-fast">Zi de post</p>}
    </div>
  ))}
</div>

<style>
  .wb { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); border-top: 1px solid var(--rule); }
  .wb-day { padding: 0.875rem 0.875rem 1.125rem; border-right: 1px solid var(--rule); border-bottom: 1px solid var(--rule); }
  .wb-feast { background: var(--raised); box-shadow: inset 0 2px 0 var(--gold-lt); }
  .wb-name { font-family: var(--display); font-size: 0.625rem; letter-spacing: 0.18em; text-transform: uppercase; color: var(--faint); display: block; }
  .wb-num { font-family: var(--display); font-size: 1.5rem; line-height: 1.05; color: var(--oxblood); display: block; margin-bottom: 0.4rem; }
  .wb-service { margin: 0; font-size: 0.8125rem; line-height: 1.5; }
  .wb-service b { color: var(--gold-text); font-weight: 600; margin-right: 0.4rem; }
  .wb-feast-txt { font-family: var(--display); font-style: italic; font-size: 0.8125rem; color: var(--oxblood); margin: 0.4rem 0 0; }
  .wb-fast { font-size: 0.5625rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--oxblood); border: 1px solid var(--rule); padding: 0.05rem 0.35rem; display: inline-block; margin: 0.4rem 0 0; }
  .wb-cancelled { margin: 0; font-size: 0.8125rem; color: var(--muted); font-style: italic; }
</style>
```

- [ ] **Step 2: Write the homepage**

Replace `web/src/pages/index.astro` entirely:

```astro
---
import { getCollection } from 'astro:content';
import Base from '../layouts/Base.astro';
import WeekBand from '../components/WeekBand.astro';
import { formatWeekRange, monthName, dayName, dayOfMonth } from '../lib/date-ro';
import { serviceLabel, upcomingWeeks, nextService } from '../lib/schedule';
import { todayInZurich, timeInZurich } from '../lib/week';

const entries = await getCollection('slujbe');
const days = entries.map((e) => ({ ...e.date, date: e.id }));

const today = todayInZurich();
const weeks = upcomingWeeks(days, today, 3);
const nextLater = nextService(days, today, timeInZurich());
---

<Base title="Bine ați venit">
  <section class="hero">
    <div class="container hero-in">
      <p class="hero-kick">Wehntalerstrasse 451 · 8046 Zürich</p>
      <h1>Bine ați venit în casa Domnului</h1>
      <p class="hero-verse">„Căutați mai întâi împărăția lui Dumnezeu și dreptatea Lui” — Matei 6:33</p>
    </div>
  </section>

  <div class="container">
    {nextLater && (
      <p class="next">
        <span class="eyebrow">Următoarea slujbă</span>
        <b>{dayName(nextLater.date)}, {dayOfMonth(nextLater.date)} {monthName(nextLater.date)}</b>
        <span>{nextLater.time} — {serviceLabel(nextLater)}</span>
      </p>
    )}

    <h2 class="section-title">Programul săptămânii</h2>

    {weeks.length === 0 ? (
      <p class="empty">Programul următoarei perioade nu a fost încă publicat. <a href="/program/">Vezi programul complet</a>.</p>
    ) : (
      weeks.map((s) => (
        <section date-week={s.key} aria-label={`Săptămâna ${formatWeekRange(s.monday, s.sunday)}`}>
          <p class="interval">{formatWeekRange(s.monday, s.sunday)}</p>
          <WeekBand week={s} />
        </section>
      ))
    )}

    <p class="all"><a href="/program/">Programul complet →</a></p>
  </div>
</Base>

<style>
  .hero { background: var(--oxblood); color: var(--parchment); }
  .hero-in { padding-block: clamp(2.5rem, 7vw, 4.5rem); }
  .hero-kick { font-size: 0.625rem; letter-spacing: 0.28em; text-transform: uppercase; color: var(--gold-lt); margin: 0 0 0.75rem; }
  .hero h1 { color: var(--parchment); font-size: clamp(1.875rem, 5vw, 2.75rem); font-weight: 500; }
  .hero-verse { font-style: italic; color: var(--rule); max-width: var(--masura); margin: 0.75rem 0 0; }
  .next { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.35rem 1rem; border: 1px solid var(--gold-lt); background: var(--raised); padding: 1rem 1.25rem; margin-block: 1.75rem 0; }
  .next b { font-family: var(--display); font-size: 1.25rem; color: var(--oxblood); }
  .next > span:last-child { color: var(--muted); }
  .section-title { font-size: 1.375rem; margin-block: 2rem 0.25rem; }
  .interval { font-family: var(--display); font-size: 1.0625rem; color: var(--faint); margin: 0 0 0.75rem; }
  .empty { color: var(--muted); font-style: italic; }
  .all { margin-block: 1.75rem 0; }
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
git add src/components/WeekBand.astro src/pages/index.astro
git commit -m "feat: program-first homepage with next-service card"
```

---

### Task 10: Week selection without a rebuild

**Files:**
- Create: `web/src/lib/week-picker.ts`, `web/src/components/WeekPicker.astro`
- Test: `web/src/lib/week-picker.test.ts`
- Modify: `web/src/pages/index.astro`, `web/src/pages/program/index.astro`

**Interfaces:**
- Consumes: `weekKey`, `todayInZurich` from `lib/week`.
- Produces: `alegeSaptamana(chei: string[], cheieAzi: string): number` — index of the week to reveal, or `-1` if every week is in the past.

This is the answer to spec §7. The pure decision lives in a tested function; the DOM wiring is short enough to read at a glance. See "Deviations from the spec" for why there is no `data.json`.

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/week-picker.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { pickWeek } from './week-picker';

const keys = ['2026-W38', '2026-W39', '2026-W40'];

describe('alegeSaptamana', () => {
  it('alege săptămâna curentă când există', () => {
    expect(pickWeek(keys, '2026-W39')).toBe(1);
  });

  it('alege prima săptămână viitoare când cea curentă lipsește', () => {
    expect(pickWeek(['2026-W38', '2026-W41'], '2026-W39')).toBe(1);
  });

  it('alege prima săptămână când toate sunt în viitor', () => {
    expect(pickWeek(keys, '2026-W30')).toBe(0);
  });

  it('întoarce -1 când toate săptămânile sunt în trecut', () => {
    expect(pickWeek(keys, '2026-W45')).toBe(-1);
  });

  it('întoarce -1 pentru o listă goală', () => {
    expect(pickWeek([], '2026-W39')).toBe(-1);
  });

  it('compară corect peste granița de an', () => {
    // String comparison works because the key is zero-padded ISO year + week.
    expect(pickWeek(['2026-W52', '2027-W01'], '2027-W01')).toBe(1);
    expect(pickWeek(['2026-W52', '2027-W01'], '2026-W53')).toBe(1);
  });

  it('compară corect săptămânile cu o cifră', () => {
    expect(pickWeek(['2026-W06', '2026-W10'], '2026-W07')).toBe(1);
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
 * chronological — that is why weekKey pads.
 */
export function pickWeek(keys: string[], todayKey: string): number {
  for (let i = 0; i < keys.length; i += 1) {
    if (keys[i] >= todayKey) return i;
  }
  return -1;
}
```

- [ ] **Step 4: Run tests**

Run: `cd web && npx vitest run src/lib/week-picker.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Write the component**

Create `web/src/components/WeekPicker.astro`:

```astro
---
// No props: the component reads the week sections already in the DOM, so it
// cannot fall out of sync with what the page rendered.
---

<div class="picker" hidden>
  <button type="button" data-picker-prev aria-label="Săptămâna precedentă">‹</button>
  <span data-picker-label aria-live="polite"></span>
  <button type="button" data-picker-next aria-label="Săptămâna următoare">›</button>
</div>

<script>
  import { pickWeek } from '../lib/week-picker';
  import { todayInZurich, weekKey } from '../lib/week';

  const bar = document.querySelector<HTMLElement>('.picker');
  const sections = [...document.querySelectorAll<HTMLElement>('section[data-week]')];

  if (bar && sections.length > 0) {
    const keys = sections.map((s) => s.dataset.week!);
    const start = pickWeek(keys, weekKey(todayInZurich()));

    // Every week stays visible when all of them are in the past, and when
    // JavaScript never runs at all. Hiding is the enhancement, not the baseline.
    if (start !== -1) {
      let i = start;
      const label = bar.querySelector<HTMLElement>('[data-picker-label]')!;
      const prev = bar.querySelector<HTMLButtonElement>('[data-picker-prev]')!;
      const next = bar.querySelector<HTMLButtonElement>('[data-picker-next]')!;

      const show = () => {
        sections.forEach((s, j) => { s.hidden = j !== i; });
        const title = sections[i].getAttribute('aria-label') ?? '';
        label.textContent = title.replace(/^Săptămâna\s*/, '');
        prev.disabled = i === 0;
        next.disabled = i === sections.length - 1;
      };

      prev.addEventListener('click', () => { if (i > 0) { i -= 1; show(); } });
      next.addEventListener('click', () => { if (i < sections.length - 1) { i += 1; show(); } });

      bar.hidden = false;
      show();
    }
  }
</script>

<style>
  .picker { display: flex; align-items: center; gap: 1rem; padding-block: 0.75rem; border-bottom: 1px solid var(--rule); }
  .picker span { font-family: var(--display); font-size: 1.125rem; font-weight: 600; color: var(--oxblood); }
  .picker button { background: none; border: 1px solid var(--rule); color: var(--oxblood); font-size: 1rem; line-height: 1; padding: 0.35rem 0.7rem; cursor: pointer; }
  .picker button:disabled { color: var(--rule); cursor: default; }
</style>
```

- [ ] **Step 5b: Recompute the next-service card, not just the week**

Spec §7 exists because a static build cannot know what "next" means. The plan solved that for the week band and left the **card** outside the solution — so it announces whatever was next at build time. At 20:00 on a Sunday it reads "următoarea slujbă · Duminică 20 · 10:00", ten hours after that Liturgy ended. A wrong time under a heading that promises the next one is the worst output this site can produce, and the nightly rebuild does not fix it: from 03:00 onward the card is simply frozen at 03:00.

The script already reads the clock, so it should own this too. Emit the upcoming services as an inline `<script type="application/json">` island — date, `time`, `service`, `detail`, `cancelled` — and have the script recompute the card the same way `nextService` does: earliest service at or after now, skipping cancelled days, **including every service that shares that earliest time**. Three weeks of services is well under a kilobyte; measure it against the ≤3 KB JS budget rather than assuming.

Without JavaScript the card keeps its build-time value, which Task 13 bounds by rebuilding every six hours. Say that in a comment so the limit is a decision rather than an oversight.

- [ ] **Step 6: Wire it into both pages**

The component finds the week sections itself via `section[date-week]`, so it takes no props — it only needs to be placed above them.

In `web/src/pages/program/index.astro`, add the import after the `DayRow` import:

```astro
import WeekPicker from '../../components/WeekPicker.astro';
```

and insert the component immediately before the `weeks.map(...)` block, changing:

```astro
    ) : (
      weeks.map((s) => (
```

to:

```astro
    ) : (
      <>
        <WeekPicker />
        {weeks.map((s) => (
```

and closing the fragment after the map — the block ends `))}</>`  instead of `))`:

```astro
        ))}
      </>
    )}
```

Apply the identical three changes to `web/src/pages/index.astro`, with the import path `'../components/WeekPicker.astro'`.

- [ ] **Step 7: Verify both paths**

Note for the audit, not an extra step: hiding weeks is what makes `npm run a11y` stop seeing them, because axe skips hidden elements and the script drives Chrome with JavaScript on. The no-JS pass added in Task 13 is what covers the weeks this script hides — so when you verify the JavaScript-off path below, you are also verifying the only view in which the other weeks are ever audited.


Run: `cd web && npm run build && npm run preview`

With JavaScript on: only one week section is visible, and ‹ › move between them.

With JavaScript off (DevTools → Command Palette → "Disable JavaScript", then reload): **all three** week sections are visible and the ‹ › bar is absent. This is the requirement — confirm it rather than assuming it.

Check the JS budget:

Run: `cd web && npm run budget`
Expected: the JS line is under 3,800 bytes.

Do **not** measure this by globbing `dist/_astro/*.js` — Astro inlines a script below roughly
4 KB, so that glob matches nothing and the check silently passes. The budget script counts
inlined and emitted script alike, and derives the request count from the built HTML, so
crossing the inline threshold fails the build instead of quietly changing how the page loads.

- [ ] **Step 8: Commit**

```bash
git add src/lib/week-picker.ts src/lib/week-picker.test.ts src/components/WeekPicker.astro src/pages/index.astro src/pages/program/index.astro
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
- Consumes: `generateIcs` from `lib/ics`; `getCollection`.
- Produces: `dist/program.ics` at build time.

The test here reads `dist/`, so it runs only after a build. It is the one integration test in Phase 1: it proves the collection, the schema and the generator are wired together, which no unit test can.

**Do not assert a specific week key in the HTML.** The homepage and `/program/` render only the current and future weeks, so `expect(html).toContain('date-week="2026-W38"')` would pass today and start failing on 21 September 2026 — a test that fails for a reason unrelated to any change anyone made. Date-specific assertions belong on the `.ics`, which emits every seeded day regardless of the build date.

- [ ] **Step 1: Write the endpoint**

Create `web/src/pages/program.ics.ts`:

```typescript
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { generateIcs } from '../lib/ics';

const LOCATION = 'Capela Sf. Katharina, Wehntalerstrasse 451, 8046 Zürich';

export const GET: APIRoute = async () => {
  const entries = await getCollection('slujbe');
  const days = entries.map((e) => ({ ...e.date, date: e.id }));

  // generateIcs does not validate dtstamp — it is a parameter precisely so output
  // is deterministic in tests, which means this call site owns its correctness.
  // Must be exactly YYYYMMDDTHHMMSSZ.
  const dtstamp = `${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;

  return new Response(generateIcs(days, { dtstamp, location: LOCATION }), {
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
    expect(cedillasIn(ics)).toEqual([]); // cele patru, ca numere, din src/lib/cedilla.ts
  });

  it('feed-ul respectă limita de 75 de octeți pe linie', () => {
    const ics = readFileSync(`${DIST}program.ics`, 'utf8');
    for (const line of ics.split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it('pagina de pornire are secțiunea de program', () => {
    const html = readFileSync(`${DIST}index.html`, 'utf8');
    expect(html).toContain('Programul slujbelor');
    expect(html).toContain('Bine ați venit în casa Domnului');
  });

  it('paginile declară limba română și diacritice corecte', () => {
    for (const p of ['index.html', 'program/index.html']) {
      const html = readFileSync(`${DIST}${p}`, 'utf8');
      expect(html).toContain('<html lang="ro"');
      expect(html).toContain('Sfântul Nicolae');
      expect(cedillasIn(html)).toEqual([]);
    }
  });

  it('fiecare link către calendar duce la un fișier real', () => {
    // Do NOT assert that the string '/program.ics' appears. That assertion was
    // green for the entire period the link was dead on every page, because the
    // href existed and the file did not. Follow each href to its target and
    // read it.
    for (const p of ['index.html', 'program/index.html']) {
      const html = readFileSync(`${DIST}${p}`, 'utf8');
      const hrefs = [...html.matchAll(/(?:href|src)="([^"]*\.ics)"/g)].map((m) => m[1]);
      expect(hrefs.length).toBeGreaterThan(0);
      for (const href of hrefs) {
        const target = `${DIST}${href.replace(/^\//, '')}`;
        expect(existsSync(target), `${p} trimite la ${href}, care nu există`).toBe(true);
        expect(readFileSync(target, 'utf8').length).toBeGreaterThan(0);
      }
    }
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
- Consumes: the `services` collection layout from Task 4 — the CMS writes files that `content.config.ts` reads, so the field names must match the Zod schema exactly.
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
const source = require.resolve('@sveltia/cms');

mkdirSync('public/admin', { recursive: true });
copyFileSync(source, 'public/admin/sveltia-cms.mjs');

console.log(`CMS copiat din ${source}`);
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
  - name: services
    label: Program liturgic
    label_singular: Zi de slujbă
    folder: src/content/services
    extension: yml
    format: yaml
    create: true
    delete: true
    slug: '{{fields.date}}'
    identifier_field: date
    sortable_fields: [date]
    summary: '{{date}} — {{feast}}'
    description: >
      Fiecare intrare este o zi cu slujbe. Pentru o săptămână obișnuită,
      deschideți ziua din săptămâna trecută, apăsați „Duplicate" și schimbați
      data. Zilele trecute dispar singure de pe site.
    fields:
      - name: date
        label: Data
        widget: datetime
        date_format: YYYY-MM-DD
        time_format: false
        picker_utc: false
      - name: feast
        label: Praznic sau sărbătoare
        widget: string
        required: false
        hint: Lăsați gol pentru o zi obișnuită.
      - name: great_feast
        label: Praznic mare
        widget: boolean
        default: false
        required: false
        hint: Marchează ziua cu cruce și chenar auriu. Necesită numele praznicului.
      - name: fast_day
        label: Zi de post
        widget: boolean
        default: false
        required: false
      - name: cancelled
        label: Slujbele sunt anulate
        widget: boolean
        default: false
        required: false
      - name: notes
        label: Observații
        widget: text
        required: false
      - name: location
        label: Alt loc decât capela obișnuită
        widget: string
        required: false
        hint: >
          Numele locului, fără punct la final. Textul apare ca atare pe site și în
          calendarul la care sunt abonați credincioșii.
      - name: services
        label: Slujbe
        label_singular: Slujbă
        widget: list
        summary: '{{fields.time}} {{fields.service}}'
        fields:
          - name: time
            label: Ora
            widget: string
            pattern: ['^([01]?\d|2[0-3]):[0-5]\d$', 'Scrieți ora ca 08:30']
          - name: service
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
          - name: detail
            label: Detaliu
            widget: string
            required: false
            hint: 'De exemplu „și Parastas". Pentru „Altceva", scrieți aici numele slujbei.'
```

The `options` list must stay identical to `SERVICE_NAMES` in `src/lib/schema.ts`. If they drift, the CMS will happily write a value the build then rejects.

- [ ] **Step 6: Guard the drift with a test**

Append to `web/src/lib/schema.test.ts`:

```typescript
import { readFileSync } from 'node:fs';
import { SERVICE_NAMES } from './schema';

/**
 * Reads the `options:` list out of config.yml without a YAML parser: take the
 * lines after `options:` that are more deeply indented and start with `- `.
 * Indentation-agnostic, so reformatting the file does not break the test.
 */
function optiuniDinConfig(yml: string): string[] {
  const lines = yml.split('\n');
  const start = lines.findIndex((l) => l.trim() === 'options:');
  if (start === -1) throw new Error('config.yml nu conține o listă `options:`');
  const adancime = lines[start].search(/\S/);

  const out: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '') continue;
    if (line.search(/\S/) <= adancime) break;
    const m = /^\s*-\s+(.*?)\s*$/.exec(line);
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
    expect(optiuniDinConfig(yml)).toEqual([...SERVICE_NAMES]);
  });
});
```

A single `toEqual` catches every drift that matters: a missing option, an extra one, a typo, and a reordering.

Run: `cd web && npx vitest run src/lib/schema.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 6b: Exempt the admin shell from the site-page guards**

`public/admin/index.html` is a vendored CMS host page: a `<script>` tag and nothing else, by design. Two pre-existing assertions in `stylesheet.itest.ts` require **every** `dist/**/*.html` to carry CSS and token colours, so the moment a real `dist/admin/index.html` exists they will fail — predicted by Task 9's re-reviewer before this task was dispatched.

Exempt it explicitly and say why, rather than loosening the rule for every page. The exemption must be narrow: `admin/index.html` only, not "anything under `admin/`", and **not** the Romanian diacritics guard, which deliberately keeps `admin/index.html` and `config.yml` in scope — `config.yml` is where this task writes the Romanian labels a volunteer reads.

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

Expected: a commit appears on `main` adding `src/content/services/<date>.yml`; Cloudflare Pages rebuilds; the new day appears on `/program/` within about a minute. **This round trip is the deliverable of Phase 1** — verify it before calling the phase done.

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
  Content-Security-Policy: default-src 'self'; img-src 'self' data: https://avatars.githubusercontent.com; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self'; connect-src 'self' https://api.github.com; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), microphone=(), camera=(), payment=(), interest-cohort=()

# LOAD-BEARING. A static build discards the endpoint's own Content-Type, so what a
# subscriber's calendar client receives is decided here and nowhere else. Verify it
# against the deployed host with `curl -sI`, not against the local build.
/program.ics
  Content-Type: text/calendar; charset=utf-8
  Cache-Control: public, max-age=3600

# /admin/ is the page where an editor's GitHub credential lives, so it gets the
# same `'self'` treatment as the rest of the site rather than an exception: the
# CMS's three fonts are vendored from npm at the exact versions its own URLs
# named, and copy-cms.mjs asserts each URL is found exactly once so an upgrade
# that moves them fails the build instead of silently restoring the CDN.
#
# Deliberately still blocked, each verified to fail gracefully: unpkg's hourly
# update check (the version is pinned on purpose), the githubstatus.com incident
# banner (start.mjs already tells a volunteer the site is unaffected, what to
# try and who to tell — which is what they need, not a diagnosis), and a `data:`
# logo fetch (console error only, UI draws correctly).
#
# UNVERIFIED until the first real sign-in, which needs credentials no agent has:
# img-src avatars.githubusercontent.com for the editor's avatar, and whatever the
# OAuth flow needs — the Worker origin in connect-src, possibly github.com.
# Watch the browser console on that first attempt.
/admin/*
  X-Robots-Tag: noindex
```

`connect-src` allows `api.github.com` because Sveltia talks to the GitHub GraphQL API from
`/admin/`, and `img-src` allows `avatars.githubusercontent.com` because that is where it draws
the signed-in editor's avatar — without it the CMS shows a broken image and nothing says why. `style-src 'unsafe-inline'` is required by Astro's `inlineStylesheets: 'always'`; it is a far smaller concession than inline script would be, and `script-src` stays strict.

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
const PAGE_BUDGET = {
  'index.html': 45 * 1024,
  'program/index.html': 135 * 1024,
};
// 3,800 bytes, not a round 3 KB or 4 KB. Astro inlines a script below roughly
// 4,096 bytes; above that it emits a file and the request count and caching
// change. The ceiling therefore belongs just under that cliff. The original
// 3 KB was set when the script only revealed a week — recomputing the
// next-service card is real work the browser must do, and a budget that makes
// the correct architecture uncomfortable gets met by moving rendering back into
// the browser, which is the thing this budget exists to prevent.
const JS_BUDGET = 3800;

// The Sveltia CMS bundle lives under dist/admin/. It is a few hundred KB of
// third-party code that only a signed-in editor ever loads, and it is not part
// of what a visitor downloads — so it is excluded from the visitor JS budget.
const EXCLUDED = ['admin'];

let failed = false;

function report(label, bytes, limit) {
  const ok = bytes <= limit;
  if (!ok) failed = true;
  console.log(`${ok ? 'OK       ' : 'PREA MARE'} ${label}: ${bytes} / ${limit} octeți`);
}

for (const [path, limit] of Object.entries(PAGE_BUDGET)) {
  report(path, statSync(join('dist', path)).size, limit);
}

function totalJs(dir) {
  let total = 0;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (name.isDirectory()) {
      if (dir === 'dist' && EXCLUDED.includes(name.name)) continue;
      total += totalJs(join(dir, name.name));
    } else if (/\.m?js$/.test(name.name)) {
      total += statSync(join(dir, name.name)).size;
    }
  }
  return total;
}

report('JS pentru vizitatori', totalJs('dist'), JS_BUDGET);

if (failed) {
  console.error('\nBugetul de performanță a fost depășit (specificație §13).');
  process.exit(1);
}
```

`/\.m?js$/` rather than `endsWith('.js')`: the CMS bundle is a `.mjs` file, and an extension test that misses it would leave the exclusion above looking effective while doing nothing.

Add to `package.json` scripts: `"budget": "node scripts/check-budget.mjs"`.

Run: `cd web && npm run build && npm run budget`
Expected: every line reads `OK`, exit code 0.

- [ ] **Step 2b: Run axe at a phone width as well**

Task 7 already wires `npm run a11y` over every built page and runs it in `test:build`. One gap remains, measured rather than assumed: **the audit viewport is 701–800 CSS px**, so this site's `34rem` phone breakpoint — where the week band stacks and the day row drops its month name — is never audited. Most of the parish reads this on a phone.

Add a second pass at a phone width (390px) as **`npm run a11y:mobil`** — the CI job below calls it by that name. Keep the same rules and the same "fail on `incomplete` for `color-contrast`" behaviour.

Then add both to the CI job below. What axe covers and what it does not is documented in `a11y.mjs`; do not restate it here, and do not widen the claim.

- [ ] **Step 2c: Audit the week picker, which nothing else ever sees**

The picker's bar un-hides only when a page renders two or more weeks. The homepage is now its only home, and the parish's real schedule is one week — so on every real build `sectiuni.length > 1` is false, the bar stays `hidden`, and axe skips it. Its focus ring, its disabled-arrow colour and its label contrast are checked by nothing.

Add a fixture-driven pass: build into a scratch directory with `src/lib/fixtures.ts`'s multi-week days as content, audit that build, discard it. The fixtures are already parsed through `daySchema`, so they can only contain days the CMS could produce — and because the build is temporary, no invented liturgical content reaches the seeds, which remain the parish's real published schedule.

This is the only way the bar is ever audited. Do not let it be quietly dropped as redundant with the other two passes; it covers what neither of them can reach.

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
      # Contrast is guaranteed by axe over the built pages, not by any static check:
      # specificity, @layer, media context and stylesheet order are cascade rules, and
      # a parser asserting over CSS text loses to them. `test:build` already runs the
      # desktop pass; this adds the phone width, which the default viewport misses.
      - run: npm run a11y:mobil
```

`TZ: Europe/Zurich` matters: `todayInZurich` is explicit about its timezone, but pinning the runner removes any doubt about what "today" meant during a build.

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
    # Every six hours, not nightly. The homepage's "next service" card falls back
    # to its build-time value without JavaScript, so the rebuild interval is the
    # worst-case staleness for a no-JS visitor. Four builds a day is ~120 of the
    # 500 free monthly builds.
    - cron: '0 1,7,13,19 * * *'
  workflow_dispatch:

jobs:
  reconstruieste:
    runs-on: ubuntu-latest
    steps:
      - name: Declanșează build-ul Cloudflare Pages
        run: curl -fsS -X POST "${{ secrets.CF_DEPLOY_HOOK }}"
```

This consumes about 120 of the 500 monthly builds.

- [ ] **Step 6: Replace the scaffold's agent instructions**

`npm create astro` left a `CLAUDE.md` and an `AGENTS.md`, each 22 lines about running the dev server. They load automatically into every agent session that touches this repo, so they read as the project's instructions while containing none of its actual rules — which is worse than having no file. Replace **both** with the same content (keep them identical; `AGENTS.md` is the vendor-neutral name):

```markdown
# bor-zh.ch — working rules

Static Astro site for the Romanian Orthodox parish of St Nicholas, Zürich.
Design authority: `docs/superpowers/specs/2026-09-15-parish-site-rewrite-design.md`.

## Rules that are not negotiable

- **Diacritics are comma-below.** ș U+0219 and ț U+021B, never the Turkish cedilla
  forms U+015F and U+0163. Check any Romanian string you add.
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
  `SERVICE_NAMES` din `src/lib/schema.ts`.
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

And when CI enforces: the schema (a bad `time` fails the build), the contrast rules (ornamental gold cannot become text), and the performance budget.

---

## What Phase 1 deliberately leaves out

News posts, the 48-post migration, events, galleries, PDFs, donations, the contact form, redirects from the old URLs, and the DNS cutover. The CMS-editable settings singleton (spec §6.7) is Phase 2, so the footer's contact details are hardcoded for now. The printed one-page editor card (spec §16) is Phase 4, with the training session; the README covers the same ground in the meantime.

The site runs on `*.pages.dev` throughout Phase 1; `www.bor-zh.ch` still points at WordPress. Nothing in this phase touches DNS, so parish email cannot break.

Phases 2–4 get their own plans, written against the same spec.
