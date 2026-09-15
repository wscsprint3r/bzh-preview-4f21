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

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
