import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { pageSchema } from '../src/lib/content-schema.ts';
import {
  assertImageReferences,
  markdownPath,
  rewriteDocumentLinks,
  rewriteImageSources,
} from './articles.mjs';
import { query } from './db.mjs';
import { normalize } from './diacritics.mjs';
import { imagesIn, toMarkdown } from './html-md.mjs';
import { migrateImages } from './media.mjs';

/**
 * The eleven WordPress pages that become this site's prose pages.
 *
 * THE TABLE IS THE ROUTE CONTRACT AND THE URL MAP'S SOURCE OF TRUTH. Each entry
 * pairs the old WordPress slug (the from-side of a redirect) with the new route
 * (without slashes; `[...page].astro` builds `/${path}/`). `order` is a spaced
 * integer rather than a position: tens leave room to insert a page between two
 * others without renumbering the files.
 *
 * NINE OF THE ELEVEN ARE BUILT BY `[...page].astro`; `contact` AND `doneaza` ARE
 * NOT. They are reserved paths - `src/lib/routes.ts` is the one list
 * `[...page].astro` and `routes.test.ts` import - because each grows generated
 * blocks (accounts, the QR-bill, the form) that a generic prose route has no
 * business knowing about. Their entries
 * still live in this table, so the URL map, the title guard and the footer's
 * `Pagini` menu treat them like every other page.
 *
 * `stripAccounts` MARKS THE TWO WHOSE PROSE PRINTS AN IBAN. Those paragraphs
 * are removed by `stripAccountBlocks` before conversion, because Task 10 renders
 * the accounts from `settings.accounts`, and two copies of an IBAN is the one
 * duplication this project has already paid for. `servicii-liturgice` is NOT
 * marked: its account is not one the generated blocks render, so its prose
 * stays as it is.
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
 * table cannot quietly disagree with what is written. The two Phase 3 pages
 * were measured 2026-09-19: "Contact", and "Donează" with U+0103.
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
  { slug: 'contact', path: 'contact', title: 'Contact', order: 100, stripAccounts: true },
  { slug: 'doneaza', path: 'doneaza', title: 'Donează', order: 110, stripAccounts: true },
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
 * encoding difference. Measured 2026-09-19 over the eleven: all titles are
 * clean already (`scoala-parohiala` holds U+0218, comma below), where three of
 * the 45 post titles needed the same normalisation. Pure, for the same reason
 * as `assertPagesFound`.
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
 * missing picture. Measured 2026-09-19 over the eleven pages: 65 tags, 65 srcs,
 * zero disagreement (the nine measured 63 on 2026-09-18; `doneaza` adds two and
 * `contact` none). Pure, so the positive control needs no database; the
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
 * The paragraph shape WordPress writes, and the account number inside it.
 *
 * THE NUMBER IS MATCHED BY SHAPE, NOT BY VALUE: `CH` plus two check digits
 * plus at least seventeen more characters of digits, spaces and capitals. A
 * hardcoded list of the two real IBANs would pass the day somebody rotates an
 * account and would say nothing about a third page that started printing one.
 * The class deliberately excludes `<` and `>`, so a match cannot run past the
 * end of a tag and swallow the element after it.
 */
const PARAGRAPH = /<p\b[^>]*>[\s\S]*?<\/p>/gi;
const IBAN = /CH\d{2}[0-9A-Z ]{17,}/;

/**
 * Removes the paragraph that prints an IBAN, for the pages that declare one.
 *
 * WHY THE PROSE IS STRIPPED. `contact` and `doneaza` each print an account
 * number in a WordPress paragraph; Task 10 renders the accounts from
 * `settings.accounts`, and a second copy of an IBAN is the duplication this
 * project has already paid for - the copy in prose cannot be updated from the
 * CMS, so the two drift the first time an account changes.
 *
 * THE COUNT IS THE GUARD. A declared page must lose exactly one paragraph: a
 * page whose IBAN moved out of the paragraph shape would otherwise strip
 * nothing and ship the number beside the generated block, and two would mean
 * somebody edited the corpus in a way this rule does not understand. The throw
 * names the file and the count, the same "a guard must find its subject" rule
 * as the title and image-count guards. A page that does not declare
 * `stripAccounts` comes back byte for byte: `servicii-liturgice` carries its
 * own account and is deliberately not stripped, so this cannot become a
 * function that strips every page it is handed.
 *
 * Pure and exported, so both throws and the untouched arm have positive
 * controls that need no database.
 */
