/*
 * WHAT THIS PROVES: that `/admin/` serves a page whose script actually exists,
 * and that every piece of the CMS it can ask for at run time is served from
 * this origin rather than fetched from a CDN.
 *
 * WHY THAT NEEDS A TEST AT ALL. Sveltia's entry file does not carry the whole
 * program. It lazily imports `chunks/<name>.js`, and the loader inside it tries
 * TWO candidates in order: a sibling of itself, and failing that
 * `https://unpkg.com/@sveltia/cms@<version>/dist/chunks/<name>.js`. So a build
 * that copies only the entry file still WORKS in development, silently over the
 * public internet, and then fails in production the moment Task 13's
 * `script-src 'self'` says no. The fallback is invisible until it is fatal,
 * which is why the set of vendored files is closed here rather than sampled.
 *
 * THE EXPECTED SET COMES FROM THE INSTALLED PACKAGE, which `dist/` cannot edit.
 * `scripts/copy-cms.mjs` is the thing under test; a test that read its output to
 * decide what its output should be would agree with any bug it contains.
 *
 * WHAT IT DOES NOT PROVE: that the CMS runs. Nothing here opens a browser, signs
 * in to GitHub or renders a form. See `cms.test.ts` for how far the config can
 * be checked, and Task 12 Step 9 for the part that needs a person.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FONTURI, rescrieFonturi } from '../../scripts/copy-cms.mjs';

const DIST = fileURLToPath(new URL('../../dist/', import.meta.url));
const PUBLIC = fileURLToPath(new URL('../../public/', import.meta.url));

const INTRARE_CMS = createRequire(import.meta.url).resolve('@sveltia/cms');
const SURSA_CMS = dirname(INTRARE_CMS);

/** The file's bytes, having proved there was a file and that it had some. */
function citeste(cale: string): Buffer {
  expect(existsSync(cale), `${cale} lipsește`).toBe(true);
  const octeti = readFileSync(cale);
  expect(octeti.length, `${cale} există dar este gol`).toBeGreaterThan(0);
  return octeti;
}

/** Every file under one folder, as `/`-separated paths relative to it. */
function fisiere(radacina: string, relativ = ''): string[] {
  const gasite: string[] = [];
  for (const intrare of readdirSync(join(radacina, relativ), { withFileTypes: true })) {
    const cale = posix.join(relativ, intrare.name);
    if (intrare.isDirectory()) gasite.push(...fisiere(radacina, cale));
    else gasite.push(cale);
  }
  return gasite.sort();
}

/*
 * What `copy-cms.mjs` is supposed to have produced, stated here independently of
 * it: the entry file npm resolved, plus every file in every subfolder beside it
 * (that is where the lazily-imported chunks live), minus the source maps.
 */
const ASTEPTATE_PACHET = [
  basename(INTRARE_CMS),
  ...readdirSync(SURSA_CMS, { withFileTypes: true })
    .filter((intrare) => intrare.isDirectory())
    .flatMap((intrare) => fisiere(SURSA_CMS, intrare.name)),
]
  .filter((f) => !f.endsWith('.map'))
  .sort();

/*
 * And the three fonts, whose expected set comes from the DECLARATION in
 * `copy-cms.mjs` rather than from anything in `dist/`. That is a weaker source
 * than the package folder above - it is the same table the script rewrites with
 * - so it is not asked to carry the claim on its own. Three other assertions
 * below come at it from outside: the served bundle must name no CDN while the
 * package's own copy still does, every font URL it does name must resolve to a
 * real file, and each of those files must match the npm package byte for byte.
 */
const ASTEPTATE_FONTURI = FONTURI.map(({ modul }) => `fonturi/${basename(modul)}`);

const ASTEPTATE = [...ASTEPTATE_PACHET, ...ASTEPTATE_FONTURI].sort();

/** Our own files under `admin/`, which are not vendored and are tracked in git. */
const ALE_NOASTRE = ['index.html', 'config.yml', 'pornire.mjs'];

const INTRARE_SERVITA = join(DIST, 'admin', basename(INTRARE_CMS));

function numaraAparitii(text: string, bucata: string): number {
  let n = 0;
  for (let i = text.indexOf(bucata); i !== -1; i = text.indexOf(bucata, i + bucata.length)) n += 1;
  return n;
}

