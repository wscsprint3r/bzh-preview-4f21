import { describe, expect, it } from 'vitest';
import { MEASURED, documentDate, documentTitle, resolveSlugs } from './documents.mjs';
import { documentSlug } from './slugify.mjs';
import { gatePdf } from './pdf-gate.mjs';

describe('document titles', () => {
  it('turns the Doxologia filename into a Romanian title', () => {
    expect(documentTitle('revista/doxologia_18_2019.pdf'))
      .toBe('Revista Doxologia nr. 18 — 2019');
  });

  it('turns the measured pastorale filename shapes into titles', () => {
    expect(documentTitle('pastorala/PASTORALA INVIEREA DOMNULUI RO 2019.pdf'))
      .toBe('Pastorală la Învierea Domnului 2019');
    expect(documentTitle('pastorala/9 002 2024 PASTORALA NASTEREA DOMNULUI RO 2024_site.pdf'))
      .toBe('Pastorală la Nașterea Domnului 2024');
  });

  it('POSITIVE CONTROL: a filename no rule recognises stops the run by name', () => {
    expect(() => documentTitle('pastorala/ceva-necunoscut.pdf')).toThrow(/ceva-necunoscut\.pdf/);
  });

  it('falls back to the humanised name for the uploads pastorale and Doxologia issues', () => {
    expect(documentTitle('wp-content/uploads/2025/03/Pastorala-Duminica-Ortodoxiei-2025.pdf'))
      .toBe('Pastorală Duminica Ortodoxiei 2025');
  });
});

describe('document dates', () => {
  it('reads the year out of the name and defaults to 1 January', () => {
    expect(documentDate('revista/doxologia_18_2019.pdf')).toBe('2019-01-01');
    expect(documentDate('pastorala/9 001 2022 PASTORALA INVIEREA DOMNULUI RO 2022.pdf')).toBe('2022-01-01');
  });

  it('POSITIVE CONTROL: refuses a name with no year', () => {
    expect(() => documentDate('pastorala/fara-an.pdf')).toThrow(/fara-an\.pdf/);
  });

  it('takes the explicit date the table carries for a file whose name has no year', () => {
    // `sf_antim_ivireanul.pdf` is the measured corpus's only study in the
    // pastorale tree, and its name carries no year: the date is the PDF's own
    // creation year, written in the table beside the title.
    expect(documentDate('pastorala/sf_antim_ivireanul.pdf')).toBe('2016-01-01');
  });
});

/*
 * THE MEASURED CORPUS, 2026-09-18, listed so the closed title table is held to
 * the real shapes rather than to one example per rule. The source files live
 * outside this repository and a fresh clone cannot read them; this list is what
 * lets `npm test` prove the table still covers every measured filename anyway.
 * A rule that stops matching a real shape fails here, by name.
 */
