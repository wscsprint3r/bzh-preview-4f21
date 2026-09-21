import { describe, expect, it } from 'vitest';
import { budgetAnnotation, escapeAnnotation, uploadAnnotation } from '../../scripts/annotations.mjs';

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

  it('names the refused upload and says what to do, in Romanian', () => {
    const text = uploadAnnotation('public/uploads/2026/09/studiu.pdf');
    expect(text.startsWith('::error::')).toBe(true);
    expect(text).toContain('public/uploads/2026/09/studiu.pdf');
    expect(text).toContain('imagini');
    expect(text).toContain('/uploads/');
    expect(text).not.toContain('\n');
  });

  it('escapes a path GitHub would otherwise mangle', () => {
    const text = uploadAnnotation('public/uploads/2026/09/a%b.jpg');
    expect(text).toContain('a%25b.jpg');
    expect(text).not.toContain('a%b.jpg');
  });
});