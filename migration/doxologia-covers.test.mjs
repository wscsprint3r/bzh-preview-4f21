import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  DOCS_DIR,
  OUT_DIR,
  PAGE_PATH,
  ROOT,
  coverName,
  isSpread,
  pageSize,
  pairPdf,
  parseEntries,
} from './doxologia-covers.mjs';

const markdown = readFileSync(join(ROOT, PAGE_PATH), 'utf8');
const pdfNames = readdirSync(join(ROOT, DOCS_DIR))
  .filter((name) => name.startsWith('doxologia-'))
  .sort();
const entries = parseEntries(markdown);
const pdfFor = (entry) => pairPdf(entry, pdfNames);

describe('the doxologia cover pairing', () => {
  it('finds every issue on the page, the duplicate included', () => {
    expect(entries.length).toBe(31);
    expect(entries.filter((e) => e.issue === 8).length).toBe(2);
  });

  it('pairs every entry with a PDF that exists', () => {
    for (const entry of entries) {
      const pdf = pdfFor(entry);
      expect(pdf, `Nr.${entry.issue} (${entry.year}) pairs with nothing`).not.toBeNull();
      expect(existsSync(join(ROOT, DOCS_DIR, pdf)), pdf).toBe(true);
    }
  });

  it('takes the linked PDF when there is one, and the heading when there is not', () => {
    const byYear = (issue, year) => entries.find((e) => e.issue === issue && e.year === year);
    expect(pdfFor(byYear(16, 2019)), 'Nr.16 links a 2018 PDF').toBe('doxologia-16-2018.pdf');
    expect(pdfFor(byYear(12, 2016)), 'Nr.12 links nothing, so the heading pairs it')
      .toBe('doxologia-12-2016.pdf');
  });

  it('names every cover doxologia-<issue>-<year>.jpg', () => {
    for (const entry of entries) {
      expect(coverName(pdfFor(entry)), `Nr.${entry.issue} (${entry.year})`)
        .toMatch(/^doxologia-\d+-\d{4}\.jpg$/);
    }
  });

  it('reads the three Letter-spread issues as spreads, and only those', () => {
    const spreads = entries
      .filter((entry) => isSpread(pageSize(join(ROOT, DOCS_DIR, pdfFor(entry)))))
      .map((entry) => pdfFor(entry));
    expect(spreads).toEqual([
      'doxologia-3-2012.pdf',
      'doxologia-2-2011.pdf',
      'doxologia-1-2011.pdf',
    ]);
  });

  it('renders every committed cover from the PDF its entry advertises', () => {
    entries.forEach((entry) => {
      const name = coverName(pdfFor(entry));
      expect(entry.image, `Nr.${entry.issue} (${entry.year})`)
        .toBe(`../../assets/content/2026/09/${name}`);
      expect(existsSync(join(ROOT, OUT_DIR, name)), name).toBe(true);
    });
  });
});