const MEASURED_CORPUS = [
  // revista/ — 26 Doxologia issues.
  'revista/doxologia_10_2015.pdf',
  'revista/doxologia_11_2016.pdf',
  'revista/doxologia_12_2016.pdf',
  'revista/doxologia_13_2017.pdf',
  'revista/doxologia_14_2017.pdf',
  'revista/doxologia_15_2018.pdf',
  'revista/doxologia_16_2018.pdf',
  'revista/doxologia_17_2019.pdf',
  'revista/doxologia_18_2019.pdf',
  'revista/doxologia_19_2020.pdf',
  'revista/doxologia_1_2011.pdf',
  'revista/doxologia_20_2020.pdf',
  'revista/doxologia_21_2021.pdf',
  'revista/doxologia_22_2021.pdf',
  'revista/doxologia_23_2022.pdf',
  'revista/doxologia_24_2022.pdf',
  'revista/doxologia_25_2023.pdf',
  'revista/doxologia_26_2023.pdf',
  'revista/doxologia_27_2024.pdf',
  'revista/doxologia_2_2011.pdf',
  'revista/doxologia_3_2012.pdf',
  'revista/doxologia_4_2012.pdf',
  'revista/doxologia_5_2013.pdf',
  'revista/doxologia_6_2013.pdf',
  'revista/doxologia_8_2014.pdf',
  'revista/doxologia_9_2015.pdf',
  // pastorala/ — 43 pastoral letters.
  'pastorala/9 001 2022 PASTORALA INVIEREA DOMNULUI RO 2022.pdf',
  'pastorala/9 001 2023 PASTORALA INVIEREA DOMNULUI RO 2023.pdf',
  'pastorala/9 001 2024 PASTORALA INVIEREA DOMNULUI RO 2024.pdf',
  'pastorala/9 002 2022 PASTORALA NASTEREA RO 2022.pdf',
  'pastorala/9 002 2023 PASTORALA NASTEREA RO 2023.pdf',
  'pastorala/Nasterea 2020.pdf',
  'pastorala/Nasterea 2021.pdf',
  'pastorala/PASTORALA INVIEREA DOMNULUI RO 2019.pdf',
  'pastorala/PASTORALA RUSALII 2018.pdf',
  'pastorala/PASTORALA_CRACIUN_2012.pdf',
  'pastorala/PASTORALA_CRACIUN_2018.pdf',
  'pastorala/PASTORALA_CRACIUN_2019.pdf',
  'pastorala/PASTORALA_PASTI_2011.pdf',
  'pastorala/PASTORALA_PASTI_2013.pdf',
  'pastorala/Pastorala Duminica Ortodoxiei 2022.pdf',
  'pastorala/Pastorala Pogorârea Duhului Sfânt 2023.pdf',
  'pastorala/Pastorala Postul Crăciunului 2023.pdf',
  'pastorala/Pastorala Rusalii 2020.pdf',
  'pastorala/Pastorala Rusalii 2021.pdf',
  'pastorala/Pastorala Sf. Sinod B.O.R. la Duminica Ortodoxiei 2019.pdf',
  'pastorala/Pastorala februarie 2021.pdf',
  'pastorala/Pastorala la Duminica Ortodoxiei 2024.pdf',
  'pastorala/Pastorala octombrie 2020.pdf',
  'pastorala/Pastorala-2011-DuminicaOrtodoxiei.pdf',
  'pastorala/Pastorala_Craciun_2013.pdf',
  'pastorala/Pastorala_Craciun_2016.pdf',
  'pastorala/Pastorala_Duminica_Ortodoxiei_2015.pdf',
  'pastorala/Pastorala_Duminica_Ortodoxiei_2016.pdf',
  'pastorala/Pastorala_Duminica_Ortodoxiei_2017.pdf',
  'pastorala/Pastorala_Nastere_2015.pdf',
  'pastorala/Pastorala_Pasti_2012.pdf',
  'pastorala/Pastorala_Pasti_2015.pdf',
  'pastorala/Pastorala_Pasti_2016.pdf',
  'pastorala/Pastorala_Pasti_2017.pdf',
  'pastorala/Pastorala_octombrie_2021.pdf',
  'pastorala/Scrisoare Pastorala - Invierea Domnului 2021.pdf',
  'pastorala/pastorala Duminica Ortodoxiei 2023 - TIPAR.pdf',
  'pastorala/pastorala febr 2020 final.pdf',
  'pastorala/pastorala_inviere_2014.pdf',
  'pastorala/pastorala_octombrie_2019.pdf',
  'pastorala/pastorala_sf_sinod_2014.pdf',
  'pastorala/pastorala_sf_sinod_2015_11_15.pdf',
  'pastorala/sf_antim_ivireanul.pdf',
  // files/ — 8 studies and statutes.
  'files/BOR_ZH - Statuten_D_2021_definitiv.pdf',
  'files/BO_Statuten_D_2021.pdf',
  'files/BO_Traktanden_17_01_21.pdf',
  'files/Das Bekenntnis des Glaubens der Heiligen Orthodoxen Kirche.pdf',
  'files/Prezentarea_Scolii_parohiale_ZH.pdf',
  'files/Scoala_Parohiala_2010.pdf',
  'files/SfLiturgie.pdf',
  'files/program-Mos-Nicolae.pdf',
  // wp-content/uploads/ — 10 PDF attachments, as the old site served them.
  'wp-content/uploads/2024/11/Doxologia_28_2024-final.pdf',
  'wp-content/uploads/2024/12/9-002-2024-PASTORALA-NASTEREA-DOMNULUI-RO-2024_site.pdf',
  'wp-content/uploads/2025/03/Pastorala-Duminica-Ortodoxiei-2025.pdf',
  'wp-content/uploads/2025/04/9-001-2025-PASTORALA-INVIEREA-DOMNULUI-RO-2025.pdf',
  'wp-content/uploads/2025/04/Doxologia_29_2025-v3-1.pdf',
  'wp-content/uploads/2025/04/Doxologia_29_2025-v3-2.pdf',
  'wp-content/uploads/2025/04/Doxologia_29_2025-v3.pdf',
  'wp-content/uploads/2025/06/Doxologia-7-2014-pt-site-1.pdf',
  'wp-content/uploads/2025/06/Pastorala-Pogorarea-Duhului-Sfant-2025.pdf',
  'wp-content/uploads/2025/11/Doxologia_30_2025-v3-1.pdf',
];

