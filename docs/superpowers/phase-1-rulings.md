# Phase 1 — rulings

Every decision taken during Phase 1 that was not already settled by the spec or the plan, in the
order it was made, with what it costs if it turns out to be wrong. The SDD ledger they came from
is git-ignored scratch and will be deleted; this file is the part worth keeping.

Three kinds of entry appear here, and the difference matters when you are deciding whether to
revisit one:

- **Ruling** — I decided something the documents left open, or decided against them.
- **My defect** — the plan or spec said something false and the ruling is the correction.
  Twenty-one of the seventy-eight are marked this way. They are the reason to distrust a confident
  sentence in this repository that no test stands behind.
- **Open** — decided provisionally, still unverified. The "Still open" section at the end lists
  everything nothing here can check.

---

## Setup

**1. Relocate `.git` into `web/` rather than `rm -rf .git && git init`.**
The plan's literal instruction would have destroyed the spec and plan commit history. `docs/`
sits at an identical path relative to both roots, so moving `.git` preserved history exactly and
git saw no diff.
*Cost if wrong:* none observed — history verified intact.

**2. Work on branch `phase-1`, not `main`.**
The plan's Task 13 pushes `main` to trigger deploys; implementing there directly needs consent
this session did not have.
*Cost if wrong:* one merge at the end.

**3. Account-level actions stop and go to you as a checklist.**
Task 12 Step 8 and Task 13 Steps 4–8 — create the GitHub repo, register an OAuth app, deploy the
Cloudflare Worker, connect Pages, push, add secrets — are outward-facing side effects needing
credentials this session does not hold. Implementers wrote every file those steps require.
*Cost if wrong:* you perform steps you might have preferred automated.

**4. Target Astro 7.x, not the spec's 5.x.** — *my defect*
`npm create astro@latest` installs 7.3.2. Verified against the registry: 5.x ended at 5.18.2,
4.x is tagged `legacy`. The spec was four months stale on its central dependency.
*Cost if wrong:* breaking changes the 5.x line would not have had; all caught by build and budget.

