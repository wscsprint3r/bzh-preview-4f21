import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { stringify } from 'yaml';
import { articleSchema } from '../src/lib/content-schema.ts';
import { query, start, stop } from './db.mjs';
import { normalize } from './diacritics.mjs';
import { imagesIn, toMarkdown } from './html-md.mjs';
import { migrateImages } from './media.mjs';

/**
 * The 45 published posts of the WordPress dump, written as Markdown files
 * under `src/content/articles/`.
 *
 * THE DATE RULE IS THE WHOLE TASK. 32 of the 45 posts carry a bulk-import
 * stamp rather than a publication date, and those import with
 * `published: false` - the parish dates them later in the CMS. The other 13
 * carry a genuine date and import with `published: true`.
 *
 * WHY THE STAMPS ARE NAMED BY VALUE RATHER THAN RECOGNISED BY A HEURISTIC.
 * "A date shared by many posts" is a rule that changes meaning the moment the
 * parish legitimately publishes three things on one day, and the rule would
 * then hold 32 posts hostage. The two stamps are facts about this dump, so
 * they are named as facts, with the counts measured beside them, and a count
 * that no longer matches fails the run - see `STAMP_COUNTS` below. Measured
 * 2026-09-17 through `db.mjs`:
 *
 *     SELECT DATE(post_date), COUNT(*)
 *     FROM wpoi_posts WHERE post_type='post' AND post_status='publish'
 *     GROUP BY 1 ORDER BY 2 DESC
 *
 *     2024-06-08  21
 *     2024-05-21  11
 *     2024-12-02   2
 *     2024-08-25   1   (and eleven more singletons)
 *
 * So 21 + 11 = 32 stamped posts and 13 genuinely dated ones. The plan's table
 * said 20 at 2024-06-08 plus "one more"; the measured count is 21, and the
 * "one more" is not a stamp at all - it is the twelve distinct dates the 13
 * dated posts carry, one of which (2024-12-02) two posts happen to share.
 * Adding a third stamp would break the 32/13 split the parish's decision is
 * sized from, so the two stamps above are the whole set.
 *
 * RUN IT DIRECTLY: `node migration/articles.mjs` starts the container, writes
 * the files, stops the container and prints the counts. Importing this module
 * starts nothing - `articles.test.mjs` imports it under vitest, where there is
 * no Docker and no dump, and the direct-run block at the bottom is the only
 * code that touches either.
 */

/**
 * The two bulk-import stamps, sorted. Everything else is a real date.
 *
 * Sorted rather than in frequency order so the list reads as a set and two
 * readings of it cannot disagree. The counts live in `STAMP_COUNTS`, keyed by
 * the same strings, because the exported list is the interface the test pins
 * and an array of objects would be a different one.
 */
export const IMPORT_STAMPS = ['2024-05-21', '2024-06-08'];

/**
 * The measured size of each stamp, checked at the start of every extraction.
 *
 * The stamps are facts about THIS dump, and a dump whose stamps cover a
 * different number of posts is a different dump - one this plan was not
 * written against. A mismatch stops the run rather than migrating a corpus
 * nobody has looked at. Measured 2026-09-17; see the file docblock for the
 * full histogram.
 */
const STAMP_COUNTS = { '2024-05-21': 11, '2024-06-08': 21 };

/**
 * Stops the run when a stamp covers a different number of posts than measured.
 *
 * EXTRACTED FROM `extractArticles` SO IT CAN BE TESTED WITHOUT DOCKER. The
 * counts are the one fact that makes the 32-stamped/13-dated split true, and a
 * guard that cannot be shown to fire is a guard nobody knows is working; a
 * fake query cannot reach a throw buried in a database loop, but this takes
 * the counts the caller measured and is pure. The extraction path still calls
 * it before a single file is converted.
 *
 * THE FAILURE IT PREVENTS: a dump whose stamp covers a different set of posts
 * is a different dump, and migrating it would write 45 files whose
 * `published:` flags were decided against data nobody has looked at. Measured
 * 2026-09-17: 11 at `2024-05-21`, 21 at `2024-06-08`.
 */
