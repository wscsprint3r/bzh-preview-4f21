import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { PDF_GATE, gatePdf, gateVerdict } from '../../migration/pdf-gate.mjs';
import { DOC_SOURCES } from '../../migration/doc-convert.mjs';

/*
 * WHAT THIS PROVES: every PDF this repository ships is one the gate would pass
 * if it were migrated today, and every content file that describes one names a
 * file that is really there.
 *
 * THE PDF TREE IS THE ONE BINARY TREE `diacritics-sources.test.ts` EXEMPTS BY
 * NAME. Its predicate excuses `public/documente/*.pdf` from the text sweep
 * because a PDF is bytes, and on its own that is a pure weakening: a PHP
 * payload renamed to `.pdf` would sit there exempt. What replaces the
 * name-by-name property is this file - the same arrangement `binaries.itest.ts`
 * has for the image trees, and for the same reason. A name list is defeated by
 * renaming a file; a parser that reads it is not.
 *
 * IT RUNS THE REAL GATE, NOT A COPY. `gatePdf` shells `pdfinfo` and
 * `pdfinfo -js` and scans the bytes for `PDF_GATE`, exactly as the migration
 * does, so a PDF added by hand after the migration cannot bypass the check that
 * ran during it. `npm run test:build` runs this after the build, which is when
 * `dist/` and the committed tree are both present; CI installs poppler for it.
 *
 * A GUARD THAT READS FILES MUST PROVE IT READ SOMETHING. The tree and the
 * content directory are asserted non-empty and to hold the same number of
 * files, and the gate's three arms each have a positive control below, so a
 * gate that had stopped firing cannot read as a clean corpus.
 *
 * WHAT IT DOES NOT PROVE: that the committed bytes are the ones the migration
 * copied. The source corpus lives outside the repository and a fresh clone
 * cannot read it; the byte-for-byte evidence is the migration run's own
 * repeatability check (two runs, identical `sha256` manifests), not this file.
 */

const DOCUMENTS = fileURLToPath(new URL('../../public/documente/', import.meta.url));
const CONTENT = fileURLToPath(new URL('../content/documente/', import.meta.url));

/**
 * Every committed PDF, pinned by number for the same reason `pageFiles` pins
 * nine: this tree is the migration's output and is not expected to grow. A PDF
 * added by hand fails here until somebody looks at it and says what it is.
 *
 * 95 = the 87 `extractDocuments` copied from the dump, plus the eight `.doc`
 * study files `migration/doc-convert.mjs` converted once and committed (Task 4,
 * spec §11 as amended). The gate below walks all ninety-five; the eight
 * converted studies are downloads on `/resurse/studii/` and are not entries in
 * the `documente` collection, which is why the content-file count is pinned
 * separately.
 */
const EXPECTED = 95;

/**
 * The documents `extractDocuments` wrote a content file for: one `.md` per
 * migrated PDF, which is what the `documente` collection and the `/pastorale/`
 * index are built from. The eight converted study files have none, so this is
 * the one number in this file that does not equal the PDF count. It is pinned
 * by hand and held to `DOC_SOURCES` by the assertions below.
 */
const MIGRATED = 87;

/** Every `.pdf` in the committed tree, sorted, by file name. */
function committedPdfs(): string[] {
  if (!existsSync(DOCUMENTS)) return [];
  return readdirSync(DOCUMENTS)
    .filter((name) => name.toLowerCase().endsWith('.pdf'))
    .sort();
}

/** Every content file, with its parsed frontmatter. */
function contentFiles(): { name: string; frontmatter: Record<string, unknown> }[] {
  if (!existsSync(CONTENT)) return [];
  return readdirSync(CONTENT)
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) => {
      const text = readFileSync(join(CONTENT, name), 'utf8');
      const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
      expect(block, `${name} has no frontmatter block`).not.toBeNull();
      return {
        name,
        frontmatter: parseYaml((block as RegExpExecArray)[1] as string) as Record<string, unknown>,
      };
    });
}

