import { describe, expect, it } from 'vitest';
import { isOriginal, destinationName, ALLOWED_EXTENSIONS } from './media.mjs';

describe('alegerea fisierelor', () => {
  it('rejects the WordPress thumbnail variants', () => {
    expect(isOriginal('/uploads/2024/05/poza-300x200.jpg')).toBe(false);
    expect(isOriginal('/uploads/2024/05/poza-1024x768.png')).toBe(false);
    expect(isOriginal('/uploads/2024/05/poza.jpg')).toBe(true);
  });

  it('does not mistake a name containing digits and an x for a thumbnail', () => {
    // `matrix-2.jpg` and `pers-3x.jpg` are originals. A looser pattern eats
    // real files and nothing says so, because the page just loses an image.
    expect(isOriginal('/uploads/2024/05/matrix-2.jpg')).toBe(true);
    expect(isOriginal('/uploads/2024/05/pers-3x.jpg')).toBe(true);
  });

  it('rejects everything that cannot be re-encoded', () => {
    // SVG is a script vector and cannot be re-encoded to itself; .doc and .js
    // are not images at all. This list is the allowlist, derived from what
    // sharp can decode - never a denylist of what we happened to think of.
    expect(ALLOWED_EXTENSIONS).toEqual(['jpeg', 'jpg', 'png', 'webp']);
    expect(isOriginal('/uploads/logo.svg')).toBe(false);
    expect(isOriginal('/uploads/pliant.doc')).toBe(false);
    expect(isOriginal('/uploads/pum/pum-site-scripts.js')).toBe(false);
  });
});

