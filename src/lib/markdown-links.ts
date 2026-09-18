/**
 * Removes anchors that carry nothing at all: `<a href="…"></a>`, and the
 * whitespace-only variants.
 *
 * WHY THIS EXISTS, MEASURED RATHER THAN ARGUED. `cursuri-de-pictura.md` is a
 * migrated WordPress page whose gallery wrote each full-size image as a link
 * with no visible content - `[](https://www.bor-zh.ch/wp-content/uploads/…jpg)`
 * - because the page's thumbnails live in a separate paragraph and the
 * full-size targets were never migrated. Ten such anchors reach the built page
 * and are invisible to a sighted visitor, so nothing on the page looks wrong;
 * axe reports `link-name` ("Links must have discernible text") on all ten,
 * which is a red browser pass. A keyboard user tabs through ten anonymous
 * stops.
 *
 * THE RULE IS STATED AS A PROPERTY OF A RENDERED BODY rather than as a fix for
 * one page: an anchor with no content has no accessible name and no visible
 * target, so it is not a link a person can use. That is the same shape as
 * `markdown-headings.ts` - a migrated body's defect repaired in the pipeline,
 * because the next import can reintroduce it and editing one content file
 * would put the rule in the content.
 *
 * CONSERVATIVE ON PURPOSE. It removes an anchor only when the inside is
 * whitespace and nothing else - no text, no entity, no tag. An anchor wrapping
 * an `<img>` is kept even when the image has empty `alt`, because that is a
 * different defect (a missing description) with a different repair, and
 * silently deleting the image would be the wrong one.
 *
 * WHAT IT DOES NOT DO: give an empty anchor a name, or decide what its target
 * was for. The old-host URLs stay in the content for Phase 4 to rule on; this
 * only stops them rendering as unusable links.
 */

/**
 * An anchor element, with quoted attribute values allowed to contain `>`.
 * The naive `<a\b[^>]*>` stops at the first `>` even inside `title="a > b"`,
 * which would split one anchor into two pieces and match neither.
 */
const ANCHOR = /<a\b(?:"[^"]*"|'[^']*'|[^>"'])*>([\s\S]*?)<\/a>/g;

export function stripEmptyAnchors(html: string): string {
  return html.replace(ANCHOR, (match, inner: string) => (inner.trim() === '' ? '' : match));
}
