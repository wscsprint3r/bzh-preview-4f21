import { describe, expect, it } from 'vitest';
import { imageKey, publicUpload, resolveImage, responsiveWidths } from './images';

describe('imageKey', () => {
  it('normalises the migration shape to a repository path', () => {
    expect(imageKey('../../assets/content/2024/05/x.jpg')).toBe('src/assets/content/2024/05/x.jpg');
  });

  it('refuses the unserved /src/ shape outright', () => {
    expect(imageKey('/src/assets/uploads/x.png')).toBeNull();
  });

  it('refuses anything else that is not the migration shape', () => {
    expect(imageKey('')).toBeNull();
    expect(imageKey('https://example.com/x.jpg')).toBeNull();
    expect(imageKey('../../../etc/passwd')).toBeNull();
  });
});

describe('publicUpload', () => {
  it('recognises the CMS shape as a served path', () => {
    expect(publicUpload('/uploads/2026/09/x.png')).toBe('/uploads/2026/09/x.png');
  });

  it('refuses a path that could escape /uploads', () => {
    expect(publicUpload('/uploads/../secret.png')).toBeNull();
    expect(publicUpload('/uploads')).toBeNull();
  });
});

describe('resolveImage', () => {
  it('resolves a real migration-shaped file to metadata with dimensions', () => {
    const image = resolveImage('../../assets/content/2024/05/5d400e5d-4326-4ffb-ad1a-5635ca9a388d.jpg');
    expect(image?.width).toBeGreaterThan(0);
    expect(image?.height).toBeGreaterThan(0);
  });

  it('does NOT resolve a public upload: it is not an Astro asset', () => {
    expect(resolveImage('/uploads/2026/09/x.png')).toBeNull();
  });

  it('gives null for a migration path that resolves to nothing', () => {
    expect(resolveImage('../../assets/content/2024/05/missing.png')).toBeNull();
  });
});

describe('responsiveWidths', () => {
  it('offers half and full width for a large image', () => {
    expect(responsiveWidths(1200)).toEqual([600, 1200]);
  });

  it('still gives positive widths for a tiny image', () => {
    expect(responsiveWidths(3)).toEqual([2, 3]);
  });

  it('deduplicates when half rounds back to the full width', () => {
    expect(responsiveWidths(1)).toEqual([1]);
  });
});
