/*
 * WHAT THIS PROVES: that the build's inline scripts are checked against an
 * allow-list, not merely hashed.
 *
 * WHY IT EXISTS. `csp-hash.mjs` used to hash every inline executable script it
 * found and write each hash into `script-src`. That is the directive whose job
 * is to refuse injected scripts: a `<script>` written into an article body
 * reached `dist/`, its SHA-256 was added to the policy, and the policy then
 * allow-listed it. The fix is to pin the set the site is supposed to have -
 * today exactly the homepage week picker - and stop the build on anything else,
 * so injected content is refused by construction rather than by trust.
 *
 * The subject is fabricated here on purpose. The real build is checked from the
 * other side by `headers.itest.ts`, which recomputes the hashes of the built
 * pages; this file checks the decision procedure, which is the half no build
 * output can exercise.
 */
import { describe, expect, it } from 'vitest';
import { EXPECTED_INLINE, unexpectedInlineScripts } from '../../scripts/csp-hash.mjs';

/** One entry in the shape `writeHeaders` collects, with `content` present. */
function script(page: string, content: string) {
  return { page, content, bytes: Buffer.byteLength(content), hash: `'sha256-${page}!'` };
}

describe('the inline-script allow-list', () => {
  it('accepts exactly the script the site is meant to have', () => {
    expect(EXPECTED_INLINE).toEqual([{ page: 'index.html', marker: 'data-picker-label' }]);
    expect(
      unexpectedInlineScripts([script('index.html', '/* data-picker-label */ const x = 1;')]),
    ).toEqual([]);
  });

  it('rejects a build that lost the expected script', () => {
    const problems = unexpectedInlineScripts([]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('data-picker-label');
  });

  it('rejects a second inline script on the homepage', () => {
    const problems = unexpectedInlineScripts([
      script('index.html', '/* data-picker-label */'),
      script('index.html', 'window.__pwned = 1'),
    ]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('index.html');
    expect(problems[0]).toContain('unexpected');
  });

  it('rejects an inline script on any other page', () => {
    const problems = unexpectedInlineScripts([
      script('index.html', '/* data-picker-label */'),
      script('noutati/update-august/index.html', 'window.__pwned = 1'),
    ]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('noutati/update-august/index.html');
  });

  it('names the page and the size of what it rejected', () => {
    const problems = unexpectedInlineScripts([script('a/index.html', '0123456789')]);
    expect(problems.join(' ')).toContain('10 bytes');
  });
});
