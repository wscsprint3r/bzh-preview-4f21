import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * WHAT THIS PROVES: no scoped `<style>` in this project targets an `img` or
 * `svg` with a bare element selector. Astro appends the component's
 * `data-astro-cid-…` to every compound of a scoped selector, descendant
 * element selectors included, so `.gg-item img` ships as
 * `.gg-item[data-astro-cid-X] img[data-astro-cid-X]`. The `<img>` on those
 * pages is rendered by `ContentImage.astro`, which carries no parent scope
 * attribute, so the compiled rule can never match and the border it declares
 * never renders. NOTHING ELSE NOTICES: the build is green, `npm test` is
 * green, axe is green, and a missing 1px rule has no visible symptom at any
 * width. The repository's pattern for reaching a child component's element is
 * `:global(img)`, as every `.prose :global(img)` block does; the whole-branch
 * review of Phase 3 found two rules that had lost it.
 *
 * WHY A SOURCE SWEEP AND NOT A BROWSER PASS. The defect is the source shape of
 * the selector; the compiled double-scoping follows from it mechanically, so
 * the source is where a guard can name the file and the rule. `scripts/a11y.mjs`
 * remains the authority on what a person sees - contrast, focus, the cascade -
 * and whether a 1px border is present is not one of those questions.
 *
 * THE POSITIVE CONTROLS ARE MUTATIONS OF THE REAL FILES, not synthetic CSS
 * alone: the detector is run over `GalleryGrid.astro` and
 * `galerie/index.astro` with `:global(img)` replaced by `img`, and must report
 * the exact selector the branch shipped by accident. A detector that cannot
 * fire on the real subject proves nothing about the real subject, and the
 * "the sweep read something" case keeps the pass from being about an empty
 * corpus - the same two rules this project applies to every file guard.
 *
 * SCOPE, SAID RATHER THAN IMPLIED. The subject is every `.astro` file under
 * `src/` that has a `<style>` block, and the rule holds for all of them
 * because no component renders its own `<img>` or `<svg>`: every image goes
 * through `ContentImage.astro` (which has no `<style>` block) and the only
 * inline `<svg>` is the QR-bill the page imports. A future component that
 * renders its own image and styles it scoped would make this guard fail
 * loudly, and the honest fix then is to exempt it here with its reason - not
 * to delete the guard.
 */

const SRC = fileURLToPath(new URL('../', import.meta.url));

/** Every `.astro` file under `src/`, as paths relative to `src/`. */
function astroFiles(): string[] {
  return readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.astro'))
    .sort();
}

