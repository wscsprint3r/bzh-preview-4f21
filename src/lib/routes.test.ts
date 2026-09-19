import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { RESERVED_PATHS } from './routes';

/*
 * WHY THIS EXISTS. `[...page].astro` builds one route per `pages` collection
 * entry, and `/contact` and `/doneaza` are built by dedicated files instead -
 * they carry generated blocks that a generic prose route has no business
 * knowing about. Two builders for one URL would collide, and one builder
 * quietly not running leaves a page in the CMS with no page on the site.
 *
 * `RESERVED_PATHS` is the one list both sides import: `[...page].astro`'s
 * `getStaticPaths` skips exactly these, and each dedicated route owns exactly
 * its own. The assertions below pin the two directions - the set against the
 * route files, and the content files against the set - because either half
 * alone is the shape that ships a page nobody can reach.
 */

const PAGES_DIR = fileURLToPath(new URL('../pages/', import.meta.url));
const PAGES_CONTENT = fileURLToPath(new URL('../content/pages/', import.meta.url));

/**
 * The pathnames of the dedicated route files: top-level `.astro` files that
 * are neither the index nor a dynamic route. A directory like `noutati/` is
 * another route's business and is not a top-level file, so it cannot appear
 * here; `rss.xml.ts` and `program.ics.ts` are endpoints, not pages.
 */
function dedicatedRoutePaths(): string[] {
  return readdirSync(PAGES_DIR)
    .filter((file) => file.endsWith('.astro') && file !== 'index.astro' && !file.startsWith('['))
    .map((file) => file.slice(0, -'.astro'.length))
    .sort();
}

/** Every `path:` a prose content file declares, read from its frontmatter. */
function declaredPagePaths(): string[] {
  return readdirSync(PAGES_CONTENT)
    .filter((file) => file.endsWith('.md'))
    .map((file) => {
      const text = readFileSync(PAGES_CONTENT + file, 'utf8');
      const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
      expect(block, `${file} has no frontmatter block`).not.toBeNull();
      const frontmatter = parseYaml((block as RegExpExecArray)[1] as string) as {
        path?: unknown;
      };
      expect(typeof frontmatter.path, `${file} declares no path`).toBe('string');
      return String(frontmatter.path);
    });
}

/**
 * The declared paths that are reserved but have no dedicated route file.
 *
 * Pure, so the positive control below can show the detector fires without
 * touching the real directory - a guard whose only input is the real corpus
 * cannot be shown to recognise the shape it exists for.
 */
function reservedPathsWithoutRoutes(
  reserved: ReadonlySet<string>,
  routePaths: readonly string[],
  declaredPaths: readonly string[],
): string[] {
  return declaredPaths.filter((path) => reserved.has(path) && !routePaths.includes(path));
}

describe('the reserved paths', () => {
  it('are exactly the dedicated route files in src/pages/', () => {
    expect([...RESERVED_PATHS].sort()).toEqual(dedicatedRoutePaths());
  });

  it('the route-file filter reads the directory and leaves the other routes out', () => {
    // Positive control for the filter above: without it, a filter that returned
    // every `.astro` file would make the equality fail for the wrong reason,
    // and one that returned nothing would fail only because the set is
    // non-empty - which this pins by naming the files it must find.
    const routes = dedicatedRoutePaths();
    expect(routes).toContain('contact');
    expect(routes).toContain('doneaza');
    expect(routes).not.toContain('index');
    expect(routes).not.toContain('[...page]');
  });

  it('every content file declaring a reserved path has a dedicated route', () => {
    const declared = declaredPagePaths();
    expect(declared.length, 'no page content file - the guard would prove nothing')
      .toBeGreaterThan(0);
    // Every reserved path is declared by a content file, so each route's
    // `getEntry('pages', …)` finds its entry rather than building from nothing.
    expect(declared.filter((path) => RESERVED_PATHS.has(path)).sort())
      .toEqual([...RESERVED_PATHS].sort());
    expect(reservedPathsWithoutRoutes(RESERVED_PATHS, dedicatedRoutePaths(), declared))
      .toEqual([]);
  });

  it('POSITIVE CONTROL: names a declared reserved path whose route file is missing', () => {
    expect(reservedPathsWithoutRoutes(new Set(['contact']), [], ['contact', 'istoric']))
      .toEqual(['contact']);
  });
});
