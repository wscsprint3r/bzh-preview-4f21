## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Romanian text: dump codepoints, never trust what you typed

User-facing strings are Romanian with **comma-below** diacritics: ș is U+0219, ț is
U+021B — never the Turkish cedilla forms ş U+015F, ţ U+0163. They are near-identical in
most fonts, so verify by codepoint, never by eye.

**"It rendered fine" is not evidence.** The self-hosted fonts contain the cedilla forms
as well as the comma-below ones — verified by decoding the cmap of every latin-ext face
shipped in Task 7: all four of U+015E, U+015F, U+0162, U+0163 are present in Cormorant
Garamond (roman and italic) and in Spectral. A corrupted character therefore draws as a
perfectly formed glyph: no box, no fallback, no visual clue at all. Screenshots, dev-server
checks and "I looked at it" can never tell you anything about this class of bug, which is
why the codepoint scan is the only check that counts.

**Escape sequences of the form \u followed by four hex digits do not survive being
written to disk.** Both the Bash heredoc (even quoted, `<<'EOF'`) and the file-writing
tools decode them into the literal character first, silently. A guard written as
`/[\u015F\u0163]/` lands on disk as `/[şţ]/` — still functionally correct, but the
"correct by construction" property it existed for is gone, and a corrupted expectation
would then happily agree with a corrupted source.

Repro:

```
$ cat > probe.txt <<'EOF'
literal-escape: \u015F \u021B \u0103
EOF
$ od -c probe.txt
0000000   l   i   t   e   r   a   l   -   e   s   c   a   p   e   :
0000020    ş  **       ț  **       ă  **  \n
```

Workaround — post-process with a script that never emits the two characters adjacently,
so there is nothing to decode:

```
node -e "…s.replace(/__U([0-9A-F]{4})__/g, (m,h) => String.fromCharCode(92)+'u'+h)…"
```

**After writing any file containing Romanian, dump its codepoints** and assert that none
of U+015E, U+015F, U+0162, U+0163 appear. `src/lib/date-ro.test.ts` and
`src/lib/schema.test.ts` each carry a test that does this for their own tables — copy that
pattern rather than inventing one.

## Test verdicts: use the exit code, never the JSON report

The `rtk` wrapper intercepts `vitest` and writes `.vitest/json/output.json` **whether or
not you asked for a JSON reporter** — confirmed by running with no reporter flag and
watching it rewritten. Every `Bash` call here is a pipe, so stdout is never unredirected
and the wrapper's parse-failure path is the normal case; when it fails to parse, the
previous file stays. A stale green report has already inverted every mutation verdict
once on this project.

Read verdicts from the **process exit code**. For readable output use
`rtk proxy npx vitest run …`, which bypasses the filter. If you must persist results,
delete `.vitest/json/output.json` first.

Same family as the backslash hazard above: the tooling silently substitutes something
plausible for what you asked for, and both have now bitten someone on the very guard
written to catch them.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
