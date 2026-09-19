import { describe, expect, it } from 'vitest';
import { formatIban, isValidIban, normalizeIban, qrAccount } from './accounts';

const ACCOUNTS = [
  { label: 'Susținerea parohiei', iban: 'CH54 0021 5215 3048 5501 P', holder: 'X', bank: 'UBS', qr_bill: false },
  { label: 'Spațiul bisericii', iban: 'CH11 0021 5215 3048 5502 K', holder: 'X', bank: 'UBS', qr_bill: true },
];

describe('IBAN handling', () => {
  it('strips spaces and hyphens and uppercases', () => {
    expect(normalizeIban('ch54 0021-5215 3048 5501 p')).toBe('CH540021521530485501P');
  });

  it('accepts the parish accounts as printed on the old site', () => {
    expect(isValidIban('CH54 0021 5215 3048 5501 P')).toBe(true);
    expect(isValidIban('CH11 0021 5215 3048 5502 K')).toBe(true);
    expect(isValidIban('CH85 0483 5035 8248 3100 0')).toBe(true);
  });

  it('POSITIVE CONTROL: rejects a transposed digit and a truncated IBAN', () => {
    expect(isValidIban('CH54 0021 5215 3048 5502 P')).toBe(false);
    expect(isValidIban('CH54 0021 5215 3048 5501')).toBe(false);
  });

  it('groups display in fours, keeping the last group short', () => {
    expect(formatIban('ch540021521530485501p')).toBe('CH54 0021 5215 3048 5501 P');
  });
});

describe('the QR account', () => {
  it('is the single flagged entry', () => {
    expect(qrAccount(ACCOUNTS)?.iban).toBe('CH11 0021 5215 3048 5502 K');
  });

  it('is undefined when none is flagged', () => {
    expect(qrAccount(ACCOUNTS.map((a) => ({ ...a, qr_bill: false })))).toBeUndefined();
  });
});
