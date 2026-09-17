import { describe, expect, it } from 'vitest';
import { parishName } from './smoke';

describe('toolchain', () => {
  it('runs TypeScript from src/lib', () => {
    expect(parishName()).toBe('Parohia Ortodoxă Română Sfântul Nicolae');
  });
});
