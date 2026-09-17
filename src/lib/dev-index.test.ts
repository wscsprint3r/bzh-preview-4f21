import { describe, expect, it } from 'vitest';
import { publicIndex } from '../../scripts/dev-index.mjs';

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
 * tested here is the decision, not the middleware: `publicIndex` takes the
 * existence check as an argument, so these cases are about the rule rather than
 * about what happens to be on this disk. The last case is the exception — it
 * uses the real `public/` to prove the rule and reality meet.
 */

/** A `public/` with exactly these files in it. */
const has = (...paths: string[]) => (path: string) => paths.includes(path);

describe('publicIndex', () => {
  it('rewrites a directory that has an index.html', () => {
    expect(publicIndex('/admin/', has('admin/index.html'))).toBe('/admin/index.html');
  });

  it('does not touch a directory with no index.html', () => {
    expect(publicIndex('/admin/', has())).toBeNull();
  });

  it('does not touch a file asked for by name', () => {
    expect(publicIndex('/admin/config.yml', has('admin/index.html'))).toBeNull();
  });

  it('does not touch a path without a trailing slash, which Astro routes', () => {
    // `/admin` fără bară rămâne un 404 al serverului de dezvoltare, ca înainte:
    // `trailingSlash: 'always'` spune că adresa cu bară este adresa.
    expect(publicIndex('/admin', has('admin/index.html'))).toBeNull();
  });

  it('NEVER touches the site root', () => {
    // `/` este o rută Astro. Chiar și cu un `public/index.html` pe disc — mai
    // ales atunci — pagina randată trebuie să câștige.
    expect(publicIndex('/', has('index.html'))).toBeNull();
  });

  it('keeps the query and the fragment', () => {
    expect(publicIndex('/admin/?x=1', has('admin/index.html'))).toBe('/admin/index.html?x=1');
    expect(publicIndex('/admin/#/collections', has('admin/index.html'))).toBe('/admin/index.html#/collections');
  });

  it('decodes the path before looking for it on disk', () => {
    expect(publicIndex('/ad%6Din/', has('admin/index.html'))).toBe('/ad%6Din/index.html');
  });

  it('does not touch a path that does not start with a slash', () => {
    expect(publicIndex('admin/', has('admin/index.html'))).toBeNull();
  });

  it('against the real public/, /admin/ really does resolve', () => {
    // Controlul care leagă regula de realitate: fără el toate cazurile de mai
    // sus ar putea fi corecte despre un director care nu există.
    expect(publicIndex('/admin/')).toBe('/admin/index.html');
    expect(publicIndex('/nu-exista/')).toBeNull();
  });
});
