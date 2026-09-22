/*
 * ONE COVER PER DOXOLOGIA ISSUE, RENDERED FROM PAGE 1 OF THE PDF THE PAGE
 * ALREADY LINKS.
 *
 * WHY REGENERATE RATHER THAN RESIZE. The page's 31 images measure: 25 old-site
 * thumbnails at ~250x353, four 1142-1258px screenshots, one 1024x754 landscape
 * screenshot that is not a cover, and a 814x1130 banner that is not a cover
 * either. A CSS width alone would upscale the 250px thumbnails to the 578px
 * reading column - blurry. Worse, every entry currently shows the PREVIOUS
 * issue's cover: Nr.28's entry shows doxologia_27_2024.jpg, Nr.27's shows
 * doxologia_26_2023.jpg, and so on. Page 1 of each linked PDF is the cover at
 * print resolution, so rendering from there fixes the pairing and the size in
 * one step, and makes a cover and the file it advertises impossible to desync.
 *
 * THE THREE LETTER-SPREAD ISSUES. doxologia-1-2011.pdf, doxologia-2-2011.pdf
 * and doxologia-3-2012.pdf are 1224x792pt pages: each sheet carries two
 * US-Letter pages side by side, and the cover is the RIGHT half - verified by
 * eye on all three. Page 1 is rendered at twice the target width and the right
 * half extracted; every other issue's page 1 is the cover, at A4 portrait.
 *
 * PAIRING RULE. An entry with a /documente/doxologia-....pdf link uses it (that
 * is what the reader clicks, so that is what the cover must show). An entry
 * with no link is paired by its heading's issue and year - today that is only
 * Nr.12, whose link the old page never had. The heading is not authoritative
 * on its own: Nr.16's heading says 2019 and its link says 16-2018, and the
 * link wins.
 *
 * RUN BY HAND, ONCE PER COVER CHANGE, like migration/doc-convert.mjs. It reads
 * only files inside this repository, so unlike the rest of migration/ it runs
 * in a fresh clone. It rewrites the page and writes the images; commit both.
 * A migration re-run would restore the old paths, so the order after one is:
 * run the migration, then run this.
 *
 * 1200px, because the reading column is 578px and DPR 2 needs 1156. The
 * markdown image pipeline emits one derivative per body image, no srcset, so
 * this one number is the file a phone and a retina desktop both fetch.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { reencode } from './media.mjs';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const PAGE_PATH = 'src/content/pages/revista-doxologia.md';
export const DOCS_DIR = 'public/documente';
export const OUT_DIR = 'src/assets/content/2026/09';
export const COVER_WIDTH = 1200;

const HEADING = /^Nr\.?\s*(\d+)\s*\([^,]+,\s*(\d{4})\)/;
const PDF_LINK = /\]\(\/documente\/(doxologia-[^)]+\.pdf)\)/;
const IMAGE = /!\[\]\((\.\.\/\.\.\/assets\/content\/[^)]+)\)/;

/**
 * The page's entries in document order, with the lines each occupies.
 *
 * `last` is the entry's last non-empty line before the next section heading
 * (`## Revista Doxologia` opens the following entry), which is where an entry
 * with no image gets one appended. A `Nr.` heading starts an entry; nothing
 * before the first heading (the banner image) belongs to one. A `##` line is
 * a boundary and never content: counting it let Nr.7's appended cover land on
 * the NEXT entry's `## Revista Doxologia` line, inside its `<h2>`.
 */
export function parseEntries(markdown) {
  const lines = markdown.split('\n');
  const entries = [];
  let current = null;
  lines.forEach((line, index) => {
    const heading = HEADING.exec(line);
    if (heading) {
      current = {
        issue: Number(heading[1]),
        year: Number(heading[2]),
        link: null,
        image: null,
        start: index,
        last: index,
      };
      entries.push(current);
      return;
    }
    if (current === null) return;
    if (line.startsWith('## ')) return;
    if (line.trim() !== '') current.last = index;
    const link = PDF_LINK.exec(line);
    if (link) current.link = link[1];
    const image = IMAGE.exec(line);
    if (image) current.image = image[1];
  });
  return entries;
}

/** The PDF an entry's cover comes from: the link, or the heading. */
export function pairPdf(entry, pdfNames) {
  if (entry.link !== null) {
    if (!pdfNames.includes(entry.link)) {
      throw new Error(
        `Nr.${entry.issue} (${entry.year}) links ${entry.link}, which is not in ${DOCS_DIR}/`,
      );
    }
    return entry.link;
  }
  const pattern = new RegExp(`^doxologia-${entry.issue}-${entry.year}(?:-|\\.)`);
  return pdfNames.find((name) => pattern.test(name)) ?? null;
}

