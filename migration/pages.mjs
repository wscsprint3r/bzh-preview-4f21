import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { pageSchema } from '../src/lib/content-schema.ts';
import { assertImageReferences, rewriteImageSources } from './articles.mjs';
import { query } from './db.mjs';
import { normalize } from './diacritics.mjs';
import { imagesIn, toMarkdown } from './html-md.mjs';
import { migrateImages } from './media.mjs';

/**
 * The nine WordPress pages that become this site's prose pages.
 *
 * THE TABLE IS THE ROUTE CONTRACT AND THE URL MAP'S SOURCE OF TRUTH. Each entry
 * pairs the old WordPress slug (the from-side of a redirect) with the new route
 * (without slashes; `[...page].astro` builds `/${path}/`). `order` is a spaced
 * integer rather than a position: tens leave room to insert a page between two
 * others without renumbering nine files.
 *
 * THE TITLES COME FROM `wpoi_posts.post_title`, NORMALISED, NOT FROM THE PLAN'S
 * TABLE, which spells them without diacritics because the plan document is
 * easier to read plain. Measured 2026-09-18 through `db.mjs`; the codepoints
 * that matter are U+0103 (a-breve) in `cursuri-de-pictura` and
 * `revista-doxologia`, and U+0218 + U+0103 in `scoala-parohiala`. Two of the
 * nine do not match the plan's plain spelling at all once normalised:
 * `revista-doxologia` is "Revista doxologică" (not "Revista Doxologia") and
 * `scoala-parohiala` is "Școala parohială". `extractPages` reads the database's
 * own title and stops the run when it does not equal the one here, so this
 * table cannot quietly disagree with what is written.
 *
 * THE FOURTH PAGE IN THE PLAN'S OLD ORDERING IS GONE, and that is on purpose:
 * the user ruled that the ninth page's route is `resurse/linkuri` (from the
 * design spec), not `resurse/links`.
 */
export const PAGES = [
  { slug: 'istoric', path: 'parohia/istoric', title: 'Istoric', order: 10 },
  { slug: 'consiliul-parohial', path: 'parohia/consiliul', title: 'Consiliul Parohial', order: 20 },
  { slug: 'servicii-liturgice', path: 'servicii-liturgice', title: 'Servicii liturgice', order: 30 },
  { slug: 'scoala-parohiala', path: 'comunitate/scoala', title: 'Școala parohială', order: 40 },
  { slug: 'cursuri-de-pictura', path: 'comunitate/pictura', title: 'Cursuri de pictură', order: 50 },
  { slug: 'catehism', path: 'resurse/catehism', title: 'Catehism', order: 60 },
  { slug: 'studii', path: 'resurse/studii', title: 'Studii', order: 70 },
  { slug: 'revista-doxologia', path: 'resurse/doxologia', title: 'Revista doxologică', order: 80 },
  { slug: 'link-uri-utile', path: 'resurse/linkuri', title: 'Link-uri utile', order: 90 },
];

/** Where the migrated pages land, relative to the repository root. */
const PAGES_DIR = 'src/content/pages';

/**
 * Stops the run when the dump does not carry every page in the table.
 *
 * THE FAILURE THIS PROJECT HAS PAID FOR MOST is a page quietly missing: the
 * build stays green, the menu links to a 404-shaped absence, and the first
 * symptom is a parishioner saying the history page "is gone". Every missing
 * slug is named in one message rather than failing on the first, because the
 * person reading it has to fix the corpus, not guess how many other pages are
 * absent. Pure, so the throw can be shown to fire without Docker.
 */
export function assertPagesFound(pages, bySlug) {
  const missing = pages.filter((page) => !bySlug.has(page.slug)).map((page) => page.slug);
  if (missing.length > 0) {
    throw new Error(
      `The dump has no published page for: ${missing.join(', ')}. ` +
        'A page silently missing is the failure this migration exists to prevent - ' +
        'do not write the other files from a corpus that does not match the table.',
    );
  }
}

/**
 * Stops the run when the database title and the table's title disagree.
 *
 * THE TITLES COME FROM `wpoi_posts.post_title`, NORMALISED - and the table is
 * the measured copy of them. The codepoint sweep cannot see a wrong title,
 * because a wrong title is made of perfectly good letters; this comparison is
 * the only thing that can. Comparing NORMALISED titles on purpose: `normalize`
 * is the one filter for the cedilla forms, so a dump title that still carried
 * one would compare equal to the table rather than stopping the run on an
 * encoding difference. Measured 2026-09-18 over the nine: all titles are clean
 * already (`scoala-parohiala` holds U+0218, comma below), where three of the
 * 45 post titles needed the same normalisation. Pure, for the same reason as
 * `assertPagesFound`.
 */
