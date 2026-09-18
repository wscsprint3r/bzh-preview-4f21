import { describe, expect, it } from 'vitest';
import { PDF_GATE, gateVerdict } from './pdf-gate.mjs';

describe('the PDF gate verdict', () => {
  it('passes a readable file with no JavaScript', () => {
    expect(gateVerdict({ opened: true, javascript: '', bytes: 'x y' }).ok).toBe(true);
  });

  it('POSITIVE CONTROL: fails an unreadable file, naming it', () => {
    expect(gateVerdict({ opened: false, javascript: '', bytes: '' })).toEqual({
      ok: false,
      reason: 'pdfinfo could not read it',
    });
  });

  it('POSITIVE CONTROL: fails a file that reports JavaScript', () => {
    expect(gateVerdict({ opened: true, javascript: 'JavaScript: 2', bytes: '' }).ok).toBe(false);
  });

  it('POSITIVE CONTROL: fails a file carrying an embedded file or launch action', () => {
    expect(gateVerdict({ opened: true, javascript: '', bytes: '/EmbeddedFile' }).ok).toBe(false);
    expect(gateVerdict({ opened: true, javascript: '', bytes: '/Launch' }).ok).toBe(false);
  });

  it('scans the bytes for exactly the two measured payload names', () => {
    // `/JS` is NOT in this list on purpose. Measured 2026-09-18 over the 87
    // clean files: six of them contain the bytes `/JS` inside compressed
    // streams, so a byte scan for it would drop six documents the JavaScript
    // question had already cleared. That question is `pdfinfo -js`'s, above.
    expect(PDF_GATE).toEqual(['/EmbeddedFile', '/Launch']);
  });
});
