import { describe, expect, it } from 'vitest';
import { indexulPublic } from '../../scripts/dev-index.mjs';

/*
 * WHAT THIS PROVES: a request for a directory under `public/` is rewritten to
 * that directory's `index.html`, and nothing else is touched.
 *
 * `/admin/` was a 404 under `astro dev` — `/admin/index.html` was 200, `/admin/`
 * and `/admin` were Astro's own 404 page. Cloudflare Pages resolves the
 * directory index and so does `scripts/a11y.mjs`'s server, so production and
 * every audit were unaffected, which is exactly why nobody saw it: the one
 * surface with no test coverage, on the one server with none. Every instruction
 * a developer follows says `/admin/`, and opening the CMS locally is the first
 * thing anybody does.
 *
 * The rewrite is `astro:server:setup` only, so it cannot reach a build. What is
 * tested here is the decision, not the middleware: `indexulPublic` takes the
 * existence check as an argument, so these cases are about the rule rather than
 * about what happens to be on this disk. The last case is the exception — it
 * uses the real `public/` to prove the rule and reality meet.
 */

/** A `public/` with exactly these files in it. */
const are = (...cai: string[]) => (cale: string) => cai.includes(cale);

describe('indexulPublic', () => {
  it('rescrie un director care are index.html', () => {
    expect(indexulPublic('/admin/', are('admin/index.html'))).toBe('/admin/index.html');
  });

  it('nu atinge un director fără index.html', () => {
    expect(indexulPublic('/admin/', are())).toBeNull();
  });

  it('nu atinge un fișier cerut pe nume', () => {
    expect(indexulPublic('/admin/config.yml', are('admin/index.html'))).toBeNull();
  });

  it('nu atinge o cale fără bară la final, pe care o rutează Astro', () => {
    // `/admin` fără bară rămâne un 404 al serverului de dezvoltare, ca înainte:
    // `trailingSlash: 'always'` spune că adresa cu bară este adresa.
    expect(indexulPublic('/admin', are('admin/index.html'))).toBeNull();
  });

  it('nu atinge NICIODATĂ rădăcina sitului', () => {
    // `/` este o rută Astro. Chiar și cu un `public/index.html` pe disc — mai
    // ales atunci — pagina randată trebuie să câștige.
    expect(indexulPublic('/', are('index.html'))).toBeNull();
  });

  it('păstrează interogarea și fragmentul', () => {
    expect(indexulPublic('/admin/?x=1', are('admin/index.html'))).toBe('/admin/index.html?x=1');
    expect(indexulPublic('/admin/#/collections', are('admin/index.html'))).toBe('/admin/index.html#/collections');
  });

  it('decodează calea înainte de a o căuta pe disc', () => {
    expect(indexulPublic('/ad%6Din/', are('admin/index.html'))).toBe('/ad%6Din/index.html');
  });

  it('nu atinge o cale care nu începe cu o bară', () => {
    expect(indexulPublic('admin/', are('admin/index.html'))).toBeNull();
  });

  it('pe public/-ul adevărat, /admin/ chiar se rezolvă', () => {
    // Controlul care leagă regula de realitate: fără el toate cazurile de mai
    // sus ar putea fi corecte despre un director care nu există.
    expect(indexulPublic('/admin/')).toBe('/admin/index.html');
    expect(indexulPublic('/nu-exista/')).toBeNull();
  });
});
