/*
 * WHAT THIS PROVES: that the IBAN copy script stays inside the constraints the
 * build turns on - small enough to stay inline, honest about which button was
 * clicked, and progressive about the no-JS state.
 *
 * WHY IT EXISTS. The script is not a component and has no module boundary: it
 * is a string injected into `/contact/` and `/doneaza/` with `set:html`, so no
 * type checker, bundler or browser pass in this repository would notice if it
 * grew past Vite's inline threshold, lost its `data-copy` marker (which is what
 * `EXPECTED_INLINE` matches it by, so the build would fail), or began hiding
 * buttons instead of revealing them. Each test below names the production
 * change that would make it fail.
 *
 * It deliberately does NOT execute the script: that needs a DOM, and the two
 * things a browser decides here - that the button is reachable and that
 * clipboard access is allowed - are decided by a browser and audited by
 * `npm run a11y`, not by this file.
 */
import { describe, expect, it } from 'vitest';
import { COPY_SCRIPT } from './copy-script.mjs';

describe('the copy script', () => {
  it('stays under a byte ceiling that keeps it inline', () => {
    expect(Buffer.byteLength(COPY_SCRIPT, 'utf8')).toBeLessThan(1024);
  });

  it('reads the IBAN from the button it belongs to, not from a page-wide lookup', () => {
    expect(COPY_SCRIPT).toContain('data-copy');
    expect(COPY_SCRIPT).toContain('closest');
  });

  it('reveals buttons rather than hiding them, so the no-JS state is text only', () => {
    expect(COPY_SCRIPT).toContain('hidden = false');
  });

  /*
   * A REVEALED BUTTON THAT CANNOT COPY IS WORSE THAN NO BUTTON. The unhide and
   * the click both check for the API, and the write's rejection is caught: an
   * absent `navigator.clipboard` (insecure context, old browser) must leave the
   * button hidden rather than throw a `TypeError` under a visitor's finger.
   */
  it('unhides and copies only where the clipboard API exists, and catches its refusal', () => {
    expect(COPY_SCRIPT).toContain('navigator.clipboard');
    expect(COPY_SCRIPT).toContain('.catch(');
  });

  /*
   * A SECOND CLICK INSIDE THE WINDOW USED TO STICK THE LABEL. The original text
   * is captured once on the button and the timer is restarted, not stacked, so
   * "Copiat" cannot become the label that is restored.
   */
  it('remembers the original label and restarts its timer', () => {
    expect(COPY_SCRIPT).toContain('dataset.label');
    expect(COPY_SCRIPT).toContain('clearTimeout');
  });

  /*
   * The inline script is classic JavaScript: `is:inline` means Astro passes it
   * through untouched, so an `import` would reach the browser as a syntax error
   * and the button would simply never work - the same silent-fallback shape the
   * CSP hash exists for.
   */
  it('carries no import, because it ships as a classic inline script', () => {
    expect(COPY_SCRIPT).not.toContain('import');
  });
});