export function assertStampCounts(counted) {
  for (const stamp of IMPORT_STAMPS) {
    if (counted.get(stamp) !== STAMP_COUNTS[stamp]) {
      throw new Error(
        `The bulk-import stamp ${stamp} covers ${counted.get(stamp)} post(s), not the ` +
          `${STAMP_COUNTS[stamp]} measured on 2026-09-17. Either the dump has changed or a ` +
          'stamp was misidentified - do not migrate from this data.',
      );
    }
  }
}

/**
 * WordPress's category names to the site's, and nothing else.
 *
 * Measured over the 45 posts, 2026-09-17: `Noutati` on 42, `Catehismul
 * Bisericii Ortodoxe` on 3, every post carrying exactly one category and none
 * carrying zero. `CATEGORIES` in `src/lib/content-schema.ts` is the target set
 * and this map is the source-to-target translation; a term in neither is an
 * error that stops the run, never a silent fallback to `Noutati`. A post
 * quietly landing in the wrong category is invisible on every page it
 * appears on.
 */
const CATEGORY_FOR_TERM = new Map([
  ['Noutati', 'Noutati'],
  ['Catehismul Bisericii Ortodoxe', 'Cateheza'],
]);

/**
 * The site category for one post's WordPress terms, or a stopped run.
 *
 * EXTRACTED FROM `extractArticles` FOR THE SAME REASON as `assertStampCounts`:
 * the throw arms are two of this task's failure modes and a fake query cannot
 * reach them once they sit inside a database loop. The decision is pure - a
 * slug for the message, the terms, and the map above.
 *
 * Exactly one term is expected. Zero has no unambiguous place on the site and
 * several would have to be resolved by a preference nobody has stated; both
 * stop the run naming the post. A term that maps to neither stops it too,
 * rather than falling back to `Noutati`, because a post quietly landing in the
 * wrong category is invisible on every page it appears on. Measured over the
 * 45 posts, 2026-09-17: every one carries exactly one term - 42 `Noutati`,
 * 3 `Catehismul Bisericii Ortodoxe`, none zero, none several.
 */
export function categoryFor(slug, terms) {
  if (terms.length !== 1) {
    throw new Error(
      `${slug} carries ${terms.length} categor(y|ies): ${terms.join(', ') || '(none)'}. ` +
        'Every published post is expected to carry exactly one, and a post with none or ' +
        'several has no unambiguous place on the site.',
    );
  }
  const category = CATEGORY_FOR_TERM.get(terms[0]);
  if (category === undefined) {
    throw new Error(
      `${slug} carries the category "${terms[0]}", which maps to neither of ` +
        `${[...CATEGORY_FOR_TERM.keys()].join(' or ')}. ` +
        'Add the mapping deliberately or correct the post - never fall back to Noutati.',
    );
  }
  return category;
}

/** Where the migrated posts land, relative to the repository root. */
const ARTICLES_DIR = 'src/content/articles';

/**
 * Whether a date is a real publication date rather than a bulk-import stamp.
 *
 * Takes the plain `YYYY-MM-DD` string `DATE(post_date)` returns - never a
 * `Date`, never a UTC instant. `week.ts`'s rule for service times applies here
 * too: a date is a local calendar fact and the migration must not shift it.
 */
export function isDated(date) {
  return !IMPORT_STAMPS.includes(date);
}

/**
 * The file a post becomes: date first, slug second.
 *
 * The date prefix is what makes the folder order the chronological order, so a
 * reader listing `src/content/articles/` sees the news as the parish sees it.
 * Two posts sharing a date cannot produce the same name because the slugs
 * differ, and the query orders by slug, so the names are stable across runs.
 */
export function fileName(slug, date) {
  return `${date}-${slug}.md`;
}

