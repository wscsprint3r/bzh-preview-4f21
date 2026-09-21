import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';

/*
 * THE COMMITTED PHOTOGRAPHS, AND THE TREATMENT THEY MUST HAVE HAD.
 *
 * The migration's `reencode` is this project's sanitisation: decode, downscale
 * to a 2400px long edge, re-encode, and write out with no metadata, so an
 * appended payload or a GPS coordinate does not survive being turned back into
 * pixels. Every migrated file went through it; a photograph added by hand is
 * the case where the treatment can be skipped with nothing to notice, because
 * the page renders and the picture looks right.
 *
 * The subject is the DIRECTORY, not a list: every file under
 * `src/assets/content` is read, and the count is asserted non-zero so an empty
 * walk cannot pass. `process.stdout.write` rather than `console.log`, because
 * the numbers are wanted on the green run too.
 */
const CONTENT = fileURLToPath(new URL('../assets/content/', import.meta.url));

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

/** The migration's long edge (`MAX_EDGE` in `migration/media.mjs`). */
const MAX_EDGE = 2400;

describe('the committed photographs', () => {
  it('have all been through the sanitising re-encode: no EXIF, no edge over 2400', async () => {
    const files = walk(CONTENT);
    expect(files.length, 'no file under src/assets/content - the sweep would prove nothing')
      .toBeGreaterThan(0);
    let longest = 0;
    for (const file of files) {
      const meta = await sharp(file).metadata();
      expect(meta.exif, `${relative(CONTENT, file)} still carries EXIF`).toBeUndefined();
      const edge = Math.max(meta.width ?? 0, meta.height ?? 0);
      longest = Math.max(longest, edge);
      expect(edge, `${relative(CONTENT, file)} is ${meta.width}x${meta.height}, over ${MAX_EDGE}`)
        .toBeLessThanOrEqual(MAX_EDGE);
    }
    process.stdout.write(
      `\nContent assets: ${files.length} files, none with EXIF, longest edge ${longest}.\n`,
    );
  });

  it('hold the ten photographs the two Phase 5 albums were built from', () => {
    const expected = [
      '2025/12/5.jpg',
      '2025/12/6.jpg',
      '2025/12/7.jpg',
      '2025/12/10.jpg',
      '2026/04/1.jpg',
      '2026/04/2.jpg',
      '2026/04/3.jpg',
      '2026/04/4.jpg',
      '2026/04/8.jpg',
      '2026/04/9.jpg',
    ];
    const present = walk(CONTENT).map((file) => relative(CONTENT, file));
    for (const path of expected) {
      expect(present, `${path} is not under src/assets/content`).toContain(path);
    }
  });
});
