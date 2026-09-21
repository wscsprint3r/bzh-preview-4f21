import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isLocalTarget, shortLinkTarget } from './short-links';

const MAP = fileURLToPath(new URL('../../functions/wp-ids.json', import.meta.url));

describe('the ?p= resolver', () => {
  it('resolves a numeric id present in the map', () => {
    expect(shortLinkTarget('123', { '123': '/noutati/slujbe/' })).toBe('/noutati/slujbe/');
  });

  it('passes through a missing, empty or non-numeric p', () => {
    for (const p of [null, '', 'abc', '12x', '-3', '1.5']) {
      expect(shortLinkTarget(p, { '123': '/x/' })).toBeNull();
    }
  });

  it('does not resolve inherited object properties', () => {
    for (const p of ['__proto__', 'constructor', 'toString']) {
      expect(shortLinkTarget(p, { '123': '/x/' })).toBeNull();
    }
  });

  it('passes through an unknown id', () => {
    expect(shortLinkTarget('999', { '123': '/x/' })).toBeNull();
  });

  /*
   * `startsWith('/')` is not the sentence "a local path". `//evil.example/x`
   * starts with a slash and is a PROTOCOL-RELATIVE URL: `Response.redirect`
   * resolves it against the request's scheme, so a map value of that shape
   * would redirect off-site. Nothing can write such a value today — the map is
   * emitted from the dump — but the runtime must not depend on that.
   */
  it('refuses a map value that is not a site-local path', () => {
    expect(shortLinkTarget('123', { '123': '//evil.example/x' })).toBeNull();
    expect(shortLinkTarget('123', { '123': 'https://evil.example/x' })).toBeNull();
    expect(shortLinkTarget('123', { '123': 'noutati/slujbe/' })).toBeNull();
  });

  it('accepts a single-slash path, and nothing that could leave the site', () => {
    for (const local of ['/', '/noutati/', '/x/?y=1']) {
      expect(isLocalTarget(local), `${local} is local`).toBe(true);
    }
    for (const away of ['//evil.example/x', '///evil.example/x', 'https://x/', 'x/', '']) {
      expect(isLocalTarget(away), `${away} is not local`).toBe(false);
    }
  });

  it('has a committed map that is non-empty and points only at local paths', () => {
    expect(existsSync(MAP), 'functions/wp-ids.json is missing — run the migration (Task 3, Step 8)').toBe(true);
    const ids = JSON.parse(readFileSync(MAP, 'utf8')) as Record<string, string>;
    const entries = Object.entries(ids);
    expect(entries.length, 'the map is too short — the migration step did not run').toBeGreaterThan(50);
    for (const [id, target] of entries) {
      expect(/^\d+$/.test(id), `key ${id} is not numeric`).toBe(true);
      expect(isLocalTarget(target), `${id} -> ${target} is not a local path`).toBe(true);
    }
  });
});