/**
 * A repo-relative image path as Markdown sees it: `src/assets/content/x.jpg`
 * becomes `../../assets/content/x.jpg`.
 *
 * ASTRO RESOLVES MARKDOWN IMAGES RELATIVE TO THE `.md` FILE, and a bare
 * `src/assets/...` is not a relative URL - it would ship as a broken `src`
 * with the image sitting right there in the repository. Articles live two
 * levels under `src/`, so `../../` is exactly `src/`. Task 8 owns the
 * built-output assertion that this shape really renders.
 */
function markdownPath(repoRelative) {
  return `../../${repoRelative.slice('src/'.length)}`;
}

/**
 * Stops the run when a reference has no migrated file behind it.
 *
 * THE GATE TASK 5 CANNOT BE. `migrateImages` leaves a dead reference out of
 * its map and names it on stdout, and exits 0 by design - the caller is what
 * decides whether that is fatal. Here it is fatal: a reference named nowhere
 * downstream renders as a broken image on a green build. `sources` covers body
 * and featured references alike, because the frontmatter `image:` is as
 * capable of pointing at nothing as an `![](...)` is.
 *
 * EXTRACTED FROM `extractArticles` so the throw can be shown to fire without
 * Docker. Measured: 0 unmapped among the 7 references these 45 posts carry
 * (4 in bodies, 3 featured), so this guard exists for the pages corpus and for
 * whatever the parish adds next.
 */
export function assertImageReferences(slug, sources, mapping) {
  for (const src of sources) {
    if (!mapping.has(src)) {
      throw new Error(
        `${slug} references ${src}, which the image migration did not write. ` +
          'The reference is dead; fix it at the source before migrating, because a ' +
          'missing image fails nothing downstream.',
      );
    }
  }
}

/**
 * Replaces every reference in `markdown` with its markdown-relative path.
 *
 * SINGLE PASS, LONGEST ALTERNATIVE FIRST, AND BOTH HALVES ARE LOAD-BEARING.
 * One full URL can be a literal prefix of another - `…/a.jpg` inside
 * `…/a.jpg-300x200.jpg` - and a raw `replaceAll` per source then rewrites the
 * longer URL's prefix when the shorter is processed first, leaving the written
 * Markdown pointing at a file nobody wrote. Sorting the alternatives by
 * descending length is what makes the longer win at that position. The single
 * pass is what makes it safe in general: the replacement text is never
 * rescanned, so a destination that happened to contain another source string
 * cannot be rewritten by that source's own pass. A regex alternation tries its
 * alternatives left to right at each position, which is why the order is by
 * descending length.
 *
 * The WordPress `-WxH` thumbnail shape is NOT an example of this pair:
 * `a-300x200.jpg` does not contain `a.jpg`, because the original's dot is not
 * in the thumbnail's stem. The pair above is constructed, so this is
 * correctness by construction rather than a fix for a corpus that needed it.
 * Measured over the 45 posts' 4 body references, 2026-09-17: 0 containment
 * pairs today. The pages corpus reuses this function.
 *
 * The sources are regex-escaped: they are URLs off a compromised server, so
 * `.` and `?` are literal characters here, not syntax.
 *
 * The mapping must cover every source. `assertImageReferences` guarantees that
 * in the extraction path, and this function checks it again with a named error
 * - a missing destination must not become the string "undefined" in a page,
 * and the pages corpus is a second caller.
 */
