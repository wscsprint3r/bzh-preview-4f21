import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { gallerySchema } from '../src/lib/content-schema.ts';
import { assertImageReferences, markdownPath } from './articles.mjs';
import { query } from './db.mjs';
import { normalize } from './diacritics.mjs';
import { migrateImages, migrateLegacyImages } from './media.mjs';

/**
 * The two photo albums the old site carried, written as `src/content/galerii/`.
 *
 * THE WP ALBUM IS THE PAGE `evenimente`, measured 2026-09-18: one
 * `image-gallery` widget whose entries live under `settings.wp_gallery` (15
 * entries) while `settings.gallery` is `[]`. The page's other two `"id":`
 * matches are its header images and are NOT part of the album; the controller
 * ruled the widget's entries are the album, so the parser reads `wp_gallery`
 * only.
 *
 * THE DATES ARE CONTENT, NOT STAMPS. 2024-05-05 is Orthodox Easter, the feast
 * the page's heading names; the page's `post_date` (2024-05-14) is an edit
 * stamp. 2001-12-20 is the earliest captioned image, the parish's opening
 * service.
 *
 * THE LEGACY TITLE DROPS THE COLON its heading carries
 * (`<h5>Imagini de la slujbe:</h5>`): the colon introduces the gallery below
 * the heading, it is not part of the name.
 */
const ALBUMS = [
  { slug: 'sfintele-pasti-2024', title: 'Sfintele Paști 2024', date: '2024-05-05' },
  { slug: 'imagini-de-la-slujbe', title: 'Imagini de la slujbe', date: '2001-12-20' },
];

/** Where the migrated albums land, relative to the repository root. */
export const GALLERIES_DIR = 'src/content/galerii';

/**
 * The legacy album page and the tree it reads from, both OUTSIDE this
 * repository and both taken by absolute path for the same reason `media.mjs`'s
 * `UPLOADS_ROOT` is: nothing from the parent directory is ever copied in, and
 * a clone can build from the committed content without holding the backups.
 */
export const LEGACY_HTML =
  '/Users/stefan/Work/stuff/site-bzh/backup-2026-08-22/web01/htdocs/galerie.html';
export const LEGACY_ROOT =
  '/Users/stefan/Work/stuff/site-bzh/backup-2026-08-22/web01/htdocs';

/**
 * The measured shape of the legacy page (2026-09-18 discovery): 10 `<img>`
 * tags, 9 unique files, 10 caption blocks. Checked on every run, because the
 * earlier parser sketch silently mis-paired `galerie/14.jpg` (whose caption
 * block has an empty date) with image 15's date under a non-greedy match - a
 * corpus change that produces plausible, wrong captions on a green run.
 */
export const LEGACY_EXPECTED = { tags: 10, unique: 9 };

/**
 * One entry per `<img>` TAG, in document order, duplicates kept. Each caption
 * is the block that follows its own image; the split is on the `<img` boundary,
 * so a caption can never be paired with the NEXT image - the non-greedy
 * alternative did exactly that when it was measured.
 *
 * The date element may be empty (`galerie/14.jpg` carries `<h5></h5>Zürich`):
 * an empty date is data, and the caption is what survives. A tag with no
 * caption block at all is a stopped run naming the file, because a caption is
 * this album's only content.
 */
export function parseLegacyGallery(html) {
  const items = [];
  // NO `.slice(1)`: a string that BEGINS with `<img` produces no leading empty
  // segment from a zero-width split, so slicing would drop its only image and
  // the single-tag positive control would report "no captioned image found"
  // instead of naming the tag. The heading segment carries no `src` and is
  // skipped by the guard below, which is what keeps it out of the album.
  for (const segment of html.split(/(?=<img\b)/)) {
    const src = segment.match(/<img[^>]+src="(galerie\/[^"]+)"/)?.[1];
    if (!src) continue;
    const block = segment.match(/<h5[^>]*>([^<]*)<\/h5>\s*([^<]*)/);
    if (!block) {
      throw new Error(
        `galerie.html: ${src} has no caption block. A caption is this album's only content; ` +
          'do not migrate an image without one.',
      );
    }
    items.push({ file: src, date: block[1].trim(), caption: normalize(block[2].trim()) });
  }
  if (items.length === 0) throw new Error('galerie.html: no captioned image found.');
  return items;
}

/**
 * Unique files, date folded into the description; a count drift stops the run.
 *
 * The per-image historic date is content, so it stays: `"<date> — <caption>"`,
 * or the bare caption where the date is empty. The duplicate tag of
 * `galerie/15.jpg` collapses to one image.
 *
 * THE COUNTS ARE CHECKED SEPARATELY, and against `expected` rather than against
 * anything derived from the input - a guard that takes its subject from the
 * artifact it checks can only check what it recognised. `extractGalleries`
 * passes the default; the pure tests declare their own sample's shape.
 */
export function legacyAlbumItems(items, expected = LEGACY_EXPECTED) {
  if (items.length !== expected.tags) {
    throw new Error(
      `galerie.html: ${items.length} image tags, but the measured corpus has ${expected.tags}. ` +
        'The page has changed; re-derive the corpus before migrating it.',
    );
  }
  const seen = new Set();
  const unique = [];
  for (const item of items) {
    if (seen.has(item.file)) continue;
    seen.add(item.file);
    unique.push({
      file: item.file,
      description: item.date === '' ? item.caption : `${item.date} — ${item.caption}`,
    });
  }
  if (unique.length !== expected.unique) {
    throw new Error(
      `galerie.html: ${unique.length} unique files, but the measured corpus has ${expected.unique}.`,
    );
  }
  return unique;
}