describe('the committed PDF archive', () => {
  it('exists and holds the measured 95 files', () => {
    expect(existsSync(DOCUMENTS), `${DOCUMENTS} is missing`).toBe(true);
    expect(committedPdfs().length, 'public/documente/ does not hold 95 PDFs').toBe(EXPECTED);
  });

  it('has one content file per migrated PDF, and every one names a file that exists', () => {
    const pdfs = committedPdfs();
    const contents = contentFiles();
    // Both halves, so neither an emptied tree nor a content file pointing at a
    // missing PDF can pass.
    expect(contents.length, 'no content file - the loop below would prove nothing').toBe(MIGRATED);
    // The other direction, closed on the one difference the tree is allowed to
    // have: the PDFs with no content file are exactly the converted study
    // files, by name, so a hand-added PDF cannot hide in the difference and a
    // converted file dropped from the tree still fails.
    expect(pdfs.length - contents.length, 'the PDFs without a content file are not the converted studies')
      .toBe(DOC_SOURCES.length);
    expect(EXPECTED - MIGRATED, 'the two pinned counts no longer describe DOC_SOURCES')
      .toBe(DOC_SOURCES.length);
    const names = new Set(pdfs);
    for (const { slug } of DOC_SOURCES) {
      expect(names.has(`${slug}.pdf`), `${slug}.pdf is a converted study and must be committed`).toBe(true);
    }
    for (const { name, frontmatter } of contents) {
      const file = String(frontmatter.file ?? '');
      expect(file, `${name} does not name a /documente/ PDF`).toMatch(/^\/documente\/[a-z0-9-]+\.pdf$/);
      const pdf = file.slice('/documente/'.length);
      expect(names.has(pdf), `${name} names ${file}, which is not committed`).toBe(true);
      // The content file is named after its PDF, so the pair cannot drift: a
      // renamed PDF without a renamed content file fails here.
      expect(`${name.slice(0, -'.md'.length)}.pdf`).toBe(pdf);
    }
  });

  /*
   * THIRTY SECONDS, BECAUSE THE DEFAULT FIVE IS A CLOCK AND NOT A GUARD. This
   * test shells `pdfinfo` and `pdfinfo -js` for each of the 95 committed PDFs,
   * 190 subprocesses; measured on this machine under load (load average 10-36)
   * it took 6,485-7,518 ms at 87 files, against vitest's 5,000 ms default - so
   * `npm run test:build` and `test:all` went red for no code reason. The suite
   * is green at `--testTimeout=60000`. 30 s is the ceiling with room for a
   * loaded CI runner; it is not a weakened check, because the same 95 files
   * are still gated by the same three arms. Re-measured after Task 4's eight
   * converted studies joined the tree: 2,071-2,358 ms over three runs at 95
   * files, 0 failures.
   */
  it('gates every committed PDF through pdfinfo, with no failures', () => {
    const pdfs = committedPdfs();
    expect(pdfs.length, 'no PDF to gate - the check would prove nothing').toBeGreaterThan(0);
    const failures: string[] = [];
    for (const name of pdfs) {
      const verdict = gatePdf(join(DOCUMENTS, name));
      if (!verdict.ok) failures.push(`${name}: ${verdict.reason}`);
    }
    // Printed, not only checked: the number is what a later reader trusts when
    // a comment disagrees with it. `process.stdout.write` because vitest's
    // default reporter swallows `console.log` on the green run.
    process.stdout.write(
      `\nCommitted PDFs gated with pdfinfo: ${pdfs.length}, failures ${failures.length}; ` +
        `content files ${contentFiles().length}.\n`,
    );
    expect(failures, `committed PDFs the gate refuses:\n${failures.join('\n')}`).toEqual([]);
  }, 30_000);
});

describe("the gate's own arms can still fire", () => {
  it('passes a readable file with no JavaScript', () => {
    expect(gateVerdict({ opened: true, javascript: '', bytes: 'x y' })).toEqual({ ok: true });
  });

  it('POSITIVE CONTROL: fails an unreadable file', () => {
    expect(gateVerdict({ opened: false, javascript: '', bytes: '' }).ok).toBe(false);
  });

  it('POSITIVE CONTROL: fails a file that reports JavaScript', () => {
    expect(gateVerdict({ opened: true, javascript: 'JavaScript: 1', bytes: '' }).ok).toBe(false);
  });

  it('POSITIVE CONTROL: fails a file carrying each byte pattern the gate scans for', () => {
    // Built from PDF_GATE, not from two strings written here a second time: a
    // list that changed would otherwise leave this control testing the old one.
    expect(PDF_GATE.length, 'the byte scan list is empty').toBeGreaterThan(0);
    for (const pattern of PDF_GATE) {
      expect(gateVerdict({ opened: true, javascript: '', bytes: pattern }).ok, pattern).toBe(false);
    }
  });
});