/** The contents of every `<style>` block in one `.astro` source. */
function styleBlocks(source: string): string[] {
  return [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((match) => match[1]);
}

/**
 * The selectors in one stylesheet that target a bare `img` or `svg` element.
 *
 * `:global(...)` spans are removed first, because an element inside one is
 * deliberately unscoped and is the correct shape. What remains is what Astro
 * will scope, and a scoped `img` or `svg` compound can only ever match markup
 * the same component renders itself - never a child component's.
 */
function bareImageSelectors(css: string): string[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const withoutGlobal = withoutComments.replace(/:global\([^()]*\)/g, '');
  const selectors = [...withoutGlobal.matchAll(/([^{}]+)\{/g)].map((match) => match[1].trim());
  return selectors.filter((selector) => /(^|[\s,>+~])(?:img|svg)(?![-\w])/.test(selector));
}

/** Every `.astro` file with a `<style>` block, and those blocks. */
const SWEPT = astroFiles()
  .map((file) => ({ file, blocks: styleBlocks(readFileSync(SRC + file, 'utf8')) }))
  .filter((entry) => entry.blocks.length > 0);

/** The bare `img`/`svg` selectors the sweep finds, each with its file. */
function bareSelectorsIn(): Array<{ file: string; selector: string }> {
  return SWEPT.flatMap(({ file, blocks }) =>
    blocks.flatMap((css) => bareImageSelectors(css).map((selector) => ({ file, selector }))),
  );
}

describe('the detector fires on the real files mutated to lose :global', () => {
  it.each([
    ['components/GalleryGrid.astro', '.gg-item img'],
    ['pages/galerie/index.astro', '.album-link img'],
  ])('%s without :global reports %s', (file, selector) => {
    const source = readFileSync(SRC + file, 'utf8');
    const css = styleBlocks(source).join('\n');
    // Every occurrence, comments included: the comment above the rule names
    // `:global(img)` too, and replacing only the first would leave the real
    // selector correct and the control proving nothing.
    const mutated = css.replaceAll(':global(img)', 'img');
    expect(
      mutated,
      'the mutation did not change the style block, so this control proves nothing',
    ).not.toBe(css);
    expect(bareImageSelectors(mutated)).toContain(selector);
  });

  it('does not fire on the untouched real files', () => {
    // The guard itself, at the file it was written for, so a failure names the
    // selector rather than only the sweep's aggregate.
    for (const file of ['components/GalleryGrid.astro', 'pages/galerie/index.astro']) {
      const source = readFileSync(SRC + file, 'utf8');
      expect(bareImageSelectors(styleBlocks(source).join('\n')), file).toEqual([]);
    }
  });

  it('does not fire on :global, on a class name that contains img, or on an attribute', () => {
    // Negative controls: the detector is about a bare element selector, not
    // about the letters. `:global(img)` is the correct shape; `.foo-img` is a
    // class; `[data-img]` is an attribute.
    expect(bareImageSelectors('.prose :global(img) { margin: 1.5rem 0; }')).toEqual([]);
    expect(bareImageSelectors('.qr-bill-svg :global(svg) { max-width: 100%; }')).toEqual([]);
    expect(bareImageSelectors('.foo-img { border: 0; }')).toEqual([]);
    expect(bareImageSelectors('[data-img] { border: 0; }')).toEqual([]);
    // And the positive control for the element half, so the negative cases are
    // not proving the detector is simply broken.
    expect(bareImageSelectors('.qr-bill-svg svg { max-width: 100%; }')).toEqual([
      '.qr-bill-svg svg',
    ]);
  });
});

describe('no scoped style targets a bare img or svg', () => {
  it('the sweep really does have style blocks to read', () => {
    // A guard that reads files must prove it read something: without this, a
    // wrong `SRC` would make the case below pass over an empty corpus.
    expect(astroFiles().length).toBeGreaterThan(20);
    expect(SWEPT.length).toBeGreaterThan(5);
    for (const named of ['components/GalleryGrid.astro', 'pages/galerie/index.astro']) {
      expect(SWEPT.map((entry) => entry.file), named).toContain(named);
    }
    // And the shape being searched for really is present, or the stripping of
    // `:global(...)` would never be exercised by the pass below.
    expect(SWEPT.some((entry) => entry.blocks.some((css) => css.includes(':global(')))).toBe(true);
  });

  it('none of them', () => {
    const found = bareSelectorsIn().map(({ file, selector }) => `${file}: ${selector}`);
    // Printed, not only checked: the counts are what a later reader trusts if a
    // comment disagrees. `process.stdout.write` because vitest's default
    // reporter hides `console.log` on the green run.
    process.stdout.write(
      `\nScoped-style sweep: ${SWEPT.length} .astro file(s) with a <style> block, ` +
        `${SWEPT.reduce((n, entry) => n + entry.blocks.length, 0)} block(s) — ` +
        `${found.length} bare img/svg selector(s).\n`,
    );
    expect(
      found,
      `scoped selectors that can never match a child component's element:\n${found.join('\n')}\n` +
        'Wrap the element in `:global(...)`, as `.prose :global(img)` does: Astro appends the ' +
        "component's data-astro-cid to every compound of a scoped selector, and the element " +
        'another component renders carries no parent scope attribute.',
    ).toEqual([]);
  });
});
