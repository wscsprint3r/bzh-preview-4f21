/**
 * Shifts every heading in a rendered markdown body so the shallowest one is an
 * `<h2>`.
 *
 * WHY THIS EXISTS, MEASURED RATHER THAN ARGUED. The migrated article bodies
 * carry their subheadings as `###` and `####` (the WordPress posts wrote them
 * under a title that was itself a heading), and `[slug].astro` renders the
 * post's own title as the page's only `<h1>`. The first body heading was
 * therefore an `<h4>` directly under an `<h1>`, which is a skipped level:
 * `npm run a11y` reported `heading-order` - "Heading levels should only
 * increase by one" - on THIRTEEN built pages, every published article. axe's
 * `heading-order` is a best-practice rule and it runs, so the browser pass is
 * a red build until the levels are right.
 *
 * The rule is stated as a property of a markdown body rather than as a fix for
 * the articles: A BODY SITS UNDER THE PAGE'S `<h1>`, SO ITS SHALLOWEST HEADING
 * IS AN `<h2>`. Prose pages already start at `##` and pass through unchanged;
 * articles shift up by the difference; a body that opened at `#` shifts down.
 * No frontmatter and no collection name is consulted, which is deliberate - a
 * transform that keyed on "is this an article" would be a second place that
 * knows what an article is, and `content-schema.ts` already owns that.
 *
 * The alternative, editing 45 migrated files so their heading levels happen to
 * match this site, would put the rule in the content rather than in the
 * pipeline: the next post the parish writes in the CMS would reintroduce it.
 *
 * WHY A STRING TRANSFORM AND NOT A REHYPE PLUGIN. Astro 7's default markdown
 * processor is Sätteri, and `markdown.rehypePlugins` is a legacy path that
 * throws unless `@astrojs/markdown-remark` is installed - which is a new
 * dependency for one transform. The glob loader renders a collection entry
 * EAGERLY (`entry.rendered` is populated in dev and in the build alike),
 * so the page can shift the levels between the loader and `render(entry)`,
 * and that is what `[slug].astro` does. A regex over that HTML is safe here
 * because it runs on the RENDERED body: anything that looked like a heading
 * inside a code block is already `&lt;h3`, so it cannot be matched.
 *
 * WHAT IT DOES NOT DO: fix an outline that is already broken in a body (an
 * `h4` following an `h2` with no `h3`), because shifting cannot invent a level
 * between two headings that both exist. `a11y.mjs` is what would report that,
 * and the current corpus has no such case.
 */

/** The opening or closing heading tag, with or without attributes. */
const HEADING_TAG = /<(\/?)h([1-6])\b/g;

export function normalizeHeadingLevels(html: string): string {
  const levels = [...html.matchAll(HEADING_TAG)].map((match) => Number(match[2]));
  // A body with no heading is left alone; there is no level to normalise to.
  if (levels.length === 0) return html;

  const shift = 2 - Math.min(...levels);
  if (shift === 0) return html;

  return html.replace(
    HEADING_TAG,
    // Clamped at six: an `h6` under an `h1` would shift to `h7`, which is not
    // an element. Two `h6`s in a body that deep is the least bad answer, and
    // no body in this corpus goes past `h4`.
    (_match, closing: string, level: string) =>
      `<${closing}h${Math.min(6, Number(level) + shift)}`,
  );
}
