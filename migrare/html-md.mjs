import TurndownService from 'turndown';
import { normalizeaza } from './diacritice.mjs';

/**
 * Elementor's rendered preamble, which is chrome rather than content.
 *
 * Every prose page starts with the same two things: a `Layouts: Popup` marker
 * the page builder emitted, and a breadcrumb line that repeats the section and
 * the page's own title. Neither belongs in the content - the title is
 * frontmatter and the breadcrumb is navigation this site renders itself.
 *
 * ANCHORED TO WHAT IT MATCHES, NOT TO POSITION. An earlier shape of this
 * function dropped "everything before the first heading", which is correct on
 * the nine pages and eats the opening paragraph of every one of the 45 posts,
 * because posts have no preamble at all. So each piece is removed by
 * recognising itself, and a document without them comes back unchanged.
 *
 * NOT IDEMPOTENT BY CONSTRUCTION, and that is a real property to know about
 * rather than a bug to chase: applying this twice is not guaranteed to equal
 * applying it once, because a second pass strips whatever NOW sits at the top
 * if that happens to be preamble-shaped - a risk only if real content itself
 * starts with something that looks like a `Layouts:` line or a breadcrumb.
 * `laMarkdown` already calls this function, so **callers pass raw HTML to
 * `laMarkdown` and never call `dezbracaPreambul` themselves first** - calling
 * both strips twice.
 *
 * Measured against all 71 real published posts and pages, 2026-09-17
 * (`migrare/verifica-preambul.mjs`, run by hand - it needs Docker and the
 * dump, so it is not part of `npm test`): **16** documents carry a
 * `<p>Layouts:...</p>` marker; **17** are changed by one strip. Two
 * different definitions, not a measurement disagreement - the difference is
 * `pastorale`, which has a breadcrumb but no `Layouts:` line, so it counts
 * in the second figure and not the first. Under either definition: **0**
 * documents leave residue of either marker after one strip, and **0** are
 * non-idempotent under a second pass. These are properties of this corpus,
 * not of the regexes; `verifica-preambul.mjs` checks them on demand, not
 * assumed to hold forever.
 *
 * A KNOWN BOUNDARY, left alone rather than widened: the breadcrumb's section
 * name is matched as `[^<>]{0,60}`, which forbids `<` - so a section name
 * wrapped in its own link (`<a href="...">Parohia noastra</a> &gt; ...`)
 * would not be recognised and would survive un-stripped. Measured: 5 of the
 * 71 real documents have an `<a>` in their first 300 characters, and 0 of
 * them leave preamble residue after one strip - no linked breadcrumb exists
 * in this corpus. Widening the pattern for a case that does not occur would
 * only make it more likely to eat something it should not.
 */
export function dezbracaPreambul(html) {
  let rezultat = html.replace(/^\s*<p>\s*Layouts:[^<]*<\/p>/i, '');
  // The breadcrumb: optional wrapping <p>, some text, `&gt;` or `>`, then the
  // page title inside <u><b>. Only matched at the very start of the document,
  // so a `>` or a `<u><b>` appearing later in real content is never touched.
  rezultat = rezultat.replace(
    /^[\s\t]*(?:<p>)?[^<>]{0,60}?(?:&gt;|>)\s*<u><b>[^<]*<\/b><\/u>\s*(?:<\/p>)?/i,
    '',
  );
  return rezultat;
}

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

// This content comes off a server compromised twice. Neither element is
// expected to carry anything a visitor should read, and the correct default
// for both is to drop them rather than transcribe their contents as visible
// prose - measured in the migration scope (71 published posts/pages): 0
// <script>, 2 <style> (`who-we-are`, `church`, both outside this phase's
// nine pages).
turndown.remove(['script', 'style']);
// Turndown core has no rule for <table> at all, so left to the default it
// falls through to the ordinary element handling and every cell becomes a
// separate paragraph, with the row/column association gone. Measured:
// exactly one <table>, in `praznicul-nasterii-domnului-hristos` (10 cells,
// one of them a merged 3-column heading row). Astro's Markdown renderer
// passes raw HTML through unmodified, so keeping the table costs no
// dependency and loses nothing.
turndown.keep(['table']);

