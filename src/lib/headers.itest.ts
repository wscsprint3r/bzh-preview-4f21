import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { anteteleRutei, parseazaHeaders } from '../../scripts/headers.mjs';

/*
 * WHAT THIS PROVES: that the file this repository ships as `dist/_headers` says
 * what it is meant to say — including the one value the build has to compute,
 * the SHA-256 that keeps the homepage's inline script executable.
 *
 * WHAT IT CANNOT PROVE, AND NOTHING HERE CAN: that Cloudflare applies any of
 * it. `_headers` is parsed by the host and never served, so no request to the
 * deployed site returns this file — the only evidence is the response headers
 * of some other URL:
 *
 *   curl -sI https://<project>.pages.dev/ | grep -i content-security-policy
 *   curl -sI https://<project>.pages.dev/program.ics | grep -i content-type
 *
 * Both are in the task 13 handover checklist, and both are the user's to run.
 * `npm run a11y` goes one step further than this file by serving the built site
 * with these headers and loading it in a real browser, which is what catches a
 * policy that is well-formed and still breaks the page. Neither is a claim
 * about the host.
 *
 * It reads `dist/`, so it runs only after a build: `npm run test:build`.
 */

const DIST = fileURLToPath(new URL('../../dist/', import.meta.url));

/** The file's text, having proved there was a file and that it had text in it. */
function citeste(cale: string): string {
  expect(existsSync(DIST + cale), `${cale} lipsește din dist/`).toBe(true);
  const text = readFileSync(DIST + cale, 'utf8');
  expect(text.length, `${cale} există dar este gol`).toBeGreaterThan(0);
  return text;
}

const TEXT = citeste('_headers');
const REGULI = parseazaHeaders(TEXT);

/** Every `.html` in `dist/`, as paths relative to it. */
function pagini(relativ = ''): string[] {
  const gasite: string[] = [];
  for (const intrare of readdirSync(DIST + relativ, { withFileTypes: true })) {
    const cale = relativ + intrare.name;
    if (intrare.isDirectory()) gasite.push(...pagini(cale + '/'));
    else if (intrare.name.endsWith('.html')) gasite.push(cale);
  }
  return gasite.sort();
}

/*
 * The inline executable scripts of one built page, found with this file's OWN
 * regex and hashed with this file's own call to `createHash`.
 *
 * DELIBERATELY NOT `scripts/scripturi.mjs` AND `scripts/csp-hash.mjs`, which is
 * what wrote the policy. A check that recomputes the expectation with the very
 * code under test agrees with that code however wrong it is; the point here is
 * a second opinion about which bytes the browser will hash. `<script>` inside
 * an HTML comment is skipped for the same reason the generator skips it — that
 * misreading is exactly what this is meant to be able to catch.
 */
function hashuriInline(html: string): string[] {
  const fara = html.replace(/<!--[\s\S]*?-->/g, '');
  const gasite: string[] = [];
  for (const m of fara.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const atribute = m[1] as string;
    const continut = m[2] as string;
    if (/\bsrc\s*=/i.test(atribute)) continue;
    const tip = (atribute.match(/\btype\s*=\s*["']([^"']*)["']/i)?.[1] ?? '').toLowerCase();
    // Only what a browser executes. `application/json` is data; CSP ignores it.
    if (!['', 'module', 'text/javascript', 'application/javascript'].includes(tip)) continue;
    gasite.push(`'sha256-${createHash('sha256').update(continut, 'utf8').digest('base64')}'`);
  }
  return gasite;
}

const CSP = anteteleRutei(REGULI, '/').get('Content-Security-Policy') ?? '';

describe('_headers ajunge în build', () => {
  it('conține reguli', () => {
    expect(REGULI.length).toBeGreaterThan(0);
  });

  /*
   * Cloudflare joins the values when a header name appears in two matching
   * rules, rather than letting the more specific one win. `Cache-Control` in
   * two rules would produce `public, max-age=3600, no-store` — neither policy.
   */
  it('niciun nume de antet nu apare în două reguli', () => {
    const unde = new Map<string, string[]>();
    for (const regula of REGULI) {
      for (const [nume] of regula.antete) {
        unde.set(nume, [...(unde.get(nume) ?? []), regula.tipar]);
      }
    }
    const duble = [...unde].filter(([, tipare]) => tipare.length > 1);
    expect(duble, 'Cloudflare ar lipi valorile cu virgulă').toEqual([]);
  });

  // Cloudflare's documented limits. A file over them is not rejected loudly.
  it('respectă limitele Cloudflare', () => {
    expect(REGULI.length).toBeLessThanOrEqual(100);
    for (const linie of TEXT.split('\n')) expect(linie.length).toBeLessThanOrEqual(2000);
  });
});

