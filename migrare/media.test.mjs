import { describe, expect, it } from 'vitest';
import { esteOriginal, numeDestinatie, EXTENSII_PERMISE } from './media.mjs';

describe('alegerea fisierelor', () => {
  it('respinge variantele de miniatura WordPress', () => {
    expect(esteOriginal('/uploads/2024/05/poza-300x200.jpg')).toBe(false);
    expect(esteOriginal('/uploads/2024/05/poza-1024x768.png')).toBe(false);
    expect(esteOriginal('/uploads/2024/05/poza.jpg')).toBe(true);
  });

  it('nu confunda un nume care contine cifre si x cu o miniatura', () => {
    // `matrix-2.jpg` and `pers-3x.jpg` are originals. A looser pattern eats
    // real files and nothing says so, because the page just loses an image.
    expect(esteOriginal('/uploads/2024/05/matrix-2.jpg')).toBe(true);
    expect(esteOriginal('/uploads/2024/05/pers-3x.jpg')).toBe(true);
  });

  it('respinge tot ce nu se poate re-encoda', () => {
    // SVG is a script vector and cannot be re-encoded to itself; .doc and .js
    // are not images at all. This list is the allowlist, derived from what
    // sharp can decode - never a denylist of what we happened to think of.
    expect(EXTENSII_PERMISE).toEqual(['jpeg', 'jpg', 'png', 'webp']);
    expect(esteOriginal('/uploads/logo.svg')).toBe(false);
    expect(esteOriginal('/uploads/pliant.doc')).toBe(false);
    expect(esteOriginal('/uploads/pum/pum-site-scripts.js')).toBe(false);
  });
});

describe('numele destinatiei', () => {
  it('pastreaza anul si luna, ca sa nu se ciocneasca doua poze la fel numite', () => {
    expect(numeDestinatie('/wp-content/uploads/2024/05/hram.jpg'))
      .toBe('src/assets/continut/2024/05/hram.jpg');
  });

  it('accepta o adresa absoluta a sitului vechi', () => {
    expect(numeDestinatie('https://www.bor-zh.ch/wp-content/uploads/2024/05/hram.jpg'))
      .toBe('src/assets/continut/2024/05/hram.jpg');
  });

  it('este determinista - aceeasi intrare, acelasi rezultat', () => {
    // Spec 11: rerunning the migration must produce identical output.
    const a = numeDestinatie('/wp-content/uploads/2024/05/hram.jpg');
    const b = numeDestinatie('/wp-content/uploads/2024/05/hram.jpg');
    expect(a).toBe(b);
  });
});

// ---------------------------------------------------------------------------
// Everything below is the sanitisation and containment evidence. The six cases
// above are the brief's; these exist because a sanitiser that is never shown a
// malicious file is not known to sanitise, and a containment rule that is never
// shown an escape attempt is not known to contain.
// ---------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, vi } from 'vitest';
import sharp from 'sharp';
import {
  esteInauntrul,
  migreazaImagini,
  numeOriginalului,
  verificaUploads,
  RADACINA_UPLOADS,
} from './media.mjs';

const PAYLOAD = '<?php system($_GET[0]); ?>';
const sha = (b) => createHash('sha256').update(b).digest('hex');

let radacina;
let uploads;

/** A deterministic image, built from numbers rather than checked in as bytes. */
async function pune(relativ, continut) {
  const cale = join(uploads, relativ);
  await mkdir(dirname(cale), { recursive: true });
  await writeFile(cale, continut);
  return cale;
}

beforeAll(async () => {
  radacina = await mkdtemp(join(tmpdir(), 'bzh-media-repo-'));
  uploads = await mkdtemp(join(tmpdir(), 'bzh-media-uploads-'));
});

afterAll(async () => {
  await rm(radacina, { recursive: true, force: true });
  await rm(uploads, { recursive: true, force: true });
});

