# bor-zh.ch — working rules

Static Astro site for the Romanian Orthodox parish of St Nicholas, Zürich. It replaces a
WordPress install that was compromised twice in eighteen months; almost every rule below
exists because something on this project looked right and was not.

Design authority: `docs/superpowers/specs/2026-09-15-parish-site-rewrite-design.md`.
`CLAUDE.md` is a symlink to this file, so the two cannot drift.

## Rules that are not negotiable

- **Diacritics are comma-below.** Romanian's letters are U+0218/U+0219 (S/s) and
  U+021A/U+021B (T/t). The Turkish cedilla forms at U+015E/U+015F and U+0162/U+0163 are a
  defect here, not a variant spelling — and the shipped fonts contain all four, so a
  corrupted character draws as a perfectly formed glyph. **No screenshot, dev server or
  careful look can ever tell you anything about this class of bug.** Dump the codepoints.
  The forbidden four are named by number and never printed as glyphs in any file this
  repository **tracks**, including this one: a file that spelled them out could not be
  swept for them, and nothing in it could be copied without carrying one. The four numbers
  and the detector live in one place, `src/lib/cedile.ts`, built with
  `String.fromCodePoint` rather than as escapes.
  **That rule was false for the whole of Phase 1, in the two files best placed to make it
  false.** `date-ro.test.ts`'s guard was a character class of all four, on disk; the plan
  document printed all four inside the paragraph forbidding them, and three test sketches
  copied from it carried them onward. Seventeen occurrences in one file and four in the
  other. Each looked right; each was the decoded-escape hazard three paragraphs below
  landing exactly where it does most damage, in an *expectation*, where a corrupted guard
  agrees with a corrupted source forever. And for as long as they were there, the
  repo-wide sweep this rule exists to enable **could not be run**: it returned hits a
  reader had to learn to ignore, which is the habit the rule is written to prevent.
  So the rule is now a test rather than a sentence. `src/lib/diacritice-surse.test.ts`
  sweeps **every tracked file** — sources, tests, documents, `public/admin/`, `_headers`,
  this file — and fails naming path and offset. It takes its subject from `git ls-files`,
  so it cannot fall behind the repository; what is git-ignored is outside it and both
  halves are deliberate: `public/admin/sveltia-cms.mjs` is third-party and legitimately
  Turkish, and `.superpowers/` is scratch whose review diffs must be able to quote the
  corrupted characters as evidence. Binary files are named one by one in `BINARE`, and any
  tracked file that is neither named there nor decodable as text fails, so that list
  cannot fall behind either. It asks only the cedilla question: the stronger
  "is every non-ASCII character expected" check does not transfer to sources, which carry
  over thirty distinct non-ASCII characters between English prose, Romanian comments and
  deliberate astral test fixtures. **That is a real gap**: a look-alike from another
  alphabet in a source file is not caught. One was introduced and caught by measurement
  while that file was being written — a Cyrillic U+0435 inside an identifier.
  `src/lib/diacritice.itest.ts` sweeps every text file in `dist/` **except the vendored
  Sveltia bundle**, whose own i18n tables legitimately contain Turkish; the exclusion is
  by path, the paths come from the installed package, and the test asserts both halves —
  that the bundle really is excluded and that our own files under `admin/` really are not.
  "Every text file" means a text extension **or** a named extensionless one. `_headers`
  has no extension and was outside both sweeps until this was written down: it is ours, it
  is text, and it carries the policy this project turns on. A second case fails on any
  extensionless file in `dist/` that nobody has named, so the list cannot fall behind the
  build the way it did.
  It asks two questions of each file: "is this one of the four wrong characters?", and the
  stronger "is every non-ASCII character one this project expects?" against a list of
  twenty-two. The second exists because a stray U+5DEE once passed every scan the first
  could make. A new character in the output fails until somebody names it.
- **Dates are `YYYY-MM-DD` strings; times are `HH:MM` local strings.** Never a UTC instant
  for a service — a Liturgy at 10:00 is at 10:00 across a DST change. `aziLaZurich()` and
  `oraLaZurich()` in `src/lib/week.ts` are the only timezone-aware functions; everything
  downstream takes plain strings.