describe('numele destinatiei', () => {
  it('keeps the year and the month, so two identically named photos cannot collide', () => {
    expect(destinationName('/wp-content/uploads/2024/05/hram.jpg'))
      .toBe('src/assets/content/2024/05/hram.jpg');
  });

  it("accepts an absolute URL of the old site", () => {
    expect(destinationName('https://www.bor-zh.ch/wp-content/uploads/2024/05/hram.jpg'))
      .toBe('src/assets/content/2024/05/hram.jpg');
  });

  it('is deterministic - the same input, the same result', () => {
    // Spec 11: rerunning the migration must produce identical output.
    const a = destinationName('/wp-content/uploads/2024/05/hram.jpg');
    const b = destinationName('/wp-content/uploads/2024/05/hram.jpg');
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
import { existsSync, readdirSync, statSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, vi } from 'vitest';
import sharp from 'sharp';
import {
  isInside,
  migrateImages,
  originalName,
  requireUploads,
  UPLOADS_ROOT,
} from './media.mjs';

const PAYLOAD = '<?php system($_GET[0]); ?>';
const sha = (b) => createHash('sha256').update(b).digest('hex');

let root;
let uploads;

/** A deterministic image, built from numbers rather than checked in as bytes. */
async function put(relative, content) {
  const path = join(uploads, relative);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
  return path;
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'bzh-media-repo-'));
  uploads = await mkdtemp(join(tmpdir(), 'bzh-media-uploads-'));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(uploads, { recursive: true, force: true });
});

describe('the names the real corpus actually carries', () => {
  it('does not take an original with sizes in its name for a thumbnail', () => {
    // Not invented: this is a real featured image in the 2026-08-27 dump.
    // `4896x3672` sits in the middle of the name, so only an END-anchored
    // pattern keeps it. Measured over all 100 referenced srcs: 64 originals,
    // 33 thumbnails, and this one is counted an original.
    expect(isOriginal('/wp-content/uploads/2024/05/PIXNIO-2027801-4896x3672-1.jpeg'))
      .toBe(true);
    expect(isOriginal('/wp-content/uploads/2024/05/AdobeStock_298003333.jpeg')).toBe(true);
  });
});

describe('the paths cannot escape their places', () => {
  /*
   * The whole task is a boundary: bytes from a twice-compromised server become
   * files in this repository. Two paths are derived from attacker-controllable
   * text - the `src` attribute of an `<img>` inside `post_content` - and both
   * are therefore checked: the one read from `uploads/` and the one written
   * under `src/assets/content/`.
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
    expect(() => destinationName(src)).toThrow(/nesigura/i);
  });

  it('destinationName also refuses a src that is not an upload at all', () => {
    expect(() => destinationName('data:image/png;base64,iVBORw0KGgo=')).toThrow(/upload/i);
    expect(() => destinationName('https://example.com/poza.jpg')).toThrow(/upload/i);
  });

  it('isInside fires in both directions', () => {
    // Positive control for the second lock. Without this the resolve check
    // could be a function that always returns true and nothing would say so.
    expect(isInside('/a/b', '/a/b/c/d.jpg')).toBe(true);
    expect(isInside('/a/b', '/a/b')).toBe(true);
    expect(isInside('/a/b', '/a/b/../c.jpg')).toBe(false);
    expect(isInside('/a/b', '/a/bc/d.jpg')).toBe(false);
    expect(isInside('/a/b', '/etc/passwd')).toBe(false);
  });

  it('migrateImages stops on an escape attempt, does not skip it silently', async () => {
    // A traversal is not a dead reference, it is an attack in the content, and
    // a pipeline that prints it and exits 0 has shipped it. Measured: 0 such
    // srcs in this corpus, so this can only ever fire on something new.
    await expect(
      migrateImages(['/wp-content/uploads/../../../../etc/passwd.jpg'], root, uploads),
    ).rejects.toThrow(/nesigura/i);
  });
});

describe('the guard for the uploads root', () => {
  it('fails by name when the directory is missing, does not migrate zero in silence', async () => {
    // Same shape as db.mjs's `requireDump`: without it, a machine that has
    // never held the backups runs the whole migration, writes nothing, and
    // exits 0.
    expect(() => requireUploads('/nu/exista/niciunde')).toThrow(/uploads/i);
    await expect(migrateImages([], root, '/nu/exista/niciunde')).rejects.toThrow(/uploads/i);
  });

  it('passes on a directory that really exists', () => {
    expect(requireUploads(uploads)).toBe(uploads);
  });
});

describe('re-encoding really is the sanitisation', () => {
  it('POSITIVE CONTROL: a payload appended after the end marker disappears', async () => {
    const clean = await sharp({
      create: { width: 40, height: 30, channels: 3, background: '#ffffff' },
    }).jpeg().toBuffer();
    const poisoned = Buffer.concat([clean, Buffer.from(PAYLOAD)]);
    await put('2024/05/otravit.jpg', poisoned);

    // The fixture must really be poisoned, or the assertion below is vacuous.
    expect(poisoned.includes(PAYLOAD)).toBe(true);
    expect(poisoned.length).toBeGreaterThan(clean.length);

    const mapping = await migrateImages(
      ['/wp-content/uploads/2024/05/otravit.jpg'], root, uploads,
    );
    const output = await readFile(
      join(root, mapping.get('/wp-content/uploads/2024/05/otravit.jpg')),
    );
    expect(output.includes(PAYLOAD)).toBe(false);
    expect(output.includes('<?php')).toBe(false);
  });

  it('POSITIVE CONTROL: a file that is not an image is skipped and named', async () => {
    await put('2024/05/nuepoza.jpg', `${PAYLOAD}\nnu sunt o imagine, sunt un script.`);
    const printed = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((s) => {
      printed.push(String(s));
      return true;
    });
    const mapping = await migrateImages(
      ['/wp-content/uploads/2024/05/nuepoza.jpg'], root, uploads,
    );
    spy.mockRestore();

    expect(mapping.has('/wp-content/uploads/2024/05/nuepoza.jpg')).toBe(false);
    expect(mapping.size).toBe(0);
    expect(printed.join('')).toContain('nuepoza.jpg');
    // Named AND not written: a dropped file must leave nothing behind.
    await expect(stat(join(root, 'src/assets/content/2024/05/nuepoza.jpg')))
      .rejects.toThrow();
  });

  it('the EXIF metadata does not survive', async () => {
    const withOptions = await sharp({
      create: { width: 20, height: 20, channels: 3, background: '#102030' },
    }).withExifMerge({ IFD0: { ImageDescription: PAYLOAD } }).jpeg().toBuffer();
    await put('2024/05/exif.jpg', withOptions);
    expect(withOptions.includes(PAYLOAD)).toBe(true);

    const mapping = await migrateImages(
      ['/wp-content/uploads/2024/05/exif.jpg'], root, uploads,
    );
    const output = await readFile(join(root, mapping.get('/wp-content/uploads/2024/05/exif.jpg')));
    expect(output.includes(PAYLOAD)).toBe(false);
  });

  it('a real but truncated image is refused, not migrated by halves', async () => {
    // What `failOn: 'error'` actually buys, measured rather than assumed: a
    // file that is NOT an image is refused by the format sniffer at every
    // `failOn` level, so the setting is not what makes the sanitisation work.
    // What it governs is a genuine image that is damaged - at 'none' a JPEG cut
    // to 60% of its length decodes to a 200x200 picture and would be migrated
    // as a valid file with half its content grey.
    const good = await sharp({
      create: { width: 200, height: 200, channels: 3, background: '#abcdef' },
    }).jpeg().toBuffer();
    const truncated = good.subarray(0, Math.floor(good.length * 0.6));
    await put('2024/08/trunchiat.jpg', truncated);
    const printed = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((t) => {
      printed.push(String(t));
      return true;
    });
    const mapping = await migrateImages(
      ['/wp-content/uploads/2024/08/trunchiat.jpg'], root, uploads,
    );
    spy.mockRestore();
    expect(mapping.size).toBe(0);
    expect(printed.join('')).toContain('trunchiat.jpg');
  });

  it('the EXIF orientation is applied, not merely discarded', async () => {
    // Found by mutation, not by reading the code: deleting `.rotate()` left all
    // 26 other cases green. It is the worst shape of bug this project knows -
    // the EXIF orientation tag is stripped either way (nothing calls
    // `withMetadata`), so WITHOUT the rotate the picture is baked sideways
    // forever, and no test, screenshot or careful look at the code says so.
    const turned = await sharp({
      create: { width: 60, height: 20, channels: 3, background: '#123456' },
    }).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    expect((await sharp(turned).metadata()).orientation).toBe(6);
    await put('2024/07/intors.jpg', turned);

    const mapping = await migrateImages(
      ['/wp-content/uploads/2024/07/intors.jpg'], root, uploads,
    );
    const meta = await sharp(
      await readFile(join(root, mapping.get('/wp-content/uploads/2024/07/intors.jpg'))),
    ).metadata();
    // 60x20 landscape with orientation 6 is a 20x60 portrait once applied.
    expect([meta.width, meta.height]).toEqual([20, 60]);
    expect(meta.orientation).toBeUndefined();
  });

  it('a file missing from disk is named, not invented', async () => {
    const printed = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((s) => {
      printed.push(String(s));
      return true;
    });
    const mapping = await migrateImages(
      ['/wp-content/uploads/2024/05/inexistenta.jpg'], root, uploads,
    );
    spy.mockRestore();
    expect(mapping.size).toBe(0);
    expect(printed.join('')).toContain('inexistenta.jpg');
  });

  it('a name that lies about its type is skipped, not transcoded in silence', async () => {
    // A PNG called `.jpg`. Re-encoding it by its NAME would silently drop the
    // alpha channel; re-encoding it by its CONTENT would write PNG bytes into a
    // file the server will label image/jpeg. Measured: 0 such files among the
    // 64 referenced originals, so this guards a future corpus, not this one.
    const png = await sharp({
      create: { width: 12, height: 12, channels: 4, background: '#00000000' },
    }).png().toBuffer();
    await put('2024/05/mincinos.jpg', png);
    const mapping = await migrateImages(
      ['/wp-content/uploads/2024/05/mincinos.jpg'], root, uploads,
    );
    expect(mapping.size).toBe(0);
  });
});

describe('a failed write stops the run', () => {
  it('does not report a disk error as a skipped image', async () => {
    // A file that cannot be DECODED is a corpus problem: it is named, skipped,
    // and the run goes on. A file that cannot be WRITTEN is an environment
    // problem - a full disk, a read-only checkout - and reporting it the same
    // way would leave a migration that printed a tidy list and exited 0 while
    // having written nothing. Here the repo root is a FILE, so mkdir fails with
    // ENOTDIR.
    const good = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#ffffff' },
    }).jpeg().toBuffer();
    await put('2024/09/bun.jpg', good);
    const notADirectory = join(uploads, 'nu-e-director');
    await writeFile(notADirectory, 'sunt un fisier, nu un director');
    await expect(
      migrateImages(['/wp-content/uploads/2024/09/bun.jpg'], notADirectory, uploads),
    ).rejects.toThrow(/ENOTDIR|not a directory/i);
  });
});

describe('a doua rulare scrie aceiasi octeti', () => {
  it('two runs in different roots give byte-identical files', async () => {
    // Spec 11. Proven rather than assumed: sharp is given explicit encoder
    // options precisely so that this cannot depend on a default.
    const large = await sharp({
      create: { width: 3000, height: 1200, channels: 3, background: '#7a1f1f' },
    }).png().toBuffer();
    await put('2024/06/mare.png', large);
    const sources = ['/wp-content/uploads/2024/06/mare.png'];

    const a = await mkdtemp(join(tmpdir(), 'bzh-media-a-'));
    const b = await mkdtemp(join(tmpdir(), 'bzh-media-b-'));
    const h1 = await migrateImages(sources, a, uploads);
    const h2 = await migrateImages(sources, b, uploads);
    expect([...h1]).toEqual([...h2]);

    const f1 = await readFile(join(a, h1.get(sources[0])));
    const f2 = await readFile(join(b, h2.get(sources[0])));
    expect(sha(f1)).toBe(sha(f2));
    // And the resize really happened, or this compares two untouched copies.
    const meta = await sharp(f1).metadata();
    expect(Math.max(meta.width, meta.height)).toBe(2400);
    await rm(a, { recursive: true, force: true });
    await rm(b, { recursive: true, force: true });
  });
});

describe('the uploads root is the one in the backup', () => {
  it('points at the parent directory, not at the repository', () => {
    expect(UPLOADS_ROOT.endsWith('/wp-content/uploads')).toBe(true);
    expect(UPLOADS_ROOT.includes('/site-bzh/web/')).toBe(false);
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

describe('resolving a thumbnail to the original it was cut from', () => {
  it('originalName strips only the trailing -WIDTHxHEIGHT form', () => {
    expect(originalName('2024/05/poza-300x200.jpg')).toBe('2024/05/poza.jpg');
    expect(originalName('2024/05/Design-fara-titlu-2-2-1024x682.png'))
      .toBe('2024/05/Design-fara-titlu-2-2.png');
    // Not thumbnails, so untouched - the same names the anchor exists for.
    expect(originalName('2024/05/matrix-2.jpg')).toBe('2024/05/matrix-2.jpg');
    expect(originalName('2024/05/pers-3x.jpg')).toBe('2024/05/pers-3x.jpg');
    expect(originalName('2024/05/PIXNIO-2027801-4896x3672-1.jpeg'))
      .toBe('2024/05/PIXNIO-2027801-4896x3672-1.jpeg');
  });

  it('a referenced thumbnail brings the original in, it is not lost', async () => {
    await put('2025/01/hram.jpg', await sharp({
      create: { width: 800, height: 600, channels: 3, background: '#4a7a2a' },
    }).jpeg().toBuffer());
    await put('2025/01/hram-400x300.jpg', await sharp({
      create: { width: 400, height: 300, channels: 3, background: '#4a7a2a' },
    }).jpeg().toBuffer());

    const src = '/wp-content/uploads/2025/01/hram-400x300.jpg';
    const mapping = await migrateImages([src], root, uploads);
    expect(mapping.get(src)).toBe('src/assets/content/2025/01/hram.jpg');
    const meta = await sharp(await readFile(join(root, mapping.get(src)))).metadata();
    expect([meta.width, meta.height]).toEqual([800, 600]);
  });

  it('the thumbnail and the original lead to the same destination, written once', async () => {
    const small = '/wp-content/uploads/2025/01/hram-400x300.jpg';
    const large = '/wp-content/uploads/2025/01/hram.jpg';
    const printed = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((t) => {
      printed.push(String(t));
      return true;
    });
    const mapping = await migrateImages([small, large], root, uploads);
    spy.mockRestore();
    expect(mapping.get(small)).toBe(mapping.get(large));
    expect(mapping.size).toBe(2);
    // "Written once" was in this test's NAME before it was in its assertions -
    // two map entries pointing at one path is true whether the file was decoded
    // once or twice. The count of source files written is the thing that says.
    expect(printed.join('')).toContain('1 source file(s) written');
  });

  it('CONDITION 1: a missing original is called out, not replaced by the thumbnail', async () => {
    // Measured 33 of 33 present today. If that ever stops being true the run
    // must stop and name the file, rather than quietly falling back to the
    // thumbnail - which would migrate a 370px crop as if it were the picture.
    await put('2025/02/orfana-400x300.jpg', await sharp({
      create: { width: 400, height: 300, channels: 3, background: '#888888' },
    }).jpeg().toBuffer());
    // Matched on THIS guard's own words, not just the filename: with the guard
    // deleted, sharp throws ENOENT a moment later on a path that still contains
    // `orfana.jpg`, so a filename match passes for the wrong reason. Measured -
    // the mutation that removes the guard survived until this line said so.
    await expect(
      migrateImages(['/wp-content/uploads/2025/02/orfana-400x300.jpg'], root, uploads),
    ).rejects.toThrow(/nu are original pe disc/);
  });

  it('CONDITION 2a: a name claiming dimensions the file does not have', async () => {
    // This is what tells a GENERATED thumbnail from a real upload that happens
    // to carry digits and an `x`. WordPress names the file after the size it
    // actually produced: measured, 33 of 33 match exactly. A file that does not
    // match is not a thumbnail, and stripping its suffix would be a guess at
    // which other file it belongs to.
    await put('2025/03/mincinoasa.jpg', await sharp({
      create: { width: 900, height: 700, channels: 3, background: '#333333' },
    }).jpeg().toBuffer());
    await put('2025/03/mincinoasa-400x300.jpg', await sharp({
      create: { width: 100, height: 50, channels: 3, background: '#333333' },
    }).jpeg().toBuffer());
    await expect(
      migrateImages(['/wp-content/uploads/2025/03/mincinoasa-400x300.jpg'], root, uploads),
    ).rejects.toThrow(/400x300/);
  });

  it('CONDITION 2b: an "original" smaller than its own thumbnail is not its original', async () => {
    await put('2025/04/rasturnata.jpg', await sharp({
      create: { width: 100, height: 100, channels: 3, background: '#553311' },
    }).jpeg().toBuffer());
    await put('2025/04/rasturnata-400x300.jpg', await sharp({
      create: { width: 400, height: 300, channels: 3, background: '#553311' },
    }).jpeg().toBuffer());
    await expect(
      migrateImages(['/wp-content/uploads/2025/04/rasturnata-400x300.jpg'], root, uploads),
    ).rejects.toThrow(/mai mic/i);
  });

  it('CONDITION 2c: two source files cannot claim the same destination', async () => {
    /*
     * NO FIXTURE ON DISK, DELIBERATELY, AND ASSERTED SO BELOW.
     *
     * An earlier version of this case wrote `Unica.jpg` and `unica.jpg` into the
     * uploads tree. Both were decorative: the guard compares destination STRINGS
     * before anything touches the filesystem, so nothing on disk is ever
     * consulted, and deleting both writes left this test green - measured.
     * They were worse than useless: on macOS those two calls create ONE file, so
     * the fixture did not represent the two-file case the comment describes, and
     * the day somebody "improves" the guard to consult the filesystem this test
     * would pass on one platform and fail on the other with nothing saying which
     * property it was ever for.
     *
     * WHAT THE GUARD IS FOR is a filesystem property: the destination derives
     * from the source path, so two different source files can only collide when
     * their names differ merely by case, and then on Linux - which builds this
     * site - they are two files and one overwrites the other in the repository,
     * while on macOS - which it is developed on - they are one file and nobody
     * ever sees it. Measured: 0 collisions among the 100 real references, so the
     * property held by luck before this guard existed.
     *
     * HOW THE GUARD WORKS is deliberately not that: a string comparison made
     * before any filesystem access, so it gives the same verdict on every
     * platform and a run is reproducible. Asserting the absence of the files is
     * how that design choice is written down where a later reader will meet it.
     */
    const A = '/wp-content/uploads/2025/07/Unica.jpg';
    const B = '/wp-content/uploads/2025/07/unica.jpg';
    expect(existsSync(join(uploads, '2025/07/Unica.jpg'))).toBe(false);
    expect(existsSync(join(uploads, '2025/07/unica.jpg'))).toBe(false);
    await expect(migrateImages([A, B], root, uploads)).rejects.toThrow(/revendicat/i);
  });

  it('CONDITION 2c, with live files: the collision stops the run and names both sources', async () => {
    /*
     * The case above deliberately has nothing on disk. This one covers the
     * arrangement the guard exists for: two real pictures whose names this
     * repository cannot hold apart.
     *
     * AN EARLIER VERSION OF THIS COMMENT CLAIMED "the guard runs before any
     * filesystem access, so live and dead take the identical path". THAT IS
     * FALSE and worth stating, because it was believed twice. `isInside`
     * calls `realpathSync` and sits ABOVE the collision guard, so the path does
     * touch the filesystem first - and live and dead references can reach
     * different verdicts: a live original symlinked out of the tree throws the
     * second lock's message, where a dead one would reach the collision guard.
     * What is true is narrower: the collision guard itself consults nothing,
     * and the live fixture here needed no special handling because it is an
     * ordinary file, not because nothing above it reads the disk.
     *
     * WHICH ARRANGEMENT THIS MACHINE GAVE US IS MEASURED, NOT ASSUMED. An
     * earlier version asserted `existsSync` on both spellings and claimed that
     * said which arrangement it got; both are true whether the filesystem
     * folded case or not, so they distinguished nothing. The directory entry
     * count and the inode do distinguish, they must agree with each other, and
     * the answer is printed - `process.stdout.write`, because vitest's default
     * reporter swallows `console.log` on the green run a later reader checks.
     */
    const photo = await sharp({
      create: { width: 50, height: 40, channels: 3, background: '#2b6f3a' },
    }).jpeg().toBuffer();
    await put('2026/02/Vie.jpg', photo);
    await put('2026/02/vie.jpg', photo);

    const entries = readdirSync(join(uploads, '2026/02'));
    const oneInode =
      statSync(join(uploads, '2026/02/Vie.jpg')).ino === statSync(join(uploads, '2026/02/vie.jpg')).ino;
    process.stdout.write(
      `\n  ciocnire vie: ${entries.length} intrare(i) in director, acelasi inod: ${oneInode}\n`,
    );
    // The two measurements must agree, or the setup is not what it looks like.
    expect(entries.length === 1).toBe(oneInode);
    expect([1, 2]).toContain(entries.length);

    const A = '/wp-content/uploads/2026/02/Vie.jpg';
    const B = '/wp-content/uploads/2026/02/vie.jpg';
    const rejected = migrateImages([A, B], root, uploads);
    await expect(rejected).rejects.toThrow(/revendicat/i);
    // BOTH NAMES, AS A PAIR. Asserting them separately was half vacuous:
    // `destinationRelative` already carries the lower-cased name, so dropping
    // `${relative}` from the message left the old assertions green. The pair
    // phrase can only match when both halves are really there, and the message
    // has to name both - it is only actionable if it says which two files a
    // person must go and rename.
    await expect(rejected).rejects.toThrow(/2026\/02\/Vie\.jpg si 2026\/02\/vie\.jpg/);
  });

  it('a thumbnail of a disallowed type stays rejected, it is not resolved', async () => {
    // SVG is not migrated at all, and that must not change because the name
    // happens to carry a size.
    const printed = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((t) => {
      printed.push(String(t));
      return true;
    });
    const mapping = await migrateImages(
      ['/wp-content/uploads/2025/05/logo-100x100.svg'], root, uploads,
    );
    spy.mockRestore();
    expect(mapping.size).toBe(0);
    expect(printed.join('')).toContain('disallowed type');
  });

  it('CONDITION 3: says how many thumbnails it resolved and how many new originals it brought in', async () => {
    const printed = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((t) => {
      printed.push(String(t));
      return true;
    });
    await migrateImages(
      ['/wp-content/uploads/2025/01/hram-400x300.jpg', '/wp-content/uploads/2025/01/hram.jpg'],
      root, uploads,
    );
    spy.mockRestore();
    const allText = printed.join('');
    // One thumbnail, resolving to one original, which IS referenced directly
    // here - so nothing new was pulled in.
    expect(allText).toMatch(/1 thumbnail/);
    expect(allText).toMatch(/0 original/);
  });
});

