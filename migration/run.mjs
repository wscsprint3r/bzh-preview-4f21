import { start, stop } from './db.mjs';
import { extractArticles } from './articles.mjs';
import { extractDocuments } from './documents.mjs';
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
 *
 * `PDFs skipped` IS the other shape: the PDF gate drops a failing file by name
 * instead of stopping, so the run reaches the summary with skips, and a
 * non-empty list sets the exit code. The corpus measured 87 clean files, so
 * any skip is a corpus that changed or a file that should not ship.
 */

await start();
let summary;
try {
  const posts = await extractArticles();
  const pages = await extractPages();
  const galleries = await extractGalleries();
  const documents = await extractDocuments();
  const redirects = await writeUrlMap(documents.redirects);
  summary = {
    postsWritten: posts.written,
    postsPublished: posts.published,
    pagesWritten: pages.written,
    imagesMigrated: posts.imagesMigrated + pages.imagesMigrated,
    imagesSkipped: posts.imagesSkipped + pages.imagesSkipped,
    albums: galleries.albums,
    galleryImages: galleries.images,
    documentsWritten: documents.documents,
    pdfsSkipped: documents.skipped.length,
    skippedDocuments: documents.skipped,
    bytesCopied: documents.bytes,
    redirects,
  };
} finally {
  await stop();
}

process.stdout.write(
  '\nMigration summary\n' +
    `  posts written:     ${summary.postsWritten}\n` +
    `  posts published:   ${summary.postsPublished}\n` +
    `  pages written:     ${summary.pagesWritten}\n` +
    `  images migrated:   ${summary.imagesMigrated}\n` +
    `  images skipped:    ${summary.imagesSkipped}\n` +
    `  albums:            ${summary.albums}\n` +
    `  gallery images:    ${summary.galleryImages}\n` +
    `  documents written: ${summary.documentsWritten}\n` +
    `  PDFs skipped:      ${summary.pdfsSkipped}\n` +
    `  bytes copied:      ${summary.bytesCopied}\n` +
    `  redirects:         ${summary.redirects}\n`,
);

if (summary.pdfsSkipped > 0) {
  // Named, not counted: the person reading the failure has to look at the file
  // that was dropped, and the reason says which mechanism refused it.
  process.stdout.write(
    '\nPDFs the gate dropped:\n' +
      summary.skippedDocuments.map((s) => `  ${s.path}: ${s.reason}\n`).join(''),
  );
  process.stdout.write(
    '\nThe corpus measured 87 clean files; a dropped file is not a success.\n',
  );
  process.exitCode = 1;
}

const mustBePositive = [
  ['posts written', summary.postsWritten],
  ['posts published', summary.postsPublished],
  ['pages written', summary.pagesWritten],
  ['images migrated', summary.imagesMigrated],
  ['albums', summary.albums],
  ['gallery images', summary.galleryImages],
  ['documents written', summary.documentsWritten],
  ['redirects', summary.redirects],
];
const zeros = mustBePositive.filter(([, count]) => count === 0).map(([name]) => name);
if (zeros.length > 0) {
  process.stdout.write(
    `\nThe migration produced none of: ${zeros.join(', ')}. That is not a success.\n`,
  );
  process.exitCode = 1;
}