describe('numele pe care le poarta chiar corpusul real', () => {
  it('nu ia drept miniatura un original care are dimensiuni in nume', () => {
    // Not invented: this is a real featured image in the 2026-08-27 dump.
    // `4896x3672` sits in the middle of the name, so only an END-anchored
    // pattern keeps it. Measured over all 100 referenced srcs: 64 originals,
    // 33 thumbnails, and this one is counted an original.
    expect(esteOriginal('/wp-content/uploads/2024/05/PIXNIO-2027801-4896x3672-1.jpeg'))
      .toBe(true);
    expect(esteOriginal('/wp-content/uploads/2024/05/AdobeStock_298003333.jpeg')).toBe(true);
  });
});

describe('caile nu pot iesi din locurile lor', () => {
  /*
   * The whole task is a boundary: bytes from a twice-compromised server become
   * files in this repository. Two paths are derived from attacker-controllable
   * text - the `src` attribute of an `<img>` inside `post_content` - and both
   * are therefore checked: the one read from `uploads/` and the one written
   * under `src/assets/continut/`.
   *
   * The rule is a POSITIVE allowlist of what a path segment may contain, not a
   * denylist of the escapes somebody thought of. Measured against all 100 real
   * referenced srcs (97 in content plus the 3 featured): 0 rejected, and the
   * only characters that occur are the ASCII letters, digits, `.`, `-` and `_`.
   * Percent-encoding is refused rather than decoded - 0 srcs contain a `%`, and
   * refusing by name beats guessing at what an encoded byte meant.
   */
  it.each([
    ['iesire cu ..', '/wp-content/uploads/../../../../etc/passwd.jpg'],
    ['iesire la mijloc', '/wp-content/uploads/2024/../../../../etc/passwd.jpg'],
    ['segment gol, deci cale absoluta', '/wp-content/uploads//etc/passwd.jpg'],
    ['procent-encodare', '/wp-content/uploads/%2e%2e%2f%2e%2e%2fetc%2fpasswd.jpg'],
    ['bara inversa', '/wp-content/uploads/..\\..\\etc\\passwd.jpg'],
    ['spatiu', '/wp-content/uploads/2024/05/po za.jpg'],
    ['punct singur', '/wp-content/uploads/./2024/05/poza.jpg'],
  ])('numeDestinatie refuza: %s', (_eticheta, src) => {
    expect(() => numeDestinatie(src)).toThrow(/nesigura/i);
  });

  it('numeDestinatie refuza si un src care nu este deloc un upload', () => {
    expect(() => numeDestinatie('data:image/png;base64,iVBORw0KGgo=')).toThrow(/upload/i);
    expect(() => numeDestinatie('https://example.com/poza.jpg')).toThrow(/upload/i);
  });

  it('esteInauntrul se declanseaza in ambele directii', () => {
    // Positive control for the second lock. Without this the resolve check
    // could be a function that always returns true and nothing would say so.
    expect(esteInauntrul('/a/b', '/a/b/c/d.jpg')).toBe(true);
    expect(esteInauntrul('/a/b', '/a/b')).toBe(true);
    expect(esteInauntrul('/a/b', '/a/b/../c.jpg')).toBe(false);
    expect(esteInauntrul('/a/b', '/a/bc/d.jpg')).toBe(false);
    expect(esteInauntrul('/a/b', '/etc/passwd')).toBe(false);
  });

  it('migreazaImagini se opreste pe o incercare de iesire, nu o sare in tacere', async () => {
    // A traversal is not a dead reference, it is an attack in the content, and
    // a pipeline that prints it and exits 0 has shipped it. Measured: 0 such
    // srcs in this corpus, so this can only ever fire on something new.
    await expect(
      migreazaImagini(['/wp-content/uploads/../../../../etc/passwd.jpg'], radacina, uploads),
    ).rejects.toThrow(/nesigura/i);
  });
});