describe('politica de securitate', () => {
  it('acoperă întregul sit', () => {
    expect(REGULI.some((r) => r.tipar === '/*')).toBe(true);
    expect(CSP).not.toBe('');
  });

  it.each([
    ['Strict-Transport-Security', 'max-age=31536000; includeSubDomains'],
    ['X-Content-Type-Options', 'nosniff'],
    ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ])('trimite %s pe orice pagină', (nume, valoare) => {
    expect(anteteleRutei(REGULI, '/program/').get(nume)).toBe(valoare);
  });

  it.each(["frame-ancestors 'none'", "object-src 'none'", "base-uri 'none'", "default-src 'self'"])(
    'politica include %s',
    (directiva) => {
      expect(CSP).toContain(directiva);
    },
  );

  /*
   * THE CHECK THIS FILE EXISTS FOR.
   *
   * `script-src 'self'` alone is well-formed, ships without complaint, and
   * stops the homepage's inline script from ever running — with no visible
   * symptom, because rendering without that script is the designed fallback.
   * So the assertion is not "a hash is present" but "the hash of the script
   * that is actually in the page is present", recomputed here from `dist/`.
   */
  /*
   * On the HEADER lines only. `public/_headers` explains the placeholder by
   * name in a comment, and `csp-hash.mjs` deliberately leaves comments alone —
   * substituting there once rewrote the explanation into a sentence about a
   * hash. What must not survive is a `{{` in a value a browser reads.
   */
  it('nu mai conține niciun substituent pe o linie de antet', () => {
    const antete = TEXT.split('\n').filter((l) => !l.trimStart().startsWith('#'));
    expect(antete.filter((l) => l.includes('{{'))).toEqual([]);
  });

  it('script-src numește hash-ul fiecărui script inline din fiecare pagină', () => {
    const toate = pagini().flatMap((p) => hashuriInline(readFileSync(DIST + p, 'utf8')).map((h) => [p, h]));
    // A guard that reads files must prove it read something: with no inline
    // script anywhere, an empty loop below would pass while proving nothing.
    expect(toate.length, 'nicio pagină construită nu are script inline').toBeGreaterThan(0);
    for (const [pagina, hash] of toate) expect(CSP, `${pagina}: ${hash} lipsește din script-src`).toContain(hash);
  });

  it("script-src nu permite 'unsafe-inline'", () => {
    const scriptSrc = CSP.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src'));
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).not.toContain('unsafe-inline');
  });
});

describe('feedul de calendar', () => {
  /*
   * LOAD-BEARING. A static build discards the `Content-Type` the endpoint sets,
   * so this rule is the only thing that decides what a subscriber's calendar
   * client receives. The rule is asserted to RESOLVE — the file it names is in
   * the build — because a rule for a path that does not exist looks exactly
   * like a rule that works.
   */
  it('dă /program.ics tipul text/calendar', () => {
    expect(existsSync(DIST + 'program.ics'), 'regula are un subiect care nu există').toBe(true);
    expect(anteteleRutei(REGULI, '/program.ics').get('Content-Type')).toBe('text/calendar; charset=utf-8');
  });

  it('îl păstrează în cache o oră', () => {
    expect(anteteleRutei(REGULI, '/program.ics').get('Cache-Control')).toBe('public, max-age=3600');
  });

  it('nu dă tipul text/calendar și paginilor', () => {
    expect(anteteleRutei(REGULI, '/').get('Content-Type')).toBeUndefined();
  });
});

describe('administrarea', () => {
  it('nu este indexată', () => {
    expect(existsSync(DIST + 'admin/index.html'), 'regula are un subiect care nu există').toBe(true);
    expect(anteteleRutei(REGULI, '/admin/').get('X-Robots-Tag')).toBe('noindex');
  });

  /*
   * `/admin/` is the page an editor's GitHub credential passes through, so it
   * gets the site's policy rather than an exception. A rule that only added
   * `X-Robots-Tag` while quietly losing the CSP would look identical in the
   * file and be the one page without a policy.
   */
  it('primește aceeași politică de securitate ca restul sitului', () => {
    expect(anteteleRutei(REGULI, '/admin/').get('Content-Security-Policy')).toBe(CSP);
  });
});