export function rewriteImageSources(slug, markdown, sources, mapping) {
  const ordered = [...new Set(sources)].sort((a, b) => b.length - a.length);
  for (const src of ordered) {
    if (!mapping.has(src)) {
      throw new Error(
        `${slug} asked to rewrite ${src}, which has no destination in the image map. ` +
          'The extraction path asserts every reference first; this is the rewriter refusing ' +
          'to turn a missing destination into a broken path in a page.',
      );
    }
  }
  if (ordered.length === 0) return markdown;
  const pattern = new RegExp(
    ordered.map((src) => src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
    'g',
  );
  return markdown.replace(pattern, (src) => markdownPath(mapping.get(src)));
}

/**
 * The category each published post carries, by slug.
 *
 * One query rather than one per post: 45 posts would otherwise mean 45 round
 * trips through `docker exec`. Ordered by slug and term name so the grouped
 * lists are deterministic.
 */
async function categoriesBySlug() {
  const rows = await query(
    'SELECT p.post_name, t.name FROM wpoi_posts p ' +
      'JOIN wpoi_term_relationships tr ON tr.object_id = p.ID ' +
      'JOIN wpoi_term_taxonomy tt ON tt.term_taxonomy_id = tr.term_taxonomy_id ' +
      "AND tt.taxonomy='category' " +
      'JOIN wpoi_terms t ON t.term_id = tt.term_id ' +
      "WHERE p.post_type='post' AND p.post_status='publish' " +
      'ORDER BY p.post_name, t.name',
  );
  const bySlug = new Map();
  for (const [slug, name] of rows) {
    const list = bySlug.get(slug) ?? [];
    list.push(name);
    bySlug.set(slug, list);
  }
  return bySlug;
}

/**
 * The featured image of each post that has one, by slug, as the attachment's
 * stored URL.
 *
 * Measured: 3 of the 45 posts carry `_thumbnail_id`. The `guid` of the
 * attachment row is the URL `post_content` would have carried, so the same
 * `migrateImages` call covers body and featured references alike.
 */
async function thumbnailsBySlug() {
  const rows = await query(
    'SELECT p.post_name, a.guid FROM wpoi_posts p ' +
      "JOIN wpoi_postmeta pm ON pm.post_id = p.ID AND pm.meta_key='_thumbnail_id' " +
      'JOIN wpoi_posts a ON a.ID = pm.meta_value ' +
      "WHERE p.post_type='post' AND p.post_status='publish' ORDER BY p.post_name",
  );
  return new Map(rows);
}

/**
 * Every published post, converted and written. Returns the two counts.
 *
 * The container must already be running - the direct-run block below is what
 * starts it - so a caller inside a test that has no Docker never reaches a
 * query by accident.
 */
export async function extractArticles() {
  const posts = await query(
    'SELECT post_name, post_title, DATE(post_date), post_content, post_excerpt ' +
      "FROM wpoi_posts WHERE post_type='post' AND post_status='publish' " +
      'ORDER BY post_name',
  );
  const categories = await categoriesBySlug();
  const thumbnails = await thumbnailsBySlug();

  // The stamps are checked before a single file is converted, so a changed
  // dump stops here rather than after 45 files have been written from it.
  const counted = new Map(IMPORT_STAMPS.map((stamp) => [stamp, 0]));
  for (const [, , date] of posts) {
    if (counted.has(date)) counted.set(date, counted.get(date) + 1);
  }
  assertStampCounts(counted);

  const documents = [];
  for (const [slug, title, date, content, excerpt] of posts) {
    /*
     * THE TAG COUNT AND THE SRCS MUST AGREE, and the equality is what catches
     * an attribute shape `imagesIn` cannot see - a lazy-load `data-src` with
     * no `src`, or an unquoted `src`. Both occur zero times today and are
     * documented limits of `imagesIn` rather than behaviour it handles; this
     * assertion is what turns a future occurrence into a stopped run instead
     * of a silently missing picture. Measured 2026-09-17 over the 45 posts:
     * 4 tags, 4 srcs, zero disagreement.
     */
    const tags = (content.match(/<img\b/gi) ?? []).length;
    const bodySources = imagesIn(content);
    if (tags !== bodySources.length) {
      throw new Error(
        `${slug}: ${tags} <img> tag(s) but imagesIn returned ${bodySources.length} src(s). ` +
          'An image the extractor cannot read is an image the page will not show.',
      );
    }

    const terms = categories.get(slug) ?? [];
    const category = categoryFor(slug, terms);

    documents.push({
      slug,
      /*
       * THE TITLE AND THE EXCERPT ARE NORMALISED BY HAND, because `toMarkdown`
       * never sees them: it normalises the BODY, and `post_title` and
       * `post_excerpt` are separate columns. Measured 2026-09-17, and found by
       * the repository-wide sweep rather than by looking: 3 of the 45 titles
       * carry the Turkish cedilla forms U+015F/U+015E where comma below
       * belongs - the posts `2024-06-08-mosii-de-iarna-2`,
       * `2024-06-08-serbarea-scolii-parohiale-de-hram` and
       * `2024-10-21-mosii-de-toamna-3` - and every screenshot renders those as
       * perfectly formed glyphs. The sweep named the three files; this line is
       * the fix. The excerpt is empty on all 45 today and is normalised
       * anyway, because the day one is not is not the day to discover this.
       */
      title: normalize(title).trim(),
      date,
      excerpt: normalize(excerpt).trim(),
      category,
      featured: thumbnails.get(slug),
      bodySources,
      markdown: toMarkdown(content, slug),
    });
  }

  const mapping = await migrateImages(
    documents.flatMap((doc) => [
      ...doc.bodySources,
      ...(doc.featured === undefined ? [] : [doc.featured]),
    ]),
  );

  let written = 0;
  let published = 0;
  for (const doc of documents) {
    const allSources = [
      ...doc.bodySources,
      ...(doc.featured === undefined ? [] : [doc.featured]),
    ];
    assertImageReferences(doc.slug, allSources, mapping);
    const body = rewriteImageSources(doc.slug, doc.markdown, doc.bodySources, mapping);

    const isPublished = isDated(doc.date);
    const frontmatter = {
      title: doc.title,
      date: doc.date,
      published: isPublished,
      category: doc.category,
      ...(doc.excerpt === '' ? {} : { summary: doc.excerpt }),
      ...(doc.featured === undefined
        ? {}
        : { image: markdownPath(mapping.get(doc.featured)) }),
    };
    // Validated BEFORE the write: a file that would not build is not written.
    articleSchema.parse(frontmatter);

    // Quoted strings throughout, and `defaultKeyType: 'PLAIN'` keeps the keys
    // bare. The date has to be quoted: js-yaml parses an unquoted
    // `2024-06-08` as a `Date`, and `articleSchema`'s own message for that case
    // is the one a volunteer reads. Quoting every string costs nothing and
    // removes the whole class - `yes`, `on` and a bare number are all read as
    // something other than text.
    const yaml = stringify(frontmatter, {
      defaultStringType: 'QUOTE_DOUBLE',
      defaultKeyType: 'PLAIN',
      lineWidth: 0,
    });

    const file = join(ARTICLES_DIR, fileName(doc.slug, doc.date));
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, `---\n${yaml}---\n\n${body}\n`);
    written += 1;
    if (isPublished) published += 1;
  }

  // Print what was measured, not only the verdict - `process.stdout.write`
  // because vitest's default reporter swallows `console.log` on the green run
  // a later reader would check these numbers against.
  const dated = documents.filter((doc) => isDated(doc.date)).length;
  const categoryCounts = new Map();
  for (const doc of documents) {
    categoryCounts.set(doc.category, (categoryCounts.get(doc.category) ?? 0) + 1);
  }
  process.stdout.write(
    `\nArticles written: ${written}, of which published: ${published}.\n` +
      `  Import stamps: ${IMPORT_STAMPS.map((s) => `${s} x${counted.get(s)}`).join(', ')}; ` +
      `genuinely dated: ${dated}.\n` +
      `  Categories: ${[...categoryCounts].map(([c, n]) => `${c} x${n}`).join(', ')}.\n`,
  );
  return { written, published };
}

/**
 * Direct invocation: `node migration/articles.mjs`.
 *
 * Importing this module must not start anything - the test suite imports it
 * and has neither Docker nor the dump. The comparison is against the file this
 * module IS, not against a flag, so any other entry point (vitest's worker,
 * a future migration runner) is left alone.
 */
const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) {
  await start();
  try {
    await extractArticles();
  } finally {
    // The container is disposable and recreated on every run; stopping it here
    // means a failed extraction does not leave `bzh-migration` behind.
    await stop();
  }
}