describe('garda pentru radacina uploads', () => {
  it('cade pe nume cand directorul lipseste, nu migreaza zero in tacere', async () => {
    // Same shape as db.mjs's `verificaSursa`: without it, a machine that has
    // never held the backups runs the whole migration, writes nothing, and
    // exits 0.
    expect(() => verificaUploads('/nu/exista/niciunde')).toThrow(/uploads/i);
    await expect(migreazaImagini([], radacina, '/nu/exista/niciunde')).rejects.toThrow(/uploads/i);
  });

  it('trece pe un director care chiar exista', () => {
    expect(verificaUploads(uploads)).toBe(uploads);
  });
});

describe('re-encodarea chiar este curatarea', () => {
  it('CONTROL POZITIV: o incarcatura lipita dupa marcajul de sfarsit dispare', async () => {
    const curat = await sharp({
      create: { width: 40, height: 30, channels: 3, background: '#ffffff' },
    }).jpeg().toBuffer();
    const otravit = Buffer.concat([curat, Buffer.from(PAYLOAD)]);
    await pune('2024/05/otravit.jpg', otravit);

    // The fixture must really be poisoned, or the assertion below is vacuous.
    expect(otravit.includes(PAYLOAD)).toBe(true);
    expect(otravit.length).toBeGreaterThan(curat.length);

    const harta = await migreazaImagini(
      ['/wp-content/uploads/2024/05/otravit.jpg'], radacina, uploads,
    );
    const iesire = await readFile(
      join(radacina, harta.get('/wp-content/uploads/2024/05/otravit.jpg')),
    );
    expect(iesire.includes(PAYLOAD)).toBe(false);
    expect(iesire.includes('<?php')).toBe(false);
  });

  it('CONTROL POZITIV: un fisier care nu este imagine este sarit si numit', async () => {
    await pune('2024/05/nuepoza.jpg', `${PAYLOAD}\nnu sunt o imagine, sunt un script.`);
    const scris = [];
    const spion = vi.spyOn(process.stdout, 'write').mockImplementation((s) => {
      scris.push(String(s));
      return true;
    });
    const harta = await migreazaImagini(
      ['/wp-content/uploads/2024/05/nuepoza.jpg'], radacina, uploads,
    );
    spion.mockRestore();

    expect(harta.has('/wp-content/uploads/2024/05/nuepoza.jpg')).toBe(false);
    expect(harta.size).toBe(0);
    expect(scris.join('')).toContain('nuepoza.jpg');
    // Named AND not written: a dropped file must leave nothing behind.
    await expect(stat(join(radacina, 'src/assets/continut/2024/05/nuepoza.jpg')))
      .rejects.toThrow();
  });

  it('metadatele EXIF nu supravietuiesc', async () => {
    const cu = await sharp({
      create: { width: 20, height: 20, channels: 3, background: '#102030' },
    }).withExifMerge({ IFD0: { ImageDescription: PAYLOAD } }).jpeg().toBuffer();
    await pune('2024/05/exif.jpg', cu);
    expect(cu.includes(PAYLOAD)).toBe(true);

    const harta = await migreazaImagini(
      ['/wp-content/uploads/2024/05/exif.jpg'], radacina, uploads,
    );
    const iesire = await readFile(join(radacina, harta.get('/wp-content/uploads/2024/05/exif.jpg')));
    expect(iesire.includes(PAYLOAD)).toBe(false);
  });

  it('o imagine adevarata dar trunchiata este refuzata, nu migrata pe jumatate', async () => {
    // What `failOn: 'error'` actually buys, measured rather than assumed: a
    // file that is NOT an image is refused by the format sniffer at every
    // `failOn` level, so the setting is not what makes the sanitisation work.
    // What it governs is a genuine image that is damaged - at 'none' a JPEG cut
    // to 60% of its length decodes to a 200x200 picture and would be migrated
    // as a valid file with half its content grey.
    const bun = await sharp({
      create: { width: 200, height: 200, channels: 3, background: '#abcdef' },
    }).jpeg().toBuffer();
    const trunchiat = bun.subarray(0, Math.floor(bun.length * 0.6));
    await pune('2024/08/trunchiat.jpg', trunchiat);
    const scris = [];
    const spion = vi.spyOn(process.stdout, 'write').mockImplementation((t) => {
      scris.push(String(t));
      return true;
    });
    const harta = await migreazaImagini(
      ['/wp-content/uploads/2024/08/trunchiat.jpg'], radacina, uploads,
    );
    spion.mockRestore();
    expect(harta.size).toBe(0);
    expect(scris.join('')).toContain('trunchiat.jpg');
  });

  it('orientarea EXIF este aplicata, nu doar aruncata', async () => {
    // Found by mutation, not by reading the code: deleting `.rotate()` left all
    // 26 other cases green. It is the worst shape of bug this project knows -
    // the EXIF orientation tag is stripped either way (nothing calls
    // `withMetadata`), so WITHOUT the rotate the picture is baked sideways
    // forever, and no test, screenshot or careful look at the code says so.
    const intors = await sharp({
      create: { width: 60, height: 20, channels: 3, background: '#123456' },
    }).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    expect((await sharp(intors).metadata()).orientation).toBe(6);
    await pune('2024/07/intors.jpg', intors);

    const harta = await migreazaImagini(
      ['/wp-content/uploads/2024/07/intors.jpg'], radacina, uploads,
    );
    const meta = await sharp(
      await readFile(join(radacina, harta.get('/wp-content/uploads/2024/07/intors.jpg'))),
    ).metadata();
    // 60x20 landscape with orientation 6 is a 20x60 portrait once applied.
    expect([meta.width, meta.height]).toEqual([20, 60]);
    expect(meta.orientation).toBeUndefined();
  });

  it('un fisier care lipseste de pe disc este numit, nu inventat', async () => {
    const scris = [];
    const spion = vi.spyOn(process.stdout, 'write').mockImplementation((s) => {
      scris.push(String(s));
      return true;
    });
    const harta = await migreazaImagini(
      ['/wp-content/uploads/2024/05/inexistenta.jpg'], radacina, uploads,
    );
    spion.mockRestore();
    expect(harta.size).toBe(0);
    expect(scris.join('')).toContain('inexistenta.jpg');
  });

  it('un nume care minte despre tipul sau este sarit, nu transcodat in tacere', async () => {
    // A PNG called `.jpg`. Re-encoding it by its NAME would silently drop the
    // alpha channel; re-encoding it by its CONTENT would write PNG bytes into a
    // file the server will label image/jpeg. Measured: 0 such files among the
    // 64 referenced originals, so this guards a future corpus, not this one.
    const png = await sharp({
      create: { width: 12, height: 12, channels: 4, background: '#00000000' },
    }).png().toBuffer();
    await pune('2024/05/mincinos.jpg', png);
    const harta = await migreazaImagini(
      ['/wp-content/uploads/2024/05/mincinos.jpg'], radacina, uploads,
    );
    expect(harta.size).toBe(0);
  });
});

