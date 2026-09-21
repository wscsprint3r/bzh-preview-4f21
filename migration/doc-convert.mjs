import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { mkdir, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { UPLOADS_ROOT } from './media.mjs';
import { gatePdf } from './pdf-gate.mjs';

/**
 * The eight `.doc` study files on `/resurse/studii/`, converted once to PDF.
 *
 * WHY A SEPARATE, MANUAL STEP RATHER THAN PART OF `run.mjs`. Spec §11's
 * determinism rule says a rerun produces byte-identical output; LibreOffice
 * stamps each PDF with a creation date, so re-converting on every run would
 * make `public/documente/` differ between two runs of an unchanged tree. The
 * conversion therefore happens ONCE, its output is committed like the 87
 * copied PDFs, and the migration only carries the static redirect rows.
 *
 * WHY THESE EIGHT AT ALL. Spec §11 said `.doc` files are not migrated, and the
 * migrated `studii` page then linked them at the old host — links that die
 * with the old host. The ruling of 2026-09-19 (spec §11 amended) is that a
 * reader who clicks a study text gets the text: converted, gated through the
 * same `pdfinfo` gate as every other document, and served from `/documente/`.
 */
export const DOCUMENTS_DIR = 'public/documente';

/** The eight sources, in the order `studii.md` links them. */
export const DOC_SOURCES = [
  { file: 'Ueber_die_Taufe.doc', slug: 'ueber-die-taufe' },
  { file: 'Ueber_die_Heilige_Eucharistie.doc', slug: 'ueber-die-heilige-eucharistie' },
  { file: 'Ueber_das_Gebet_Vater_unser.doc', slug: 'ueber-das-gebet-vater-unser' },
  { file: 'eminescu.doc', slug: 'eminescu' },
  { file: 'unirea.doc', slug: 'unirea' },
  { file: 'secularizare.doc', slug: 'secularizare' },
  { file: 'coruptibilitate.doc', slug: 'coruptibilitate' },
  { file: 'Sinodul-Iasi.doc', slug: 'sinodul-iasi' },
];

/** The rows the URL map gains: old uploads path -> `/documente/<slug>.pdf`. */
export function docRedirects() {
  return DOC_SOURCES.map(({ file, slug }) => [
    `/wp-content/uploads/2024/05/${file}`,
    `/documente/${slug}.pdf`,
  ]);
}

/** `soffice`, wherever this machine keeps it, or a named failure. */
function sofficeBinary() {
  const candidates = ['soffice', '/Applications/LibreOffice.app/Contents/MacOS/soffice'];
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ['--version'], { stdio: 'ignore' });
      return candidate;
    } catch {
      // try the next one
    }
  }
  throw new Error(
    'LibreOffice (soffice) is not installed, and these .doc files need it.\n' +
      'On macOS: brew install --cask libreoffice',
  );
}

/**
 * Converts every source that has no output yet. `--force` re-converts and
 * overwrites. Each output goes through `gatePdf`; a file the gate refuses is
 * deleted and stops the run by name — a converted study text is still an
 * untrusted document until the same gate that judged the other 87 has read it.
 */
export async function convertDocs({ force = false, log = console.log } = {}) {
  const binary = sofficeBinary();
  await mkdir(DOCUMENTS_DIR, { recursive: true });
  let converted = 0;
  for (const { file, slug } of DOC_SOURCES) {
    const out = join(DOCUMENTS_DIR, `${slug}.pdf`);
    if (existsSync(out) && !force) {
      log(`  ${slug}: already converted`);
      continue;
    }
    const source = join(UPLOADS_ROOT, '2024/05', file);
    if (!existsSync(source)) throw new Error(`${file}: not under ${UPLOADS_ROOT}/2024/05/`);
    const scratch = mkdtempSync(join(tmpdir(), 'doc-convert-'));
    try {
      execFileSync(binary, ['--headless', '--convert-to', 'pdf', '--outdir', scratch, source], {
        stdio: ['ignore', 'ignore', 'inherit'],
      });
      const produced = join(scratch, `${basename(file, '.doc')}.pdf`);
      if (!existsSync(produced)) throw new Error(`${file}: LibreOffice produced no PDF`);
      const verdict = gatePdf(produced);
      if (!verdict.ok) throw new Error(`${file}: the PDF gate refused it — ${verdict.reason}`);
      await rename(produced, out);
      log(`  ${slug}: converted`);
      converted += 1;
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
  log(`converted ${converted} document(s); ${DOC_SOURCES.length - converted} already present`);
  return converted;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await convertDocs({ force: process.argv.includes('--force') });
}
