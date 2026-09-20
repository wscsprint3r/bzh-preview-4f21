import { describe, expect, it } from 'vitest';
import { budgetAnnotation, escapeAnnotation } from '../../scripts/annotations.mjs';

describe('the GitHub annotation', () => {
  it('escapes the three characters GitHub requires', () => {
    expect(escapeAnnotation('a%\nb\rc')).toBe('a%25%0Ab%0Dc');
  });

  it('names every failing page and carries the Romanian explanation', () => {
    const text = budgetAnnotation(['program/index.html', 'noutati/index.html'], 'EXPLICAȚIE');
    expect(text.startsWith('::error::')).toBe(true);
    expect(text).toContain('program/index.html');
    expect(text).toContain('noutati/index.html');
    expect(text).toContain('EXPLICAȚIE');
    expect(text).not.toContain('\n');
  });
});