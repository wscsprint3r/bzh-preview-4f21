// Verifies `stripPreamble`'s real-corpus behaviour with checks stronger
// than "the string changed". A weaker check - `stripPreamble(c) !== c` -
// passes on a document that lost `Layouts:` but kept its breadcrumb line,
// since SOMETHING changed; this checks that a changed document has lost
// BOTH markers it recognises, not just one. It also checks that applying
// the strip twice never changes anything a first application did not
// already change: `stripPreamble` is not idempotent BY CONSTRUCTION (see
// its docblock in `html-md.mjs`) - a document whose real content happened to
// start with something preamble-shaped would lose more on a second pass -
// so this is what stands in for that guarantee on the actual corpus, rather
// than trusting the construction never bites. And it re-proves both
// directions of Task 3's original brief: no post is ever touched, and every
// one of the nine pages this phase targets is.
//
// Needs Docker and the dump outside this repository (see `db.mjs`'s
// README), so it is not part of `npm test` - run by hand:
//
//   node migration/check-preamble.mjs
//
// Exits non-zero and names every offending document on any violation;
// prints the measured counts either way, not only the verdict.

import { stripPreamble } from './html-md.mjs';
import * as db from './db.mjs';

// The nine pages Phase 2 currently migrates - see task-3-brief.md Step 6.
// Taken from the brief by hand, not derived from anything this script
// reads, so a page dropped from the migration plan does not silently drop
// out of this check too.
const NINE_PAGES = [
  'istoric',
  'consiliul-parohial',
  'catehism',
  'studii',
  'revista-doxologia',
  'link-uri-utile',
  'scoala-parohiala',
  'cursuri-de-pictura',
  'servicii-liturgice',
];

// The same two markers `stripPreamble` targets, checked independently of
// its own regexes - a residue check that reused those regexes could not
// catch a bug in them.
function hasResidue(text) {
  return /Layouts:/i.test(text) || /(?:&gt;|>)\s*<u><b>[^<]*<\/b><\/u>/i.test(text);
}

await db.start();
try {
  const rows = await db.query(
    "SELECT post_type, post_name, post_content FROM wpoi_posts WHERE post_status='publish' AND post_type IN ('post','page')",
  );

  const changed = [];
  const withResidue = [];
  const nonIdempotent = [];
  const postsTouched = [];
  const theNinePages = new Map(NINE_PAGES.map((name) => [name, false]));

  for (const [type, name, content] of rows) {
    const afterOneStrip = stripPreamble(content);
    const wasChanged = afterOneStrip !== content;
    if (wasChanged) {
      changed.push(`${type}:${name}`);
      if (hasResidue(afterOneStrip)) withResidue.push(`${type}:${name}`);
    }
    if (type === 'post' && wasChanged) postsTouched.push(name);
    if (type === 'page' && theNinePages.has(name)) theNinePages.set(name, wasChanged);

    const afterTwoStrips = stripPreamble(afterOneStrip);
    if (afterTwoStrips !== afterOneStrip) nonIdempotent.push(`${type}:${name}`);
  }

  const untouchedPages = [...theNinePages.entries()]
    .filter(([, touched]) => !touched)
    .map(([name]) => name);

  process.stdout.write(`documents checked: ${rows.length}\n`);
  process.stdout.write(
    `documents changed by one strip: ${changed.length} - ${changed.join(' ')}\n`,
  );

  const problems = [];
  if (postsTouched.length > 0) {
    problems.push(`posts touched by the strip (must be 0): ${postsTouched.join(', ')}`);
  }
  if (untouchedPages.length > 0) {
    problems.push(`pages from NINE_PAGES untouched by the strip (must be 0): ${untouchedPages.join(', ')}`);
  }
  if (withResidue.length > 0) {
    problems.push(
      `"Layouts:" residue or breadcrumb left after a strip (must be 0): ${withResidue.join(', ')}`,
    );
  }
  if (nonIdempotent.length > 0) {
    problems.push(`stripPreamble is not idempotent on (must be 0): ${nonIdempotent.join(', ')}`);
  }

  if (problems.length > 0) {
    throw new Error(problems.join('\n'));
  }

  process.stdout.write(
    'OK: no post touched, all 9 pages of NINE_PAGES touched, no residue, idempotent over the whole corpus.\n',
  );
} finally {
  await db.stop();
}
