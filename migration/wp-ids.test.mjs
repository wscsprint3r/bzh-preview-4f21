import { describe, expect, it } from 'vitest';
import { shortLinkMap } from './wp-ids.mjs';

describe('the short-link map', () => {
  const ROWS = [
    ['/slujbe/', '/noutati/slujbe/'],
    ['/istoric/', '/parohia/istoric/'],
    ['/wp-content/uploads/2024/05/x.pdf', '/documente/x.pdf'],
  ];

  it('maps a post slug to its /noutati/ path', () => {
    expect(shortLinkMap([{ id: 12, slug: 'slujbe' }], ROWS)).toEqual([['12', '/noutati/slujbe/']]);
  });

  it('maps a page slug to its new path', () => {
    expect(shortLinkMap([{ id: 7, slug: 'istoric' }], ROWS)).toEqual([
      ['7', '/parohia/istoric/'],
    ]);
  });

  it('drops a slug the URL map does not carry', () => {
    expect(shortLinkMap([{ id: 9, slug: 'gone' }], ROWS)).toEqual([]);
  });

  it('is sorted by id and one id appears once', () => {
    const map = shortLinkMap(
      [
        { id: 30, slug: 'slujbe' },
        { id: 4, slug: 'istoric' },
      ],
      ROWS,
    );
    expect(map).toEqual([
      ['4', '/parohia/istoric/'],
      ['30', '/noutati/slujbe/'],
    ]);
  });
});
