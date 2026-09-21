import { describe, expect, it } from 'vitest';
import { parseUrlMap } from './url-map';

describe('the URL map parser', () => {
  it('drops comments, the header and blank lines', () => {
    const rows = parseUrlMap(
      '# a comment\nvechi,nou\n/old/,/new/\n\n/kept/,/kept/\n',
    );
    expect(rows).toEqual([
      ['/old/', '/new/'],
      ['/kept/', '/kept/'],
    ]);
  });

  it('splits on the FIRST comma, so a new path may contain one', () => {
    expect(parseUrlMap('/old/,/new/,with,commas/')).toEqual([
      ['/old/', '/new/,with,commas/'],
    ]);
  });

  it('refuses a row that is not two fields', () => {
    expect(() => parseUrlMap('/old-only\n')).toThrow(/without a comma/);
  });

  it('keeps percent-encoded tokens verbatim', () => {
    const token = '/wp-content/uploads/2025/06/Pastorala-Pogorarea-Duhului-Sfant-2025.pdf';
    expect(parseUrlMap(`${token},/documente/pastorala-pogorarea-duhului-sfant-2025.pdf`)).toEqual([
      [token, '/documente/pastorala-pogorarea-duhului-sfant-2025.pdf'],
    ]);
  });
});