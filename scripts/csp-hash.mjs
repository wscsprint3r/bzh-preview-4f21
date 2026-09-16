/*
 * Puts the hash of every inline script into the Content-Security-Policy that
 * ships, at `astro:build:done`.
 *
 * ---------------------------------------------------------------------------
 * WHY THE POLICY CANNOT SIMPLY BE WRITTEN BY HAND.
 *
 * Task 10's week picker is about 3 KB, which is under Vite's inline threshold,
 * so Astro writes it INTO the homepage as `<script type="module">...</script>`
 * rather than emitting a file. `script-src 'self'` does not cover an inline
 * script: Chrome refuses it outright, and the refusal has NO VISIBLE SYMPTOM on
 * this site, because rendering without that script is the designed fallback.
 * Every week shows, the picker bar stays hidden, and the next-service card
 * keeps the value the build stamped on it - so the page looks correct while
 * announcing a service that finished hours ago.
 *
 * The alternatives and why they lost:
 *
 *   - `'unsafe-inline'`: re-admits every injected `<script>` the directive
 *     exists to stop, to solve a problem one hash solves exactly.
 *   - Emitting the script as a file: costs a request on every visit and throws
 *     away the measurement Task 10 made; `check-budget.mjs` fails on it by
 *     design.
 *   - Astro's own `security.csp`: emits a per-page `<meta http-equiv>`, which
 *     cannot carry `frame-ancestors` and never touches `public/admin/index.html`
 *     - the one page an editor's GitHub credential passes through.
 *
 * So `public/_headers` carries a placeholder and this fills it in.
 * ---------------------------------------------------------------------------
 *
 * IT FAILS THE BUILD RATHER THAN DOING NOTHING. A substitution that quietly
 * finds nothing to substitute leaves `script-src 'self'` on the deployed site,
 * which is the exact defect this file exists to prevent - so a missing
 * `dist/_headers`, a missing placeholder and an unrecognised `<script>` all
 * stop the build. `src/lib/headers.itest.ts` then asserts the shipped file from
 * the other side: a real hash, no placeholder left.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { scripturi } from './scripturi.mjs';

/** The token in `public/_headers` that this file replaces. */
export const SEMN = '{{hash-scripturi}}';

/** Every `.html` in a directory tree, as paths relative to it. */
function paginile(radacina, relativ = '') {
  const gasite = [];
  for (const intrare of readdirSync(join(radacina, relativ), { withFileTypes: true })) {
    const cale = relativ === '' ? intrare.name : `${relativ}/${intrare.name}`;
    if (intrare.isDirectory()) gasite.push(...paginile(radacina, cale));
    else if (intrare.name.endsWith('.html')) gasite.push(cale);
  }
  return gasite.sort();
}

/**
 * The CSP source expression for one inline script, e.g. `'sha256-AEAz...='`.
 *
 * Hashed as UTF-8 over the text BETWEEN the tags, which is what the algorithm
 * in CSP 3 section 6.6.3.4 specifies and what Chrome was measured computing:
 * the hash below is byte-identical to the one Chrome named in its own refusal
 * message for this very script.
 */
export function hashScript(continut) {
  return `'sha256-${createHash('sha256').update(continut, 'utf8').digest('base64')}'`;
}

/**
 * Rewrites `<dir>/_headers` in place, substituting the hashes of every inline
 * executable script in `<dir>`. Returns what it measured, so the caller can
 * print it rather than print a verdict.
 */
export function scrieHeaders(dir, spune = console.log) {
  const fisier = join(dir, '_headers');
  if (!existsSync(fisier)) {
    throw new Error(
      `${fisier} lipsește. Astro copiază public/_headers în dist/ — dacă fișierul sursă a ` +
        'dispărut, situl se publică fără niciun antet de securitate.',
    );
  }

  const gasite = [];
  for (const pagina of paginile(dir)) {
    for (const s of scripturi(readFileSync(join(dir, pagina), 'utf8'))) {
      if (s.fel === 'necunoscut') {
        throw new Error(
          `${pagina}: <script${s.atribute}> nu e nici cod, nici date cunoscute.\n` +
            'Adaugă-l în TIPURI_EXECUTATE sau în TIPURI_DATE din scripts/scripturi.mjs. ' +
            'Un script pe care politica nu îl recunoaște este un script pe care situl publicat îl refuză.',
        );
      }
      if (s.fel !== 'executat' || s.src !== null) continue;
      gasite.push({ pagina, octeti: Buffer.byteLength(s.continut), hash: hashScript(s.continut) });
    }
  }

  // Sorted and deduplicated, so two builds of the same output produce the same
  // file: an ordering that followed the walk would make the diff of `_headers`
  // depend on the filesystem.
  const unice = [...new Set(gasite.map((g) => g.hash))].sort();

  /*
   * SUBSTITUTED ONLY ON HEADER LINES, NEVER IN COMMENTS. `public/_headers`
   * explains the placeholder by name, so a whole-file `replaceAll` rewrote the
   * explanation into a sentence about a hash — found by reading the output.
   * Requiring the token on a header line also means a file that mentions it
   * only in prose fails below instead of shipping `script-src 'self'`, which is
   * the defect this whole file exists to prevent.
   */
  const esteComentariu = (linie) => linie.trimStart().startsWith('#');
  const linii = readFileSync(fisier, 'utf8').split('\n');
  if (!linii.some((l) => !esteComentariu(l) && l.includes(SEMN))) {
    throw new Error(
      `${fisier} nu conține ${SEMN} pe nicio linie de antet.\n` +
        'Fără el, script-src rămâne doar cu \x27self\x27 și browserul refuză scriptul inline al ' +
        'paginii principale — fără nicio urmă vizibilă, fiindcă pagina fără JavaScript arată corect. ' +
        'Vezi comentariul despre script-src din public/_headers.',
    );
  }
  writeFileSync(
    fisier,
    linii.map((l) => (esteComentariu(l) ? l : l.replaceAll(SEMN, unice.join(' ')))).join('\n'),
  );

  // Print what was measured, not only that something was.
  if (gasite.length === 0) {
    spune(
      'CSP: niciun script inline în build — script-src rămâne doar \x27self\x27, ceea ce e corect ' +
        'DOAR dacă scriptul e emis ca fișier. check-budget.mjs decide dacă asta e în regulă.',
    );
  } else {
    for (const g of gasite) spune(`CSP: ${g.pagina} script inline de ${g.octeti} octeți -> ${g.hash}`);
  }
  return { gasite, unice };
}

/** The Astro integration that runs it. Wired in `astro.config.mjs`. */
export const hashuriCsp = {
  name: 'hashuri-csp',
  hooks: {
    'astro:build:done': ({ dir, logger }) => {
      scrieHeaders(dir.pathname, (mesaj) => logger.info(mesaj));
    },
  },
};