/** The one file name a PDF's cover gets: doxologia-<issue>-<year>.jpg. */
export function coverName(pdfName) {
  const match = /^(doxologia-\d+-\d{4})/.exec(pdfName);
  if (match === null) throw new Error(`${pdfName} is not a doxologia-N-YYYY name`);
  return `${match[1]}.jpg`;
}

/** Page 1's size in points, from the same poppler the PDF gate uses. */
export function pageSize(pdfPath) {
  const info = execFileSync('pdfinfo', [pdfPath], { encoding: 'utf8' });
  const match = /^Page size:\s+([\d.]+) x ([\d.]+) pts/m.exec(info);
  if (match === null) throw new Error(`pdfinfo reported no page size for ${pdfPath}`);
  return { width: Number(match[1]), height: Number(match[2]) };
}

/** A sheet wider than it is tall carries two Letter pages; the cover is right. */
export function isSpread(size) {
  return size.width > size.height;
}

/** The repository path a generated cover is written to. */
export function coverPath(name) {
  return `${OUT_DIR}/${name}`;
}

/** The path a content file uses to name the generated cover. */
export function markdownPath(name) {
  return `../../assets/${OUT_DIR.replace('src/assets/', '')}/${name}`;
}

/**
 * The page with each entry's image replaced, and Nr.7's appended.
 *
 * POSITIONAL, NOT A GLOBAL REPLACE: doxologia_24_2022.jpg appears in two
 * entries (Nr.25's and Nr.22's) and each maps to a different issue's cover, so
 * the replacement happens inside each entry's own lines.
 */
export function rewriteMarkdown(markdown, entries, names) {
  const lines = markdown.split('\n');
  entries.forEach((entry, index) => {
    const rel = markdownPath(names[index]);
    if (entry.image !== null) {
      for (let line = entry.start; line <= entry.last; line += 1) {
        lines[line] = lines[line].replace(entry.image, rel);
      }
    } else {
      lines[entry.last] = `${lines[entry.last]} ![](${rel})`;
    }
  });
  return lines.join('\n');
}

async function renderCover(pdfPath, spread) {
  const dir = mkdtempSync(join(tmpdir(), 'doxologia-cover-'));
  try {
    execFileSync('pdftoppm', [
      '-f', '1', '-l', '1',
      '-jpeg', '-jpegopt', 'quality=90',
      '-scale-to-x', String(spread ? COVER_WIDTH * 2 : COVER_WIDTH),
      '-scale-to-y', '-1',
      pdfPath, join(dir, 'page'),
    ]);
    const rendered = join(dir, readdirSync(dir)[0]);
    let source = rendered;
    if (spread) {
      const meta = await sharp(rendered).metadata();
      const width = meta.width ?? 0;
      const height = meta.height ?? 0;
      source = join(dir, 'half.jpg');
      writeFileSync(
        source,
        await sharp(rendered)
          .extract({ left: width / 2, top: 0, width: width / 2, height })
          .jpeg({ quality: 90 })
          .toBuffer(),
      );
    }
    return await reencode(source, 'cover.jpg');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  const pdfNames = readdirSync(join(ROOT, DOCS_DIR))
    .filter((name) => name.startsWith('doxologia-'))
    .sort();
  const markdown = readFileSync(join(ROOT, PAGE_PATH), 'utf8');
  const entries = parseEntries(markdown);
  const names = [];
  const report = [];
  for (const entry of entries) {
    const pdf = pairPdf(entry, pdfNames);
    if (pdf === null) {
      throw new Error(`Nr.${entry.issue} (${entry.year}) pairs with no PDF - fix the heading or add the file`);
    }
    const name = coverName(pdf);
    const spread = isSpread(pageSize(join(ROOT, DOCS_DIR, pdf)));
    const bytes = await renderCover(join(ROOT, DOCS_DIR, pdf), spread);
    mkdirSync(join(ROOT, OUT_DIR), { recursive: true });
    writeFileSync(join(ROOT, coverPath(name)), bytes);
    names.push(name);
    report.push(`${pdf} -> ${name}${spread ? ' (spread: right half)' : ''} ${bytes.length} B`);
  }
  writeFileSync(join(ROOT, PAGE_PATH), rewriteMarkdown(markdown, entries, names));
  process.stdout.write(
    `\n${report.join('\n')}\n\n${entries.length} covers written to ${OUT_DIR}/, page rewritten.\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