export function stripAccountBlocks(html, slug) {
  const page = PAGES.find((candidate) => candidate.slug === slug);
  if (!page?.stripAccounts) return html;
  let removed = 0;
  const result = html.replace(PARAGRAPH, (match) => {
    if (!IBAN.test(match)) return match;
    removed += 1;
    return '';
  });
  if (removed !== 1) {
    throw new Error(
      `${PAGES_DIR}/${slug}.md: stripAccounts is declared, but removed ${removed} ` +
        'paragraph(s) carrying an IBAN; expected exactly 1. A number that moved out of ' +
        'the paragraph shape would ship beside the generated block, and two mean the ' +
        'corpus changed in a way this rule does not understand.',
    );
  }
  return result;
}

/**
 * The uploads-image href this migration can rewrite, anchored to the parish's
 * own host the way `media.mjs` anchors its own sources.
 *
 * Measured over the eleven pages, 2026-09-19: 11 anchors with an uploads-image
 * href, all on `cursuri-de-pictura`, all `https://www.bor-zh.ch`, all `.jpg`.
 * The host is part of the shape because a foreign uploads path is somebody
 * else's file: `migrateImages` would skip it as foreign, and collecting it here
 * would turn that skip into a stopped run.
 */
const LINKED_IMAGE =
  /^https:\/\/www\.bor-zh\.ch\/wp-content\/uploads\/[^\s"']+\.(?:jpe?g|png|webp)$/i;

/**
 * An anchor element, with quoted attribute values allowed to contain `>`.
 * The same shape `src/lib/markdown-links.ts` uses for `stripEmptyAnchors`,
 * which is the render-time transform these links must survive.
 */
const ANCHOR = /(<a\b(?:"[^"]*"|'[^']*'|[^>"'])*>)([\s\S]*?)<\/a>/gi;

/** The visible text of an anchor's content: every tag removed, whitespace collapsed. */
function visibleText(inner) {
  return inner.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * The link text for one anchor: the lightbox title when it has one, the file's
 * own name otherwise.
 *
 * `data-elementor-lightbox-title` is the text Elementor shows for the gallery
 * item, and it is the only human-meaningful string the anchor carries - the
 * anchors are empty, which is why `stripEmptyAnchors` deletes them today.
 * Measured 2026-09-19: all 11 carry it; nine hold the file's stem and two hold
 * real titles (`Curs Pictura 2`). The fallback exists so a future anchor
 * without the attribute still gets a name and survives that transform.
 */
function linkName(title, href) {
  const trimmed = (title ?? '').replace(/\s+/g, ' ').trim();
  if (trimmed !== '') return trimmed;
  return href.split('/').pop().replace(/\.[^.]+$/, '');
}

/**
 * The anchors that can become usable links: an uploads-image href with no
 * visible text inside.
 *
 * THE ELEVEN CURSURI ANCHORS. The page's WordPress gallery wrote each
 * full-size image as an anchor with nothing inside it - the thumbnails live in
 * a separate paragraph and the targets were never migrated - so the body
 * renders eleven invisible, unnamed link stops and axe's `link-name` fails.
 * `src/lib/markdown-links.ts` states the render-time rule and why it is
 * conservative; this is the migration side of the same defect, giving each
 * anchor a name and a destination instead of deleting it.
 *
 * "NO VISIBLE TEXT" IS TAGS-STRIPPED, so an anchor wrapping an `<img>` counts
 * as textless and is collected; the rewrite below cannot name that shape, and
 * `assertImageLinkCount` is what stops the run on it rather than letting it
 * keep an old-host href. Measured 2026-09-19: 0 such anchors on the eleven
 * pages (the count of collectable ones is still 11, all on
 * `cursuri-de-pictura`).
 *
 * Pure and exported, so the positive control - an anchor with no image href -
 * needs no database.
 */
export function linkImagesIn(html) {
  const links = [];
  for (const [, tag, inner] of html.matchAll(ANCHOR)) {
    const href = tag.match(/\bhref\s*=\s*["']([^"']*)["']/i)?.[1];
    if (href === undefined || !LINKED_IMAGE.test(href)) continue;
    if (visibleText(inner) !== '') continue;
    const title = tag.match(/\bdata-elementor-lightbox-title\s*=\s*["']([^"']*)["']/i)?.[1];
    links.push({ href, name: linkName(title, href) });
  }
  return links;
}

/**
 * The link text with Markdown syntax escaped, so a title cannot become link
 * structure.
 *
 * The titles come off a server that was compromised twice; an unescaped `]`
 * closes the link early and whatever follows it becomes markup. Backslashes are
 * escaped first, in the same pass, so a title carrying one cannot neutralise
 * the escape of the next character.
 */
function escapeLinkText(name) {
  return name.replace(/[\\[\]]/g, '\\$&');
}

/**
 * Turns each collected anchor into a named Markdown link at the migrated path.
 *
 * THE EMPTY-ANCHOR SHAPE, `[](<href>)`, which is what Turndown writes for the
 * markup `linkImagesIn` collects. The count of tokens replaced is returned
 * rather than assumed: an anchor whose Markdown shape this did not find is one
 * the caller must refuse to ship, and `assertImageLinkCount` is where that
 * happens.
 *
 * ONE SPACE BETWEEN ADJACENT LINKS, AND IT IS LOAD-BEARING. The source's eleven
 * anchors sit next to each other with nothing between them - the WordPress
 * markup separates them with whitespace Turndown drops - so the rewritten links
 * would be glued into one unbreakable string. Measured on the built page: axe's
 * color-contrast rule returns an `incomplete` for two of them ("partially
 * obscured by another element"), and an incomplete is a red browser pass here.
 * A space is inserted before a link only when the character before it is the
 * closing `)` of another link, so the first link is not indented and no trailing
 * space is left behind.
 *
 * A missing destination is a named error rather than the string "undefined" in
 * a page - the same defence `rewriteImageSources` carries, for the same reason.
 */
export function rewriteLinkedImages(markdown, links, mapping) {
  for (const { href } of links) {
    if (!mapping.has(href)) {
      throw new Error(
        `${href} was collected as a gallery link, but the image migration did not write it. ` +
          'The link is dead; fix it at the source before migrating, because a missing image ' +
          'fails nothing downstream.',
      );
    }
  }
  if (links.length === 0) return { markdown, rewritten: 0 };
  const byHref = new Map(links.map((link) => [link.href, link]));
  const alternatives = [...byHref.keys()]
    .map((href) => href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  let rewritten = 0;
  const result = markdown.replace(
    new RegExp(`\\[\\]\\((${alternatives})\\)`, 'g'),
    (_match, href, offset, whole) => {
      rewritten += 1;
      const { name } = byHref.get(href);
      const separator = whole[offset - 1] === ')' ? ' ' : '';
      return `${separator}[${escapeLinkText(name)}](${markdownPath(mapping.get(href))})`;
    },
  );
  return { markdown: result, rewritten };
}

/**
 * Stops the run when the image anchors and the rewrites disagree.
 *
 * THE COUNT IS THE RAW HTML'S, not `linkImagesIn`'s: it counts every anchor
 * whose href has the uploads-image shape, whether or not this pipeline could
 * collect it. An anchor it did not collect or the rewrite did not find would
 * keep pointing at the old host, and nothing downstream reads a link's
 * destination - `build-output.itest.ts`'s old-host assertion is the second net,
 * and this is the one that fails the migration instead of the build.
 *
 * Pure, so the positive control needs no database; the `<a href uploads-image>`
 * fixture that fires it is the shape a future page could carry.
 */
export function assertImageLinkCount(slug, html, rewritten) {
  const anchors = [...html.matchAll(ANCHOR)].filter(([, tag]) => {
    const href = tag.match(/\bhref\s*=\s*["']([^"']*)["']/i)?.[1];
    return href !== undefined && LINKED_IMAGE.test(href);
  }).length;
  if (anchors !== rewritten) {
    throw new Error(
      `${slug}: ${anchors} <a href uploads-image> anchor(s) but ${rewritten} rewritten. ` +
        'An anchor the migration cannot rewrite keeps pointing at the old host, which stops ' +
        'serving these files - do not ship it.',
    );
  }
}

/**
 * The eleven prose pages, converted and written. Returns the counts.
 *
 * `redirects` is what `extractDocuments` returns as its own `redirects`; the
 * bodies' old-host PDF links are rewritten to the `/documente/<slug>.pdf` files
 * this run writes. The default is the empty map, and that is not a silent pass:
 * every PDF-shaped old-host link in the corpus then stops the run by name.
 *
 * The container must already be running - `run.mjs` starts it once for both
 * extractors - so a test that has no Docker never reaches a query by accident.
 * Importing this module starts nothing.
 *
 * NO PREAMBLE IS STRIPPED HERE, and that is a deliberate absence: `toMarkdown`
 * already calls `stripPreamble`, and the eleven pages are the only documents
 * that have a preamble, so this is the one place where calling it a second time
 * could eat real content that happens to look preamble-shaped.
 */
export async function extractPages(redirects = []) {
  const documentMap = new Map(redirects.map(({ from, to }) => [from, to]));
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
    // Before `toMarkdown`: the account paragraph is removed from the HTML the
    // converter sees, so the number never reaches the Markdown at all. The
    // guards above read the RAW html, which the strip does not change.
    const stripped = stripAccountBlocks(content, page.slug);
    documents.push({
      page,
      // Kept for `assertImageLinkCount`: the guard counts the RAW html's
      // anchors, not the ones `linkImagesIn` recognised.
      html: content,
      title: titlesBySlug.get(page.slug),
      bodySources,
      linkSources: linkImagesIn(content),
      markdown: toMarkdown(stripped, page.slug),
    });
  }

  // ONE `migrateImages` CALL OVER EVERY PAGE, so a picture the pages share
  // (`istoric`, `consiliul-parohial` and `revista-doxologia` all carry the same
  // screenshot) is decoded and written exactly once. The cursuri gallery's
  // full-size files are in the same call: they are referenced only by an
  // anchor, and an anchor is as capable of naming a missing file as an `<img>`
  // is, so the same `assertImageReferences` gate covers them.
  const allSources = documents.flatMap((doc) => [
    ...doc.bodySources,
    ...doc.linkSources.map((link) => link.href),
  ]);
  const mapping = await migrateImages(allSources);

  await mkdir(PAGES_DIR, { recursive: true });
  let written = 0;
  for (const doc of documents) {
    const sources = [...doc.bodySources, ...doc.linkSources.map((link) => link.href)];
    assertImageReferences(doc.page.slug, sources, mapping);
    const linked = rewriteLinkedImages(
      rewriteImageSources(doc.page.slug, doc.markdown, doc.bodySources, mapping),
      doc.linkSources,
      mapping,
    );
    // Before the document rewrite, and against the raw HTML: an image anchor
    // this pipeline did not rewrite must stop the run, not keep its old host.
    assertImageLinkCount(doc.page.slug, doc.html, linked.rewritten);
    const body = rewriteDocumentLinks(linked.markdown, documentMap);

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
