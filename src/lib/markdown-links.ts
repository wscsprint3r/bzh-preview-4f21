/**
 * THE TWO ANCHOR RULES THE RENDER PIPELINE APPLIES TO A MIGRATED BODY, in one
 * module so a route imports once and the next body cannot reimplement half of
 * one.
 *
 * `stripEmptyAnchors` removes anchors that carry nothing at all.
 * `resolveContentAssetLinks` rewrites an anchor that names a migrated content
 * asset to the URL the build emitted for it.
 *
 * They are two halves of the same defect. A WordPress gallery wrote its
 * full-size images as links with no visible content, and the migration turns
 * each into `[name](../../assets/content/…)` - a path Markdown resolves
 * relative to the `.md` file. Astro's pipeline rewrites markdown IMAGES, not
 * link nodes, so without the second rule the href ships verbatim and resolves
 * to `/assets/content/…`, which the host does not serve. The first rule keeps
 * an anchor with no name from rendering at all; the second gives a named one a
 * target that exists. Old-host URLs a future page might still carry are Phase
 * 4's to rule on.
 */

/**
 * An anchor element, with quoted attribute values allowed to contain `>`.
 * The naive `<a\b[^>]*>` stops at the first `>` even inside `title="a > b"`,
 * which would split one anchor into two pieces and match neither.
 */
const ANCHOR = /<a\b(?:"[^"]*"|'[^']*'|[^>"'])*>([\s\S]*?)<\/a>/g;

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
export function stripEmptyAnchors(html: string): string {
  return html.replace(ANCHOR, (match, inner: string) => (inner.trim() === '' ? '' : match));
}

/**
 * Every migrated content asset, keyed by repository path and valued by the URL
 * the build emits for it.
 *
 * `?url` IS THE POINT, and the eager glob is what makes the files exist at
 * all. Measured on the d73b49e build: the eleven cursuri anchors pointed at
 * `/assets/content/…`, where `dist/assets/` does not exist, and the originals
 * were not reliably in the build graph - three of the eleven existed only as
 * `.webp` derivatives the image pipeline had emitted, so no path from those
 * hrefs could reach a file. A lookup by computed key is deliberate too -
 * Rollup cannot see which entry is wanted, so it keeps every one and the map
 * cannot be tree-shaken down to the images a page happens to show.
 */
const CONTENT_ASSETS = import.meta.glob<string>(
  '/src/assets/content/**/*.{jpg,jpeg,png,webp,avif}',
  { eager: true, query: '?url', import: 'default' },
);

/** A quoted attribute value, either quote style. */
const ANCHOR_HREF = /\bhref\s*=\s*(["'])(.*?)\1/;

/**
 * The path a content-asset href names, after `assets/content/`, or null when
 * the href is not one this rule owns.
 *
 * RELATIVE PREFIXES ONLY, `../` repeated. That is how Markdown sees `src/`
 * from a content file, and it is the shape `migration/articles.mjs`'s
 * `markdownPath` writes. A URL on another host is not ours to rewrite even
 * when the path reads the same, and a root-absolute `/src/assets/content/…`
 * is the unserved namespace the `/src/` guard in `build-output.itest.ts`
 * owns - resolving it here would hide the defect that guard exists to name.
 */
function contentAssetPath(href: string): string | null {
  const marker = 'assets/content/';
  const at = href.indexOf(marker);
  if (at === -1) return null;
  if (!/^(?:\.\.?\/)+$/.test(href.slice(0, at))) return null;
  return href.slice(at + marker.length);
}

/** `decodeURIComponent` for a path, unchanged when it is not valid escape syntax. */
function decodePath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/**
 * Rewrites every anchor that names a migrated content asset to the URL the
 * build emitted for it, and fails the build when the file is not there.
 *
 * THE FAILURE IS THE FEATURE. An anchor that names a content asset the
 * repository does not hold cannot be resolved, and a named link that silently
 * loses its target is the defect this rule exists to repair; so the build
 * stops, naming the href. The empty-anchor arm is different and stays with
 * `stripEmptyAnchors`: a nameless anchor is removed before this rule runs,
 * which is why routes call `stripEmptyAnchors` first.
 *
 * THE QUERY OR FRAGMENT IS KEPT, and looked up without it: an image link with
 * `#…` is odd but harmless, and dropping the suffix would change the target.
 * A percent-encoded path is looked up decoded as a second try, because a
 * Markdown renderer may encode a destination and the repository path on disk
 * is the decoded one.
 */
export function resolveContentAssetLinks(html: string): string {
  return html.replace(ANCHOR, (match) => {
    const href = ANCHOR_HREF.exec(match)?.[2];
    if (href === undefined) return match;
    const asset = contentAssetPath(href);
    if (asset === null) return match;
    const cut = asset.search(/[?#]/);
    const path = cut === -1 ? asset : asset.slice(0, cut);
    const suffix = cut === -1 ? '' : asset.slice(cut);
    const url =
      CONTENT_ASSETS[`/src/assets/content/${path}`] ??
      CONTENT_ASSETS[`/src/assets/content/${decodePath(path)}`];
    if (url === undefined) {
      throw new Error(
        `content asset link "${href}" names no file under src/assets/content/. ` +
          'The link would 404 in the built site; migrate the file or fix the link.',
      );
    }
    return match.replace(ANCHOR_HREF, () => `href="${url}${suffix}"`);
  });
}