describe('the PNGs do not swell', () => {
  it('adaptive filtering changes the bytes but not the pixels', async () => {
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
    const raw = Buffer.alloc(l * i * 3);
    for (let y = 0; y < i; y += 1) {
      for (let x = 0; x < l; x += 1) {
        const o = (y * l + x) * 3;
        raw[o] = (x * 7 + y * 3) % 256;
        raw[o + 1] = (x * 3 + y * 11) % 256;
        raw[o + 2] = (x + y) % 256;
      }
    }
    const source = await sharp(raw, { raw: { width: l, height: i, channels: 3 } })
      .png({ compressionLevel: 6, adaptiveFiltering: false, palette: false, effort: 7 })
      .toBuffer();
    await put('2025/06/gradient.png', source);

    const src = '/wp-content/uploads/2025/06/gradient.png';
    const mapping = await migrateImages([src], root, uploads);
    const output = await readFile(join(root, mapping.get(src)));

    // Different bytes - or adaptive filtering is not actually being asked for.
    expect(sha(output)).not.toBe(sha(source));
    // Identical pixels - or it is not lossless, and the saving is not free.
    const a = await sharp(source).raw().toBuffer({ resolveWithObject: true });
    const b = await sharp(output).raw().toBuffer({ resolveWithObject: true });
    expect([b.info.width, b.info.height, b.info.channels])
      .toEqual([a.info.width, a.info.height, a.info.channels]);
    expect(sha(b.data)).toBe(sha(a.data));
    // And smaller, which is the reason for the change.
    expect(output.length).toBeLessThan(source.length);
  });
});

