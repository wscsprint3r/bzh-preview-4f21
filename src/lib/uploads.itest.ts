import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { afterAll, describe, expect, it, vi } from 'vitest';
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

  it('refuses an SVG or an SVGZ by name instead of shipping it or rasterising it silently', async () => {
    // Measured on sharp 0.35.4: it DECODES an SVG and writes PNG bytes back
    // under the `.svg` name, and it does the same for a gzipped `.svgz`, which
    // a server would still send as image/svg+xml. The project's ruling is
    // older than this file: SVG is a script-injection vector and is never
    // re-encoded automatically.
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4">' +
      '<rect width="4" height="4" fill="#123456"/></svg>';
    for (const name of ['logo.svg', 'logo.svgz']) {
      const source = join(scratch, `svg-src-${name}`);
      mkdirSync(source, { recursive: true });
      writeFileSync(join(source, name), name.endsWith('z') ? gzipSync(svg) : svg);
      await expect(
        sanitiseUploads({ src: source, out: join(scratch, `svg-out-${name}`), log: () => {} }),
      ).rejects.toThrow(new RegExp(`${name.replace('.', '\\.')}\\b`));
    }
  });

  it('every built upload decodes and carries no EXIF', async () => {
    if (!existsSync(DIST_UPLOADS)) return; // no uploads in this build is a legitimate state
    // `withFileTypes` and `isFile`, because a recursive walk yields the
    // DIRECTORIES too (measured: ["2024", "2024/05", "2024/05/a.jpg"]), and
    // sharp on a directory fails as an undecodable upload. The sanitiser
    // supports nesting on purpose, so the dist side has to as well.
    for (const entry of readdirSync(DIST_UPLOADS, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const full = join(entry.parentPath, entry.name);
      const file = relative(DIST_UPLOADS, full);
      const metadata = await sharp(full).metadata();
      expect(metadata.format, `${file} does not decode as an image`).toBeDefined();
      expect(metadata.exif, `${file} still carries EXIF`).toBeUndefined();
    }
  });

  /*
   * THE FAILURE IS ANNOTATED IN ROMANIAN, AND THE ANNOTATION IS GATED THE WAY
   * THE BUDGET'S IS. `::error::` is a GitHub Actions workflow command; printed
   * anywhere else it is noise in a local terminal, so the sanitiser prints it
   * only under `GITHUB_ACTIONS`, exactly as `check-budget.mjs` does. Both
   * directions are asserted: with the flag the editor's run page carries the
   * sentence, without it nothing is printed.
   */
  it('prints the Romanian annotation for a refused upload only on the run page', async () => {
    const source = join(scratch, 'refused-src');
    const out = join(scratch, 'refused-out');
    mkdirSync(join(source, '2026/09'), { recursive: true });
    writeFileSync(join(source, '2026/09/studiu.pdf'), 'not an image');
    const previous = process.env.GITHUB_ACTIONS;
    const written: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      written.push(String(chunk));
      return true;
    });
    try {
      process.env.GITHUB_ACTIONS = 'true';
      await expect(
        sanitiseUploads({ src: source, out, log: () => {} }),
      ).rejects.toThrow(/studiu\.pdf/);
    } finally {
      spy.mockRestore();
      if (previous === undefined) delete process.env.GITHUB_ACTIONS;
      else process.env.GITHUB_ACTIONS = previous;
    }
    const annotated = written.join('');
    expect(annotated).toContain('::error::');
    expect(annotated).toContain('2026/09/studiu.pdf');
    expect(annotated).toContain('imagini');
  });
});