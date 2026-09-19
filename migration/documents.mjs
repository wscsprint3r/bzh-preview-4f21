import { statSync } from 'node:fs';
import { copyFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { stringify } from 'yaml';
import { documentSchema } from '../src/lib/content-schema.ts';
import { query } from './db.mjs';
import { LEGACY_ROOT as HTDOCS_ROOT } from './galleries.mjs';
import { UPLOADS_ROOT, isInside } from './media.mjs';
import { gatePdf } from './pdf-gate.mjs';
import { documentSlug, slugify } from './slugify.mjs';

/**
 * The parish's PDF archive, gated and copied, plus the URL-map rows that keep
 * every old path working.
 *
 * COPY, NEVER RE-ENCODE. The security ruling is recorded in `./pdf-gate.mjs`
 * and in `migration/README.md`: the bytes are copied verbatim, so the gate is
 * the only thing standing between the compromised server's files and this
 * repository's `public/documente/`. A file failing the gate is dropped BY NAME
 * and counted; because the corpus measured 87 clean files, `run.mjs` exits
 * non-zero if the dropped set is not empty.
 *
 * THE TITLE TABLE IS CLOSED, and that is a content decision rather than a
 * parser someone could not be bothered to write. A wrong title on a pastoral
 * letter is content nobody can verify mechanically - the letters carry no
 * machine-readable title, and the filenames are the only metadata there is - so
 * every measured shape has a rule, every rule has an example asserted in
 * `documents.test.mjs`, and a filename matching none stops the migration by
 * name. The alternative, a general humaniser, would confidently produce a
 * plausible wrong title for a file nobody has read.
 *
 * THE DATES ARE THE YEAR IN THE NAME, 1 JANUARY. That is a deliberate
 * simplification: the documents are dated by year on the old site, the months
 * are not in the filenames, and inventing one from a PDF's internal timestamp
 * would be a date nobody published. Six measured files carry no year in the
 * name at all; their rules carry an explicit date, each with its source named
 * in the table below.
 */

/** Where the migrated PDFs land, relative to the repository root. */
export const DOCUMENTS_DIR = 'public/documente';

/** Where the frontmatter that describes them lands. */
export const CONTENT_DIR = 'src/content/documente';

/** The three legacy trees, each measured flat on 2026-09-18. */
const LEGACY_TREES = ['revista', 'pastorala', 'files'];

/** The uploads URL the WordPress dump serves every attachment from. */
const UPLOADS_URL_PREFIX = '/wp-content/uploads/';

/**
 * The measured corpus, 2026-09-18. A run that finds anything else stops.
 *
 * Counts are pinned per tree rather than only in total, because a tree that
 * gained one file while another lost one would keep the total honest and the
 * corpus wrong. The byte total is pinned too: it is what `run.mjs` reports as
 * `bytes copied`, and a corpus whose bytes moved is a corpus somebody must
 * re-measure before it is trusted - the same rule `EXPECTED_POSTS` and
 * `LEGACY_EXPECTED` already set.
 */
export const MEASURED = {
  uploads: 10,
  revista: 26,
  pastorala: 43,
  files: 8,
  bytes: 206424931,
};

/**
 * The last four-digit year in a slug, which is the one the filename means.
 *
 * `pastorala-2011-duminicaortodoxiei` has one; `pastorala-sf-sinod-2015-11-15`
 * has 2015 and two two-digit numbers that must not be read as years, which is
 * why the match is anchored to whole hyphen-separated tokens. The LAST match
 * wins because the measured corpus repeats the year at the end of a name
 * (`9 001 2022 ... RO 2022`), and the end is where the document's year is.
 */
function yearOf(key, relativePath) {
  const years = [...key.matchAll(/(?:^|-)((?:19|20)\d{2})(?=-|$)/g)].map((m) => m[1]);
  if (years.length === 0) {
    throw new Error(
      `${relativePath}: no year in the filename, and no rule in the table carries a date for ` +
        'it. Do not invent one; read the document and add it to the table.',
    );
  }
  return years[years.length - 1];
}

/**
 * The closed table: one rule per measured filename shape.
 *
 * Each entry is `{ name, test, title, tree?, date? }`. `test` runs against the
 * slugified basename, so separators, case and the diacritics' exact form do not
 * matter; `title(key)` builds the Romanian title from the same key; `tree`
 * narrows a rule to one source tree (used by the `files/` entries, whose names
 * are unique enough that a bare-key match would quietly claim a same-named file
 * from another tree); `date` is the explicit date for a file whose name carries
 * no year.
 *
 * ORDER IS PART OF THE TABLE. `sf-sinod` must be asked before
 * `duminica-ortodoxiei`, or the synod letter titled `... la Duminica
 * Ortodoxiei` would lose `Sfântul Sinod`; `postul-craciunului` before `craciun`
 * for the same reason. A new rule belongs where its most specific neighbour is,
 * not at the end.
 */
const RULES = [
  {
    name: 'doxologia issue',
    test: /doxologia-(\d+)-((?:19|20)\d{2})/,
    title: (key) => {
      const m = key.match(/doxologia-(\d+)-((?:19|20)\d{2})/);
      return `Revista Doxologia nr. ${Number(m[1])} — ${m[2]}`;
    },
  },
  {
    name: 'the Holy Synod, at the Sunday of Orthodoxy',
    test: /(?:^|-)sf-sinod.*duminica-?ortodoxiei/,
    title: (key, relativePath) => `Pastorală Sfântul Sinod la Duminica Ortodoxiei ${yearOf(key, relativePath)}`,
  },
  {
    name: 'the Holy Synod',
    test: /(?:^|-)sf-sinod/,
    title: (key, relativePath) => `Pastorală Sfântul Sinod ${yearOf(key, relativePath)}`,
  },
  {
    name: 'Duminica Ortodoxiei',
    test: /duminica-?ortodoxiei/,
    title: (key, relativePath) => `Pastorală Duminica Ortodoxiei ${yearOf(key, relativePath)}`,
  },
  {
    name: 'Postul Crăciunului',
    test: /postul-craciunului/,
    title: (key, relativePath) => `Pastorală Postul Crăciunului ${yearOf(key, relativePath)}`,
  },
  {
    name: 'Pogorârea Duhului Sfânt',
    test: /pogorarea-duhului-sfant/,
    title: (key, relativePath) => `Pastorală Pogorârea Duhului Sfânt ${yearOf(key, relativePath)}`,
  },
  {
    name: 'Învierea Domnului',
    test: /invierea-domnului|(?:^|-)pastorala-inviere(?:-|$)/,
    title: (key, relativePath) => `Pastorală la Învierea Domnului ${yearOf(key, relativePath)}`,
  },
  {
    name: 'Nașterea Domnului',
    test: /nasterea-domnului|(?:^|-)nasterea-|(?:^|-)nastere-/,
    title: (key, relativePath) => `Pastorală la Nașterea Domnului ${yearOf(key, relativePath)}`,
  },
  {
    name: 'Rusalii',
    test: /(?:^|-)rusalii(?:-|$)/,
    title: (key, relativePath) => `Pastorală la Rusalii ${yearOf(key, relativePath)}`,
  },
  {
    name: 'Crăciun',
    test: /(?:^|-)craciun(?:-|$)/,
    title: (key, relativePath) => `Pastorală la Crăciun ${yearOf(key, relativePath)}`,
  },
  {
    name: 'Paști',
    test: /(?:^|-)pasti(?:-|$)/,
    title: (key, relativePath) => `Pastorală la Paști ${yearOf(key, relativePath)}`,
  },
  {
    name: 'the monthly letter for February',
    test: /(?:^|-)februarie(?:-|$)|(?:^|-)febr(?:-|$)/,
    title: (key, relativePath) => `Pastorală februarie ${yearOf(key, relativePath)}`,
  },
  {
    name: 'the monthly letter for October',
    test: /(?:^|-)octombrie(?:-|$)/,
    title: (key, relativePath) => `Pastorală octombrie ${yearOf(key, relativePath)}`,
  },
  /*
   * The eight `files/` documents, one entry each. Their titles are the ones the
   * old site printed beside the link where a link exists (measured in the
   * legacy tree's revista.html, scoala.html and info.html, which are outside
   * this repository), and the
   * document's own first page otherwise. Their dates: the year in the name
   * where there is one, and otherwise the year the document was made, read from
   * `pdfinfo` and the text itself, named per entry.
   */
  {
    name: 'the parish statutes, the German version the old site linked',
    tree: 'files',
    test: /^bor-zh-statuten-d-2021-definitiv$/,
    title: () => 'Statutul parohiei (DE)',
    date: '2021-01-01',
  },
  {
    name: 'the parish statutes, German',
    tree: 'files',
    test: /^bo-statuten-d-2021$/,
    title: () => 'Statuten der Kirchgemeinde St. Nikolaus Zürich',
    date: '2021-01-01',
  },
  {
    name: 'the agenda of the 17 January 2021 members’ meeting',
    tree: 'files',
    test: /^bo-traktanden-17-01-21$/,
    title: () => 'Traktanden der Mitgliederversammlung vom 17.01.2021',
    // The date is in the document: "Traktanden Mitgliederversammlung vom
    // 17.01.2021".
    date: '2021-01-17',
  },
  {
    name: 'the confession of faith, German',
    tree: 'files',
    test: /^das-bekenntnis-des-glaubens-der-heiligen-orthodoxen-kirche$/,
    title: () => 'Das Bekenntnis des Glaubens der Heiligen Orthodoxen Kirche',
    // The PDF's own CreationDate is 2015-12-21; no date is printed in it.
    date: '2015-01-01',
  },
  {
    name: 'the parish school presentation',
    tree: 'files',
    test: /^prezentarea-scolii-parohiale-zh$/,
    title: () => 'Prezentarea Școlii parohiale',
    // The PDF's own CreationDate is 2009-01-10; no date is printed in it.
    date: '2009-01-01',
  },
  {
    name: 'the 2010 Saint Nicholas children’s programme',
    tree: 'files',
    test: /^scoala-parohiala-2010$/,
    title: () => 'Programul de Moș Nicolae 2010 — Sărbătoarea Copiilor',
    date: '2010-01-01',
  },
  {
    name: 'the explanation of the Divine Liturgy',
    tree: 'files',
    test: /^sfliturgie$/,
    title: () => 'O explicare a Sfintei Liturghii',
    // The imprint on the first page is 2011.
    date: '2011-01-01',
  },
  {
    name: 'the 2008 Saint Nicholas children’s programme',
    tree: 'files',
    test: /^program-mos-nicolae$/,
    title: () => 'Programul de Moș Nicolae 2008',
    // The programme itself is dated Zuerich 2007-2008 and the old page called
    // the link "Programul de Mos Nicolae 2008".
    date: '2008-01-01',
  },
  {
    name: 'the study on Saint Antim Ivireanul',
    test: /^sf-antim-ivireanul$/,
    title: () => 'Sfântul Antim Ivireanul — o lumină pentru cei de azi',
    // The title is the document's own first line. The PDF's CreationDate is
    // 2016-09-28, and the name carries no year.
    date: '2016-01-01',
  },
];

/**
 * The rule and slugified key for a source path, or a stopped run naming it.
 *
 * `tree` is the path's first segment (`files`, `pastorala`, `revista`); the
 * uploads tree arrives as `wp-content/uploads/...`, whose first segment is
 * `wp-content`, and no rule narrows on it, so an uploads file can only match a
 * rule that is about the filename itself.
 */
function ruleFor(relativePath) {
  const key = slugify(basename(relativePath).replace(/\.pdf$/i, ''));
  const tree = relativePath.includes('/') ? relativePath.slice(0, relativePath.indexOf('/')) : '';
  const rule = RULES.find((r) => (!r.tree || r.tree === tree) && r.test.test(key));
  if (!rule) {
    throw new Error(
      `${relativePath}: no title rule recognises this filename. The table is the measured ` +
        'corpus, and a filename it does not carry has not been read by anyone - add a rule ' +
        'with a title a person has checked, do not let a general parser guess one.',
    );
  }
  return { rule, key };
}

/** The Romanian title for one source path. Pure; throws on an unmeasured name. */
export function documentTitle(relativePath) {
  const { rule, key } = ruleFor(relativePath);
  return rule.title(key, relativePath);
}

/** The `YYYY-MM-DD` date for one source path. Pure; throws on an unmeasured name. */
export function documentDate(relativePath) {
  const { rule, key } = ruleFor(relativePath);
  if (rule.date) return rule.date;
  return `${yearOf(key, relativePath)}-01-01`;
}

/**
 * Every entry's destination slug, with collisions resolved by tree prefix.
 *
 * THE RULE: a slug claimed by exactly one source file stays bare; a slug
 * claimed by more than one is prefixed with each claimant's tree, so both move
 * (`pastorala-...` and `uploads-...`). If prefixing still leaves two entries on
 * one slug - the same basename twice in one tree - the run stops naming both,
 * because the only remaining fixes are a rename at the source or a hand-written
 * slug, and both are decisions rather than defaults.
 *
 * Pure and exported: the collision the real corpus does not contain is the one
 * a test can construct, and the rule must be exercised by something.
 */
export function resolveSlugs(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const group = groups.get(entry.slug) ?? [];
    group.push(entry);
    groups.set(entry.slug, group);
  }
  const resolved = entries.map((entry) =>
    groups.get(entry.slug).length === 1 ? entry.slug : `${entry.tree}-${entry.slug}`,
  );
  const seen = new Map();
  resolved.forEach((slug, index) => {
    if (seen.has(slug)) {
      throw new Error(
        `${entries[index].relativePath} and ${seen.get(slug)} both resolve to "${slug}". ` +
          'Prefixing with the tree did not separate them; rename one at the source.',
      );
    }
    seen.set(slug, entries[index].relativePath);
  });
  return resolved;
}