describe('o scriere esuata opreste rularea', () => {
  it('nu raporteaza o eroare de disc ca pe o imagine sarita', async () => {
    // A file that cannot be DECODED is a corpus problem: it is named, skipped,
    // and the run goes on. A file that cannot be WRITTEN is an environment
    // problem - a full disk, a read-only checkout - and reporting it the same
    // way would leave a migration that printed a tidy list and exited 0 while
    // having written nothing. Here the repo root is a FILE, so mkdir fails with
    // ENOTDIR.
    const bun = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#ffffff' },
    }).jpeg().toBuffer();
    await pune('2024/09/bun.jpg', bun);
    const nuEDirector = join(uploads, 'nu-e-director');
    await writeFile(nuEDirector, 'sunt un fisier, nu un director');
    await expect(
      migreazaImagini(['/wp-content/uploads/2024/09/bun.jpg'], nuEDirector, uploads),
    ).rejects.toThrow(/ENOTDIR|not a directory/i);
  });
});

describe('a doua rulare scrie aceiasi octeti', () => {
  it('doua rulari in radacini diferite dau fisiere identice octet cu octet', async () => {
    // Spec 11. Proven rather than assumed: sharp is given explicit encoder
    // options precisely so that this cannot depend on a default.
    const mare = await sharp({
      create: { width: 3000, height: 1200, channels: 3, background: '#7a1f1f' },
    }).png().toBuffer();
    await pune('2024/06/mare.png', mare);
    const surse = ['/wp-content/uploads/2024/06/mare.png'];

    const a = await mkdtemp(join(tmpdir(), 'bzh-media-a-'));
    const b = await mkdtemp(join(tmpdir(), 'bzh-media-b-'));
    const h1 = await migreazaImagini(surse, a, uploads);
    const h2 = await migreazaImagini(surse, b, uploads);
    expect([...h1]).toEqual([...h2]);

    const f1 = await readFile(join(a, h1.get(surse[0])));
    const f2 = await readFile(join(b, h2.get(surse[0])));
    expect(sha(f1)).toBe(sha(f2));
    // And the resize really happened, or this compares two untouched copies.
    const meta = await sharp(f1).metadata();
    expect(Math.max(meta.width, meta.height)).toBe(2400);
    await rm(a, { recursive: true, force: true });
    await rm(b, { recursive: true, force: true });
  });
});