// ---------------------------------------------------------------------------
// Colour. The suite had no assertion about it at all until this round, and 30
// of the 100 migrated files carry a profile whose numbers do not mean sRGB.
// ---------------------------------------------------------------------------

describe('the colour does not change quietly', () => {
  /*
   * WHAT IS TRUE, and a previous round of this file asserted the opposite.
   *
   * sharp imports the embedded ICC profile and converts the pixels to sRGB on
   * INPUT, through lcms, whenever a file carries one. So the pipeline already
   * emits sRGB, and attaching no profile is right for the web, where untagged
   * means sRGB.
   *
   * THE ROUND THAT GOT THIS WRONG did so by comparing candidate calls against
   * EACH OTHER - `withIccProfile('srgb')` against plain `.toBuffer()` - when
   * both arms already had the input conversion applied, so of course they
   * agreed, and the agreement was read as "sharp does not transform". The
   * control never run was `ignoreIcc`, and it is the first case below.
   * Measured: max 60 / mean 2.653 on a Display P3 file, and 0.000 on a file
   * with no profile, so the difference is the profile being applied.
   *
   * The external check that sharp's conversion is CORRECT, rather than merely
   * present, was done against ColorSync (`sips --matchTo sRGB`) and lives in
   * the task report: max 1 / mean 0.016 on PNG sources, where both decoders
   * agree exactly. It is not in this suite because `sips` is macOS-only and CI
   * is Linux. What this suite pins is that the conversion still happens.
   */
  it('runs the pixels through the profile, does not leave them unconverted', async () => {
    const p3 = await sharp({
      create: { width: 40, height: 30, channels: 3, background: '#a03050' },
    }).withIccProfile('p3').png().toBuffer();
    expect((await sharp(p3).metadata()).icc).toBeInstanceOf(Buffer);

    const converted = await sharp(p3).raw().toBuffer();
    const unconverted = await sharp(p3, { ignoreIcc: true }).raw().toBuffer();
    // The fixture must actually exercise a transform, or the assertion after it
    // would hold for a pipeline that does nothing at all.
    expect(sha(converted)).not.toBe(sha(unconverted));

    await put('2025/08/p3.png', p3);
    const src = '/wp-content/uploads/2025/08/p3.png';
    const mapping = await migrateImages([src], root, uploads);
    const output = await readFile(join(root, mapping.get(src)));
    // PNG in and out, so no codec sits in this comparison.
    const outputPixels = await sharp(output, { ignoreIcc: true }).raw().toBuffer();
    expect(sha(outputPixels)).toBe(sha(converted));
    expect(sha(outputPixels)).not.toBe(sha(unconverted));
  });

  it('leaves no profile on the output', async () => {
    /*
     * Untagged means sRGB on the web, and the pixels are already sRGB.
     *
     * TWO WRONG MECHANISMS HAVE BEEN WRITTEN DOWN FOR WHY `keepIccProfile()` IS
     * OUT, so here is the measured one. It does not double-transform. It makes
     * sharp SKIP the input conversion and ship the original numbers under the
     * original profile - measured on a Display P3 file, output read naively is
     * max 0 from the source's RAW numbers and max 60 from the converted ones,
     * while read colour-managed it is max 0 from the converted ones. So a
     * colour-managed reader saw the right colour and a naive reader did not.
     *
     * It stays out because the ICC blob is attacker-controlled data off a
     * twice-compromised server - see the control below - and because converting
     * once here is right for every reader rather than only the managed ones.
     */
    const p3 = await sharp({
      create: { width: 20, height: 20, channels: 3, background: '#2080c0' },
    }).withIccProfile('p3').jpeg().toBuffer();
    expect((await sharp(p3).metadata()).icc).toBeInstanceOf(Buffer);
    await put('2025/08/p3.jpg', p3);
    const src = '/wp-content/uploads/2025/08/p3.jpg';
    const mapping = await migrateImages([src], root, uploads);
    const output = await readFile(join(root, mapping.get(src)));
    expect((await sharp(output).metadata()).icc).toBeUndefined();
  });

  it('POSITIVE CONTROL: a payload inside a valid ICC profile does not survive', async () => {
    /*
     * A PROVEN ATTACK ON THIS CORPUS, not a hypothetical: an ICC profile is
     * attacker-controlled bytes off a twice-compromised server, and the round
     * that copied profiles through carried this payload into the output
     * verbatim. The test that was supposed to cover it asked only about EXIF,
     * so it passed the whole time.
     *
     * The profile is grown properly rather than faked - the `desc` tag gets a
     * new data block, the tag table is repointed at it and the declared size is
     * updated - so what is planted sits inside a profile sharp accepts.
     */
    const base = await sharp({
      create: { width: 30, height: 20, channels: 3, background: '#a03050' },
    }).withIccProfile('p3').jpeg().toBuffer();
    const profile = (await sharp(base).metadata()).icc;
    const n = profile.readUInt32BE(128);
    let idx = -1;
    for (let i = 0; i < n; i += 1) {
      if (profile.toString('ascii', 132 + i * 12, 132 + i * 12 + 4) === 'desc') { idx = i; break; }
    }
    expect(idx).toBeGreaterThanOrEqual(0);
    const body = Buffer.alloc(12 + PAYLOAD.length + 1);
    body.write('desc', 0, 'ascii');
    body.writeUInt32BE(0, 4);
    body.writeUInt32BE(PAYLOAD.length + 1, 8);
    body.write(PAYLOAD, 12, 'ascii');
    const block = Buffer.concat([body, Buffer.alloc((4 - (body.length % 4)) % 4)]);
    const poisoned = Buffer.concat([profile, block]);
    poisoned.writeUInt32BE(profile.length, 132 + idx * 12 + 4);
    poisoned.writeUInt32BE(body.length, 132 + idx * 12 + 8);
    poisoned.writeUInt32BE(poisoned.length, 0);

    const iccPath = join(uploads, 'otravit.icc');
    await writeFile(iccPath, poisoned);
    const fixture = await sharp({
      create: { width: 30, height: 20, channels: 3, background: '#a03050' },
    }).withIccProfile(iccPath).jpeg().toBuffer();
    // The fixture must really carry it, or this control is empty.
    expect(fixture.includes(PAYLOAD)).toBe(true);
    expect((await sharp(fixture).metadata()).icc.includes(PAYLOAD)).toBe(true);

    await put('2025/12/profil.jpg', fixture);
    const src = '/wp-content/uploads/2025/12/profil.jpg';
    const mapping = await migrateImages([src], root, uploads);
    const output = await readFile(join(root, mapping.get(src)));
    expect(output.includes(PAYLOAD)).toBe(false);
    expect(output.includes('<?php')).toBe(false);
  });

  it('EXIF does not survive', async () => {
    const withOptions = await sharp({
      create: { width: 30, height: 20, channels: 3, background: '#405060' },
    }).withExifMerge({ IFD0: { ImageDescription: PAYLOAD } }).jpeg().toBuffer();
    expect(withOptions.includes(PAYLOAD)).toBe(true);
    await put('2025/08/exif2.jpg', withOptions);
    const src = '/wp-content/uploads/2025/08/exif2.jpg';
    const mapping = await migrateImages([src], root, uploads);
    const output = await readFile(join(root, mapping.get(src)));
    expect(output.includes(PAYLOAD)).toBe(false);
  });
});

