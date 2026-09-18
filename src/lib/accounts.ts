/** One account the parish publishes, as the settings singleton stores it. */
export interface Account {
  label: string;
  iban: string;
  holder: string;
  bank: string;
  qr_bill: boolean;
}

export function normalizeIban(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase();
}

/**
 * ISO 7064 MOD-97-10, the IBAN checksum. Country-agnostic on purpose: a future
 * German IBAN is not silently accepted by shape alone.
 */
export function isValidIban(value: string): boolean {
  const iban = normalizeIban(value);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const expanded = rearranged.replace(/[A-Z]/g, (char) => String(char.charCodeAt(0) - 55));
  let remainder = 0;
  for (const digit of expanded) {
    remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

/** Display form: groups of four, space-separated. */
export function formatIban(value: string): string {
  return normalizeIban(value).replace(/(.{4})(?=.)/g, '$1 ');
}

export function qrAccount(accounts: Account[]): Account | undefined {
  return accounts.find((account) => account.qr_bill);
}