/** Every `.pdf` under a directory, recursively, as paths relative to it. */
async function pdfsUnder(dir, relative = '') {
  const found = [];
  for (const entry of await readdir(join(dir, relative), { withFileTypes: true })) {
    if (entry.isDirectory()) {
      found.push(...(await pdfsUnder(dir, `${relative}${entry.name}/`)));
    } else if (entry.name.toLowerCase().endsWith('.pdf')) {
      found.push(`${relative}${entry.name}`);
    }
  }
  return found.sort();
}

/**
 * The legacy files, by walking the measured trees.
 *
 * `oldPath` is the URL path a browser requested from the old static site,
 * percent-encoded segment by segment: the filenames carry spaces and diacritics
 * (`Pastorala Pogorârea Duhului Sfânt 2023.pdf`), a raw space cannot survive a
 * `_redirects` line, and the browser that followed the old link sent the
 * encoded form. Phase 4 copies this token into `_redirects` verbatim.
 */
async function legacyEntries() {
  const entries = [];
  for (const tree of LEGACY_TREES) {
    const root = join(HTDOCS_ROOT, tree);
    for (const relative of await pdfsUnder(root)) {
      const source = `${tree}/${relative}`;
      entries.push({
        tree,
        relativePath: source,
        oldPath: `/${source.split('/').map(encodeURIComponent).join('/')}`,
        absolutePath: join(root, relative),
      });
    }
  }
  return entries;
}

