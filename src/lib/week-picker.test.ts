import { describe, expect, it } from 'vitest';
import { pickWeek } from './week-picker';

const keys = ['2026-W38', '2026-W39', '2026-W40'];

describe('pickWeek', () => {
  it('picks the current week when it exists', () => {
    expect(pickWeek(keys, '2026-W39')).toBe(1);
  });

  it('picks the first future week when the current one is missing', () => {
    expect(pickWeek(['2026-W38', '2026-W41'], '2026-W39')).toBe(1);
  });

  it('picks the first week when they are all in the future', () => {
    expect(pickWeek(keys, '2026-W30')).toBe(0);
  });

  it('returns -1 when every week is in the past', () => {
    expect(pickWeek(keys, '2026-W45')).toBe(-1);
  });

  it('returns -1 for an empty list', () => {
    expect(pickWeek([], '2026-W39')).toBe(-1);
  });

  it('compares correctly across the year boundary', () => {
    // String comparison works because the key is zero-padded ISO year + week.
    expect(pickWeek(['2026-W52', '2027-W01'], '2027-W01')).toBe(1);
    expect(pickWeek(['2026-W52', '2027-W01'], '2026-W53')).toBe(1);
  });

  it('compares single-digit weeks correctly', () => {
    expect(pickWeek(['2026-W06', '2026-W10'], '2026-W07')).toBe(1);
  });
});
