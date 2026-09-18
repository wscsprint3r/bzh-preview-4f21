import { start, stop } from './db.mjs';
import { extractArticles } from './articles.mjs';
import { extractGalleries } from './galleries.mjs';
import { extractPages } from './pages.mjs';
import { writeUrlMap } from './url-map.mjs';

/**
 * The migration's one entry point: `node migration/run.mjs`.
 *
 * THE DATABASE IS STARTED ONCE AND STOPPED IN A `finally`, so a failed
 * extraction does not leave `bzh-migration` behind and a rerun does not pay
 * for two container starts. Each extractor is imported and called; none of
 * them starts or stops anything itself.
 *
 * THE SUMMARY PRINTS WHAT WAS MEASURED, NOT ONLY THE VERDICT, and the process
 * exits non-zero when one of the counts that must be positive is zero - a
 * migration that produced nothing must not report success. `images skipped` is
 * excluded from that check ON PURPOSE and it is the one count whose zero is
 * the healthy value: in both extractors a reference the image pipeline could
 * not write stops the run before a summary exists, so reaching the summary
 * with any skips is impossible today, and printing the number is what shows
 * the reader the impossibility held.
 */

await start();
let summary;
try {
  const posts = await extractArticles();
  const pages = await extractPages();
  const galleries = await extractGalleries();
  const redirects = await writeUrlMap();
  summary = {
    postsWritten: posts.written,
    postsPublished: posts.published,
    pagesWritten: pages.written,
    imagesMigrated: posts.imagesMigrated + pages.imagesMigrated,
    imagesSkipped: posts.imagesSkipped + pages.imagesSkipped,
    albums: galleries.albums,
    galleryImages: galleries.images,
    redirects,
  };
} finally {
  await stop();
}

process.stdout.write(
  '\nMigration summary\n' +
    `  posts written:   ${summary.postsWritten}\n` +
    `  posts published: ${summary.postsPublished}\n` +
    `  pages written:   ${summary.pagesWritten}\n` +
    `  images migrated: ${summary.imagesMigrated}\n` +
    `  images skipped:  ${summary.imagesSkipped}\n` +
    `  albums:          ${summary.albums}\n` +
    `  gallery images:  ${summary.galleryImages}\n` +
    `  redirects:       ${summary.redirects}\n`,
);

const mustBePositive = [
  ['posts written', summary.postsWritten],
  ['posts published', summary.postsPublished],
  ['pages written', summary.pagesWritten],
  ['images migrated', summary.imagesMigrated],
  ['albums', summary.albums],
  ['gallery images', summary.galleryImages],
  ['redirects', summary.redirects],
];
const zeros = mustBePositive.filter(([, count]) => count === 0).map(([name]) => name);
if (zeros.length > 0) {
  process.stdout.write(
    `\nThe migration produced none of: ${zeros.join(', ')}. That is not a success.\n`,
  );
  process.exitCode = 1;
}