/**
 * Whatever Turndown's own whitespace handling does not already reach.
 *
 * Turndown's `collapseWhitespace` (see its source) already turns every run
 * of spaces, tabs and newlines inside a real text node into one space -
 * skipping only `<pre>`, and this corpus has none - and its own
 * `postProcess` trims `[\t\r\n]` off both ends of the whole document and
 * caps consecutive blank lines at two newlines, structurally, regardless of
 * input. Measured against all 71 published posts and pages run through
 * `dezbracaPreambul` + Turndown + `normalizeaza`: no tab and no run of three
 * or more newlines ever reaches this function. An earlier version of this
 * function still stripped both "just in case" - dead code that did nothing
 * on this corpus and would have actively corrupted a fenced code block's
 * indentation on the day this corpus ever grew one.
 *
 * TWO THINGS survive Turndown's own cleanup, and this handles only those:
 *
 * 1. A wholly blank line carrying indentation forward from a list item.
 *    Measured on a fixture shaped like `cursuri-de-pictura`'s real markup
 *    (`<li><p>...</p></li>`, WordPress's block-editor list shape): Turndown
 *    emits a line of nothing but four spaces between list items. Cosmetic
 *    noise, not Markdown syntax - CommonMark treats an all-whitespace line
 *    as blank either way - so it is safe to empty.
 * 2. A LEADING non-breaking space. Turndown strips one real leading space
 *    from the very start of a document, but its check is for the literal
 *    ASCII space character - a leading `&nbsp;` is a different character
 *    and survives Turndown untouched, becoming an ordinary space only
 *    afterwards, when `normalizeaza` runs on Turndown's output. `.trim()`
 *    catches that. Measured as a no-op on all 71 real documents: this is
 *    defence for content this corpus does not currently contain, not a fix
 *    for anything broken in it.
 *
 * NEITHER OF THESE IS THE TWO-TRAILING-SPACES-BEFORE-A-NEWLINE THAT TURNDOWN
 * DELIBERATELY EMITS FOR A `<br>` - CommonMark's hard-line-break syntax,
 * measured at 44 of them across 13 real documents, addresses and
 * service-time lists among them. A line is only touched here when there is
 * NOTHING before its trailing whitespace; a line with real content in front
 * of a hard break is left exactly as Turndown wrote it. An earlier version
 * of this function stripped `[ ]{2,}\n` unconditionally and destroyed every
 * one of those 44 breaks - this is the fix for that, not a variant of it.
 */
function curataSpatii(md) {
  return md.replace(/^[ \t]+$/gm, '').trim();
}

/**
 * HTML in, Markdown out - Turndown converts, THEN `normalizeaza` runs.
 *
 * That order is load-bearing, not a stylistic choice. `post_content` is
 * WordPress HTML: an entity like `&nbsp;` or `&#160;` is plain ASCII TEXT to
 * `normalizeaza` - an ampersand and some letters or digits, nothing it
 * recognises - right up until something decodes it, and Turndown's HTML
 * parser is what decodes it, turning the entity into the actual character
 * U+00A0. Normalising before conversion would run `normalizeaza` over a
 * document that does not yet contain the non-breaking space it exists to
 * remove, and Turndown would manufacture it back afterwards, unfiltered:
 * measured in the 2026-08-27 dump at 14,961 `&nbsp;` plus 6 `&#160;`, 14,967
 * in total, against the 459 literal non-breaking spaces `normalizeaza` was
 * measured removing - a 32x regression, invisible to a reader because
 * U+00A0 renders as an ordinary space.
 *
 * `nume` is optional and exists only for the two prints below: keeping a
 * `<table>` or dropping a `<script>`/`<style>` is a transform worth a human
 * noticing, not a silent one, and a future migration run that drives this
 * function per document knows the post or page name and can pass it
 * through. Omitted, the line still prints, just without a name to point at
 * - so a caller that forgets to pass it gets a visible gap instead of a
 * quiet one.
 */
export function laMarkdown(html, nume) {
  const eticheta = nume ?? '(document nedenumit)';
  if (/<table\b/i.test(html)) {
    process.stdout.write(`laMarkdown: ${eticheta} pastreaza un <table> ca HTML brut\n`);
  }
  if (/<script\b/i.test(html) || /<style\b/i.test(html)) {
    process.stdout.write(`laMarkdown: ${eticheta} elimina <script>/<style>\n`);
  }
  return curataSpatii(normalizeaza(turndown.turndown(dezbracaPreambul(html))));
}

/**
 * Every `src` an `<img>` carries, in document order, duplicates included.
 *
 * Measured against the real migration scope (71 published posts/pages, 116
 * `<img>` tags): 116 srcs found, 0 discrepancy - including that `srcset`
 * (106 occurrences in scope) is never mistaken for `src`. Two known limits,
 * left as measured rather than fixed against nothing real: an image with
 * only a lazy-load `data-src` and no `src` returns nothing for that image -
 * `data-src` occurs 0 times in scope - and an unquoted `src=foo.jpg` is not
 * matched either, since no unquoted `src` occurs in scope. Both are pinned
 * by tests below as known behaviour, not silently left undocumented.
 */
export function imaginiDin(html) {
  return [...html.matchAll(/<img\b[^>]*?\ssrc=["']([^"']+)["']/gi)].map((m) => m[1]);
}