describe('pagina de administrare există', () => {
  it('dist/admin/index.html a fost construită', () => {
    const html = citeste(join(DIST, 'admin', 'index.html')).toString('utf8');
    expect(html).toContain('<html lang="ro"');
    expect(html).toContain('</html>');
    // Nu este o măsură de securitate - CMS-ul este apărat de autentificarea
    // GitHub - dar o pagină de administrare indexată este o invitație.
    expect(html).toMatch(/<meta\b[^>]*name="robots"[^>]*noindex/);
  });

  /*
   * Referința, urmărită până la fișier. Trei generații ale aceleiași greșeli pe
   * acest proiect au venit din aserțiuni care spuneau „textul apare în pagină";
   * `src="/admin/sveltia-cms.mjs"` este adevărat și atunci când fișierul nu a
   * fost copiat niciodată, iar pagina arată atunci exact ca o pagină goală.
   */
  it('fiecare <script src> al ei duce la un fișier real din dist/', () => {
    const html = citeste(join(DIST, 'admin', 'index.html')).toString('utf8');
    const surse = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]*)"/g)].map((m) => m[1] as string);
    expect(surse.length, 'pagina de administrare nu încarcă niciun script').toBe(1);
    for (const src of surse) {
      expect(src.startsWith('/'), `${src} nu este absolută`).toBe(true);
      citeste(join(DIST, src.slice(1).split(/[?#]/)[0] as string));
    }
  });

  /*
   * Al doilea capăt al aceluiași lanț. `pornire.mjs` este fișierul care chiar
   * pornește CMS-ul, iar el importă bundle-ul pe cale relativă. Dacă acel import
   * nu duce nicăieri, pagina rămâne albă și tăcută - exact starea în care a fost
   * găsită înainte să existe fișierul acesta.
   */
  it('fiecare import al lui pornire.mjs duce la un fișier real', () => {
    const sursa = citeste(join(DIST, 'admin', 'pornire.mjs')).toString('utf8');
    const importuri = [
      ...sursa.matchAll(/\bfrom\s*'([^']+)'/g),
      ...sursa.matchAll(/\bimport\(\s*'([^']+)'/g),
    ].map((m) => m[1] as string);
    expect(importuri.length, 'pornire.mjs nu importă nimic').toBeGreaterThan(0);
    for (const specificator of importuri) {
      expect(specificator.startsWith('./'), `${specificator} nu este relativ`).toBe(true);
      citeste(join(DIST, 'admin', specificator.slice(2)));
    }
    // Și chiar cheamă init: un import fără apel ar trece testul de mai sus și ar
    // lăsa pagina tot albă.
    expect(sursa).toMatch(/\binit\s*\(/);
  });

  it('servește chiar configurația pe care o verifică testele', () => {
    // `cms.test.ts` validează `public/admin/config.yml`. Dacă ce ajunge în
    // `dist/` ar fi altceva, acea validare ar fi despre un fișier pe care nu îl
    // citește nimeni.
    expect(citeste(join(DIST, 'admin', 'config.yml')).equals(citeste(join(PUBLIC, 'admin', 'config.yml')))).toBe(true);
  });
});

describe('bundle-ul CMS este servit din acest sit, nu de pe un CDN', () => {
  it('pachetul chiar are ce să dea', () => {
    // Fără asta, o mulțime așteptată goală ar face ca egalitatea de mai jos să
    // fie adevărată despre un `dist/admin/` fără niciun fișier vendorizat.
    expect(ASTEPTATE.length).toBeGreaterThan(1);
    expect(ASTEPTATE).toContain(basename(INTRARE_CMS));
    expect(ASTEPTATE.some((f) => f.startsWith('chunks/'))).toBe(true);
    expect(ASTEPTATE.some((f) => f.startsWith('fonturi/'))).toBe(true);
  });

  /*
   * Mulțime închisă, în amândouă sensurile. Prea puțin: o bucată lipsă pe care
   * CMS-ul o cere de la unpkg, unde CSP-ul o oprește. Prea mult: harta de surse
   * de 7 MB sau a doua copie a programului, publicate lumii degeaba.
   */
  it('poartă exact fișierele pachetului, nici unul în plus, nici unul în minus', () => {
    const vendorizate = fisiere(join(DIST, 'admin')).filter((f) => !ALE_NOASTRE.includes(f));
    expect(vendorizate).toEqual(ASTEPTATE);
  });

  it('poartă octeții pachetului, nu o copie veche', () => {
    for (const cale of ASTEPTATE_PACHET) {
      // Fișierul de intrare este singurul rescris; are testul lui mai jos.
      if (cale === basename(INTRARE_CMS)) continue;
      const copiat = citeste(join(DIST, 'admin', cale));
      expect(copiat.equals(readFileSync(join(SURSA_CMS, cale))), cale).toBe(true);
    }
  });

  /*
   * FIȘIERUL DE INTRARE ESTE SINGURUL COD STRĂIN PE CARE ÎL MODIFICĂM, deci
   * egalitatea este exactă: ce se servește trebuie să fie chiar pachetul trecut
   * prin `rescrieFonturi`, nici un octet mai mult. O modificare în plus -
   * strecurată, sau făcută de o unealtă pe drum - pică aici.
   */
  it('fișierul de intrare este pachetul cu fonturile rescrise și nimic altceva', () => {
    const servit = citeste(INTRARE_SERVITA).toString('utf8');
    expect(servit).toBe(rescrieFonturi(readFileSync(INTRARE_CMS, 'utf8')));
  });

  /*
   * Și dovada că rescrierea are ce să rescrie. Fără controlul pozitiv, „nu
   * numește niciun CDN" ar fi la fel de adevărat despre un pachet care nu l-a
   * numit niciodată - iar atunci nimeni nu ar afla că tabelul `FONTURI` a rămas
   * în urmă.
   */
  it('nu mai numește CDN-ul de fonturi, deși pachetul îl numește', () => {
    const CDN = 'cdn.jsdelivr.net';
    expect(numaraAparitii(readFileSync(INTRARE_CMS, 'utf8'), CDN)).toBeGreaterThan(0);
    expect(numaraAparitii(citeste(INTRARE_SERVITA).toString('utf8'), CDN)).toBe(0);
  });

  /*
   * Referințele, urmărite până la fișier - aceeași regulă ca pentru `.ics`: o
   * adresă rescrisă greșit ar ieși din mulțimea verificată în loc să o facă să
   * pice, dacă nimeni nu ar număra și nu ar deschide fișierele.
   */
  it('fiecare font pe care îl cere duce la un fișier real din dist/', () => {
    const servit = citeste(INTRARE_SERVITA).toString('utf8');
    const urluri = [...servit.matchAll(/url\((\/admin\/[^)]+)\)/g)].map((m) => m[1] as string);
    expect(urluri.length, 'bundle-ul nu cere niciun font local').toBe(FONTURI.length);
    for (const url of urluri) citeste(join(DIST, url.slice(1)));
  });

  it('fonturile servite sunt chiar fonturile din pachetele npm', () => {
    const require = createRequire(import.meta.url);
    for (const { modul } of FONTURI) {
      const nume = basename(modul);
      const servit = citeste(join(DIST, 'admin', 'fonturi', nume));
      expect(servit.equals(readFileSync(require.resolve(modul))), nume).toBe(true);
    }
  });

  it('nu publică hărțile de surse', () => {
    // Controlul pozitiv: pachetul chiar ARE hărți, deci absența lor din `dist/`
    // este o alegere, nu o constatare despre un pachet care nu le are.
    const harti = fisiere(SURSA_CMS).filter((f) => f.endsWith('.map'));
    expect(harti.length).toBeGreaterThan(0);
    for (const harta of harti) {
      expect(existsSync(join(DIST, 'admin', harta)), harta).toBe(false);
    }
  });

  it('nu costă nimic vizitatorului, fiindcă nimeni nu ajunge acolo din greșeală', () => {
    // Nu un buget, ci ordinul de mărime: dacă bundle-ul ar ajunge vreodată sub
    // 100 KB, cel mai probabil s-a copiat altceva decât programul.
    const octeti = ASTEPTATE.reduce((n, f) => n + statSync(join(DIST, 'admin', f)).size, 0);
    expect(octeti).toBeGreaterThan(100 * 1024);
  });
});
