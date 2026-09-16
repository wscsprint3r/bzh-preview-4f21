import { describe, expect, it } from 'vitest';
import { alegeSaptamana } from './week-picker';

const chei = ['2026-W38', '2026-W39', '2026-W40'];

describe('alegeSaptamana', () => {
  it('alege săptămâna curentă când există', () => {
    expect(alegeSaptamana(chei, '2026-W39')).toBe(1);
  });

  it('alege prima săptămână viitoare când cea curentă lipsește', () => {
    expect(alegeSaptamana(['2026-W38', '2026-W41'], '2026-W39')).toBe(1);
  });

  it('alege prima săptămână când toate sunt în viitor', () => {
    expect(alegeSaptamana(chei, '2026-W30')).toBe(0);
  });

  it('întoarce -1 când toate săptămânile sunt în trecut', () => {
    expect(alegeSaptamana(chei, '2026-W45')).toBe(-1);
  });

  it('întoarce -1 pentru o listă goală', () => {
    expect(alegeSaptamana([], '2026-W39')).toBe(-1);
  });

  it('compară corect peste granița de an', () => {
    // String comparison works because the key is zero-padded ISO year + week.
    expect(alegeSaptamana(['2026-W52', '2027-W01'], '2027-W01')).toBe(1);
    expect(alegeSaptamana(['2026-W52', '2027-W01'], '2026-W53')).toBe(1);
  });

  it('compară corect săptămânile cu o cifră', () => {
    expect(alegeSaptamana(['2026-W06', '2026-W10'], '2026-W07')).toBe(1);
  });
});
