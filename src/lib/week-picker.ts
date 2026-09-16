/**
 * Index of the week to reveal: the one containing today, else the earliest
 * future one, else -1 when every rendered week has passed.
 *
 * Keys are `YYYY-Www` with a zero-padded week number, so lexical comparison is
 * chronological — that is why cheieSaptamana pads.
 */
export function alegeSaptamana(chei: string[], cheieAzi: string): number {
  for (let i = 0; i < chei.length; i += 1) {
    if (chei[i] >= cheieAzi) return i;
  }
  return -1;
}