describe('the measured corpus is the one the table was derived from', () => {
  it('holds the four measured trees, 87 files in all', () => {
    expect(MEASURED_CORPUS).toHaveLength(87);
    const byTree = {};
    for (const path of MEASURED_CORPUS) {
      const tree = path.startsWith('wp-content/') ? 'uploads' : path.split('/')[0];
      byTree[tree] = (byTree[tree] ?? 0) + 1;
    }
    expect(byTree).toEqual({ revista: 26, pastorala: 43, files: 8, uploads: 10 });
    // The counts pinned in the extractor and the fixture above must agree, or
    // one of the two has been edited without the other.
    expect(MEASURED).toMatchObject({ revista: 26, pastorala: 43, files: 8, uploads: 10 });
  });

  it('every measured file gets a title and a date', () => {
    for (const path of MEASURED_CORPUS) {
      expect(documentTitle(path), path).not.toBe('');
      expect(documentDate(path), path).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('every measured file gets a schema-shaped slug, and no two share one', () => {
    const entries = MEASURED_CORPUS.map((path) => ({
      relativePath: path,
      tree: path.startsWith('wp-content/') ? 'uploads' : path.split('/')[0],
      slug: documentSlug(path),
    }));
    const slugs = resolveSlugs(entries);
    expect(slugs).toHaveLength(87);
    expect(new Set(slugs).size, 'two measured files share a slug').toBe(87);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9-]+$/);
  });
});

describe('the slug collision rule', () => {
  const LEGACY = {
    relativePath: 'pastorala/9 002 2024 PASTORALA NASTEREA DOMNULUI RO 2024_site.pdf',
    tree: 'pastorala',
    slug: '9-002-2024-pastorala-nasterea-domnului-ro-2024-site',
  };
  const UPLOAD = {
    relativePath: 'wp-content/uploads/2024/12/9-002-2024-PASTORALA-NASTEREA-DOMNULUI-RO-2024_site.pdf',
    tree: 'uploads',
    slug: '9-002-2024-pastorala-nasterea-domnului-ro-2024-site',
  };

  it('leaves a slug alone when nothing else claims it', () => {
    expect(resolveSlugs([LEGACY])).toEqual([LEGACY.slug]);
  });

  it('prefixes BOTH members of a collision with the tree each came from', () => {
    expect(resolveSlugs([LEGACY, UPLOAD])).toEqual([
      `pastorala-${LEGACY.slug}`,
      `uploads-${LEGACY.slug}`,
    ]);
  });

  it('POSITIVE CONTROL: a collision inside one tree stops the run, naming both files', () => {
    const first = { relativePath: 'pastorala/a/duplicat.pdf', tree: 'pastorala', slug: 'duplicat' };
    const second = { relativePath: 'pastorala/b/duplicat.pdf', tree: 'pastorala', slug: 'duplicat' };
    expect(() => resolveSlugs([first, second])).toThrow(/duplicat.*duplicat/s);
  });
});

describe('the PDF gate shelling wrapper', () => {
  // Two real committed files, from two different source trees. They exist in a
  // fresh clone because the migration's output is committed, so this is a
  // `pdfinfo` run over a real PDF without depending on the forensic backups.
  const COMMITTED = [
    'public/documente/doxologia-18-2019.pdf',
    'public/documente/pastorala-invierea-domnului-ro-2019.pdf',
  ];

  it('passes real committed PDFs', () => {
    for (const path of COMMITTED) expect(gatePdf(path), path).toEqual({ ok: true });
  });

  it('POSITIVE CONTROL: fails a path pdfinfo cannot open, rather than throwing', () => {
    expect(gatePdf('public/documente/nu-exista.pdf')).toEqual({
      ok: false,
      reason: 'pdfinfo could not read it',
    });
  });
});
