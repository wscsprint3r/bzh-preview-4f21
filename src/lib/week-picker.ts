/**
 * Index of the week to reveal: the one containing today, else the earliest
 * future one, else -1 when every rendered week has passed.
 *
 * Keys are `YYYY-Www` with a zero-padded week number, so lexical comparison is
 * chronological — that is why weekKey pads.
 */
export function pickWeek(keys: string[], todayKey: string): number {
  for (let i = 0; i < keys.length; i += 1) {
    if (keys[i] >= todayKey) return i;
  }
  return -1;
}
