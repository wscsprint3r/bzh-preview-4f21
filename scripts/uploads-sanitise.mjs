/*
 * Every file the CMS uploads is re-encoded into the build, so what ships
 * carries pixels and nothing else.
 *
 * WHY THE BUILD AND NOT THE CMS. `public/uploads/` is committed and served
 * as-is (public/admin/config.yml explains the pair), so a photograph a
 * volunteer uploads ships with whatever the camera wrote into it — EXIF, and
 * GPS inside it. The migration's `src/assets/content/` is safe because sharp
 * re-encoded it; this gives the CMS path the same treatment at the only point
 * the project controls: the build. `astro:build:done` runs after `public/` is
 * copied, so the files are rewritten in `dist/` and the committed originals
 * are untouched.
 *
 * A FILE THAT DOES NOT DECODE STOPS THE BUILD, BY NAME. The migration DROPS a
 * file that fails to decode, because the source came off a compromised server
 * and a dropped file is a success. An upload is different: it is a volunteer's
 * file, a page may reference it, and silently dropping it would 404 a page
 * that looked fine at save time. Failing names the file and the reason.
 */
import { readdirSync, statSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import sharp from 'sharp';

export const UPLOADS_SRC = 'public/uploads';
export const UPLOADS_OUT = 'dist/uploads';

/** Every file under `dir`, recursively, as paths relative to it. */
function filesUnder(dir, found = [], base = dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) filesUnder(path, found, base);
    else found.push(relative(base, path));
  }
  return found;
}

/**
 * Re-encodes every file from `src` into `out`, returning how many it wrote.
 * `rotate()` with no argument applies the EXIF orientation and then discards
 * it; no `withMetadata()` call means no EXIF, no GPS, no ICC profile — the
 * same "decode and re-encode is the sanitisation" ruling the migration follows.
 */
export async function sanitiseUploads({ src = UPLOADS_SRC, out = UPLOADS_OUT, log = console.log } = {}) {
  let written = 0;
  if (statSync(src, { throwIfNoEntry: false }) === undefined) {
    log(`uploads: ${src}/ does not exist — nothing to sanitise`);
    return 0;
  }
  for (const file of filesUnder(src)) {
    const from = join(src, file);
    const to = join(out, file);
    /*
     * SVG IS REFUSED BY NAME, BEFORE ANY DECODER SEES IT, and the reason is a
     * measurement rather than caution: sharp 0.35.4 DECODES an SVG — and a
     * gzipped `.svgz`, which a server still sends as image/svg+xml — and writes
     * PNG bytes back, so a sanitiser that relied only on the decode failing
     * accepted one and wrote it out under the vector's name. The project ruled
     * on SVG in Phase 2 — it is a script-injection vector and is never
     * re-encoded automatically — and a rasterised-SVG-with-a-.svg-name would be
     * a page promising a vector and serving a bitmap.
     */
    const lower = file.toLowerCase();
    if (lower.endsWith('.svg') || lower.endsWith('.svgz')) {
      throw new Error(
        `${from} is an SVG. This build does not accept an SVG upload: sharp can rasterise one, ` +
          'but an SVG is a script-injection vector, and it is refused by name rather than re-encoded.',
      );
    }
    let buffer;
    try {
      buffer = await sharp(from).rotate().toBuffer();
    } catch (error) {
      throw new Error(`${from} is not an image this build can decode (${error.message}).`);
    }
    await mkdir(dirname(to), { recursive: true });
    await writeFile(to, buffer);
    written += 1;
  }
  log(`uploads: ${written} file(s) re-encoded into ${out}/, metadata dropped`);
  return written;
}

/** The Astro integration. Wired in `astro.config.mjs`. */
export const uploadsSanitise = {
  name: 'uploads-sanitise',
  hooks: {
    'astro:build:done': async ({ logger }) => {
      await sanitiseUploads({ log: (message) => logger.info(message) });
    },
  },
};