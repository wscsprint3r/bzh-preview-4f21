/*
 * WHAT THIS PROVES: that the contact form's inline script keeps the properties
 * the build turns on - small enough to stay inline, classic JavaScript, and
 * able to recover from a failed attempt.
 *
 * WHY IT EXISTS. The script is not a component and has no module boundary: it
 * is a string injected into `/contact/` with `set:html`, so no type checker,
 * bundler or browser pass in this repository would notice if it grew past
 * Vite's inline threshold, lost its `data-contact-form` marker (which is what
 * `EXPECTED_INLINE` matches it by, so the build would fail), gained an
 * `import` (a syntax error in a classic script), or stopped resetting the
 * Turnstile widget - the last of which locks the form for every visitor whose
 * first submission failed, with no symptom any audit here can see.
 *
 * It deliberately does NOT execute the script: that needs a DOM, and the two
 * things a browser decides here - that the form is reachable and that the
 * status line is announced - are decided by a browser and audited by
 * `npm run a11y`, not by this file.
 */
import { describe, expect, it } from 'vitest';
import { CONTACT_SCRIPT } from './contact-script.mjs';

describe('the contact script', () => {
  it('stays under a byte ceiling that keeps it inline', () => {
    expect(Buffer.byteLength(CONTACT_SCRIPT, 'utf8')).toBeLessThan(2048);
  });

  it('attaches to the form by the marker the CSP set names it by', () => {
    expect(CONTACT_SCRIPT).toContain('data-contact-form');
  });

  it('carries no import, because it ships as a classic inline script', () => {
    expect(CONTACT_SCRIPT).not.toContain('import');
  });

  /*
   * THE TOKEN IS SPENT ON EVERY ATTEMPT, so both failure paths must reset the
   * widget or the second try replays a consumed token and fails forever. The
   * count assertion is what makes "added to one path only" fail here.
   */
  it('resets the Turnstile widget on every failure path', () => {
    expect(CONTACT_SCRIPT).toContain('turnstile');
    expect(CONTACT_SCRIPT.match(/reset\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});