describe('radacina uploads este cea din copia de siguranta', () => {
  it('arata catre directorul parinte, nu catre depozit', () => {
    expect(RADACINA_UPLOADS.endsWith('/wp-content/uploads')).toBe(true);
    expect(RADACINA_UPLOADS.includes('/site-bzh/web/')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Resolving a referenced thumbnail to the original it was cut from.
//
// "Only referenced images" is about the referenced PICTURE, not the referenced
// byte-file: 33 of the 100 real references are `-WxH` thumbnails and are the
// ONLY reference to their picture, so dropping them loses the icon of Saint
// Nicholas from `istoric`, a council member's photograph, five Doxologia cover
// scans and the liturgical programme, on a green build.
// ---------------------------------------------------------------------------

describe('rezolvarea miniaturii la originalul din care a fost taiata', () => {
  it('numeOriginalului dezbraca doar forma -LATIMExINALTIME de la sfarsit', () => {
    expect(numeOriginalului('2024/05/poza-300x200.jpg')).toBe('2024/05/poza.jpg');
    expect(numeOriginalului('2024/05/Design-fara-titlu-2-2-1024x682.png'))
      .toBe('2024/05/Design-fara-titlu-2-2.png');
    // Not thumbnails, so untouched - the same names the anchor exists for.
    expect(numeOriginalului('2024/05/matrix-2.jpg')).toBe('2024/05/matrix-2.jpg');
    expect(numeOriginalului('2024/05/pers-3x.jpg')).toBe('2024/05/pers-3x.jpg');
    expect(numeOriginalului('2024/05/PIXNIO-2027801-4896x3672-1.jpeg'))
      .toBe('2024/05/PIXNIO-2027801-4896x3672-1.jpeg');
  });

  it('o miniatura referita aduce originalul, nu se pierde', async () => {
    await pune('2025/01/hram.jpg', await sharp({
      create: { width: 800, height: 600, channels: 3, background: '#4a7a2a' },
    }).jpeg().toBuffer());
    await pune('2025/01/hram-400x300.jpg', await sharp({
      create: { width: 400, height: 300, channels: 3, background: '#4a7a2a' },
    }).jpeg().toBuffer());

    const src = '/wp-content/uploads/2025/01/hram-400x300.jpg';
    const harta = await migreazaImagini([src], radacina, uploads);
    expect(harta.get(src)).toBe('src/assets/continut/2025/01/hram.jpg');
    const meta = await sharp(await readFile(join(radacina, harta.get(src)))).metadata();
    expect([meta.width, meta.height]).toEqual([800, 600]);
  });

  it('miniatura si originalul duc la aceeasi destinatie, scrisa o data', async () => {
    const mic = '/wp-content/uploads/2025/01/hram-400x300.jpg';
    const mare = '/wp-content/uploads/2025/01/hram.jpg';
    const scris = [];
    const spion = vi.spyOn(process.stdout, 'write').mockImplementation((t) => {
      scris.push(String(t));
      return true;
    });
    const harta = await migreazaImagini([mic, mare], radacina, uploads);
    spion.mockRestore();
    expect(harta.get(mic)).toBe(harta.get(mare));
    expect(harta.size).toBe(2);
    // "Written once" was in this test's NAME before it was in its assertions -
    // two map entries pointing at one path is true whether the file was decoded
    // once or twice. The count of source files written is the thing that says.
    expect(scris.join('')).toContain('1 fisier(e) sursa scrise');
  });

  it('CONDITIA 1: un original lipsa este strigat, nu inlocuit cu miniatura', async () => {
    // Measured 33 of 33 present today. If that ever stops being true the run
    // must stop and name the file, rather than quietly falling back to the
    // thumbnail - which would migrate a 370px crop as if it were the picture.
    await pune('2025/02/orfana-400x300.jpg', await sharp({
      create: { width: 400, height: 300, channels: 3, background: '#888888' },
    }).jpeg().toBuffer());
    // Matched on THIS guard's own words, not just the filename: with the guard
    // deleted, sharp throws ENOENT a moment later on a path that still contains
    // `orfana.jpg`, so a filename match passes for the wrong reason. Measured -
    // the mutation that removes the guard survived until this line said so.
    await expect(
      migreazaImagini(['/wp-content/uploads/2025/02/orfana-400x300.jpg'], radacina, uploads),
    ).rejects.toThrow(/nu are original pe disc/);
  });

  it('CONDITIA 2a: un nume care pretinde dimensiuni pe care fisierul nu le are', async () => {
    // This is what tells a GENERATED thumbnail from a real upload that happens
    // to carry digits and an `x`. WordPress names the file after the size it
    // actually produced: measured, 33 of 33 match exactly. A file that does not
    // match is not a thumbnail, and stripping its suffix would be a guess at
    // which other file it belongs to.
    await pune('2025/03/mincinoasa.jpg', await sharp({
      create: { width: 900, height: 700, channels: 3, background: '#333333' },
    }).jpeg().toBuffer());
    await pune('2025/03/mincinoasa-400x300.jpg', await sharp({
      create: { width: 100, height: 50, channels: 3, background: '#333333' },
    }).jpeg().toBuffer());
    await expect(
      migreazaImagini(['/wp-content/uploads/2025/03/mincinoasa-400x300.jpg'], radacina, uploads),
    ).rejects.toThrow(/400x300/);
  });

  it('CONDITIA 2b: un "original" mai mic decat miniatura lui nu este originalul lui', async () => {
    await pune('2025/04/rasturnata.jpg', await sharp({
      create: { width: 100, height: 100, channels: 3, background: '#553311' },
    }).jpeg().toBuffer());
    await pune('2025/04/rasturnata-400x300.jpg', await sharp({
      create: { width: 400, height: 300, channels: 3, background: '#553311' },
    }).jpeg().toBuffer());
    await expect(
      migreazaImagini(['/wp-content/uploads/2025/04/rasturnata-400x300.jpg'], radacina, uploads),
    ).rejects.toThrow(/mai mic/i);
  });

  it('CONDITIA 2c: doua fisiere sursa nu pot revendica aceeasi destinatie', async () => {
    // The destination is derived from the source path, so two DIFFERENT source
    // files can only land on one name when the names differ merely by case -
    // and that is a real, platform-dependent bug rather than a curiosity: on
    // Linux, which is what builds this site, they are two files and one
    // overwrites the other in the repository; on macOS, which is what it is
    // developed on, they are one file and nobody ever sees it. Measured: 0
    // collisions among the 100 real references, exact or case-insensitive - so
    // this holds today by luck, and the guard is what makes it hold by
    // construction.
    const poza = await sharp({
      create: { width: 60, height: 40, channels: 3, background: '#2b6f3a' },
    }).jpeg().toBuffer();
    await pune('2025/07/Unica.jpg', poza);
    await pune('2025/07/unica.jpg', poza);
    await expect(
      migreazaImagini(
        ['/wp-content/uploads/2025/07/Unica.jpg', '/wp-content/uploads/2025/07/unica.jpg'],
        radacina, uploads,
      ),
    ).rejects.toThrow(/revendicat/i);
  });

  it('o miniatura de tip nepermis ramane respinsa, nu se rezolva', async () => {
    // SVG is not migrated at all, and that must not change because the name
    // happens to carry a size.
    const scris = [];
    const spion = vi.spyOn(process.stdout, 'write').mockImplementation((t) => {
      scris.push(String(t));
      return true;
    });
    const harta = await migreazaImagini(
      ['/wp-content/uploads/2025/05/logo-100x100.svg'], radacina, uploads,
    );
    spion.mockRestore();
    expect(harta.size).toBe(0);
    expect(scris.join('')).toContain('tip nepermis');
  });

  it('CONDITIA 3: spune cate miniaturi a rezolvat si cate originale noi a adus', async () => {
    const scris = [];
    const spion = vi.spyOn(process.stdout, 'write').mockImplementation((t) => {
      scris.push(String(t));
      return true;
    });
    await migreazaImagini(
      ['/wp-content/uploads/2025/01/hram-400x300.jpg', '/wp-content/uploads/2025/01/hram.jpg'],
      radacina, uploads,
    );
    spion.mockRestore();
    const tot = scris.join('');
    // One thumbnail, resolving to one original, which IS referenced directly
    // here - so nothing new was pulled in.
    expect(tot).toMatch(/1 miniatur/);
    expect(tot).toMatch(/0 original/);
  });
});

describe('PNG-urile nu se umfla', () => {
  it('filtrarea adaptiva schimba octetii dar nu pixelii', async () => {
    // The one tuning decision in media.mjs, pinned by the property that makes
    // it safe rather than by the size it saves. sharp's PNG default made the 25
    // referenced PNGs grow 39.9 -> 55.7 MB; adaptive filtering brings that to
    // 35.3 MB and is LOSSLESS, which is asserted here by decoding both back to
    // raw pixels. `palette: true` would reach 12.0 MB and is deliberately not
    // taken: it quantises to 256 colours, which is a visible decision about
    // somebody's photographs.
    //
    // A gradient, not flat colour: filtering is what exploits row-to-row
    // similarity, so a flat fixture would make both encoders agree and the
    // test would pass while proving nothing.
    const l = 240;
    const i = 180;
    const brut = Buffer.alloc(l * i * 3);
    for (let y = 0; y < i; y += 1) {
      for (let x = 0; x < l; x += 1) {
        const o = (y * l + x) * 3;
        brut[o] = (x * 7 + y * 3) % 256;
        brut[o + 1] = (x * 3 + y * 11) % 256;
        brut[o + 2] = (x + y) % 256;
      }
    }
    const sursa = await sharp(brut, { raw: { width: l, height: i, channels: 3 } })
      .png({ compressionLevel: 6, adaptiveFiltering: false, palette: false, effort: 7 })
      .toBuffer();
    await pune('2025/06/gradient.png', sursa);

    const src = '/wp-content/uploads/2025/06/gradient.png';
    const harta = await migreazaImagini([src], radacina, uploads);
    const iesire = await readFile(join(radacina, harta.get(src)));

    // Different bytes - or adaptive filtering is not actually being asked for.
    expect(sha(iesire)).not.toBe(sha(sursa));
    // Identical pixels - or it is not lossless, and the saving is not free.
    const a = await sharp(sursa).raw().toBuffer({ resolveWithObject: true });
    const b = await sharp(iesire).raw().toBuffer({ resolveWithObject: true });
    expect([b.info.width, b.info.height, b.info.channels])
      .toEqual([a.info.width, a.info.height, a.info.channels]);
    expect(sha(b.data)).toBe(sha(a.data));
    // And smaller, which is the reason for the change.
    expect(iesire.length).toBeLessThan(sursa.length);
  });
});
