import { describe, expect, it } from 'vitest';
import { apexRedirectTarget } from './apex';

/*
 * The apex→www decision, pure and tested here because the Function that runs it
 * (`functions/_middleware.ts`) is a thin edge no run in this repository can
 * reach. Every case below is one the middleware must answer the same way.
 */
describe('apexRedirectTarget', () => {
  it('sends the apex host, with its path and query, to www over https', () => {
    expect(apexRedirectTarget(new URL('https://bor-zh.ch/'))).toBe('https://www.bor-zh.ch/');
    expect(apexRedirectTarget(new URL('http://bor-zh.ch/program/?p=42'))).toBe(
      'https://www.bor-zh.ch/program/?p=42',
    );
  });

  it('passes the canonical www host through', () => {
    expect(apexRedirectTarget(new URL('https://www.bor-zh.ch/program/'))).toBeNull();
  });

  it('passes a pages.dev host through, so previews and deploys are untouched', () => {
    expect(apexRedirectTarget(new URL('https://bzh.pages.dev/'))).toBeNull();
  });

  it('passes a host that merely ends in the apex name', () => {
    expect(apexRedirectTarget(new URL('https://bor-zh.ch.evil.example/'))).toBeNull();
  });

  it('takes both hostnames as parameters, so the decision is not pinned to the parish', () => {
    expect(apexRedirectTarget(new URL('https://exemplu.ch/x'), 'exemplu.ch', 'www.exemplu.ch')).toBe(
      'https://www.exemplu.ch/x',
    );
  });
});