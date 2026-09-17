import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { ALLOWED_EXTENSIONS } from '../../migration/media.mjs';

/*
 * WHAT THIS PROVES: every file under `src/assets/content/` really is an image
 * this project can decode - not a payload that was renamed to `.jpg`.
 *
 * WHY IT EXISTS. `diacritics-sources.test.ts` sweeps every tracked file that is
 * not valid UTF-8 text, and until Task 6 that exemption was a list of exact
 * paths holding one entry, `public/favicon.ico`. Task 6 commits the migrated
 * images and there are too many to name one by one, so the rule became a
 * predicate: the favicon, or a path under `src/assets/content/` whose extension
 * is on `ALLOWED_EXTENSIONS` in `migration/media.mjs`. A prefix rule on its own
 * is a pure weakening - it would excuse a PHP payload renamed to `.jpg` for as
 * long as it sat under that directory - so it does not ship alone. This is the
 * replacement guarantee, and it is stronger than naming: a name list is
 * defeated by renaming a file, a decoder is not.
 *
 * It asserts from the OUTSIDE exactly the guarantee `migrateImages` makes from
 * the inside: the pipeline decodes every source through sharp and writes it
 * back out, so nothing that is not a real image can be under the prefix unless
 * something bypassed the pipeline. It needs sharp and a whole tree of files,
 * which is why it lives here and not in the unit sweep: `npm run test:build`
 * runs this file after the build, where the images are present.
 *
 * A GUARD THAT READS FILES MUST PROVE IT READ SOMETHING, and a decoder that is
 * never shown a bad file is not known to decode. Both controls are below.
 */

const CONTENT = fileURLToPath(new URL('../assets/content/', import.meta.url));

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

// `existsSync` first, so a missing directory fails the named case below rather
// than throwing here with an error about the repository root.
const FILES = existsSync(CONTENT) ? filesUnder(CONTENT).sort() : [];

/** The extension a path carries, lower-cased, or `''` when it carries none. */
function extensionOf(path: string): string {
  return path.split('.').pop()?.toLowerCase() ?? '';
}

describe('the migrated images are all real images', () => {
  it('the tree exists and has files in it', () => {
    // Without this, every case below would pass vacuously on a checkout where
    // the images were never written - the guard loudest exactly when it had
    // checked nothing.
    expect(existsSync(CONTENT), `${CONTENT} is missing`).toBe(true);
    expect(FILES.length, 'src/assets/content/ is empty').toBeGreaterThan(0);
  });

  it('every file carries an extension on the allow-list', () => {
    // The same list `migrateImages` writes with, imported rather than copied.
    // A file whose extension is off it would have been swept as text by the
    // unit sweep instead - which is the failure this makes impossible.
    const offList = FILES.filter((path) => !ALLOWED_EXTENSIONS.includes(extensionOf(path)));
    expect(
      offList,
      `files under src/assets/content/ whose extension is not one of ` +
        `${ALLOWED_EXTENSIONS.join(', ')}: ${offList.join(', ')}`,
    ).toEqual([]);
  });

  it('every file decodes through sharp, with real dimensions', async () => {
    const failures: string[] = [];
    for (const relative of FILES) {
      const path = join(CONTENT, relative);
      try {
        // `failOn: 'error'` and a full `raw()` decode, not `metadata()` alone:
        // metadata reads the header, so a file cut off after a valid header
        // passes it. `migrateImages` refuses such a file, and this asserts the
        // same thing from outside.
        const image = sharp(path, { failOn: 'error' });
        const meta = await image.metadata();
        if (!meta.width || !meta.height) {
          failures.push(`${relative}: decoded with no dimensions`);
          continue;
        }
        const pixels = await image.raw().toBuffer();
        if (pixels.length === 0) failures.push(`${relative}: decoded to no pixels`);
      } catch (error) {
        failures.push(`${relative}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    // Printed, not only checked: the number is what a later reader trusts when
    // a comment disagrees with it. `process.stdout.write` because vitest's
    // default reporter swallows `console.log` on the green run.
    process.stdout.write(
      `\nDecoded ${FILES.length} file(s) under src/assets/content/ through sharp: ` +
        `${failures.length} failure(s).\n`,
    );
    expect(
      failures,
      `files under src/assets/content/ that are not decodable images:\n${failures.join('\n')}`,
    ).toEqual([]);
  });

  it('POSITIVE CONTROL: the decoder fires on bytes that are not an image, and resolves on one that is', async () => {
    // The negative control the controller asked for: if `sharp` resolved on
    // anything, the case above would prove nothing. And the other direction,
    // built from numbers rather than committed as bytes, so "everything
    // failed" cannot be mistaken for a working check either.
    await expect(sharp(Buffer.from('not an image')).metadata()).rejects.toThrow();
    const real = await sharp({
      create: { width: 3, height: 2, channels: 3, background: '#123456' },
    }).png().toBuffer();
    const meta = await sharp(real).metadata();
    expect([meta.width, meta.height]).toEqual([3, 2]);
  });
});
