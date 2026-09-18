import type { Article } from './content-schema';

export interface ArticleEntry {
  id: string;
  data: Article;
}

/**
 * The category as a visitor reads it.
 *
 * `CATEGORIES` in `content-schema.ts` holds ASCII keys on purpose - they travel
 * into frontmatter and into the CMS dropdown, and the schema's own comment says
 * they are not prose. This is the prose: the same values with the comma-below
 * letters Romanian needs. Typed `Record<Article['category'], string>`, so a
 * third category cannot be added without a label for it - `astro check` fails
 * on the missing key rather than a card rendering a bare `Noutati`.
 */
export const CATEGORY_LABELS: Record<Article['category'], string> = {
  Noutati: 'Noutăți',
  Cateheza: 'Cateheză',
};

/**
 * The published posts, newest first.
 *
 * THE ONLY PLACE `published` IS READ. `/noutati`, `/rss.xml`, the homepage and
 * `getStaticPaths` in `[slug].astro` all come through here. Four copies of the
 * same filter is four chances to forget one, and the one that gets forgotten
 * is `getStaticPaths` - which does not look wrong anywhere, it just quietly
 * gives all 32 archived posts a live URL of their own.
 *
 * The id tiebreak is not decoration: 32 of the migrated posts share one of two
 * dates, so without it the build's output order depends on filesystem order
 * and every `dist/` diff becomes noise.
 *
 * GENERIC OVER `ArticleEntry`, not `ArticleEntry[]`. Astro's `render(entry)`
 * needs the full `CollectionEntry<'articles'>` - it reads `collection` and
 * `body` off the entry - so a function that returns the narrow interface would
 * force `[slug].astro` to cast back to the type it handed in. The constraint
 * is still the whole contract: nothing is read but `id` and `data`.
 */
export function publishedArticles<T extends ArticleEntry>(entries: T[]): T[] {
  return entries
    .filter((a) => a.data.published)
    .sort((a, b) => (a.data.date === b.data.date
      ? a.id.localeCompare(b.id, 'en')
      : b.data.date.localeCompare(a.data.date, 'en')));
}

/**
 * The public slug of an article: the collection id with the date prefix gone.
 *
 * The migration names each file `YYYY-MM-DD-<wordpress-slug>.md`, so the
 * collection id is `2024-11-04-hramul-parohiei-2024` while every link the
 * parish has ever published points at `/noutati/hramul-parohiei-2024/`.
 * `migration/url-map.mjs` emits the redirects from the bare WordPress slug,
 * which makes this function and that map two derivations of one public URL -
 * so the route built here and the redirect target there agree by construction.
 *
 * ONE PREFIX ONLY: an id that is not date-prefixed comes back unchanged, and a
 * date appearing later in a slug is not touched. Both are asserted in
 * `articles.test.ts`, because a slug is what a URL is made of.
 */
export function articleSlug(id: string): string {
  return id.replace(/^\d{4}-\d{2}-\d{2}-/, '');
}
