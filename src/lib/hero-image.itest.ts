import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * THE HOMEPAGE HERO IS THE LCP FETCH, AND NOTHING ELSE MEASURES AN ASSET'S
 * BYTES. `check-budget.mjs` measures HTML bytes per page, visitor JavaScript
 * and request count; the hero's one request is argued for in the note beside
 * `'index.html': 12`, but the bytes it hands the browser were measured by
 * nothing — and the Lighthouse rows that would have caught them are
 * deferred to Phase 5, so neither half of spec §13 was watching.
 *
 * The guard is scoped to this one image on purpose: a general asset-byte
 * budget would redden on a legitimate album photograph, and the LCP image is
 * the asset with a stated target. It reads the BUILT page and stats the BUILT
 * files, so it measures what a browser would fetch rather than what the source
 * intends.
 *
 * THE NUMBERS ARE PRINTED, NOT ONLY THE VERDICT, for the reason every guard
 * here prints: a later reader checks the claim against the number, and
 * vitest's default reporter hides a passing test's `console.log` — hence
 * `process.stdout.write`.
 */
const DIST = fileURLToPath(new URL('../../dist/', import.meta.url));
const HTML = readFileSync(join(DIST, 'index.html'), 'utf8');

/*
 * MEASURED 2026-09-21 through Astro at its default quality, against the
 * re-cut 2:1 derivative (`7-hero.jpg`, `sharp(src).resize({ width: 1600
 * }).extract({ left: 0, top: 280, width: 1600, height: 800 }).jpeg({ quality:
 * 90 })`): 480w = 28,834 B, 800w = 70,706 B, 1200w = 137,744 B. The ceiling
 * of 180,000 is headroom for a re-encode of this crop, not enough to hide a
 * return to the uncropped album file: put through the same pipeline, that
 * file's 1200w candidate measures 207,858 B — over the ceiling, which is why
 * the homepage gets a derivative. The first draft of this ceiling was 160,000,
 * guessed from a sharp estimate before a build existed; the built number is
 * the one that counts.
 */
const HERO_BYTES_CEILING = 180_000;
const HERO_WIDTHS = [480, 800, 1200];

type Candidate = { url: string; width: number };

function heroTags(html: string): string[] {
  return [...html.matchAll(/<img[^>]*class="hero-img"[^>]*>/g)].map((match) => match[0]);
}

function candidates(tag: string): Candidate[] {
  const srcset = tag.match(/srcset="([^"]*)"/)?.[1] ?? '';
  return srcset
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .map((part) => {
      const [url, descriptor] = part.split(/\s+/);
      return { url: url as string, width: Number((descriptor ?? '').replace(/w$/, '')) };
    });
}

describe('the hero image the browser fetches', () => {
  it('exists once on the homepage, so a second hero cannot escape the measurement', () => {
    expect(HTML.length).toBeGreaterThan(0);
    const tags = heroTags(HTML);
    expect(tags, 'no img.hero-img in dist/index.html — the guard would measure nothing').toHaveLength(1);
  });

  it('offers the three measured candidates, ascending, and no fourth', () => {
    const [tag] = heroTags(HTML);
    const list = candidates(tag);
    expect(list.map((c) => c.width)).toEqual(HERO_WIDTHS);
  });

  it('ships no hero candidate over the byte ceiling, and prints every candidate', () => {
    const [tag] = heroTags(HTML);
    const list = candidates(tag);
    expect(list.length).toBeGreaterThan(0);
    const measured = list.map((candidate) => {
      const path = join(DIST, candidate.url.replace(/^\//, ''));
      const bytes = statSync(path).size;
      return { ...candidate, bytes };
    });
    /*
     * The `src` is Astro's 1600w variant, emitted as the fallback for a browser
     * with no `srcset` support and fetched by none of the browsers this site
     * targets; it is printed so the number is not hidden, and deliberately not
     * capped — the cap is on what the LCP fetch can be, and that is a srcset
     * candidate.
     */
    const src = tag.match(/ src="([^"]*)"/)?.[1] ?? '';
    const srcBytes = src === '' ? 0 : statSync(join(DIST, src.replace(/^\//, ''))).size;
    expect(srcBytes, 'the hero img names no src file').toBeGreaterThan(0);
    process.stdout.write(
      `\nHero candidates: ${measured.map((c) => `${c.width}w ${c.bytes} B`).join(', ')}` +
        `; src fallback (not in srcset) ${srcBytes} B\n`,
    );
    for (const candidate of measured) {
      expect(
        candidate.bytes,
        `${candidate.width}w is ${candidate.bytes} B, over the ${HERO_BYTES_CEILING} B ceiling`,
      ).toBeLessThanOrEqual(HERO_BYTES_CEILING);
    }
  });
});
