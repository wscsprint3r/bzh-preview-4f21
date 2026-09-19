import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseUrlMap } from './url-map';

/*
 * `dist/_redirects` is never served by any host this repository can reach —
 * Cloudflare parses it and drops it — so the only check that can exist is
 * against the built file itself, and the live check is handover F.
 *
 * THE TARGETS THAT DO NOT RESOLVE ARE THE HELD-BACK POSTS, and their number is
 * pinned rather than allowed: 32 unpublished posts keep their old URLs and
 * their redirect targets have no page until the parish dates them, which is the
 * documented design. Any OTHER missing target is a rule pointing at a 404.
 *
 * THE PIN IS 31, NOT 32, and the difference is a row that works. Thirty-two
 * posts are held back, but `/scoala-parohiala/` is not among the missing
 * targets: the CSV's page row wins over its post row, so it redirects to the
 * published page `/comunitate/scoala/` and resolves. Measured on the first
 * green build: 31 missing, all of them `/noutati/…` targets. The plan's 32
 * counted unpublished posts rather than absent redirect targets.
 */

const DIST = fileURLToPath(new URL('../../dist/', import.meta.url));

function read(path: string): string {
  expect(existsSync(DIST + path), `${path} is missing from dist/`).toBe(true);
  const text = readFileSync(DIST + path, 'utf8');
  expect(text.length, `${path} exists but is empty`).toBeGreaterThan(0);
  return text;
}

describe('the built _redirects', () => {
  const text = read('_redirects');
  const lines = text.split('\n').filter((l) => l !== '' && !l.startsWith('#'));
  const rules = lines.map((l) => {
    const [from, to, status] = l.split(' ');
    return { from, to, status: Number(status) };
  });

  it('holds one rule per line, only 301 and 410, no duplicate source', () => {
    /*
     * 149 today, not the plan's 151: 144 data rows, 3 of them old==new and
     * skipped, +4 extras, +4 gone. The bound stays loose rather than pinned
     * because Task 4 regenerates the CSV with more rows; it is a positive
     * control that the guard read the whole file, and the exact classes are in
     * the build log and the CSV's own header.
     */
    expect(lines.length).toBeGreaterThan(140);
    for (const rule of rules) expect([301, 410]).toContain(rule.status);
    expect(new Set(rules.map((r) => r.from)).size).toBe(rules.length);
  });

  it('keeps every 301 above every 410', () => {
    const last301 = rules.map((r) => r.status).lastIndexOf(301);
    const first410 = rules.map((r) => r.status).indexOf(410);
    expect(first410).toBeGreaterThan(last301);
  });

  it('resolves every 301 target, except the pinned held-back posts', () => {
    const missing = rules
      .filter((r) => r.status === 301 && r.to.startsWith('/'))
      .filter((r) => !existsSync(`${DIST}${r.to}index.html`) && !existsSync(`${DIST}${r.to}`))
      .map((r) => r.from);
    expect(missing).toHaveLength(31);
    for (const from of missing) {
      const rule = rules.find((r) => r.from === from);
      expect(rule?.to.startsWith('/noutati/'), `${from} -> ${rule?.to}`).toBe(true);
    }
  });

  it('agrees with the CSV row for row', () => {
    const rows = parseUrlMap(readFileSync('docs/url-map.csv', 'utf8')).filter(([a, b]) => a !== b);
    const froms = new Set(rules.map((r) => r.from));
    for (const [oldPath] of rows) expect(froms.has(oldPath), `${oldPath} has no rule`).toBe(true);
  });

  it('carries the album, the calendar wildcards and the 410 block', () => {
    const byFrom = new Map(rules.map((r) => [r.from, r]));
    expect(byFrom.get('/galerie.html')?.to).toBe('/galerie/');
    expect(byFrom.get('/event/*')?.to).toBe('/evenimente/');
    expect(byFrom.get('/wp-content/*')?.status).toBe(410);
    expect(byFrom.get('/wp-login.php')?.status).toBe(410);
  });
});