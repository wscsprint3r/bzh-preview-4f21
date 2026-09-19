/**
 * The Swiss QR-bill for the account whose `qr_bill` flag is set, generated at
 * build time and embedded in `/doneaza` as raw markup.
 *
 * THE LIBRARY'S REAL SHAPE, RESOLVED BEFORE THIS FILE WAS WRITTEN. `swissqrbill`
 * has no main export - `import('swissqrbill')` throws
 * ERR_PACKAGE_PATH_NOT_EXPORTED - so the SVG entry point is the subpath
 * `swissqrbill/svg`, whose `SwissQRBill` class takes
 * `{ creditor: { name, address, buildingNumber?, city, zip, country, account },
 * currency, amount?, ... }` and returns the SVG document from `toString()`.
 * `qr-bill.test.ts` records the full probe; the names below are the settings'
 * names mapped onto the library's, which are not the same: the street is
 * `address`, the house number is `buildingNumber`, and the IBAN is `account`.
 *
 * WHY `buildQrBill` CHECKS THE CHECKSUM ITSELF. The library validates the IBAN
 * in its constructor, but it validates everything, and its message is the same
 * generic `ValidationError` for every defect. This wrapper refuses the one
 * defect that matters before the library is reached, naming the value, so a
 * build failure points at the settings file rather than at the library.
 *
 * WHY THE DATA IS RETURNED RATHER THAN THE SVG. Two functions, because the
 * mapping is what a test can assert and the rendering is the library's. The
 * route calls both; `renderQrBillSvg` is a one-line seam so that a future
 * library swap is one function, not a page.
 *
 * THE AMOUNT IS ABSENT ON PURPOSE. An open QR-bill - the donor fills in the sum
 * in their banking app - is what the parish asked for; putting a number here
 * would print it on every copy and remove the choice.
 *
 * NOTHING HERE IS CLIENT CODE. The SVG is a string, embedded once by the route
 * at build time; no script runs to produce it, and the page's CSP does not need
 * to know it exists.
 */
import { SwissQRBill } from 'swissqrbill/svg';
import type { Data } from 'swissqrbill/types';
import { isValidIban, normalizeIban, type Account } from './accounts';

/** The holder's address as `settings.creditor_address` stores it. */
export interface CreditorAddress {
  street: string;
  house_number?: string;
  postal_code: string;
  town: string;
  country: string;
}

/** Exactly what the library's constructor requires, under this project's name. */
export type QrBillData = Data;

/**
 * The QR-bill data for one account and the holder's address.
 *
 * Throws on an IBAN the MOD-97 checksum rejects. The message is English and
 * names the IBAN: it is a build-time diagnostic read by whoever runs the build,
 * not copy a parishioner sees.
 */
export function buildQrBill(account: Account, creditor: CreditorAddress): QrBillData {
  if (!isValidIban(account.iban)) {
    throw new Error(
      `qr-bill: "${account.iban}" is not a valid IBAN (MOD-97), so no QR-bill can be ` +
        'built from it. Check the value in src/content/settings/settings.yml.',
    );
  }
  return {
    creditor: {
      name: account.holder,
      address: creditor.street,
      buildingNumber: creditor.house_number,
      city: creditor.town,
      zip: creditor.postal_code,
      country: creditor.country,
      account: normalizeIban(account.iban),
    },
    currency: 'CHF',
  };
}

/** CSS pixels per millimetre: 96px to the inch, 25.4mm to the inch. */
const PX_PER_MM = 96 / 25.4;

/** The library's own length, in CSS pixels, or null when it is not a mm string. */
function mmLengthInPx(value: string | number | null): number | null {
  if (typeof value !== 'string') return null;
  const match = /^([\d.]+)mm$/.exec(value.trim());
  return match === null ? null : Number(match[1]) * PX_PER_MM;
}

/**
 * The QR-bill as an SVG document string, from the library, with the one
 * addition that makes it scale.
 *
 * THE VIEWBOX IS LOAD-BEARING, and its absence was measured on the Task 11
 * build. The library emits `width="210mm" height="105mm"` and no viewBox, so
 * CSS `max-width: 100%` shrinks the element's box while the drawing keeps its
 * natural size and is clipped: on the 390px phone pass the QR code was partly
 * cut off, and axe's grid read the overflowing content as overlapping the
 * account block below, which failed the audit. The viewBox is set from the
 * library's own mm pair, so the document scales as one; every coordinate and
 * the QR payload remain exactly the library's.
 *
 * THROWS RATHER THAN SKIPPING IT. If a library upgrade reports its size in
 * another form, a missing viewBox is a silently clipped payment instrument. A
 * failed build is the message that gets someone to look.
 */
export function renderQrBillSvg(data: QrBillData): string {
  const bill = new SwissQRBill(data);
  const width = mmLengthInPx(bill.instance.width());
  const height = mmLengthInPx(bill.instance.height());
  if (width === null || height === null) {
    throw new Error(
      `qr-bill: the library reported a size of ${JSON.stringify(bill.instance.width())} x ` +
        `${JSON.stringify(bill.instance.height())}, not the mm pair this wrapper scales with.`,
    );
  }
  bill.instance.viewBox(0, 0, width, height);
  return bill.toString();
}
