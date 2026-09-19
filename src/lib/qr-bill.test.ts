/*
 * WHAT THIS PROVES: that the parish's QR account and the settings' creditor
 * address become the data object `swissqrbill` requires, that an IBAN the
 * checksum rejects never reaches the library, and that the SVG the library
 * renders is a script-free, byte-for-byte deterministic document.
 *
 * STEP 1, RESOLVED BEFORE THIS WRAPPER WAS WRITTEN - the brief's command prints
 * an error, so what it would have printed is recorded here instead:
 *
 *   - `import('swissqrbill')` throws ERR_PACKAGE_PATH_NOT_EXPORTED. The package
 *     has NO main export: its `exports` map publishes five subpaths and no `.`.
 *     The SVG entry point is `swissqrbill/svg`, which exports `SwissQRBill` and
 *     `SwissQRCode`. `node_modules/swissqrbill/dist` does not exist either; the
 *     built files are under `node_modules/swissqrbill/lib`.
 *   - Constructor: `new SwissQRBill(data, options?)`. The `data` shape is
 *     `{ creditor: { name, address, buildingNumber?, city, zip, country,
 *        account }, currency: 'CHF' | 'EUR', amount?, debtor?, message?,
 *        additionalInformation?, reference?, av1?, av2? }`.
 *     The brief's sketch (`creditor.street`, `iban`) is v3's shape: v4 spells
 *     the street `address` (with `buildingNumber` beside it) and the IBAN
 *     `account`. The wrapper maps the settings' names onto these.
 *   - SVG output: `bill.toString()`, documented as "the outerHTML of the SVG"
 *     and measured as an `<svg xmlns=... width="210mm" height="105mm">`
 *     document. No DOM, no browser and no extra dependency beyond the package's
 *     own `svg-engine` is needed; the `pdf` subpath would need `pdfkit`, and
 *     nothing here imports it.
 *   - The library validates the IBAN itself in the constructor, with its own
 *     MOD-97 check. `buildQrBill` refuses an invalid one earlier still, so a bad
 *     account fails with a message that names the IBAN rather than with the
 *     library's generic `ValidationError`.
 *
 * WHAT IT DOES NOT PROVE: that a bank app accepts the bill, or that the printed
 * reference reconciles. That is one real test transfer - spec §9 - and it is a
 * handover item rather than something this repository can run.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildQrBill, renderQrBillSvg } from './qr-bill';

const ACCOUNT = {
  label: 'Spațiul bisericii',
  iban: 'CH11 0021 5215 3048 5502 K',
  holder: 'Rumänisch-Orthodoxe Kirchgemeinde St. Nikolaus',
  bank: 'UBS (Schweiz) AG',
  qr_bill: true,
};

const CREDITOR = {
  street: 'Wehntalerstrasse',
  house_number: '451',
  postal_code: '8046',
  town: 'Zürich',
  country: 'CH',
};

describe('the QR-bill data', () => {
  it('maps the account and the creditor address into the library data shape', () => {
    const data = buildQrBill(ACCOUNT, CREDITOR);
    expect(data.creditor.name).toBe(ACCOUNT.holder);
    expect(data.creditor.address).toBe('Wehntalerstrasse');
    expect(data.creditor.buildingNumber).toBe('451');
    expect(data.creditor.zip).toBe('8046');
    expect(data.creditor.city).toBe('Zürich');
    expect(data.creditor.country).toBe('CH');
    expect(data.creditor.account).toBe('CH110021521530485502K');
    expect(data.currency).toBe('CHF');
  });

  it('normalises a spaced IBAN into the 21 characters the library wants', () => {
    expect(buildQrBill(ACCOUNT, CREDITOR).creditor.account).toHaveLength(21);
  });

  it('leaves the amount open, so the donor fills it in', () => {
    // Open amount is a property of the DATA, not of the printed form: the
    // library renders an empty amount field, and a number here would print one.
    expect(buildQrBill(ACCOUNT, CREDITOR).amount).toBeUndefined();
  });

  it('POSITIVE CONTROL: refuses an IBAN the checksum rejects', () => {
    // `CH54 ... 5502 P` is the flagged account's own digits with one changed:
    // MOD-97 rejects it and so does the library, measured. The control would be
    // worthless against a value that is wrong in some other way, because a
    // refusal for a missing field would look like the checksum working.
    expect(() =>
      buildQrBill({ ...ACCOUNT, iban: 'CH54 0021 5215 3048 5502 P' }, CREDITOR),
    ).toThrow(/IBAN/);
  });

  it('names the offending IBAN in the failure', () => {
    expect(() =>
      buildQrBill({ ...ACCOUNT, iban: 'CH54 0021 5215 3048 5502 P' }, CREDITOR),
    ).toThrow(/CH54 0021 5215 3048 5502 P/);
  });
});

describe('the rendered QR-bill', () => {
  it('is an SVG document with no script and no event attribute', () => {
    const svg = renderQrBillSvg(buildQrBill(ACCOUNT, CREDITOR));
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).not.toMatch(/<script/i);
    expect(svg).not.toMatch(/\son[a-z]+=/i);
    expect(svg).not.toContain('javascript:');
  });

  it('really carries the creditor and the account the library was given', () => {
    const svg = renderQrBillSvg(buildQrBill(ACCOUNT, CREDITOR));
    expect(svg).toContain('Rumänisch-Orthodoxe Kirchgemeinde');
    expect(svg).toContain('CH11 0021 5215 3048 5502 K');
    expect(svg).toContain('8046 Zürich');
  });

  it('declares a viewBox so the bill scales instead of being clipped', () => {
    /*
     * MEASURED, NOT DECORATIVE. The library emits width/height in mm and NO
     * viewBox, so CSS `max-width: 100%` shrinks the element's box while the
     * drawing keeps its natural size and is clipped: on the 390px phone pass
     * the QR code was partly cut off, and axe's grid read the overflowing
     * content as overlapping the account block below, which the audit failed
     * on. `renderQrBillSvg` sets the viewBox from the library's own mm pair, so
     * the document scales as one and every coordinate and the payload stay the
     * library's. At natural size the viewBox is an identity transform.
     */
    const svg = renderQrBillSvg(buildQrBill(ACCOUNT, CREDITOR));
    const match = /<svg[^>]*\bviewBox="([^"]+)"/.exec(svg);
    expect(match, 'the bill has no viewBox, so it cannot scale').not.toBeNull();
    const [x, y, width, height] = ((match as RegExpExecArray)[1] as string)
      .split(/\s+/)
      .map(Number);
    expect([x, y]).toEqual([0, 0]);
    // 210mm x 105mm in CSS pixels: the coordinate system the library draws in.
    expect(width).toBeCloseTo((210 * 96) / 25.4, 6);
    expect(height).toBeCloseTo((105 * 96) / 25.4, 6);
  });

  it('is byte-for-byte deterministic across two builds', () => {
    // A timestamp or a random id inside the SVG would make every build differ,
    // which no page guard would notice and which would churn the whole document.
    const first = renderQrBillSvg(buildQrBill(ACCOUNT, CREDITOR));
    const second = renderQrBillSvg(buildQrBill(ACCOUNT, CREDITOR));
    expect(first).toBe(second);
  });
});

/*
 * THE PIN, ASSERTED RATHER THAN TRUSTED. A static build has no way to notice a
 * breaking change in this library until the page renders - and the page that
 * renders it is the donations page, where the symptom is a bill a donor cannot
 * scan. `@sveltia/cms` is pinned exactly for the same reason and its pin is
 * tested in `cms.test.ts`; this is the same guard for the same class of risk.
 */
describe('the swissqrbill pin', () => {
  it('is exact, with no range', () => {
    const pkg = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const version = pkg.devDependencies?.swissqrbill ?? pkg.dependencies?.swissqrbill;
    expect(version, 'swissqrbill is not required in package.json').toBeDefined();
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