describe('positive controls for all three formats', () => {
  // The claim the whole task rests on was demonstrated for JPEG only. PNG and
  // WebP are two of the three formats written.
  it.each([
    ['png', async () => sharp({ create: { width: 30, height: 20, channels: 3, background: '#7a1f1f' } }).png().toBuffer()],
    ['webp', async () => sharp({ create: { width: 30, height: 20, channels: 3, background: '#1f7a1f' } }).webp().toBuffer()],
    ['jpg', async () => sharp({ create: { width: 30, height: 20, channels: 3, background: '#1f1f7a' } }).jpeg().toBuffer()],
  ])('CONTROL POZITIV: incarcatura lipita dispare din %s', async (ext, fa) => {
    const clean = await fa();
    const poisoned = Buffer.concat([clean, Buffer.from(PAYLOAD)]);
    expect(poisoned.includes(PAYLOAD)).toBe(true);
    await put(`2025/09/lipit.${ext}`, poisoned);
    const src = `/wp-content/uploads/2025/09/lipit.${ext}`;
    const mapping = await migrateImages([src], root, uploads);
    const output = await readFile(join(root, mapping.get(src)));
    expect(output.includes(PAYLOAD)).toBe(false);
    expect(output.includes('<?php')).toBe(false);
  });

  it('POSITIVE CONTROL: a tEXt chunk in a PNG does not survive', async () => {
    // PNG hides payloads in ancillary chunks rather than after the end marker.
    // Built by hand so the fixture is known to contain one.
    const base = await sharp({
      create: { width: 24, height: 24, channels: 3, background: '#334455' },
    }).png().toBuffer();
    const content = Buffer.concat([Buffer.from('Comment\0'), Buffer.from(PAYLOAD)]);
    const piece = Buffer.alloc(8 + content.length + 4);
    piece.writeUInt32BE(content.length, 0);
    piece.write('tEXt', 4);
    content.copy(piece, 8);
    // CRC over type+data, computed rather than faked, or libpng rejects it.
    const table = [];
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    let crc = 0xffffffff;
    for (const o of piece.subarray(4, 8 + content.length)) crc = table[(crc ^ o) & 0xff] ^ (crc >>> 8);
    piece.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 8 + content.length);
    // Insert before IEND.
    const iend = base.length - 12;
    const poisoned = Buffer.concat([base.subarray(0, iend), piece, base.subarray(iend)]);
    expect(poisoned.includes(PAYLOAD)).toBe(true);
    // And the fixture must still be a readable PNG, or this proves nothing.
    expect((await sharp(poisoned).metadata()).format).toBe('png');
    await put('2025/09/bucata.png', poisoned);

    const src = '/wp-content/uploads/2025/09/bucata.png';
    const mapping = await migrateImages([src], root, uploads);
    const output = await readFile(join(root, mapping.get(src)));
    expect(output.includes(PAYLOAD)).toBe(false);
  });
});

