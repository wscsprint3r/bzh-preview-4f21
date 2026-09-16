import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SEMN } from '../../scripts/csp-hash.mjs';
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

const RADACINA = fileURLToPath(new URL('../../', import.meta.url));
const DIST = `${RADACINA}dist/`;

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

/** Sorted, without repeats — so two sets can be compared as arrays and read. */
function unic(valori: string[]): string[] {
  return [...new Set(valori)].sort();
}

/*
 * The `'sha256-…'` tokens of ONE directive, found by splitting the policy the
 * way a browser does rather than by searching the whole string. A hash sitting
 * in `style-src`, or in `script-src-elem`, is a different rule with different
 * consequences, and must not be mistaken for one of these.
 */
function hashuriDinScriptSrc(politica: string): string[] {
  const directiva = politica
    .split(';')
    .map((d) => d.trim())
    .find((d) => d === 'script-src' || d.startsWith('script-src '));
  return [...(directiva ?? '').matchAll(/'sha256-[A-Za-z0-9+/=]+'/g)].map((m) => m[0]);
}

/** Every `sha256-` token anywhere in a text, quoted or not, valid or not. */
function tokenuriSha(text: string): string[] {
  return [...text.matchAll(/sha256-[A-Za-z0-9+/=]*/g)].map((m) => m[0]);
}

/*
 * Every path into this repository that a text mentions in backticks.
 *
 * A token counts as a path when it is a bare `a/b/c` — no spaces, no quotes, no
 * scheme, no angle brackets — and either contains a `/` or ends in a source
 * extension. That deliberately keeps out `img-src`, `Cache-Control`, `blob:`,
 * `/admin/` (a URL, not a file) and `text/calendar; charset=utf-8`, and lets in
 * `astro.config.mjs` at the root. The list is PRINTED by the test below, so a
 * token that quietly stopped being recognised is visible in a run rather than
 * inferred from a green.
 */
export function caiMentionate(text: string): string[] {
  const EXTENSII = /\.(mjs|js|ts|md|ya?ml|json|astro|css|html|ics|txt)$/;
  const gasite: string[] = [];
  for (const m of text.matchAll(/`([^`]+)`/g)) {
    const token = m[1] as string;
    if (!/^[A-Za-z0-9_.@-]+(?:\/[A-Za-z0-9_.@-]+)*$/.test(token)) continue;
    if (!token.includes('/') && !EXTENSII.test(token)) continue;
    gasite.push(token);
  }
  return unic(gasite);
}

/** `public/_headers` as written, not as built. */
const SURSA = readFileSync(`${RADACINA}public/_headers`, 'utf8');

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

  /*
   * EQUALITY, NOT CONTAINMENT, AND THAT IS THE WHOLE POINT OF THIS ASSERTION.
   *
   * "Every hash the build computed appears in `script-src`" is a subset
   * relation, and it is silent about the other direction. Measured on this very
   * file: paste an invented `'sha256-3MO6h9CZ…'` beside the placeholder in
   * `public/_headers` and the build, this suite and the browser pass all went
   * green — while the policy shipped to every page `/*` covers, `/admin/`
   * included, whitelisting whatever inline script happens to hash to it.
   *
   * `toEqual` over both sets closes it, and also catches a hash left behind by
   * a merge or by a script that was deleted.
   */
  it('script-src numește exact hash-urile scripturilor inline construite, niciunul în plus', () => {
    const perPagina = pagini().flatMap((p) => hashuriInline(readFileSync(DIST + p, 'utf8')).map((h) => [p, h]));
    // A guard that reads files must prove it read something: with no inline
    // script anywhere, two empty sets would agree while proving nothing.
    expect(perPagina.length, 'nicio pagină construită nu are script inline').toBeGreaterThan(0);
    const construite = unic(perPagina.map(([, h]) => h as string));
    const inPolitica = unic(hashuriDinScriptSrc(CSP));
    // Print what was measured, not only the verdict. Straight to stdout:
    // vitest's default reporter swallows `console.log` from a passing test.
    process.stdout.write(
      `\nScripturi inline construite:\n${perPagina.map(([p, h]) => `  ${p} -> ${h}`).join('\n')}\n` +
        `script-src numește ${inPolitica.length}: ${inPolitica.join(' ')}\n`,
    );
    expect(inPolitica, 'hash-urile din script-src nu sunt exact cele ale scripturilor construite').toEqual(
      construite,
    );
  });

  it("script-src nu permite 'unsafe-inline'", () => {
    const scriptSrc = CSP.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src'));
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).not.toContain('unsafe-inline');
  });
});

/*
 * THE DETECTORS ABOVE, PROVED ABLE TO FIRE.
 *
 * Both assertions in this file that matter are of the form "X is absent": no
 * hash in the source, nothing extra in the policy. This repository does not
 * accept that claim without a positive control — an absence is also what a
 * detector that stopped matching reports.
 *
 * The invented hash is the one measured slipping through the old subset check.
 */