**5. Every subagent runs on opus.** (Your instruction, superseding the skill's model tiering.)
*Cost if wrong:* higher token spend per task than tiering would choose.

**6. Install `@astrojs/check` + `typescript` as devDependencies.**
Astro 7 ships `astro check` as a stub that prompts to install them, so the brief's `check` script
would have blocked in CI — and it is the only thing enforcing the "TypeScript strict" constraint.
*Cost if wrong:* two dev dependencies; nothing reaches a visitor.

---

## From the pre-flight scan, before any code

**7. Move every date-specific assertion off the HTML pages and onto `/program.ics`.**
Task 11 asserted `2026-W38` in `dist/index.html`. Both pages render only current and future
weeks, so the suite would have started failing on 21 September 2026 for no reason connected to
any change. The `.ics` emits all seeded days regardless of build date.
*Cost if wrong:* slightly weaker HTML coverage.

**8. The budget script must skip `dist/admin/` and match `/\.m?js$/`.** — *my defect*
It counted `.js` files across all of `dist`, which would have included the Sveltia bundle. It
escaped only because `endsWith('.js')` happens not to match `.mjs` — an accidental pass.
*Cost if wrong:* none; strictly more correct.

**9. One combined 45 KB limit on `dist/index.html`, not 30 KB HTML + 15 KB CSS.** — *my defect*
With `inlineStylesheets: 'always'` the CSS lives inside the HTML, so the spec's separate CSS
budget would measure an empty set and always pass, while the HTML budget would fail for carrying
weight the spec allotted to CSS.
*Cost if wrong:* the homepage may carry 45 KB rather than 30 KB — still an order of magnitude
under the WordPress site's 400 KB.

**10. Task 11 must not use `vitest run --include <glob>`.**
Vitest 5 removed it. Replaced with a second config selected via `--config`, which does not depend
on CLI surface that moves between majors.

---

## Task 2 — dates and Romanian names

**11. `parti` validated shape, not validity — fix, do not defer.**
`2026-13-01` rendered the literal string `undefined`; `2026-02-30` reported "Luni" after rolling
over to 2 March. The reviewer called it minor. It reaches a visitor as a wrong liturgical date.
`partiData` now validates and parses in one place, and everything downstream imports it.
*Cost if wrong:* a thrown error on a malformed filename instead of a silently wrong render —
the better failure.

**12. `CLAUDE.md`'s emptiness binds twelve implementers — fold the fix into Task 13.**
The scaffold's generated `CLAUDE.md` omitted every project rule. Not deferred and not patched
mid-session: every dispatch stated the constraints explicitly, which is where implementers
actually read them, and Task 13 replaced both files with the real rules.
*Cost if wrong:* twelve tasks ran with a vague `CLAUDE.md` present.

---

## Task 3 — the week

**13. `aziLaZurich` must not depend on `en-CA` resolving to ISO order.**
Reviewer rated it minor because a shape test fails loudly — but that test runs in CI with full
ICU, which is not where this bites. On a small-icu Node build `en-CA` falls back to en-US and
yields `09/15/2026`, silently corrupting every comparison downstream. `date-ro.ts` already bans
`Intl` for the name tables for this exact reason; this reintroduced the dependency one file away.
Fixed with `formatToParts`.
*Cost if wrong:* a few lines more code than `Intl.format`, for no benefit.

**14. The four positional shape tests I specified were decoration.** — *my defect*
They pass against the broken implementation on full ICU. The implementer's five forced-fallback
tests are the ones that can observe the failure: 5 failed | 29 passed under mutation.

---

## Task 4 — the schema

**15. `z.strictObject`, plus a Romanian message for unknown keys.**
A misspelled `praznicmare:` silently drops the flag and ships a wrong-looking day on a green
build — the likeliest YAML mistake a non-technical volunteer makes. Strict-and-wrong is a loud
build failure; permissive-and-wrong is a parishioner at church at the wrong time.

**16. Normalise `ora` to `HH:MM` in the schema, so nothing downstream must remember to pad.**

**17. Omit `$schema` from the shape rather than permitting it.**
Astro's `generateJSONSchema` calls `.extend({$schema})`, and Zod 4 refuses to overwrite an
existing key on a schema carrying refinements — so including it fails *every* build. The
alternative (a no-op `.transform` so Astro skips the extend) reads as dead code, gets deleted in
a tidy-up, and the build then fails with an error pointing into Zod internals that never mentions
`$schema`.
*Cost if wrong:* a hand-added `$schema:` line is rejected with a Romanian message naming the key.

**18. `generateId` must validate the entry id — which is the schedule's primary key.**
Zod structurally cannot see it: it receives `data`, never `id`. So `2026-02-30.yml`, `2026-9-21.yml`,
a `.yaml` extension or a subfolder each yielded a silently missing or bogus day on a green build.
The schema validated every field except the one identifying the day.

**19. `.ics` UIDs are `<date>T<time>-<slug>`, not `<date>T<time>`.** — *my defect*
I changed the UID scheme to survive reordering without considering that two services legitimately
share a start time: 17:00 Spovedanie alongside 17:00 Vecernie is an ordinary parish evening.
Identical UIDs make every subscriber's calendar silently merge them into one event.
*Cost if wrong:* slightly longer UIDs.

**20. `Altceva` without `detaliu` is rejected** — otherwise the escape-hatch word itself reaches a
visitor.

---

## Task 5 — schedule logic

**21. Validate `azi` in `urmatoareaSlujba`.**
The implementer argued against it because throwing changes a contract Tasks 8/9 were not told to
expect — but I write those dispatches and neither task existed yet. Unguarded, a malformed `azi`
string-compares below everything and confidently returns the schedule's *first* service.

**22. When two services share the earliest time, the homepage card renders all of them.**
Showing only "17:00 Spovedanie" while 17:00 Vecernie is also happening is actively misleading.

---

## Task 6 — the calendar feed

**23. `DTEND` must take the next service starting strictly later.** — *my defect*
My plan took `slujbe[i + 1]`, the next by index. For two services sharing a start time the first
gets `DTEND` equal to its `DTSTART`. RFC 5545 §3.6.1 requires `DTEND` later, and a zero-length
VEVENT renders unpredictably — for a parish, a service that looks like it is not happening. Same
defect as the UID collision one layer down, missed the same way: I fixed the identifier and never
asked what the duration did.

**24. A cancelled day with an empty `slujbe` list emitted no VEVENT at all.** — *my defect*
Subscribers kept the stale event and the cancellation was invisible to exactly the people the
feed exists to inform — the opposite of what spec §8 promises. Fixed in the schema rather than in
CMS guidance, because guidance is a document nobody reads at the moment they are deleting a row.
The refinement now requires at least one service, with a message that teaches the workflow: keep
the times, tick `anulat`.
*Cost if wrong:* an editor cannot record a day with no services at all — a day they would simply
not create a file for.

**25. The slug docblock stated the opposite of what the code does.** — *my defect*
I wrote that diacritics are "folded rather than stripped so that Sfânta and Sfanta cannot produce
the same slug". Folding is definitionally what maps them *together*. The claim was also baked
into a test name, which asserted nothing of the kind. Behaviour kept — folding is right — and the
justification rewritten to name what actually prevents collisions.
This is the worst class of wrong comment: not stale, but promising a property the code
structurally cannot have, exactly where a reader decides whether a guard is still needed.

**26. The `.slice(0, 40)` cap is load-bearing and nothing recorded it.** — *my defect*
The longest service name gives a 40-character slug and a 68-octet UID line, which is what keeps
UIDs under the 75-octet fold. A folded UID breaks clients *and* silently breaks the
`/UID:(\S+)/` assertions. Now pinned by a test asserted against `NUME_SLUJBE` itself.

**27. VTIMEZONE content and `STATUS:CANCELLED` scoping must be pinned by tests.**
Three VTIMEZONE mutants survived 29/29 — any of them puts *every service an hour off*. And
nothing scoped `STATUS:CANCELLED` to its day: feed-wide application also survived 29/29, so one
cancelled Sunday would have marked the entire parish calendar cancelled.

**28. Prefix cancelled summaries with an explicit marker *and* keep `STATUS:CANCELLED`.** — *open*
The reviewer reports Google hides cancelled events from subscribed feeds, which would make the
day silently empty on the most common client. A client that shows cancelled events makes it
unmissable; one that hides them at least does not advertise a service that is not happening; the
unacceptable middle is an entry that looks ordinary. **Google's behaviour is reported, not
verified by us** — a real subscription after launch is the only way to settle it.

---

## Task 7 — tokens and colour

**29. The contrast guard was never tied to `global.css`.** — *my defect, and the most important one*
I told the implementer the contrast test "is what stops the mockup's gold coming back". It was
not: `global.css` carried a hand-transcribed `:root` block with no tie to `tokens.ts`, so setting
`--gold-text: #B08B3E` in the stylesheet alone left **all 195 tests green while shipping 2.95:1**
— the exact defect the guard existed to prevent, inside the guard I was most confident about.

**30. A guard that reads a file must prove it read something.**
The first CSS guard passed while inert: `import.meta.glob(…, {query:'?raw'})` returns an empty
string for `.css` in this pipeline, so it scanned nothing. Caught only by mutation. Now a
project-wide rule.

**31. The feast-day mark is U+2020 (`†`), not U+271D.**
U+271D — named here by number, because it is exactly the character that will not draw — is in
none of the eight shipped font files, so it rendered from an OS fallback, defeating the point of
self-hosting. U+2020 is present in all of them, and is also the conventional feast-day mark in
Romanian Orthodox calendars: the available glyph is the more correct one.

**32. The gold roles invert on dark.**
`--gold-text` is 4.67:1 on parchment but 2.26:1 on oxblood; `--gold-lt` is 2.95:1 on parchment but
4.82:1 on oxblood. Each is safe exactly where the other is not. Someone copying the global `a`
rule into the hero would have shipped 2.26:1 — *worse* than the mockup bug we started from. A
comment is not enough: `tokens.test.ts` enforces a role set per surface.

**33. Derive the forbidden set; never enumerate it.**
A denylist only ever contains what someone remembered. Equally: assert the resolved `:root` map
equals the source of truth, since equality closes aliasing, reordering, duplication and omission
in one assertion.

**34. Move the guard to built `dist` output, and name the limit it cannot reach.**
Four of the five escapes were one mistake — reading shipped bytes leaves no region to pick. The
fifth is a genuine limit: resolving an ancestor's background is a cascade computation, not a
parse. Named in the test file and closed separately by axe over the built pages.
That static guard covered **2 of 12** colour rules. It was deleted; axe took over.

---

## Task 9 — the homepage

**35. Approve the departure from the plan's `opacity: 0.75`.** — *my defect*
The axe gate's first real catch, on my own CSS: it produced six contrast violations on a
genuinely cancelled day, and `--gold-text` is unusable below opacity 0.981. Every static guard
would have passed it. A line-through is also the better design — opacity says "less important",
a strike says "not happening".

**36. Render `locatie`, on the band and on the card.**
It is in the schema, exposed by the CMS and written into the `.ics` `LOCATION`, but no task
rendered it — so a day held in a different chapel yielded a calendar that says so and a website
that does not. A card that says when but not where, on the one day the where has changed, is
worse than no card.

**37. A scoped component rule silently defeats a global one.**
Astro's scoping attribute puts a component rule at (0,3,1), outranking a global `a:hover` at
(0,1,1), so every scoped `.x a { color }` loses its hover with no test, no axe violation and no
build failure. Found in three places, including `SiteHeader` — i.e. every page of the site.

**38. Widen the phone day-name track.**
3.4px clearance is a coincidence, not a margin. **Phase 2 blocker, not a note:** German
`Donnerstag` measures 94.2px against a 64px track, so the `de` locale the plan calls "ready"
would break this row on day one.

**39. The heading may not count weeks.**
"Programul săptămânii" is singular while up to three weeks render, and after Task 10 it is
correct with JS on and wrong with JS off. A heading may not promise a date range either.

**40. Exercise the multi-week path with a fixture, never with seed data.**
The seeds are the parish's real published schedule. Invented liturgical content would be
indistinguishable from real services to a future reader, and this repo is the source of truth for
what the parish does.

---

## Task 10 — the week picker

**41. Take the picker off `/program/`; homepage only.** — *my rationale was half wrong*
I claimed this closes the "bar audited by nothing" gap. The reviewer corrected me: it **moves**
it. It stands on better grounds — `/program/` becomes a zero-JavaScript page (13,895 bytes, down
from 17,699), every week returns to Ctrl+F and to the accessibility tree, and ~1.1 KB of card
logic that page never used goes with it. The bar's own audit is Task 13's fixture-driven pass.

**42. The clock must be read once, not twice.** — *my defect*
Reading date and time separately let the card go 15 hours stale. `acumLaZurich` now returns both
from one `Date`. The implementer's guard is a Proxy `Date` asserting exactly one read — whose
control revealed *three* reads, because `acum = new Date()` in a default parameter evaluates even
when the body ignores it. Neither of us knew that; it was found by building a control rather than
reasoning about one.

**43. JS budget raised from 3,072 to 3,800 bytes.** — *my defect*
I set 3 KB when the script only revealed a week, then added card recomputation without revisiting
it, leaving 84 bytes of headroom. A budget that makes the correct architecture uncomfortable gets
met by moving rendering back into the browser — the thing it exists to prevent. 3,800 rather than
a round number because Astro inlines below ~4,096 bytes, and the ceiling belongs under the cliff.

**44. `hidden` does not hide when the author sets `display`.** — *my defect*
The picker shipped its navigation bar — two dead arrows — to every no-JS visitor, while looking
correct to anyone testing with JavaScript on, which is the state nobody checks.

**45. Normalise at presentation time; never mutate stored data.**
Reversed the implementer's trailing-period strip in the schema. Canonicalising `ora` to `HH:MM`
loses nothing; stripping punctuation turns "Capela Sf." into "Capela Sf" and changes what ships
in the `.ics` `LOCATION`, which a client stores as data rather than prose.

---

## Task 12 — the CMS

**46. Use an Astro integration, not `prebuild`/`predev` hooks.**
Three of this repo's commands bypass npm lifecycle hooks, including the `astro dev --background`
that `CLAUDE.md` documents — so a fresh clone would have served `/admin/` with a 404 for its only
script. Its own evidence closed it: `astro dev` **had** been serving the bundle as a 404.

**47. Accept English CMS chrome; do not enable the locale fetch.**
That would make the CMS's language depend on a CDN being up and on each editor's browser
settings — the exact run-time third-party dependency spec §14 removes from this page. The trade
is recorded in the spec rather than left implicit.

**48. Rename the printed card's button to `Save` rather than set `automatic_deployments: false`.**
The config change would make the label read better but would stop a save triggering a deploy,
growing the weekly routine by a step and forcing the volunteer to understand save-versus-publish.
Here every commit triggers a Pages build, so Save *does* publish: one button, one truth.

**49. The printed card named three buttons that do not exist.** — *my defect*
`Publică`, `Discard`, `Publish` — and five rows were wrong on first check. Two of them come from
one unreachable branch that `publish_mode: simple` creates; `Discard`'s label comes from a
different branch reading `entry.workflow`, a state that mode never produces. None was caught by
any test, because none of them is code.

**50. An accessible name is not what a sighted person sees.**
Sveltia renders no tooltips and several controls are icon-only: the navigation button's visible
text is the ligature `article`; "Contents" exists only as its aria-label. Documentation for a
sighted reader describes positions and icons.

---

## Task 13 — headers, CI, handover

**51. The shipped `script-src 'self'` would have killed the site's only script, invisibly.** — *my defect*
The week picker is inlined into the homepage, and `script-src 'self'` forbids inline execution.
Getting this wrong has no visible symptom: the page without JavaScript is the *designed*
fallback, so a broken policy renders a page that looks perfect and announces a service that
finished hours ago. The policy now names the script by SHA-256, substituted at `astro:build:done`.

**52. Rewrite `a11y.mjs` to drive Chrome over CDP instead of the axe CLI.**
The CLI structurally cannot run two of the three passes this project needs: `--chrome-options` is
split on `[,;]` so `window-size=390,844` arrives as two broken arguments with no escape; the size
is clamped to 500 regardless (the same clamp that made Task 9's first responsive measurement
measure nothing — twice now, a month apart, in different tools); and page scripts cannot be
disabled at all, which is the pass that covers every week the picker hides.
The differential guard is the important half: run both over the same build and diff per-rule
passes, violations *and* incompletes. Replacing a checker is where coverage goes to die.

**53. Add a 62rem pass — the Holy Week layout.**
`BandaSaptamanii` has a `min-width: 62rem` branch the default viewport never sees: seven days on
one row, the week with the most services and the most visitors of the year, audited by nothing.

**54. Shift the fixture dates by a whole-week offset — and assert the bar is visible.**
The assertion *is* the ruling. `saptamaniViitoare` renders only future weeks, so from late
December the fixture would yield one week and the pass would audit nothing, silently — this
project's most-repeated defect in new clothes. Failing loudly in December sounds more honest
until you picture someone meeting a red build in Advent and "fixing" it by deleting the pass.

**55. The `_headers` integration test must say what it does not prove.** — *open*
The live host decides what a subscriber receives; `curl -sI` is the check. Its job is to stop the
file being deleted or malformed, not to imply it has been verified.

---

## Task 13, after review — the fix round

**56. `script-src` accepted a hash nothing generated.**
The headers test asserted every hash the build computed appears in the policy, and never the
converse. An invented `sha256-…` pasted beside the placeholder built green, passed the headers
suite 19/19, passed the browser audit — and then shipped to every page `/*` covers, `/admin/`
included. `AGENTS.md` forbade hand-writing a hash there; nothing enforced it. Now equality in
both directions, and `public/_headers` must contain no `sha256-` token at all.
*Cost if wrong:* an equality assertion that a legitimate second inline script would trip — which
is the notification we want.

**57. The audit's breakpoints were transcribed from the CSS, not derived from it.**
`a11y.mjs` hardcoded `34rem` and `62rem`. Move `RandZi.astro`'s breakpoint to `48rem` and all four
browser passes stay green while the default 756px pass silently audits the phone branch — the
claim the extra passes exist to make is then false, with nothing saying so. This project's
signature defect, found inside the audit built to catch it.

**58. My fix for #57 would have passed #57's own defect.** — *my defect, and the worst-shaped one here*
I specified "at least one viewport strictly below each breakpoint and at least one at or above
it". On that same mutation, 48rem is 768px: 390 and 756 are below it, 1100 is above it — green.
The unaudited region is the **band** 769–991px, and a per-breakpoint test structurally cannot see
a band. I wrote a check that would have gone green on the exact defect it was written to catch,
inside the ruling correcting an instance of that same failure.
Replaced with band coverage: the breakpoints cut the width axis into bands, and every band must
hold an audited viewport. Strictly stronger — it implies my criterion at every breakpoint — and it
actually goes red on the mutation. Its second control is the part I would not have asked for:
*add* a breakpoint nobody moved, and watch the band alone fail. That is what makes it a guard
rather than a regression test for one mutation.

**59. The handover checklist was not in the repository.**
`.gitignore` excludes `.superpowers/`, yet `_headers` pointed a cloner there for "the exact
commands". They would fall back to the plan's pre-implementation text and be told about
`nightly.yml`, a `Publish` button and the script-killing `_headers` — the three things Task 13
exists to have changed. Now `docs/handover.md`, tracked, with a test asserting it is tracked: a
pointer to an untracked file is the same failure one level up.

**60. The docs told people to `curl` the compromised host.**
`README.md` sent the volunteer and the developer to `https://www.bor-zh.ch/…`, which serves the
WordPress install for the whole of Phase 1. The dangerous half is not the link: the CSP
verification step would have returned headers from a server this branch has never touched, and
**read as a pass**. Now the Pages deployment, with one sentence saying the domain proves nothing
until the DNS cutover.

**61. The six-hourly rebuild cannot fire from a non-default branch.**
GitHub runs `schedule` triggers only from the default branch, and the handover offered "use
`phase-1` everywhere" as an equal option — under which the workflow never fires and the six-hour
staleness bound silently becomes "until someone publishes".

**62. The axe differential was doctrine with nothing behind it — and reconstructing it was refused.**
`AGENTS.md` stated "run both checkers over the same input and diff the results" as a rule, with no
script, no procedure, and a table living only in a report inside the workspace that gets deleted
with the branch. Ruling: do not re-add `@axe-core/cli` — a dependency kept so a one-time
comparison can be re-run is a dependency that rots. The table moves into `docs/a11y-differential.md`.
Then the implementer declined the rest of my ruling, correctly: the old side's per-rule lists were
never recorded, only six aggregate counts plus a prose claim. A differential table whose old side
is *inferred* rather than recorded is exactly the "reads as a running guard" failure this item
exists to remove, one level deeper. It shipped what exists, said plainly what is missing, and
added this side's full per-rule inventory as a real baseline.

**63. Ask whether every non-ASCII character is one this project expects.**
The diacritics sweep was a four-codepoint denylist — which is why every scan called a commit
message containing U+5DEE clean. The inverse question is the stronger one and, at a 16-codepoint
inventory in our own output, the cheaper one. Both now run; the denylist stays because it produces
the better message for the case it covers.
*Cost if wrong:* a new Romanian word with a new character fails the build until someone reviews
it, which is the intent.

**64. A fourth way the tooling here lies.**
Vitest 5's default reporter swallows `console.log` from a **passing** test — it appears only under
`--reporter=verbose`. So "print what was measured, not only the verdict", which this project
states as a rule, is unfollowable by the obvious means: you read a green run and conclude it
printed. `process.stdout.write` passes through. Found by the implementer, not by me, and not in
any ruling I gave it.

---

## The final review, and what it took to close it

**65. A fifth way the tooling lies, and the one that lies about content.**
`rtk`'s `grep` silently drops `-v` and truncates at terminal width, so it returns the lines that
*do* match when asked for the ones that do not. Worse, **any `rtk <cmd> | wc -l` counts the
rendering rather than the data**: `rtk git log --oneline main..HEAD | wc -l` gives 50 against an
honest 138. I hit this myself — a ruling count of 28 one way and a larger number the other, from
one unchanged file — assumed a formatting difference and moved on.
It is worse than the other four in one respect worth naming: `diff` and the JSON reporter lie
about a **verdict**, which someone might think to double-check. `grep` lies about **content** —
the list you are reading is not the list you asked for, and there is no verdict to be suspicious
of.

**66. A number in the section about numbers that was never measured.**
The `diff` entry claimed the two `_headers` files "differ on a 330-character line". Neither file
has ever had one: the line is the policy header, 317 characters in the source and 352 in the
built copy, and it was 317 at every commit in that section's history. An inherited measurement
inside the paragraph warning against inherited measurements, surviving two review rounds. The
correction is left visible in the file — a reader who sees that one number was wrong calibrates
the others correctly.

**67. The coverage guard credited widths nothing ran.**
The band check proved every band between breakpoints held an audited viewport — but took the
audited widths from a *declaration* rather than from what a pass executed. Add a condition to the
table and nothing else, and the guard goes green while nothing runs at that width. Its own failure
message said "add a condition (and put it in the scripts)": it instructed two things and checked
the first, so someone following it exactly closes the guard without closing the gap.
The second arrangement was worse in what it hid: the fixture pass ran only two widths but was
credited the whole matrix, leaving the Holy Week row **with the week-picker bar visible** audited
by nothing at all — the one build where that bar is not `hidden`, on the week with the most
services and the most visitors of the year.
*Ruling:* the guarantee belongs to the suite, not to a declaration. Derive audited widths from
what each pass runs against the pages it loads, make an unreferenced key a failure, and add a wide
pass to the fixture build rather than exempting it.

**68. Enforce a limit rather than document it.**
The guard that checks references in `_headers` only looks inside backticks. Offered the choice
between fixing one bare filename and recording that the limit was chosen, the implementer took a
third option and enforced it: a file-shaped token outside backticks and outside a URL now fails,
with route and URL lines exempt structurally rather than by a list of names. A documented limit
decays into an excuse, and this is the file the policy lives in.

**69. The homepage grew without bound, and broke on a volunteer's ordinary save.**
The JSON island carried every future service day. Past roughly eleven months of published
schedule the page crossed its budget: the site still deployed, but CI went red on **every
subsequent save**, and the volunteer received a failure email about content that was entirely
valid, with no way to understand it or fix it. The first symptom would be a parish publishing
further ahead than usual — a sign of a well-organised parish.
Also a defect in the plan: a deviation dropped the separate data file on the grounds that the
client script "only toggles `hidden`", then a later task reinstated the payload inline to make the
card recompute, and nobody revisited the deviation that its absence had justified.
*Ruling:* bound the island to what the client can use — derived from how long the site can
plausibly go unrebuilt — and pin the bound with a far-future fixture. The page is now flat at
26 KB whether the schedule holds 48 weeks or 260.

**70. The repository violated its own central rule.**
All four forbidden codepoints were printed as glyphs in four tracked files — a test and three plan
lines. `CLAUDE.md` states that a file spelling them out could not be swept for them; that was
exactly the situation, so the repo-wide sweep the rule exists to enable could not be run. Rebuilt
from `String.fromCodePoint`, and the sweep extended to **tracked source files**, not only build
output. Inputs are where a corrupted expectation sits quietly agreeing with a corrupted source.

**71. My rulings document claimed a check that was scheduled nowhere.** — *my defect*
Of the six open items this file said "Each is in the launch checklist." It was false for two of
six. Ruling 28 shipped both a cancellation marker and `STATUS:CANCELLED` *because* Google's
behaviour was reported rather than verified, and made a real subscription the thing that settles
it — and my sentence then claimed that check lived somewhere it did not, so it would simply never
have happened.

**72. The feed's sort was a silent no-op under its own tests.**
Remove it and the whole calendar suite passes. The counter-example is ordinary — services at
17:00, 19:00 and 18:00 produce overlapping end times — and a suitable fixture already existed that
the feed's tests never used. The second silent `sort` on this project; the first was caught at
25/25 green.

**73. The JavaScript-off audit could be deleted with everything staying green.**
Delete all three of those conditions and four browser passes and 266 unit tests pass — while the
only audit that renders the weeks the picker hides is gone. The band check proved every *width*
was audited; nothing proved the *modes* were.

**74. I conflated two different 404s and would have sent someone hunting.** — *my defect*
Told that `/admin/` 404s under the dev server, I wrote that ruling 46's evidence must therefore
have been wrong. Both were true at once. Ruling 46 concerned a 404 *for the CMS bundle*, which was
fixed and stayed fixed; the remaining one is a second mechanism — Astro's dev server does not
resolve a directory index, so `/admin/index.html` was fine while `/admin/` was not. Cloudflare and
the audit's own server both resolve it, which is why nothing saw it. Acting on my inference would
have meant hunting a defect that was not there.

**75. I passed on a reviewer's byte count as though it were a property.** — *my defect*
I wrote that the homepage budget breaks at 44 weeks. The next measurement said 48. The difference
is the invented parish week — about 133 bytes a day against 145 — and neither number is a property
of this repository; the only one that is, is the constant part of the page. This project already
had that rule for timing figures, and I broke it while quoting someone else's number.

**76. The island was sliced before cancelled days were discarded.**
At 39 consecutive cancelled days the server-rendered card and the client agreed; at 40 they did
not, with the server rendering a correct card and the client then hiding it. It costs the card
rather than a wrong time — the right side of this project's line — but forty cancelled days is a
vacancy, a closure or an illness, not a hypothetical.

**77. A message written for the volunteer reached only the CI log.**
A failed page budget was made to explain, in Romanian, that the failure is probably not the
editor's file and whom to tell. It printed to the build log, which GitHub's failure email does not
carry — and the README told the volunteer that the email names the file. A good fix aimed at the
wrong surface: the one person it existed for was the one who would not see it. It now reaches the
run-summary page, the README's promise is corrected, and what the email actually contains became a
handover step, because nothing here can see it.

**78. The coverage guard was blind six times, and then the class closed.**
Hardcoded breakpoints; declared-but-never-run widths; the JavaScript-off axis; an empty media
map; a one-directional assertion; and a sixth the implementer found *before* closing the fifth.
Three different reviewers found the first five, and every fix until the last closed the
arrangement it was shown and left the next one open.
*Ruling:* stop patching arrangements and ask why the axes keep arriving. Each escape was a
dimension the guard indexed on one side only, or not at all — width, mode, page-set, direction.
Restated as *everything the built CSS demands against everything the suite runs, in both
directions, with anything unindexable named in words or red*, the class closed rather than the
instance. The restatement immediately fired on something that had been standing all along: a
`prefers-reduced-motion` query present in the built CSS through every previous version of the
guard, indexed by nothing and printed nowhere. A further hunt found three more subject-narrowings
and closed those too.
This is the single most useful thing on the project. Five rounds of patching bought five green
runs; one round of asking what the arrangements had in common bought the property.

---

## Still open

Eight things are decided provisionally and not verified here. **Six are steps of the launch
checklist, `docs/handover.md`, and each names its step below; the other two are not launch steps
and say why.**

This sentence used to read "Each is in the launch checklist." It was false for two of the six,
and the one that stung was the first: ruling #71 records how, and #28 shipped both an explicit marker *and*
`STATUS:CANCELLED` precisely **because** Google's behaviour was reported rather than verified,
and made a real subscription after launch the thing that settles it. Claiming that check was
scheduled somewhere it was not is how it would simply never have happened. The steps are named
by id now rather than asserted to exist, and `src/lib/referinte-doc.test.ts` fails if an id here
stops resolving in `handover.md` — assert that a reference resolves, not that its text appears.

1. **Google Calendar and `STATUS:CANCELLED`** (#28) — reported, not verified. `checklist:H9`
   subscribes the feed in Google Calendar specifically; `checklist:H10` cancels a test day and
   writes down what each subscriber actually sees.
2. **What Cloudflare does with `_headers`** (#55) — nothing in this repository can see it.
   `curl -sI` against the deployed site: `checklist:F1`.
3. **`connect-src` almost certainly needs the OAuth Worker's origin** — the CMS sign-in will fail
   until it is added, and the failure lands on you, not on a test. `checklist:G`.
4. **CI has never run.** There is no remote. Chrome/chromedriver version skew is absorbed by
   `DETECT_CHROMEDRIVER_VERSION`, itself unverified. `checklist:A4`.
5. **The CMS placeholders were accepted, not rejected** — `/admin/` loads the config and renders a
   sign-in screen echoing "select the root directory of the <REPO> repository". The failure lands
   at the sign-in attempt, where you meet it. `checklist:D1`.
6. **What GitHub's build-failure email actually contains** (#77) — the explanation written for
   the volunteer reaches the run-summary page; whether any of it survives into the email is not
   observable from here. `checklist:H11` asks you to fail one build on purpose and write down
   what arrives, because the whole point of that message is the person who reads the email.
7. **One arrangement of the coverage guard is open, and named rather than half-closed** (#78) —
   a pass's page-set label is free text and the audit takes its directory independently, so
   nothing inside a run ties a label to a build. **Deliberately NOT in the launch checklist.**
   It is not reachable by editing the table — both callers hardcode their directory beside their
   key — and the two builds share page names, so the label cannot be derived. Nothing a person can
   do at launch changes it; it is a note for whoever next touches `scripts/a11y.mjs`, and an
   honest eighth beats a seventh patched silent.
8. **German is a Phase 2 blocker, not a note** (#38) — `Donnerstag` breaks the phone day-name row.
   **Deliberately NOT in the launch checklist, and that is the ruling rather than an oversight.**
   It is a design constraint on a phase that has not been planned, not something anybody can do or
   check at launch: there is no German copy to break the row with until Phase 2 adds it. Putting
   it on a checklist somebody works through in an evening would mean a step that cannot be
   completed, and a step that cannot be completed is how a checklist stops being worked through.
   It belongs to whoever writes the Phase 2 plan, which is why it is here and not there.

---

## What generalises

The defects on this project were almost all one shape: **a check that looked like it was checking,
and was not.** The rules that came out of it are in `CLAUDE.md`, under "How this project decides
whether something is actually checked". They were each paid for once.
