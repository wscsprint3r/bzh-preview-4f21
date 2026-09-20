import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { sanitiseUploads } from '../../scripts/uploads-sanitise.mjs';

/*
 * THE POSITIVE CONTROL IS SYNTHETIC, because `public/uploads/` is empty on
 * every fresh clone — the CMS creates it on the first upload. A guard that
 * walks an empty tree proves nothing, so the test manufactures an image that
 * carries EXIF, runs the sanitiser over it, and shows the metadata is gone.
 * Only then does it assert the built tree.
 */
const DIST_UPLOADS = fileURLToPath(new URL('../../dist/uploads/', import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), 'uploads-itest-'));

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe('uploads sanitisation', () => {
  it('strips EXIF from a synthetic tagged image', async () => {
    const source = join(scratch, 'src');
    const out = join(scratch, 'out');
    const dir = join(source, '2024/05');
    mkdirSync(dir, { recursive: true });
    const tagged = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#808080' },
    })
      .withExif({ IFD0: { Copyright: 'a name', Software: 'a camera' } })
      .jpeg()
      .toBuffer();
    writeFileSync(join(dir, 'tagged.jpg'), tagged);
    expect((await sharp(join(dir, 'tagged.jpg')).metadata()).exif).toBeDefined();

    await sanitiseUploads({ src: source, out, log: () => {} });

    expect((await sharp(join(out, '2024/05/tagged.jpg')).metadata()).exif).toBeUndefined();
  });

  it('refuses an SVG by name instead of shipping it or rasterising it silently', async () => {
    // Measured on sharp 0.35.4: it DECODES an SVG and writes PNG bytes back
    // under the `.svg` name, so a sanitiser that only relied on the decode
    // failing would accept one. The project's ruling is older than this file:
    // SVG is a script-injection vector and is never re-encoded automatically.
    const source = join(scratch, 'svg-src');
    mkdirSync(source, { recursive: true });
    writeFileSync(
      join(source, 'logo.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4">' +
        '<rect width="4" height="4" fill="#123456"/></svg>',
    );
    await expect(
      sanitiseUploads({ src: source, out: join(scratch, 'svg-out'), log: () => {} }),
    ).rejects.toThrow(/logo\.svg/);
  });

  it('every built upload decodes and carries no EXIF', async () => {
    if (!existsSync(DIST_UPLOADS)) return; // no uploads in this build is a legitimate state
    for (const file of readdirSync(DIST_UPLOADS, { recursive: true }) as string[]) {
      const full = join(DIST_UPLOADS, file);
      const metadata = await sharp(full).metadata();
      expect(metadata.format, `${file} does not decode as an image`).toBeDefined();
      expect(metadata.exif, `${file} still carries EXIF`).toBeUndefined();
    }
  });
});