/**
 * The uploads files, from the attachment rows rather than from the tree.
 *
 * The dump is the authority on what the old site served: a PDF sitting in
 * `wp-content/uploads/` with no `application/pdf` attachment row was never
 * linked, and the site's own URL map is about links. The guid is the URL as the
 * old site served it, which is also this row's `oldPath`.
 *
 * THE PATH IS REBUILT SEGMENT BY SEGMENT from the URL, each segment decoded
 * once, and the result is held inside `UPLOADS_ROOT` with `isInside` - the same
 * second lock `media.mjs` uses for the image pipeline, because the dump came
 * off a server attackers held twice and a guid is text from that dump.
 */
async function uploadEntries() {
  const rows = await query(
    "SELECT guid FROM wpoi_posts WHERE post_type='attachment' AND post_mime_type='application/pdf'",
  );
  return rows.map(([guid]) => {
    const url = new URL(guid);
    if (url.origin !== 'https://www.bor-zh.ch' || !url.pathname.startsWith(UPLOADS_URL_PREFIX)) {
      throw new Error(
        `${guid}: a PDF attachment whose guid is not a bor-zh.ch uploads URL. ` +
          'Do not migrate a file from a host nobody measured.',
      );
    }
    const relative = url.pathname
      .slice(UPLOADS_URL_PREFIX.length)
      .split('/')
      .map(decodeURIComponent)
      .join('/');
    const absolutePath = join(UPLOADS_ROOT, relative);
    if (!isInside(UPLOADS_ROOT, absolutePath)) {
      throw new Error(`${guid}: resolves outside the uploads tree, which is never migrated from.`);
    }
    return {
      tree: 'uploads',
      relativePath: `wp-content/uploads/${relative}`,
      oldPath: url.pathname,
      absolutePath,
    };
  });
}

