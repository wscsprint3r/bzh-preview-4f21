import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { articleSlug } from './articles';
import { parseUrlMap } from './url-map';

/*
 * `dist/_redirects` is never served by any host this repository can reach —
 * Cloudflare parses it and drops it — so the only check that can exist is
 * against the built file itself, and the live check is handover F.
 *
 * THE TARGETS THAT DO NOT RESOLVE ARE THE HELD-BACK POSTS, AND THE CHECK IS A
 * PROPERTY, NOT A COUNT. The unpublished posts keep their old URLs and their
 * targets have no page until the parish dates and publishes each one, which is
 * the documented design. A PINNED COUNT GOES RED ON THE FIRST PUBLISH: the
 * parish dates one post, its `/noutati/<slug>/` appears, and the volunteer's
 * push fails CI for doing exactly what the design asks. So the held-back slugs
 * are read from `src/content/articles/*.md`'s own `published` frontmatter, and
 * every missing target must be one of THEIR targets. Any other missing target
 * is a rule pointing at a 404.
 *
 * `/scoala-parohiala/` IS HELD BACK AND STILL RESOLVES: the CSV's page row
 * wins over its post row, so it redirects to the published page
 * `/comunitate/scoala/` instead of `/noutati/scoala-parohiala/`. The positive
 * control below is the same shape — a target that exists must not be reported.
 */

const DIST = fileURLToPath(new URL('../../dist/', import.meta.url));
const ARTICLES = fileURLToPath(new URL('../../src/content/articles/', import.meta.url));

function read(path: string): string {
  expect(existsSync(DIST + path), `${path} is missing from dist/`).toBe(true);
  const text = readFileSync(DIST + path, 'utf8');
  expect(text.length, `${path} exists but is empty`).toBeGreaterThan(0);
  return text;
}

/**
 * Every article file's public slug and its `published` flag, off disk.
 *
 * The frontmatter field is asserted to be a boolean rather than coerced: a
 * string `published: "false"` would read as truthy here, and the schema rejects
 * it anyway — this is the guard saying what it expects rather than guessing.
 */
function articleStates(): { slug: string; published: boolean }[] {
  return readdirSync(ARTICLES)
    .filter((file) => file.endsWith('.md'))
    .sort()
    .map((file) => {
      const text = readFileSync(join(ARTICLES, file), 'utf8');
      const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
      expect(block, `${file} has no frontmatter block`).not.toBeNull();
      const frontmatter = parseYaml((block as RegExpExecArray)[1] as string) as {
        published?: unknown;
      };
      expect(typeof frontmatter.published, `${file} has no boolean published field`).toBe('boolean');
      return { slug: articleSlug(file.slice(0, -'.md'.length)), published: frontmatter.published === true };
    });
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
     * 156 today: 152 data rows, 3 of them old==new and skipped -> 149 rules
     * from the map, +3 extras (the album and the two calendar wildcards), +4
     * gone. The apex is not a rule at all — it cannot be one, and lives in
     * `functions/_middleware.ts`. The bound stays loose rather than pinned
     * because a rerun of the migration can regenerate the CSV with more rows;
     * it is a positive control that the guard read the whole file, and the
     * exact classes are in the build log and the CSV's own header.
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

  it('resolves every 301 target, except the held-back posts', () => {
    const articles = articleStates();
    expect(
      articles.length,
      'no article file was read, so an empty held-back set below would prove nothing',
    ).toBeGreaterThan(30);
    const heldBack = articles.filter((a) => !a.published).map((a) => a.slug);
    expect(
      heldBack.length,
      'no article is held back, so this guard cannot say whether a missing target is legitimate',
    ).toBeGreaterThan(0);
    const heldBackTargets = new Set(heldBack.map((slug) => `/noutati/${slug}/`));

    const missing = rules
      .filter((r) => r.status === 301 && r.to.startsWith('/'))
      .filter((r) => !existsSync(`${DIST}${r.to}index.html`) && !existsSync(`${DIST}${r.to}`))
      .map((r) => r.from);
    for (const from of missing) {
      const rule = rules.find((r) => r.from === from);
      expect(rule?.to.startsWith('/noutati/'), `${from} -> ${rule?.to}`).toBe(true);
      expect(
        heldBackTargets.has(rule?.to ?? ''),
        `${from} -> ${rule?.to} is missing from dist/, but it is not a held-back post's target`,
      ).toBe(true);
    }

    const controlFrom = '/galerie.html';
    const control = rules.find((r) => r.from === controlFrom);
    expect(control, `${controlFrom} control rule is gone`).toBeDefined();
    expect(
      control !== undefined && existsSync(`${DIST}${control.to}index.html`),
      `${controlFrom}'s target does not resolve, so the positive control proves nothing`,
    ).toBe(true);
    expect(missing).not.toContain(controlFrom);
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