import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * The PDF gate: the security ruling recorded for this phase, as code.
 *
 * THE BYTES ARE COPIED, NOT RE-DISTILLED, and that is deliberate rather than
 * unfinished. A raster is sanitised by re-encoding it through sharp; a PDF
 * cannot be, and the alternative - rasterising 87 pastoral letters into images -
 * would destroy text that people zoom into and print. So the ruling is: copy
 * as-is, but only after a gate that is weaker than re-encoding and says so.
 * `migration/README.md` carries the ruling in full.
 *
 * TWO QUESTIONS, TWO MECHANISMS.
 * - "Does it open?" is `pdfinfo`'s, which parses the document the way a viewer
 *   will; a file it cannot read is dropped by name, the same shape as sharp's
 *   decode-or-drop.
 * - "Does it carry script or a payload?" is `pdfinfo -js` plus a byte scan.
 *   `pdfinfo -js` reports document JavaScript; the byte scan looks for the two
 *   payload names below.
 *
 * WHAT NEITHER MECHANISM COVERS, SAID PLAINLY SO THE CLAIM IS NOT READ AS
 * STRONGER THAN IT IS. The byte scan finds a name in the uncompressed stream:
 * a `/EmbeddedFile` or `/Launch` inside an object stream is invisible to it by
 * exactly the compression the `/JS` note below describes, and the only honest
 * claim is "no such name in the bytes as stored". `pdfinfo -js` reports the
 * document-level JavaScript name tree; it does not report `/OpenAction`, an
 * annotation's `/AA` actions, or XFA forms. The ruling stands - copy rather
 * than re-distil, with a gate that is weaker than re-encoding and says so -
 * and this paragraph is the "says so".
 *
 * WHY THE BYTE SCAN IS ONLY THOSE TWO. The plan's sentence named `/JavaScript`,
 * `/JS`, `/EmbeddedFile` and `/Launch` as "in `pdfinfo -js` output or the raw
 * bytes", which reads as one list for both mechanisms. Measured 2026-09-18
 * over the 87 clean files: `/JavaScript` and `/EmbeddedFile` and `/Launch`
 * occur zero times, and `/JS` occurs six times inside compressed streams
 * (doxologia 17/19/21/22/25/27) - the bytes of a compressed stream, not a
 * JavaScript action. A byte scan for `/JS` would therefore drop six documents
 * the JavaScript question had already cleared. The `/JavaScript` and `/JS`
 * names are covered where they are meaningful: `pdfinfo -js` prints them when
 * they are real names, and an empty report is the verdict.
 */

/**
 * The two payload names the byte scan looks for.
 *
 * Exported so `documents.itest.ts` can build its positive control from the same
 * list the gate uses rather than a second copy that could drift from it.
 */
export const PDF_GATE = ['/EmbeddedFile', '/Launch'];

/**
 * The verdict, as a pure function of what the two mechanisms found.
 *
 * Pure so the three failure arms can be shown to fire without a PDF that
 * carries a payload - which this corpus has none of, and which must not be
 * manufactured into the repository to make a test convenient.
 */
export function gateVerdict({ opened, javascript, bytes }) {
  if (!opened) return { ok: false, reason: 'pdfinfo could not read it' };
  if (javascript.trim() !== '') return { ok: false, reason: 'reports JavaScript' };
  const hit = PDF_GATE.find((pattern) => bytes.includes(pattern));
  if (hit !== undefined) return { ok: false, reason: `carries ${hit}` };
  return { ok: true };
}

/**
 * Run both mechanisms over one file on disk and return the verdict.
 *
 * The read happens only when `pdfinfo` opened the file: a path that does not
 * exist must return the unreadable verdict rather than throw from
 * `readFileSync`, which would be a crash in the middle of a corpus walk instead
 * of a dropped file named in the summary. `latin1` because the byte scan is
 * about byte sequences, not text; a UTF-8 read could refuse or replace bytes.
 */
export function gatePdf(path) {
  let opened = true;
  let javascript = '';
  try {
    execFileSync('pdfinfo', [path], { stdio: ['ignore', 'ignore', 'ignore'] });
    javascript = execFileSync('pdfinfo', ['-js', path], { encoding: 'utf8' });
  } catch {
    opened = false;
  }
  if (!opened) return gateVerdict({ opened, javascript, bytes: '' });
  return gateVerdict({ opened, javascript, bytes: readFileSync(path, 'latin1') });
}
