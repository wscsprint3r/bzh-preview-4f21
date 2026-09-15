import { describe, expect, it } from 'vitest';
import { numeleParohiei } from './smoke';

describe('toolchain', () => {
  it('runs TypeScript from src/lib', () => {
    expect(numeleParohiei()).toBe('Parohia Ortodoxă Română Sfântul Nicolae');
  });
});
