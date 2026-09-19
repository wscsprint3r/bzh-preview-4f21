import { describe, expect, it } from 'vitest';
import { galleryIdsFromElementor, legacyAlbumItems, parseLegacyGallery } from './galleries.mjs';

const LEGACY = `
  <h5 class="mb-4">Imagini de la slujbe:</h5>
  <img src="galerie/8.jpg" alt="" width="160px" height="128px">
  <div class="media-body"><h5 class="m-0">20.12.2001</h5>Deschiderea oficiala a parohiei</div>
  <img src="galerie/10.jpg" alt="">
  <div class="media-body"><h5>8.06.2002</h5>Botezul pruncului Andrei Munteanu</div>
  <img src="galerie/14.jpg" alt="">
  <div class="media-body"><h5 class="m-0"></h5>Zürich</div>
  <img src="galerie/15.jpg" alt="">
  <div class="media-body"><h5>06.12.2003</h5>Zürich</div>
  <img src="galerie/15.jpg" alt="">
  <div class="media-body"><h5>06.12.2003</h5>Zürich</div>`;

describe('the legacy album parser', () => {
  it('pairs each image tag with the caption block that follows it, empty date included', () => {
    expect(parseLegacyGallery(LEGACY)).toEqual([
      { file: 'galerie/8.jpg', date: '20.12.2001', caption: 'Deschiderea oficiala a parohiei' },
      { file: 'galerie/10.jpg', date: '8.06.2002', caption: 'Botezul pruncului Andrei Munteanu' },
      { file: 'galerie/14.jpg', date: '', caption: 'Zürich' },
      { file: 'galerie/15.jpg', date: '06.12.2003', caption: 'Zürich' },
      { file: 'galerie/15.jpg', date: '06.12.2003', caption: 'Zürich' },
    ]);
  });

  it('POSITIVE CONTROL: an image tag with no caption block stops the run by name', () => {
    expect(() => parseLegacyGallery('<img src="galerie/9.jpg" alt="">')).toThrow(/galerie\/9\.jpg/);
  });
});

describe('the legacy album items', () => {
  it('collapses the duplicate file and folds the date into the description', () => {
    // The fixture above is a 5-tag sample, not the measured page: the counts it
    // is checked against are its own. The default is the real corpus's
    // `LEGACY_EXPECTED`, which is what `extractGalleries` must be held to - so
    // the sample declares its shape rather than borrowing the real one.
    expect(legacyAlbumItems(parseLegacyGallery(LEGACY), { tags: 5, unique: 4 })).toEqual([
      { file: 'galerie/8.jpg', description: '20.12.2001 — Deschiderea oficiala a parohiei' },
      { file: 'galerie/10.jpg', description: '8.06.2002 — Botezul pruncului Andrei Munteanu' },
      { file: 'galerie/14.jpg', description: 'Zürich' },
      { file: 'galerie/15.jpg', description: '06.12.2003 — Zürich' },
    ]);
  });

  it('POSITIVE CONTROL: a tag count that disagrees with the measured corpus stops the run', () => {
    const six = `${LEGACY}<img src="galerie/16.jpg" alt=""><div><h5>06.12.2003</h5>Zürich</div>`;
    expect(() => legacyAlbumItems(parseLegacyGallery(six), { tags: 10, unique: 9 }))
      .toThrow(/10/);
  });
});

describe('the Elementor gallery ids', () => {
  it('reads the ids out of the widget entries under settings.wp_gallery, in document order', () => {
    const json = JSON.stringify([
      { elType: 'widget', widgetType: 'image-gallery', settings: { wp_gallery: [{ id: 11 }, { id: 22 }], gallery: [] } },
      { elType: 'widget', widgetType: 'heading', settings: {} },
    ]);
    expect(galleryIdsFromElementor(json)).toEqual([11, 22]);
  });

  it('POSITIVE CONTROL: a blob with only the empty settings.gallery yields an empty list', () => {
    const json = JSON.stringify([
      { elType: 'widget', widgetType: 'image-gallery', settings: { gallery: [{ id: 11 }] } },
    ]);
    expect(galleryIdsFromElementor(json)).toEqual([]);
  });
});
