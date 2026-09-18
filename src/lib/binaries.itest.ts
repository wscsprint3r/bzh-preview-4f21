import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { ALLOWED_EXTENSIONS } from '../../migration/media.mjs';

/*
 * WHAT THIS PROVES: every committed image this project owns really is an image
 * it can decode - not a payload that was renamed to `.jpg`.
 *
 * TWO ROOTS, ONE GUARANTEE. `src/assets/content/` is the migration's output:
 * `migrateImages` decodes every source through sharp and writes it back out, so
 * nothing that is not a real image can be under that prefix unless something
 * bypassed the pipeline. `public/uploads/` is what the CMS writes, and nothing
 * re-encodes it, so this file is the ONLY place that says an uploaded file is
 * an image rather than bytes with an image's extension. It may be absent or
 * empty on a fresh clone; the CMS creates it on the first upload, and the guard
 * activates with it.
 *
 * WHY THE PREFIX EXEMPTION NEEDS THIS. `diacritics-sources.test.ts` exempts both
 * prefixes from the text sweep by extension, which on its own would excuse a
 * PHP payload renamed to `.jpg` for as long as it sat there. What replaces the
 * name-by-name property is stronger than naming: a decoder. A name list is
 * defeated by renaming a file; a decoder is not.
 *
 * It needs sharp and a whole tree of files, which is why it lives here and not
 * in the unit sweep: `npm run test:build` runs this file after the build, where
 * the images are present.
 *
 * A GUARD THAT READS FILES MUST PROVE IT READ SOMETHING, and a decoder that is
 * never shown a bad file is not known to decode. Both controls are below.
 */

const CONTENT = fileURLToPath(new URL('../assets/content/', import.meta.url));
const UPLOADS = fileURLToPath(new URL('../../public/uploads/', import.meta.url));

/** Every file under `dir`, recursively, as paths relative to it. */
function filesUnder(dir: string, relative = ''): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(join(dir, relative), { withFileTypes: true })) {
    const path = relative + entry.name;
    if (entry.isDirectory()) found.push(...filesUnder(dir, `${path}/`));
    else found.push(path);
  }
  return found;
}

/*
 * `existsSync` first, so a missing directory is a named fact rather than a
 * throw about the repository root. The migration's tree is REQUIRED - an empty
 * one would make every case below check nothing - while the CMS's is not.
 */
const ROOTS = [
  {
    label: 'src/assets/content/',
    dir: CONTENT,
    required: true,
    files: existsSync(CONTENT) ? filesUnder(CONTENT).sort() : [],
  },
  {
    label: 'public/uploads/',
    dir: UPLOADS,
    required: false,
    files: existsSync(UPLOADS) ? filesUnder(UPLOADS).sort() : [],
  },
];

/** The extension a path carries, lower-cased, or `''` when it carries none. */
function extensionOf(path: string): string {
  return path.split('.').pop()?.toLowerCase() ?? '';
}

describe('the committed images are all real images', () => {
  it('the migrated tree exists and has files in it', () => {
    // Without this, the extension and decoder cases would pass vacuously on a
    // checkout where the images were never written.
    expect(existsSync(CONTENT), `${CONTENT} is missing`).toBe(true);
    const migrated = ROOTS[0]!;
    expect(migrated.files.length, 'src/assets/content/ is empty').toBeGreaterThan(0);
    // The asymmetry is declared, not incidental: exactly one root is required.
    expect(
      ROOTS.filter((root) => root.required).map((root) => root.label),
      'the required image root changed',
    ).toEqual(['src/assets/content/']);
  });

  it('every file under an image root carries an extension on the allow-list', () => {
    // The same list `migrateImages` writes with, imported rather than copied.
    // A file whose extension is off it would have been swept as text by the
    // unit sweep instead - which is the failure this makes impossible.
    const offList = ROOTS.flatMap((root) =>
      root.files
        .filter((path) => !ALLOWED_EXTENSIONS.includes(extensionOf(path)))
        .map((path) => `${root.label}${path}`),
    );
    expect(
      offList,
      `files under an image root whose extension is not one of ` +
        `${ALLOWED_EXTENSIONS.join(', ')}: ${offList.join(', ')}`,
    ).toEqual([]);
  });

  it('every committed image decodes through sharp, with real dimensions', async () => {
    const failures: string[] = [];
    for (const root of ROOTS) {
      for (const relative of root.files) {
        const path = join(root.dir, relative);
        try {
          // `failOn: 'error'` and a full `raw()` decode, not `metadata()` alone:
          // metadata reads the header, so a file cut off after a valid header
          // passes it. `migrateImages` refuses such a file, and this asserts the
          // same thing from outside - for the CMS's uploads it is the only check
          // there is.
          const image = sharp(path, { failOn: 'error' });
          const meta = await image.metadata();
          if (!meta.width || !meta.height) {
            failures.push(`${root.label}${relative}: decoded with no dimensions`);
            continue;
          }
          const pixels = await image.raw().toBuffer();
          if (pixels.length === 0) failures.push(`${root.label}${relative}: decoded to no pixels`);
        } catch (error) {
          failures.push(
            `${root.label}${relative}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }
    // Printed, not only checked: the number is what a later reader trusts when
    // a comment disagrees with it. `process.stdout.write` because vitest's
    // default reporter swallows `console.log` on the green run.
    const counts = ROOTS.map((root) => `${root.label} ${root.files.length}`).join(', ');
    process.stdout.write(
      `\nDecoded committed images through sharp (${counts}): ` +
        `${failures.length} failure(s).\n`,
    );
    expect(
      failures,
      `committed files that are not decodable images:\n${failures.join('\n')}`,
    ).toEqual([]);
  });

  it('POSITIVE CONTROL: the decoder fires on bytes that are not an image, and resolves on one that is', async () => {
    // If `sharp` resolved on anything, the case above would prove nothing. And
    // the other direction, built from numbers rather than committed as bytes, so
    // "everything failed" cannot be mistaken for a working check either.
    await expect(sharp(Buffer.from('not an image')).metadata()).rejects.toThrow();
    const real = await sharp({
      create: { width: 3, height: 2, channels: 3, background: '#123456' },
    }).png().toBuffer();
    const meta = await sharp(real).metadata();
    expect([meta.width, meta.height]).toEqual([3, 2]);
  });
});
