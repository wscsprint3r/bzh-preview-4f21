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

// WordPress wraps stray text in nothing at all and Elementor leaves literal
// tabs between blocks. Turndown keeps them, which produces Markdown with
// indented lines that render as code blocks - silently, and only on the
// paragraphs that happened to follow a tab.
function curataSpatii(md) {
  return md
    .replace(/\t/g, ' ')
    .replace(/[ ]{2,}\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
 */
export function laMarkdown(html) {
  return curataSpatii(normalizeaza(turndown.turndown(dezbracaPreambul(html))));
}

/** Every `src` an `<img>` carries, in document order, duplicates included. */
export function imaginiDin(html) {
  return [...html.matchAll(/<img\b[^>]*?\ssrc=["']([^"']+)["']/gi)].map((m) => m[1]);
}
