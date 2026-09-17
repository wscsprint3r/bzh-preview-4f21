// Verifies `dezbracaPreambul`'s real-corpus behaviour with checks stronger
// than "the string changed". A weaker check - `dezbracaPreambul(c) !== c` -
// passes on a document that lost `Layouts:` but kept its breadcrumb line,
// since SOMETHING changed; this checks that a changed document has lost
// BOTH markers it recognises, not just one. It also checks that applying
// the strip twice never changes anything a first application did not
// already change: `dezbracaPreambul` is not idempotent BY CONSTRUCTION (see
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
//   node migrare/verifica-preambul.mjs
//
// Exits non-zero and names every offending document on any violation;
// prints the measured counts either way, not only the verdict.

import { dezbracaPreambul } from './html-md.mjs';
import * as db from './db.mjs';

// The nine pages Phase 2 currently migrates - see task-3-brief.md Step 6.
// Taken from the brief by hand, not derived from anything this script
// reads, so a page dropped from the migration plan does not silently drop
// out of this check too.
const NOUA = [
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

// The same two markers `dezbracaPreambul` targets, checked independently of
// its own regexes - a residue check that reused those regexes could not
// catch a bug in them.
function areReziduu(text) {
  return /Layouts:/i.test(text) || /(?:&gt;|>)\s*<u><b>[^<]*<\/b><\/u>/i.test(text);
}

await db.porneste();
try {
  const randuri = await db.interogheaza(
    "SELECT post_type, post_name, post_content FROM wpoi_posts WHERE post_status='publish' AND post_type IN ('post','page')",
  );

  const schimbate = [];
  const cuReziduu = [];
  const neidempotente = [];
  const articoleAtinse = [];
  const paginileNoua = new Map(NOUA.map((nume) => [nume, false]));

  for (const [tip, nume, continut] of randuri) {
    const dupaUnaStripare = dezbracaPreambul(continut);
    const schimbat = dupaUnaStripare !== continut;
    if (schimbat) {
      schimbate.push(`${tip}:${nume}`);
      if (areReziduu(dupaUnaStripare)) cuReziduu.push(`${tip}:${nume}`);
    }
    if (tip === 'post' && schimbat) articoleAtinse.push(nume);
    if (tip === 'page' && paginileNoua.has(nume)) paginileNoua.set(nume, schimbat);

    const dupaDoua = dezbracaPreambul(dupaUnaStripare);
    if (dupaDoua !== dupaUnaStripare) neidempotente.push(`${tip}:${nume}`);
  }

  const paginiNeatinse = [...paginileNoua.entries()]
    .filter(([, atinsa]) => !atinsa)
    .map(([nume]) => nume);

  process.stdout.write(`documente verificate: ${randuri.length}\n`);
  process.stdout.write(
    `documente schimbate de o stripare: ${schimbate.length} - ${schimbate.join(' ')}\n`,
  );

  const probleme = [];
  if (articoleAtinse.length > 0) {
    probleme.push(`articole atinse de stripare (trebuie 0): ${articoleAtinse.join(', ')}`);
  }
  if (paginiNeatinse.length > 0) {
    probleme.push(`pagini din NOUA neatinse de stripare (trebuie 0): ${paginiNeatinse.join(', ')}`);
  }
  if (cuReziduu.length > 0) {
    probleme.push(
      `reziduu de "Layouts:" sau firimitura ramas dupa o stripare (trebuie 0): ${cuReziduu.join(', ')}`,
    );
  }
  if (neidempotente.length > 0) {
    probleme.push(`dezbracaPreambul nu e idempotenta pe (trebuie 0): ${neidempotente.join(', ')}`);
  }

  if (probleme.length > 0) {
    throw new Error(probleme.join('\n'));
  }

  process.stdout.write(
    'OK: niciun articol atins, toate cele 9 pagini din NOUA atinse, niciun reziduu, idempotenta pe tot corpusul.\n',
  );
} finally {
  await db.opreste();
}