describe('detectoarele de hash chiar se declanșează', () => {
  const INVENTAT = "'sha256-3MO6h9CZoU1BDqVrXhF8G7RbqZZTQmJfN3uAn9GJXEo='";

  it('vede un hash strecurat în script-src', () => {
    expect(hashuriDinScriptSrc(`default-src 'self'; script-src 'self' ${INVENTAT}; img-src 'self'`)).toEqual([
      INVENTAT,
    ]);
  });

  it('nu ia hash-uri din alte directive', () => {
    expect(hashuriDinScriptSrc(`script-src 'self'; style-src ${INVENTAT}`)).toEqual([]);
  });

  // `script-src-elem` starts with the same fourteen characters and is a
  // different directive; a prefix test would have counted its hashes as ours.
  it('nu confundă script-src-elem cu script-src', () => {
    expect(hashuriDinScriptSrc(`script-src-elem ${INVENTAT}`)).toEqual([]);
  });

  it('vede un hash scris de mână într-o linie de antet', () => {
    expect(tokenuriSha(`  Content-Security-Policy: script-src 'self' ${INVENTAT} ${SEMN}`)).toHaveLength(1);
  });

  it('nu se declanșează pe un text fără hash', () => {
    expect(tokenuriSha(`script-src 'self' ${SEMN}`)).toEqual([]);
  });
});

describe('public/_headers, fișierul sursă', () => {
  /*
   * THE HASH IS FORBIDDEN AT THE SOURCE, not only checked at the destination.
   *
   * `AGENTS.md` says in so many words "do not hand-write a hash there", and
   * until this test nothing enforced it. A hand-written hash here survives every
   * rebuild — `csp-hash.mjs` only substitutes the placeholder, it does not clean
   * the line — so catching it in `dist/` catches it once per build, while
   * catching it here catches it where someone typed it.
   */
  it('nu conține niciun hash scris de mână', () => {
    expect(tokenuriSha(SURSA), 'hash-urile se calculează la build, nu se scriu aici').toEqual([]);
  });

  it(`poartă ${SEMN} pe o linie de antet`, () => {
    const antete = SURSA.split('\n').filter((l) => !l.trimStart().startsWith('#'));
    expect(antete.filter((l) => l.includes(SEMN)).length, `${SEMN} apare doar în comentarii`).toBeGreaterThan(0);
  });
});

/*
 * EVERY PATH THIS FILE NAMES MUST RESOLVE.
 *
 * `public/_headers` is instruction as much as configuration: its comments are
 * what someone reads on the first real sign-in, when the console is full of
 * refusals and they need to know where the expected list lives. It shipped
 * pointing at `scripts/csp-browser.mjs`, which has never existed — and a rule
 * for a path that does not exist looks exactly like a rule that works.
 */
describe('referințele din public/_headers', () => {
  const CAI = caiMentionate(SURSA);

  it('chiar găsește căi de verificat', () => {
    process.stdout.write(`\npublic/_headers menționează ${CAI.length} cale(i):\n${CAI.map((c) => `  ${c}`).join('\n')}\n`);
    expect(CAI.length, `detectorul de căi a găsit ${CAI.length} — nu ar verifica nimic mai jos`).toBeGreaterThan(3);
    // Named explicitly so a regex that stopped recognising a shape fails here
    // rather than quietly shrinking the list the cases below iterate.
    expect(CAI).toContain('scripts/csp-hash.mjs');
    expect(CAI).toContain('src/pages/program.ics.ts');
    expect(CAI).toContain('docs/handover.md');
  });

  it('detectorul recunoaște o cale inexistentă, și nu confundă restul cu o cale', () => {
    expect(caiMentionate('lista e în `scripts/csp-browser.mjs`, nu în `img-src` sau `/admin/`')).toEqual([
      'scripts/csp-browser.mjs',
    ]);
    expect(existsSync(`${RADACINA}scripts/csp-browser.mjs`)).toBe(false);
  });

  it.each(CAI)('`%s` există', (cale) => {
    expect(existsSync(RADACINA + cale), `public/_headers trimite la ${cale}, care nu există`).toBe(true);
  });

  /*
   * EXISTING IS NOT ENOUGH FOR THE HANDOVER. `.gitignore` excludes
   * `.superpowers/`, and this file used to point there for "the exact
   * commands" — a path that resolves on the machine that wrote it and in no
   * clone at all. A pointer to an untracked file is the same failure one level
   * up, so the pointer's target is asserted to be in the index.
   */
  it('docs/handover.md este urmărit de git, nu doar prezent pe disc', () => {
    const urmarit = execFileSync('git', ['ls-files', '--', 'docs/handover.md'], {
      cwd: RADACINA,
      encoding: 'utf8',
    }).trim();
    expect(urmarit, 'docs/handover.md nu este urmărit — un clone nu l-ar primi').toBe('docs/handover.md');
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