/**
 * Stops the run when the corpus on disk is not the measured one.
 *
 * A migration that silently migrates a different corpus is the failure the
 * counts in `MEASURED` exist for: one file added or removed changes the URL map
 * and the content tree without anything looking wrong.
 */
function assertMeasuredCorpus(entries) {
  for (const tree of [...LEGACY_TREES, 'uploads']) {
    const found = entries.filter((entry) => entry.tree === tree).length;
    if (found !== MEASURED[tree]) {
      throw new Error(
        `${tree}: ${found} PDF(s), but the measured corpus has ${MEASURED[tree]}. ` +
          'Re-measure the corpus and update MEASURED before migrating it.',
      );
    }
  }
  const bytes = entries.reduce((sum, entry) => sum + statSync(entry.absolutePath).size, 0);
  if (bytes !== MEASURED.bytes) {
    throw new Error(
      `The corpus measures ${bytes} bytes, but the measured corpus is ${MEASURED.bytes}. ` +
        'A file has changed; do not copy bytes nobody has measured.',
    );
  }
}

/**
 * Every entry, with its destination slug, title and date - the one plan the
 * writer and the redirect reader both start from.
 *
 * THE SLUGS ARE COMPUTED TWICE, on purpose. The computation is pure today, so
 * the two runs agree by construction; the comparison is a tripwire for the day
 * slugification grows a dependency on the locale, the clock or anything else
 * that would make two machines write two `docs/url-map.csv` files. It is cheap
 * and it is the property the repeatability check downstream depends on.
 *
 * Titles and dates are resolved for EVERY entry before anything is written: an
 * unmeasured filename must stop the run before the tree holds a half-migrated
 * corpus.
 */