/**
 * The attachment ids of the image-gallery widget, from `settings.wp_gallery`.
 *
 * `settings.gallery` is deliberately NOT read: on this dump it is `[]` while
 * `wp_gallery` holds the 15 measured entries, so a parser reading the former
 * would return an empty list for a page that has an album. A widget with no
 * `wp_gallery` entries yields an empty list here and the caller's guard stops
 * the run by name.
 */
export function galleryIdsFromElementor(json) {
  const ids = [];
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node === null || typeof node !== 'object') return;
    if (node.widgetType === 'image-gallery' && Array.isArray(node.settings?.wp_gallery)) {
      for (const item of node.settings.wp_gallery) if (item?.id) ids.push(Number(item.id));
    }
    for (const value of Object.values(node)) walk(value);
  };
  try {
    walk(JSON.parse(json));
  } catch {
    // An unreadable blob is an empty gallery here; the caller's count guard
    // stops the run before anything is written.
  }
  return ids;
}

/**
 * Both albums, converted and written. Returns the two counts `run.mjs` reports.
 *
 * The container must already be running - `run.mjs` starts it once for every
 * extractor - so a test that has no Docker never reaches a query by accident.
 * Importing this module starts nothing.
 */
export async function extractGalleries() {
  const rows = await query(
    'SELECT p.post_name, pm.meta_value FROM wpoi_posts p ' +
      "JOIN wpoi_postmeta pm ON pm.post_id=p.ID AND pm.meta_key='_elementor_data' " +
      "WHERE p.post_name='evenimente' AND p.post_type='page'",
  );
  if (rows.length !== 1) {
    throw new Error(
      `The dump has ${rows.length} row(s) for the page evenimente, expected exactly one. ` +
        'That page is the WP album; do not migrate a corpus that does not carry it.',
    );
  }
  const ids = galleryIdsFromElementor(rows[0][1]);
  if (ids.length === 0) {
    throw new Error(
      'evenimente: the image-gallery widget has no entries under settings.wp_gallery. ' +
        'The album has no pictures; do not write an empty gallery.',
    );
  }
  const attachments = await query(
    "SELECT ID, guid FROM wpoi_posts WHERE post_type='attachment' AND ID IN (" +
      `${ids.join(',')})`,
  );
  const guidById = new Map(attachments.map(([id, guid]) => [Number(id), guid]));
  const missing = ids.filter((id) => !guidById.has(id));
  if (missing.length > 0) {
    throw new Error(
      `evenimente: the gallery references attachment id(s) ${missing.join(', ')}, which have ` +
        'no row in wpoi_posts. The album is incomplete; fix it at the source before migrating.',
    );
  }
  // In WIDGET ORDER, not the query's: the first entry is the cover, and
  // `WHERE ID IN` returns rows in whatever order the table gives.
  const wpSources = ids.map((id) => guidById.get(id));
  const wpMapping = await migrateImages(wpSources);
  assertImageReferences(ALBUMS[0].slug, wpSources, wpMapping);

  const legacyItems = legacyAlbumItems(parseLegacyGallery(await readFile(LEGACY_HTML, 'utf8')));
  const legacySources = legacyItems.map((item) => item.file);
  const legacyMapping = await migrateLegacyImages(legacySources, LEGACY_ROOT);
  assertImageReferences(ALBUMS[1].slug, legacySources, legacyMapping);

  const documents = [
    {
      ...ALBUMS[0],
      cover: markdownPath(wpMapping.get(wpSources[0])),
      // WP entries carry no descriptions: the gallery widget holds pictures,
      // not captions.
      images: wpSources.map((src) => ({ file: markdownPath(wpMapping.get(src)) })),
    },
    {
      ...ALBUMS[1],
      cover: markdownPath(legacyMapping.get(legacySources[0])),
      images: legacyItems.map((item) => ({
        file: markdownPath(legacyMapping.get(item.file)),
        description: item.description,
      })),
    },
  ];

  await mkdir(GALLERIES_DIR, { recursive: true });
  for (const doc of documents) {
    const { slug, ...frontmatter } = doc;
    // Validated BEFORE the write: a file that would not build is not written.
    gallerySchema.parse(frontmatter);
    const yaml = stringify(frontmatter, {
      defaultStringType: 'QUOTE_DOUBLE',
      defaultKeyType: 'PLAIN',
      lineWidth: 0,
    });
    await writeFile(join(GALLERIES_DIR, `${slug}.md`), `---\n${yaml}---\n`);
  }

  const images = wpMapping.size + legacyMapping.size;
  // Print what was measured, not only the verdict - `process.stdout.write`
  // because vitest's default reporter swallows `console.log` on the green run a
  // later reader would check these numbers against.
  process.stdout.write(
    `\nAlbums written: ${documents.length}.\n` +
      `  Images migrated: ${images} (${wpMapping.size} WordPress, ` +
      `${legacyMapping.size} legacy).\n`,
  );
  return { albums: documents.length, images };
}
