# The axe differential: `@axe-core/cli` against `scripts/a11y.mjs`

Replacing a checker is the easiest place in a project to lose coverage without anyone
noticing. The new one passes, everyone relaxes, and nobody finds out for a year that it
checks less. So when `scripts/a11y.mjs` stopped driving `@axe-core/cli` and started
injecting `axe-core` into a Selenium-driven Chrome, the swap was not accepted on "it still
passes": both engines were run over the same build and their results compared rule id by
rule id, in **passes, violations and incompletes** — not only in violations, because a rule
that silently stops running reports no violations either.

**This was a one-time gate, at one commit, and it is not re-run by anything.** That is a
deliberate choice, not an oversight: `@axe-core/cli` is gone from `package.json` and from
the lockfile, and a dependency kept only so a finished comparison can be repeated is a
dependency that rots. What this file exists for is that the *evidence* should outlive the
comparison, and that the next person who replaces a checker here should find the procedure
rather than only the rule.

## Why the CLI had to go

| | |
|---|---|
| `--chrome-options` | parsed with `val.split(/[,;]/)`, so `window-size=390,844` arrives as `--window-size=390` and `--844`. No escape exists. |
| `window-size` itself | clamped — launching headless Chrome with `390,844` measured `innerWidth === 500`. |
| disabling the page's scripts | no option at all |

`Emulation.setDeviceMetricsOverride` and `Emulation.setScriptExecutionDisabled` do the first
two exactly, and both are CDP-only.

## What was compared

| | |
|---|---|
| Commit the swap landed at | `bed5e4e` |
| Engine, both sides | `axe-core` **4.13.0** |
| Old driver | `@axe-core/cli` **4.13.0** (`^4.13.0` in `package.json`, pinned to 4.13.0 in the lockfile; removed at `bed5e4e`) |
| New driver | `selenium-webdriver` 4.44.0 + `chromedriver` 153.0.0, `axe-core/axe.min.js` injected |
| Input | the same `dist/`, the same viewport, the same two pages |

Result, as recorded at the time:

```
IDENTIC  / passes: CLI 30 / nou 30           IDENTIC  /program/ passes: CLI 31 / nou 31
IDENTIC  / violations: CLI 0 / nou 0         IDENTIC  /program/ violations: CLI 0 / nou 0
IDENTIC  / incomplete: CLI 0 / nou 0         IDENTIC  /program/ incomplete: CLI 0 / nou 0
```

**What that record does and does not contain.** The comparison was made rule id by rule id
and the verdict `IDENTIC` is about the id sets, not merely about their sizes — but the id
lists themselves were never written down, so what survives from the CLI side is the six
counts above. The lists below fix that from this side on: they are a baseline a future
differential can be diffed against without having to trust anyone's summary.

## The rule inventory on this side

Measured at commit `678dedd`, `axe-core` 4.13.0, condition *birou, JS pornit* (the default
viewport, 756 CSS px, page scripts running) — the condition the CLI comparison was made
under. Captured with `A11Y_REGULI=1 node scripts/a11y.mjs`.

`/` — **30 passes, 0 violations, 0 incomplete**:

```
aria-allowed-attr aria-conditional-attr aria-hidden-body aria-hidden-focus
aria-prohibited-attr aria-valid-attr aria-valid-attr-value bypass color-contrast
document-title empty-heading heading-order html-has-lang html-lang-valid
landmark-banner-is-top-level landmark-contentinfo-is-top-level landmark-main-is-top-level
landmark-no-duplicate-banner landmark-no-duplicate-contentinfo landmark-no-duplicate-main
landmark-one-main landmark-unique link-name list listitem meta-viewport
meta-viewport-large page-has-heading-one region skip-link
```

`/program/` — **31 passes, 0 violations, 0 incomplete**: the same thirty, plus
`avoid-inline-spacing`.

`admin/index.html` is not in this table: it is excluded from the axe audit by exact path
(`FARA_AXE`), for the reason given at the top of `scripts/a11y.mjs`. It is *not* excluded
from the Content-Security-Policy check.

## How to redo it

Needed if the engine, the driver or the browser is replaced again. Nothing in the repository
runs it, and nothing should — it is a gate, not a guard.

```bash
# 1. The build both sides will look at. Do not rebuild between the two runs.
npm run build

# 2. This side, with rule ids.
A11Y_REGULI=1 node scripts/a11y.mjs 2>&1 | grep '^    REGULI' > /tmp/nou.txt

# 3. The other side, installed for the length of the comparison and not saved.
#    --no-save keeps it out of package.json and the lockfile.
npm install --no-save --no-package-lock @axe-core/cli@4.13.0
npx http-server dist -p 4321 --silent &          # or any static server
npx axe http://localhost:4321/ http://localhost:4321/program/ \
    --save /tmp/cli.json --exit || true
kill %1

# 4. Diff the three id sets per page. `--save` writes passes, violations AND
#    incomplete; compare all three. A rule missing from *passes* is the failure
#    this whole exercise exists to catch, and it produces no violation.
node -e '
  const r = require("/tmp/cli.json");
  for (const p of r) for (const k of ["passes","violations","incomplete"])
    console.log(p.url, k, (p[k]||[]).map(x=>x.id).sort().join(" "));
'

# 5. Remove it again.
npm uninstall --no-save @axe-core/cli
```

Compare the two outputs set by set, per page and per category. **A difference in `passes`
matters as much as one in `violations`**: a rule that quietly stopped running is exactly the
regression a "still green" check cannot see.

If the axe-core versions differ between the two sides, the rule sets will differ for reasons
that have nothing to do with the driver — pin both to the same version first, or the
comparison means nothing.
