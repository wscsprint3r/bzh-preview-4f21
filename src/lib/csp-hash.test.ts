/*
 * WHAT THIS PROVES: that the build's inline scripts are checked against an
 * allow-list, not merely hashed.
 *
 * WHY IT EXISTS. `csp-hash.mjs` used to hash every inline executable script it
 * found and write each hash into `script-src`. That is the directive whose job
 * is to refuse injected scripts: a `<script>` written into an article body
 * reached `dist/`, its SHA-256 was added to the policy, and the policy then
 * allow-listed it. The fix is to pin the set the site is supposed to have -
 * today the homepage week picker and the copy script on each account page - and
 * stop the build on anything else, so injected content is refused by
 * construction rather than by trust.
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

/*
 * The three scripts the site is meant to have. The two copy scripts are
 * byte-identical - one source string, emitted on two routes - so the expected
 * list names a PAGE per entry rather than a count: `unexpectedInlineScripts`
 * matches page and marker together, and a build that lost only `/doneaza/`'s
 * copy must fail without the identical `/contact/` one standing in for it.
 */
const INDEX = script('index.html', '/* data-picker-label */ const x = 1;');
const CONTACT = script('contact/index.html', '/* data-copy */ const y = 2;');
const DONEAZA = script('doneaza/index.html', '/* data-copy */ const y = 2;');

describe('the inline-script allow-list', () => {
  it('accepts exactly the scripts the site is meant to have', () => {
    expect(EXPECTED_INLINE).toEqual([
      { page: 'index.html', marker: 'data-picker-label' },
      { page: 'contact/index.html', marker: 'data-copy' },
      { page: 'doneaza/index.html', marker: 'data-copy' },
    ]);
    expect(unexpectedInlineScripts([INDEX, CONTACT, DONEAZA])).toEqual([]);
  });

  it('rejects a build that lost every expected script', () => {
    const problems = unexpectedInlineScripts([]);
    expect(problems).toHaveLength(3);
    expect(problems.join(' ')).toContain('data-picker-label');
    expect(problems.join(' ')).toContain('contact/index.html');
    expect(problems.join(' ')).toContain('doneaza/index.html');
  });

  /*
   * The positive control for the page half of the match: both copies carry
   * `data-copy`, so a lookup that ignored the page would find the contact
   * script and pass a build whose `/doneaza/` copy is gone. `[INDEX, CONTACT]`
   * removes the entry the matcher must not accept as a stand-in.
   */
  it('rejects a build that lost only the doneaza copy script', () => {
    const problems = unexpectedInlineScripts([INDEX, CONTACT]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('doneaza/index.html');
    expect(problems[0]).toContain('data-copy');
  });

  it('rejects a second inline script on the homepage', () => {
    const problems = unexpectedInlineScripts([
      INDEX,
      CONTACT,
      DONEAZA,
      script('index.html', 'window.__pwned = 1'),
    ]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('index.html');
    expect(problems[0]).toContain('unexpected');
  });

  it('rejects a second inline script on an account page', () => {
    const problems = unexpectedInlineScripts([
      INDEX,
      CONTACT,
      DONEAZA,
      script('contact/index.html', 'window.__pwned = 1'),
    ]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('contact/index.html');
    expect(problems[0]).toContain('unexpected');
  });

  it('rejects an inline script on any other page', () => {
    const problems = unexpectedInlineScripts([
      INDEX,
      CONTACT,
      DONEAZA,
      script('noutati/update-august/index.html', 'window.__pwned = 1'),
    ]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('noutati/update-august/index.html');
  });

  it('names the page and the size of what it rejected', () => {
    const problems = unexpectedInlineScripts([
      INDEX,
      CONTACT,
      DONEAZA,
      script('a/index.html', '0123456789'),
    ]);
    expect(problems.join(' ')).toContain('10 bytes');
  });
});