- **`#B08B3E` and `#C8A45C` are ornament only — never text** at any size. On the page they
  are 2.95:1 and 2.18:1. Use `--gold-text` (#8A6A28, 4.67:1) — but only on the page: the
  roles INVERT on the oxblood hero, where `--gold-text` is 2.26:1 and `--gold-lt` is
  4.82:1. `ROLURI_TEXT` and `ROLURI_TEXT_PE_OXBLOOD` in `src/lib/tokens.ts` are the two
  sets, and `tokens.test.ts` enforces both.
- **The parent directory is not part of this repository.** It holds several GB of forensic
  backups of the compromised server and a file of database credentials. Never `git add`
  anything from outside this root, and never weaken `.gitignore`.
- **Import Zod as `astro/zod`**, never a direct `zod` dependency — a second copy breaks
  `instanceof` checks.
- The service names in `public/admin/config.yml` must stay identical to `NUME_SLUJBE` in
  `src/lib/schema.ts`. A test fails if they drift.
- **`script-src` in `public/_headers` carries a placeholder, not a hash.** Task 10's week
  picker is inlined into the homepage, and `script-src 'self'` forbids inline execution —
  so the shipped policy names the script by SHA-256, substituted at `astro:build:done` by
  `scripts/csp-hash.mjs`. Do not hand-write a hash there and do not add `'unsafe-inline'`.
  Getting this wrong has no visible symptom: the page without JavaScript is the designed
  fallback, so a broken policy renders a page that looks perfect and announces a service
  that finished hours ago.

## Tooling here lies to you in five specific ways

**Test verdicts: use the process exit code, never `.vitest/json/output.json`.** The `rtk`
wrapper writes that file whether or not a JSON reporter was asked for, and when its parse
fails — the normal case when stdout is piped — the previous file stays. A stale green
report has already inverted every mutation verdict once on this project. It goes stale in
both directions: during the task 13 fix round the file sat fifty minutes untouched across
a session of vitest runs, reporting `numTotalTests 19`, `numPassedTests 18`,
`success: false` — a red verdict, for a suite that was green at 250 unit and 137
integration tests, naming a test count that had stopped being current two commits earlier.
For readable output use `rtk proxy npx vitest run …`, or the binary directly at
`./node_modules/.bin/vitest`, which bypasses the filter altogether.

**`diff` lies too, and in the worse direction.** `rtk`'s `diff` reports `public/_headers`
and `dist/_headers` as `[ok] Files are identical` and exits 0, when what they differ on is
line 32 — the `Content-Security-Policy` header itself, 317 characters in the source and 352
in the build, the substituted hash being the whole difference between a working policy and
one that silently kills the site's only script. It also exits 0 when it *does* print a
difference. Use `rtk proxy diff`, which exits 1 on that same pair, and read the exit code.
(An earlier version of this paragraph said "a 330-character line". Neither file has ever
had one; the number was never measured. That is this section's own failure mode, and it
survived two rounds here before anyone put a `.length` on it.)

**Escape sequences of the form backslash-u followed by four hex digits do not survive
being written to disk.** Both the Bash heredoc — even quoted, `<<'EOF'` — and the
file-writing tools decode them into the literal character first, silently. A guard written
as a character class of U+015F and U+0163 lands on disk containing those very characters:
still functionally correct, but the "correct by construction" property it existed for is
gone, and a corrupted expectation would then happily agree with a corrupted source. Build
such characters from numbers — `String.fromCodePoint(0x015f)` — or write a placeholder and
post-process it with a script that never emits the backslash and the `u` adjacently.
Re-measured: a quoted heredoc carrying `X`, the escape for U+00E9 and `Y` lands on disk as
three characters, not eight.

**A `console.log` in a test is invisible on the run that matters.** Vitest 5's default
reporter shows a passing test's `console.log` nowhere at all — not with `--silent=false`,
only under `--reporter=verbose`. So the rule below this section, *print what was measured,
not only the verdict*, cannot be followed with `console.log`: measured with a two-case
probe, the failing case's line is printed under a `stdout |` header and the passing case's
is not — so the print disappears on exactly the green run a later reader would check the
number against, and appears only on the red one, which is the wrong way round.
`process.stdout.write` passes through the reporter in both cases.
The three prints this project relies on all use it — the inline-script hashes and the paths
`public/_headers` names, both in `headers.itest.ts`, and the full non-ASCII inventory in
`diacritice.itest.ts`. Measured both ways on that last one.

**`grep` lies about content, which is worse than lying about a verdict.** The four above
misreport an *answer*, and an answer is something you might think to check twice. `rtk`'s
`grep` misreports the *list* — what you are reading is not what you asked for, and there is
no verdict sitting beside it to be suspicious of. Two agents hit it in one session, an hour
apart, on different flags:

- **`-v` is dropped.** `rtk grep -v X <file>` announces `N matches in 1 files:` and then
  lists the lines that *do* match — the inverse of what was asked, silently. Lines are also
  cut at terminal width, mid-word. First measured on a throwaway 38-line file (twelve
  reported, twenty-six the honest answer), re-taken against a tracked one so a reader can
  reproduce it from a clone: `rtk grep -v '#' public/_headers` announced 146 and listed
  matching lines, where `rtk proxy grep -vc` says 15.
- **Piping counts the display, not the matches.** Piped, `rtk grep` still emits its
  *rendering*: a header line, a blank, at most **twenty-five** result lines, and one
  `[+N more]`. So `rtk grep -n X <file> | wc -l` is **28** for any file with more than
  twenty-five matches, and 28 is a fact about the cap rather than about the file. Measured
  four times now, on a ledger at 69 matches, at 70, at 73, and on `public/_headers` at 146:
  **28 every time.** The honest count comes from `rtk proxy grep -c`, or from `node`. The
  earlier version of this bullet cited that ledger's 69 as if it were the point; the ledger
  is appended to between rounds, so the citation decayed — inside the section about citations
  that decay. What does not decay is the 28 and the reason for it. An agent got 28 one way
  and a larger number the other, concluded a file must have been reformatted between the two
  calls, and moved on, which is the behaviour this paragraph exists to stop.

Use `rtk proxy grep` and read the whole output. And treat anything downstream of a filtered
`grep` — a `wc -l`, a `head`, a count quoted in a report — as a measurement of the filter
rather than of the file. Every count in this file was taken with `node` reading the file
directly, for that reason.

## How this project decides whether something is actually checked

Every one of these was paid for.

- **A check that prints a problem and exits 0 ships it.** Detecting and failing are
  different features.
- **A guard that reads files must prove it read something.** A missing `dist/` must fail,
  not pass quietly; every "X is absent" claim needs a positive control showing the
  detector can fire.
- **A guard that derives its subject from the artifact it checks can only check what it
  recognised.** Take the expected set from somewhere the defect cannot edit — that is why
  `CSP_ASTEPTAT` is written out by hand rather than read off a run. The exception is when
  following the artifact *is* the property: `a11y.mjs` derives the layout breakpoints from
  the built CSS precisely because a hand-written copy of them went stale without a symptom.
  Say which of the two a list is, and why, beside it.
- **Assert that a reference resolves, not that its text appears.** A rule for a path that
  does not exist looks exactly like a rule that works.
- **Print what was measured, not only the verdict.** The number is what a later reader
  trusts when a comment disagrees with it.
- **Static reading is the wrong tool for a claim about what a person sees.** Contrast,
  focus rings, the cascade and Content-Security-Policy are all decided by a browser, so a
  browser is what checks them: `scripts/a11y.mjs`.
- **Ask a browser for a narrow viewport and check you got it.** Chrome refuses a window
  under about 500px, silently. Task 9 asked for 375px and measured 500px; Task 13 asked for
  390px and measured 500px, in a different tool, a month apart. `Emulation.setDeviceMetrics`
  `Override` over CDP is the only thing that honours the request, and `innerWidth` belongs
  beside every number so a third occurrence cannot hide.
- **Replacing a checker is where coverage goes to die.** The new one passes, everyone
  relaxes, and nobody notices it checks less. Run both over the same input and diff the
  results — every rule id, in passes, violations *and* incompletes, because a rule that
  stops running reports no violations either. This was done once, for `a11y.mjs` at
  `bed5e4e`, and **nothing re-runs it**: `@axe-core/cli` is deliberately not a dependency
  any more. `docs/a11y-differential.md` carries the result, the versions on both sides,
  this side's rule inventory and the procedure to redo it. It is a gate, not a guard, and
  saying so is the point — doctrine with no implementation reads as a running check.
- **An explicit gap beats a vacuous pass.** Where something cannot be checked here — what
  Cloudflare does with `_headers`, what the CMS does after a real sign-in — say so and say
  what to run instead.

## Commands

`npm run dev` · `npm test` · `npm run check` · `npm run budget`

`npm run test:build` — build, integration tests over `dist/`, the default-width browser
pass, then the budget.

`npm run test:all` — all of the above plus the phone (390px), wide (1100px) and
week-picker passes. A green `npm test` is not this. **CI runs `npm run check` as well
(`ci.yml`), and `test:all` does not include it** — a type error passes here and fails there,
so run both before you push.

`npm run a11y` · `a11y:mobil` · `a11y:larg` · `a11y:selector` — the browser passes on
their own. Each serves the built site with the `_headers` of the build it is auditing and
fails on any Content-Security-Policy violation the policy did not already expect. The first
three audit `dist/`; `a11y:selector` builds a throwaway site from `src/lib/fixturi.ts` into
a scratch directory and audits that one's `_headers`, which is the same file's content from
a different build, not `dist/_headers`.

Every pass also derives the layout breakpoints from the CSS of the pages it loads and fails if
a band of widths between them is audited by nobody — so a breakpoint that moves or one that is
added is a red build, not a silently wrong claim. **Audited means a pass runs there, over those
pages.** The widths come from `TRECERI` in `scripts/a11y.mjs`, one entry per pass, each naming
the command `package.json` runs, the set of pages it loads and the conditions it loads them
under; a `CONDITII` key no entry names, an entry `npm run test:all` never reaches, and a set of
pages credited with another set's widths are each a failure naming the thing. `CONDITII` on its
own is a declaration, and crediting it cost this project two invisible holes — an 850px viewport
nothing ran at, and the week band's 62rem branch with the picker bar visible, which until this
round nothing on the project had ever audited.

**Width is not the only axis, and the other two were each a pass that could be deleted with
nothing going red.** A condition must declare at least one media query: `medii: {}` made the
"every declared breakpoint still exists" assertion a loop over nothing, and with every `medii`
emptied you can move a breakpoint from 34rem to 30rem and stay green on all four passes. And
every set of pages must be audited with **scripts off** by some pass, or be named in
`FARA_JS_MOTIVAT` with the reason in words. Deleting the three JS-off conditions left four
browser passes and the whole unit suite green while removing the only audit that renders the
weeks the picker hides — axe skips hidden elements and drives Chrome with JavaScript on, so
with the picker working the homepage band is audited on one week out of three. `proba` is the
one legitimate exemption: its bar exists only with scripts running. Both directions fail, so an
exemption for a set that does have a scripts-off pass is red too. Each pass prints the states
it audited beside the widths.

**How long `test:all` takes is a property of the machine, not of this repository.** Well under a
minute on all three machines it has run on — 36 to 42 s over nine runs — so quote a range or
nothing. The top of that range moved when the selector pass gained its third condition: 40, 40
and 42 s on the machine measured after that change, against 36 to 40 before it. What is invariant
is the shape: four Astro builds and four headless-Chrome launches dominate the wall time, so it
tracks the browser and the disk rather than the number of tests.

Use `astro dev --background`, then `astro dev stop|status|logs`.