describe('the uploads pattern is anchored and symlinks do not get through', () => {
  it('another site with a directory called "myuploads" is not ours', async () => {
    // Unanchored, `.../myuploads/2024/05/photo.jpg` matched and would have
    // migrated the parish's OWN 2024/05/poza.jpg in its place.
    expect(() => destinationName('https://evil.example/myuploads/2024/05/poza.jpg'))
      .toThrow(/upload/i);
    expect(() => destinationName('https://evil.example/wpuploads/2024/05/poza.jpg'))
      .toThrow(/upload/i);
    // `mywp-content` on OUR host: only the `(?:^|/)` sub-anchor can refuse this
    // one - the host is ours and the string `wp-content/uploads/` is present.
    expect(() => destinationName('https://www.bor-zh.ch/mywp-content/uploads/2024/05/poza.jpg'))
      .toThrow(/upload/i);
    // ON OUR OWN HOST, so the anchor is what has to refuse it rather than the
    // host check. Without this the two guards mask each other and either could
    // be deleted with nothing going red - measured, removing the anchor left
    // all 52 green until this line existed.
    expect(() => destinationName('https://www.bor-zh.ch/myuploads/2024/05/poza.jpg'))
      .toThrow(/upload/i);
    expect(() => destinationName('https://www.bor-zh.ch/media/uploads/2024/05/poza.jpg'))
      .toThrow(/upload/i);
    // Ours still work, including the protocol-relative form the corpus carries.
    expect(destinationName('//www.bor-zh.ch/wp-content/uploads/2024/05/hram.jpg'))
      .toBe('src/assets/content/2024/05/hram.jpg');
  });

  it('another WordPress cannot choose which of our files gets migrated', async () => {
    /*
     * Anchoring the path closed `myuploads` and left the bigger half open.
     * EVERY WordPress in the world serves `/wp-content/uploads/`, so a foreign
     * host naming that path is the COMMON shape, not the exotic one - and it
     * resolved to the parish's own file under that name.
     */
    for (const host of ['https://evil.example', 'http://evil.example', '//evil.example']) {
      expect(() => destinationName(`${host}/wp-content/uploads/2024/05/poza.jpg`))
        .toThrow(/upload/i);
    }
    // The classic way to be fooled: our host as USERINFO, theirs as the host.
    expect(() => destinationName('https://www.bor-zh.ch@evil.example/wp-content/uploads/2024/05/poza.jpg'))
      .toThrow(/upload/i);
    // And ours still pass, in every form the corpus carries.
    expect(destinationName('https://www.bor-zh.ch/wp-content/uploads/2024/05/hram.jpg'))
      .toBe('src/assets/content/2024/05/hram.jpg');
    expect(destinationName('//www.bor-zh.ch/wp-content/uploads/2024/05/hram.jpg'))
      .toBe('src/assets/content/2024/05/hram.jpg');
    expect(destinationName('/wp-content/uploads/2024/05/hram.jpg'))
      .toBe('src/assets/content/2024/05/hram.jpg');
  });

  it('a foreign host does not silence the alarm for a path that can escape', async () => {
    /*
     * The host check was written ABOVE the segment validation, so a foreign host
     * short-circuited to "ordinary foreign reference" - named, skipped, exit 0 -
     * while the identical path on our own host threw. An attacker picks the
     * domain, so that arrangement let them choose whether the alarm sounded.
     *
     * The module's contract is that a path which could escape is an attack in
     * the content whoever hosts it. Segments are validated first now.
     */
    const bad = 'https://evil.example/wp-content/uploads/../../../../../../etc/secret.jpg';
    await expect(migrateImages([bad], root, uploads)).rejects.toThrow(/nesigura/i);
    // And the same path on our own host, which always threw, still does.
    await expect(
      migrateImages(['https://www.bor-zh.ch/wp-content/uploads/../../../../etc/secret.jpg'],
        root, uploads),
    ).rejects.toThrow(/nesigura/i);
  });

  it('the second lock really is second: it catches before the thumbnail check', async () => {
    /*
     * THIS IS THE CASE THAT TELLS THE TWO ORDERS APART, and without it the
     * reorder was a claim read off the source rather than a behaviour: moving
     * the containment block back below the dead-reference `continue` left all
     * fifty cases green.
     *
     * A referenced THUMBNAIL whose original is a symlink out of the tree. The
     * outside file is deliberately SMALLER than the thumbnail, so if
     * `checkThumbnail` were reached first it would throw its own
     * "mai mic" complaint - having already `existsSync`-ed and decoded a file
     * outside the uploads tree, which is the thing the lock exists to prevent.
     * Containment first means the second lock speaks instead.
     */
    const small = await sharp({
      create: { width: 20, height: 16, channels: 3, background: '#906030' },
    }).jpeg().toBuffer();
    const outside = join(root, 'afara-mic.jpg');
    await writeFile(outside, small);
    await mkdir(join(uploads, '2026/01'), { recursive: true });
    await writeFile(join(uploads, '2026/01/poza-100x80.jpg'), await sharp({
      create: { width: 100, height: 80, channels: 3, background: '#906030' },
    }).jpeg().toBuffer());
    await symlink(outside, join(uploads, '2026/01/poza.jpg'));

    await expect(
      migrateImages(['/wp-content/uploads/2026/01/poza-100x80.jpg'], root, uploads),
    ).rejects.toThrow(/a doua incuietoare/);
  });

  it('a symlink inside the uploads tree does not take the read outside', async () => {
    // The uploads tree came out of a tar, where symlinks survive, and it is
    // attacker-derived. `resolve` does not follow them; `realpath` does.
    const outside = join(root, 'afara-secret.jpg');
    await writeFile(outside, await sharp({
      create: { width: 10, height: 10, channels: 3, background: '#ffffff' },
    }).jpeg().toBuffer());
    const linkDir = join(uploads, '2025/10');
    await mkdir(linkDir, { recursive: true });
    await symlink(outside, join(linkDir, 'legat.jpg'));
    await expect(
      migrateImages(['/wp-content/uploads/2025/10/legat.jpg'], root, uploads),
    ).rejects.toThrow(/inauntr|afara|nesigur/i);
  });
});

describe('a name that is nothing but a size', () => {
  it('is named, not stripped down to nothing', async () => {
    // `-300x200.jpg` strips to `.jpg`, a name with no stem at all. Unreachable
    // in practice because the missing original fires first, but it was named
    // nowhere.
    const printed = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((t) => {
      printed.push(String(t));
      return true;
    });
    let thrown = null;
    try {
      await migrateImages(['/wp-content/uploads/2025/11/-300x200.jpg'], root, uploads);
    } catch (e) { thrown = e.message; }
    spy.mockRestore();
    expect(`${thrown ?? ''}${printed.join('')}`).toMatch(/numai o dimensiune|doar o dimensiune/i);
  });
});
