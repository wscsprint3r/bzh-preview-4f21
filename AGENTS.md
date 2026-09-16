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
  The forbidden four are named by number and never printed as glyphs anywhere in this
  repository, including here: a file that spelled them out could not be swept for them,
  and nothing in it could be copied without carrying one.
  `src/lib/diacritice.itest.ts` sweeps every text file in `dist/`.
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

## Tooling here lies to you in three specific ways

**Test verdicts: use the process exit code, never `.vitest/json/output.json`.** The `rtk`
wrapper writes that file whether or not a JSON reporter was asked for, and when its parse
fails — the normal case when stdout is piped — the previous file stays. A stale green
report has already inverted every mutation verdict once on this project. For readable
output use `rtk proxy npx vitest run …`, which bypasses the filter.

**`diff` lies too, and in the worse direction.** `rtk`'s `diff` reported
`public/_headers` and `dist/_headers` as `[ok] Files are identical` when they differ on a
330-character line, and it exits 0 even when it does print a difference. Use
`rtk proxy diff`, and read the exit code.

**Escape sequences of the form backslash-u followed by four hex digits do not survive
being written to disk.** Both the Bash heredoc — even quoted, `<<'EOF'` — and the
file-writing tools decode them into the literal character first, silently. A guard written
as a character class of U+015F and U+0163 lands on disk containing those very characters:
still functionally correct, but the "correct by construction" property it existed for is
gone, and a corrupted expectation would then happily agree with a corrupted source. Build
such characters from numbers — `String.fromCodePoint(0x015f)` — or write a placeholder and
post-process it with a script that never emits the backslash and the `u` adjacently.

## How this project decides whether something is actually checked

Every one of these was paid for.

- **A check that prints a problem and exits 0 ships it.** Detecting and failing are
  different features.
- **A guard that reads files must prove it read something.** A missing `dist/` must fail,
  not pass quietly; every "X is absent" claim needs a positive control showing the
  detector can fire.
- **A guard that derives its subject from the artifact it checks can only check what it
  recognised.** Take the expected set from somewhere the defect cannot edit.
- **Assert that a reference resolves, not that its text appears.** A rule for a path that
  does not exist looks exactly like a rule that works.
- **Print what was measured, not only the verdict.** The number is what a later reader
  trusts when a comment disagrees with it.
- **Static reading is the wrong tool for a claim about what a person sees.** Contrast,
  focus rings, the cascade and Content-Security-Policy are all decided by a browser, so a
  browser is what checks them: `scripts/a11y.mjs`.
- **An explicit gap beats a vacuous pass.** Where something cannot be checked here — what
  Cloudflare does with `_headers`, what the CMS does after a real sign-in — say so and say
  what to run instead.

## Commands

`npm run dev` · `npm test` · `npm run check` · `npm run budget`

`npm run test:build` — build, integration tests over `dist/`, the default-width browser
pass, then the budget.

`npm run test:all` — all of the above plus the phone (390px), wide (1100px) and
week-picker passes. **This is what CI runs; a green `npm test` is not.**

`npm run a11y` · `a11y:mobil` · `a11y:larg` · `a11y:selector` — the browser passes on
their own. Each loads the built site with `dist/_headers` applied and fails on any
Content-Security-Policy violation the policy did not already expect.

Use `astro dev --background`, then `astro dev stop|status|logs`.