async function plannedDocuments() {
  const entries = [...(await legacyEntries()), ...(await uploadEntries())].sort((a, b) =>
    a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0,
  );
  assertMeasuredCorpus(entries);

  const slugs = resolveSlugs(
    entries.map((entry) => ({ ...entry, slug: documentSlug(entry.relativePath) })),
  );
  const again = resolveSlugs(
    entries.map((entry) => ({ ...entry, slug: documentSlug(entry.relativePath) })),
  );
  for (const [index, slug] of slugs.entries()) {
    if (slug !== again[index]) {
      throw new Error(`${entries[index].relativePath}: slug computation is not deterministic.`);
    }
  }

  return entries.map((entry, index) => ({
    ...entry,
    slug: slugs[index],
    title: documentTitle(entry.relativePath),
    date: documentDate(entry.relativePath),
  }));
}

/**
 * The old path -> new `/documente/<slug>.pdf` for every migrated PDF.
 *
 * THE SAME PLAN `extractDocuments` WRITES FROM, exposed so the prose extractors
 * can rewrite their old-host PDF links to the files this run writes. Planning
 * only - it reads the dump and the legacy trees and writes nothing - so the
 * direct run of `articles.mjs` can call it without copying 87 PDFs. `run.mjs`
 * passes `extractDocuments`'s own redirects instead, because it has them;
 * both derive from `plannedDocuments`, so the two cannot disagree.
 *
 * The old path is the legacy absolute path (`/revista/doxologia_18_2019.pdf`)
 * or the uploads path as the old site served it (`/wp-content/uploads/…`),
 * which is what a migrated body links to; the new path is absolute, because a
 * document is a download and the route depth of the page must not matter.
 */
export async function documentRedirects() {
  const planned = await plannedDocuments();
  return planned.map((entry) => ({ from: entry.oldPath, to: `/documente/${entry.slug}.pdf` }));
}

/**
 * Gates every PDF, copies the passing ones byte-for-byte, and writes one
 * content file each. Returns the counts `run.mjs` reports.
 *
 * The container must already be running - `run.mjs` starts it once for every
 * extractor - so importing this module starts nothing.
 */
export async function extractDocuments() {
  const planned = await plannedDocuments();

  await mkdir(DOCUMENTS_DIR, { recursive: true });
  await mkdir(CONTENT_DIR, { recursive: true });

  const skipped = [];
  const redirects = [];
  let documents = 0;
  let bytes = 0;
  for (const entry of planned) {
    const verdict = gatePdf(entry.absolutePath);
    if (!verdict.ok) {
      skipped.push({ path: entry.relativePath, reason: verdict.reason });
      continue;
    }
    const file = `/documente/${entry.slug}.pdf`;
    const frontmatter = { title: entry.title, date: entry.date, file };
    // Validated BEFORE the write: a content file that would not build is not
    // written, and the failure names the source file.
    documentSchema.parse(frontmatter);
    await copyFile(entry.absolutePath, join(DOCUMENTS_DIR, `${entry.slug}.pdf`));
    const yaml = stringify(frontmatter, {
      defaultStringType: 'QUOTE_DOUBLE',
      defaultKeyType: 'PLAIN',
      lineWidth: 0,
    });
    await writeFile(join(CONTENT_DIR, `${entry.slug}.md`), `---\n${yaml}---\n`);
    redirects.push({ from: entry.oldPath, to: file });
    bytes += statSync(entry.absolutePath).size;
    documents += 1;
  }

  // Print what was measured, not only the verdict - `process.stdout.write`
  // because vitest's default reporter swallows `console.log` on the green run a
  // later reader would check these numbers against.
  process.stdout.write(
    `\nDocuments written: ${documents} (${bytes} bytes, ${skipped.length} skipped).\n` +
      (skipped.length === 0
        ? ''
        : `  Skipped: ${skipped.map((s) => `${s.path} (${s.reason})`).join(', ')}\n`),
  );
  return { documents, bytes, skipped, redirects };
}
