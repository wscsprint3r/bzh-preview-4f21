import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { shortLinkTarget } from './short-links';

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

  it('has a committed map that is non-empty and points only at local paths', () => {
    expect(existsSync(MAP), 'functions/wp-ids.json is missing — run the migration (Task 3, Step 8)').toBe(true);
    const ids = JSON.parse(readFileSync(MAP, 'utf8')) as Record<string, string>;
    const entries = Object.entries(ids);
    expect(entries.length, 'the map is too short — the migration step did not run').toBeGreaterThan(50);
    for (const [id, target] of entries) {
      expect(/^\d+$/.test(id), `key ${id} is not numeric`).toBe(true);
      expect(target.startsWith('/'), `${id} -> ${target} is not a local path`).toBe(true);
    }
  });
});