export function assertPageTitles(pages, titlesBySlug) {
  for (const page of pages) {
    const dbTitle = titlesBySlug.get(page.slug);
    if (dbTitle !== page.title) {
      throw new Error(
        `${page.slug}: wpoi_posts.post_title is "${dbTitle}", but the table says ` +
          `"${page.title}". The dumped title has moved, or the table was edited by hand - ` +
          'either way, do not migrate a title nobody has looked at.',
      );
    }
  }
}

/**
 * Stops the run when the `<img>` count and the readable `src` count disagree.
 *
 * THE SAME ASSERTION TASK 6 MAKES FOR POSTS, for the same reason: an attribute
 * shape `imagesIn` cannot see - a lazy-load `data-src` with no `src`, an
 * unquoted `src` - is a documented limit of `imagesIn`, not behaviour it
 * handles. The equality turns either into a stopped run instead of a silently
 * missing picture. Measured 2026-09-18 over the nine pages: 63 tags, 63 srcs,
 * zero disagreement. Pure, so the positive control needs no database; the
 * `<img data-src>` fixture is the shape that fires it.
 */
export function assertImageTagCount(slug, html, sources) {
  const tags = (html.match(/<img\b/gi) ?? []).length;
  if (tags !== sources.length) {
    throw new Error(
      `${slug}: ${tags} <img> tag(s) but imagesIn returned ${sources.length} src(s). ` +
        'An image the extractor cannot read is an image the page will not show.',
    );
  }
}

/**
 * The nine prose pages, converted and written. Returns the counts.
 *
 * The container must already be running - `run.mjs` starts it once for both
 * extractors - so a test that has no Docker never reaches a query by accident.
 * Importing this module starts nothing.
 *
 * NO PREAMBLE IS STRIPPED HERE, and that is a deliberate absence: `toMarkdown`
 * already calls `stripPreamble`, and the nine pages are the only documents that
 * have a preamble, so this is the one place where calling it a second time
 * could eat real content that happens to look preamble-shaped.
 */
export async function extractPages() {
  const rows = await query(
    'SELECT post_name, post_title, post_content FROM wpoi_posts ' +
      "WHERE post_type='page' AND post_status='publish' ORDER BY post_name",
  );
  const bySlug = new Map(rows.map(([slug, title, content]) => [slug, { title, content }]));
  assertPagesFound(PAGES, bySlug);
  // Normalised here and nowhere else: this is the only read of `post_title`.
  const titlesBySlug = new Map(rows.map(([slug, title]) => [slug, normalize(title).trim()]));
  assertPageTitles(PAGES, titlesBySlug);

  const documents = [];
  for (const page of PAGES) {
    const { content } = bySlug.get(page.slug);
    const bodySources = imagesIn(content);
    assertImageTagCount(page.slug, content, bodySources);
    documents.push({
      page,
      title: titlesBySlug.get(page.slug),
      bodySources,
      markdown: toMarkdown(content, page.slug),
    });
  }

  // ONE `migrateImages` CALL OVER EVERY PAGE, so a picture the nine share
  // (`istoric`, `consiliul-parohial` and `revista-doxologia` all carry the same
  // screenshot) is decoded and written exactly once.
  const allSources = documents.flatMap((doc) => doc.bodySources);
  const mapping = await migrateImages(allSources);

  await mkdir(PAGES_DIR, { recursive: true });
  let written = 0;
  for (const doc of documents) {
    assertImageReferences(doc.page.slug, doc.bodySources, mapping);
    const body = rewriteImageSources(doc.page.slug, doc.markdown, doc.bodySources, mapping);

    const frontmatter = {
      title: doc.title,
      path: doc.page.path,
      order: doc.page.order,
    };
    // Validated BEFORE the write: a file that would not build is not written.
    pageSchema.parse(frontmatter);

    const yaml = stringify(frontmatter, {
      defaultStringType: 'QUOTE_DOUBLE',
      defaultKeyType: 'PLAIN',
      lineWidth: 0,
    });
    await writeFile(join(PAGES_DIR, `${doc.page.slug}.md`), `---\n${yaml}---\n\n${body}\n`);
    written += 1;
  }

  // Every skip is fatal in this path (`assertImageReferences` above throws
  // first), so this is 0 by construction whenever the run reaches here; it is
  // reported anyway because `run.mjs`'s summary promises the number.
  const imagesSkipped = new Set(allSources).size - mapping.size;
  process.stdout.write(
    `\nPages written: ${written}.\n` +
      `  Images migrated: ${mapping.size}, skipped: ${imagesSkipped}.\n`,
  );
  return { written, imagesMigrated: mapping.size, imagesSkipped };
}
