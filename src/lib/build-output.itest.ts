import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * WHAT THIS PROVES: that the content collection, the schema, the generator and
 * the pages are wired to each other in a real build. No unit test can — every
 * one of them runs against a fixture, and the joint they cannot see is the one
 * where `getCollection` hands `e.data` and `e.id` to a page or an endpoint.
 *
 * It reads `dist/`, so it runs only after a build: `npm run test:build`.
 *
 * NOTHING HERE MAY PIN A DATE AGAINST THE PAGES. The homepage and `/program/`
 * render only the current and future weeks, so `toContain('data-saptamana=
 * "2026-W38"')` would pass today and start failing on 21 September 2026 — a
 * red suite caused by the calendar rather than by a change anyone made. The
 * `.ics` is different in kind: it emits every seeded day whatever the build
 * date, so date-specific claims belong there and only there.
 *
 * A GUARD THAT READS A FILE MUST PROVE IT READ SOMETHING. `existsSync` answers
 * a different question from "did I get bytes", and `not.toMatch` against an
 * empty string passes triumphantly. So every read goes through `citeste`,
 * which fails on a missing or empty file, and every "X is absent" claim is
 * paired with a positive control showing the detector can fire.
 */

const DIST = fileURLToPath(new URL('../../dist/', import.meta.url));
const CONTINUT = fileURLToPath(new URL('../content/slujbe/', import.meta.url));

/** RFC 5545 §3.1: the line break in an iCalendar stream is CRLF, always. */
const CRLF = '\r\n';

/** The file's text, having proved there was a file and that it had text in it. */
function citeste(cale: string): string {
  expect(existsSync(DIST + cale), `${cale} lipsește din dist/`).toBe(true);
  const text = readFileSync(DIST + cale, 'utf8');
  expect(text.length, `${cale} există dar este gol`).toBeGreaterThan(0);
  return text;
}

/*
 * The forbidden characters are named by CODEPOINT and never written as glyphs,
 * the convention `diacritice.itest.ts` sets and explains: a file that spelled
 * them out could not itself be swept for them, and a `backslash-u` escape is
 * decoded into the literal character on the way to disk in this repo (see
 * CLAUDE.md), so the escape form is not a way round it either.
 *
 * `diacritice.itest.ts` owns the project-wide sweep, and `.ics` is in its
 * extension list, so the feed is covered there too. These two lines exist
 * because that coverage is silent: nothing in this file would notice if the
 * feed dropped out of that sweep, and the feed is the one artefact where a
 * volunteer's `praznic:` reaches a subscriber's phone unedited.
 */
/** Turkish cedilla forms: capital/small S, capital/small T. */
const CEDILE = [0x015e, 0x015f, 0x0162, 0x0163];
/** The Romanian comma-below forms they are mistaken for. */
const VIRGULA_DEDESUBT = [0x0218, 0x0219, 0x021a, 0x021b];

function areVreunul(text: string, coduri: readonly number[]): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const cp = text.codePointAt(i);
    if (cp !== undefined && coduri.includes(cp)) return true;
  }
  return false;
}

/**
 * RFC 5545 §3.1 unfolding: a continuation line begins with one whitespace
 * character, which is removed along with the CRLF before it. Without this, a
 * property long enough to fold would read as two lines and every per-property
 * assertion below would quietly stop seeing it.
 */
function desfasoara(ics: string): string[] {
  const linii: string[] = [];
  for (const bruta of ics.split(CRLF)) {
    if (bruta.startsWith(' ') && linii.length > 0) linii[linii.length - 1] += bruta.slice(1);
    else if (bruta.length > 0) linii.push(bruta);
  }
  return linii;
}

/** The properties of each VEVENT, unfolded, in order. */
function evenimente(ics: string): string[][] {
  const blocuri: string[][] = [];
  let curent: string[] | null = null;
  for (const linie of desfasoara(ics)) {
    if (linie === 'BEGIN:VEVENT') curent = [];
    else if (linie === 'END:VEVENT') {
      expect(curent, 'END:VEVENT fără BEGIN:VEVENT').not.toBeNull();
      if (curent) blocuri.push(curent);
      curent = null;
    } else if (curent) curent.push(linie);
  }
  expect(curent, 'BEGIN:VEVENT fără END:VEVENT').toBeNull();
  return blocuri;
}

/** Toate paginile HTML din `dist`, ca o cale relativă la `dist`. */
function paginiConstruite(): string[] {
  const gasite: string[] = [];
  const mergi = (relativ: string): void => {
    for (const intrare of readdirSync(DIST + relativ, { withFileTypes: true })) {
      const cale = relativ + intrare.name;
      if (intrare.isDirectory()) mergi(cale + '/');
      else if (intrare.name.endsWith('.html')) gasite.push(cale);
    }
  };
  if (existsSync(DIST)) mergi('');
  return gasite.sort();
}

/** Zilele pe care le are colecția, citite din numele fișierelor — cheia ei primară. */
function zileleDinColectie(): string[] {
  return readdirSync(CONTINUT)
    .filter((f) => f.endsWith('.yml'))
    .map((f) => f.slice(0, -'.yml'.length))
    .sort();
}

/**
 * Câte slujbe cuprinde colecția, adunate din toate zilele ei.
 *
 * O numărătoare de linii peste YAML, nu o analiză a lui: fișierele de program
 * scriu fiecare slujbă pe propriul rând, ca `- ora: "07:30"`. Dacă cineva trece
 * vreodată la stil flow, numărul de aici scade și testul pică — zgomotos, cerând
 * să fie renumărat, nu în tăcere lăsând feed-ul să piardă slujbe.
 */
function slujbeInColectie(): number {
  let n = 0;
  for (const f of readdirSync(CONTINUT).filter((x) => x.endsWith('.yml'))) {
    n += [...readFileSync(CONTINUT + f, 'utf8').matchAll(/^[ \t]*-[ \t]*ora:/gm)].length;
  }
  return n;
}

const ZILE = zileleDinColectie();

describe('detectoarele acestui fișier pot să se declanșeze', () => {
  // Un control care nu poate să eșueze nu verifică nimic. Șirurile se
  // construiesc din coduri, exact ca mulțimile căutate.
  it.each(CEDILE)('prinde sedila %i', (cp) => {
    expect(areVreunul(`Înăl${String.fromCodePoint(cp)}area`, CEDILE)).toBe(true);
  });

  it('nu confundă virgula dedesubt cu sedila', () => {
    const bun = VIRGULA_DEDESUBT.map((cp) => String.fromCodePoint(cp)).join('');
    expect(areVreunul(bun, CEDILE)).toBe(false);
    expect(areVreunul(bun, VIRGULA_DEDESUBT)).toBe(true);
  });

  it('nu se declanșează pe a-breve, a-circumflex sau i-circumflex', () => {
    const altele = [0x0103, 0x00e2, 0x00ee].map((cp) => String.fromCodePoint(cp)).join('');
    expect(areVreunul(altele, CEDILE)).toBe(false);
    expect(areVreunul(altele, VIRGULA_DEDESUBT)).toBe(false);
  });

  it('citirea unui fișier inexistent eșuează, nu trece în gol', () => {
    expect(() => citeste('nu-exista-acest-fisier.ics')).toThrow();
  });

  it('colecția chiar are zile și slujbe de comparat', () => {
    expect(ZILE.length).toBeGreaterThan(0);
    expect(slujbeInColectie()).toBeGreaterThanOrEqual(ZILE.length);
  });
});

describe('ieșirea build-ului', () => {
  it('a fost generată', () => {
    expect(citeste('index.html')).toContain('</html>');
  });

  it('cuprinde pagina de program', () => {
    expect(citeste('program/index.html')).toContain('</html>');
  });

  it('emite feed-ul de calendar', () => {
    expect(citeste('program.ics')).toContain('BEGIN:VCALENDAR');
  });
});

/*
 * Aserțiunile de mai jos se pot fixa pe conținutul colecției tocmai pentru că
 * feed-ul poartă fiecare zi a ei, oricare ar fi data build-ului.
 */
describe('feed-ul de calendar poartă colecția', () => {
  it('se deschide și se închide ca un VCALENDAR', () => {
    const linii = desfasoara(citeste('program.ics'));
    expect(linii[0]).toBe('BEGIN:VCALENDAR');
    expect(linii[linii.length - 1]).toBe('END:VCALENDAR');
    expect(linii.length).toBeGreaterThan(30);
  });

  // Egalitate de mulțimi, nu un exemplu: o zi pierdută pe drumul dintre
  // `getCollection` și feed cade aici, iar o zi adăugată în colecție nu cere
  // nicio modificare în acest test.
  it('poartă exact zilele colecției, nici una în plus, nici una în minus', () => {
    const ics = citeste('program.ics');
    const dinFeed = [...ics.matchAll(/^DTSTART;TZID=Europe\/Zurich:(\d{4})(\d{2})(\d{2})T/gm)]
      .map((m) => `${m[1]}-${m[2]}-${m[3]}`);
    expect([...new Set(dinFeed)].sort()).toEqual(ZILE);
  });

  it('poartă fiecare slujbă a colecției, nu doar fiecare zi', () => {
    expect(evenimente(citeste('program.ics')).length).toBe(slujbeInColectie());
  });

  // Capătul celălalt al lanțului: `ora` normalizată de schema, numele compus de
  // `etichetaSlujba` din `slujba` + `detaliu`, praznicul scris de un voluntar.
  it('duce ora, numele compus și praznicul până în feed', () => {
    const ics = citeste('program.ics');
    expect(ics).toContain('DTSTART;TZID=Europe/Zurich:20260914T073000');
    expect(ics).toContain('SUMMARY:Sfânta Liturghie și Parastas');
    expect(ics).toContain('Înălțarea Sfintei Cruci');
  });
});

describe('feed-ul respectă formatul iCalendar', () => {
  it('desparte liniile cu CRLF, nu cu LF', () => {
    const ics = citeste('program.ics');
    expect(ics.endsWith(CRLF)).toBe(true);
    expect(/[^\r]\n/.test(ics), 'LF fără CR înaintea lui').toBe(false);
    expect(/\r[^\n]/.test(ics), 'CR fără LF după el').toBe(false);
  });

  it('nu depășește 75 de octeți pe linie', () => {
    const linii = citeste('program.ics').split(CRLF);
    expect(linii.length).toBeGreaterThan(30);
    for (const linie of linii) {
      expect(new TextEncoder().encode(linie).length, linie).toBeLessThanOrEqual(75);
    }
  });

  /*
   * DTSTAMP-ul este singurul câmp pe care acest capăt îl compune singur:
   * `genereazaIcs` îl primește ca parametru și nu îl validează, tocmai ca
   * ieșirea să fie deterministă în teste. Deci corectitudinea lui se verifică
   * aici sau nicăieri.
   *
   * Proprietatea, nu un exemplu, și fără ceas: forma exactă YYYYMMDDTHHMMSSZ,
   * plus un drum dus-întors prin `Date` care respinge o a 13-a lună sau o oră
   * 99 pe care simpla potrivire de cifre le-ar accepta. O aserțiune despre cât
   * de aproape este de „acum” ar fi tocmai genul de test pe care îl strică
   * trecerea timpului, nu o schimbare de cod.
   */
  it('ștampilează fiecare eveniment cu un DTSTAMP UTC valid', () => {
    const blocuri = evenimente(citeste('program.ics'));
    expect(blocuri.length).toBeGreaterThan(0);
    for (const bloc of blocuri) {
      const linie = bloc.find((l) => l.startsWith('DTSTAMP:'));
      expect(linie, `VEVENT fără DTSTAMP: ${bloc.join(' | ')}`).toBeDefined();
      const stampila = (linie as string).slice('DTSTAMP:'.length);
      const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(stampila);
      expect(m, `DTSTAMP prost format: ${stampila}`).not.toBeNull();
      const [, an, luna, zi, ore, minute, secunde] = m as RegExpExecArray;
      const d = new Date(Date.UTC(+an, +luna - 1, +zi, +ore, +minute, +secunde));
      expect(`${d.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`, 'DTSTAMP inexistent').toBe(stampila);
    }
  });

  it('dă fiecărui eveniment câmpurile obligatorii și un UID propriu', () => {
    const blocuri = evenimente(citeste('program.ics'));
    expect(blocuri.length).toBeGreaterThan(0);
    const uiduri: string[] = [];
    for (const bloc of blocuri) {
      for (const cheie of ['UID:', 'DTSTAMP:', 'DTSTART;', 'DTEND;', 'SUMMARY:', 'LOCATION:']) {
        expect(bloc.some((l) => l.startsWith(cheie)), `lipsește ${cheie} din ${bloc.join(' | ')}`).toBe(true);
      }
      expect(bloc.find((l) => l.startsWith('DTSTART;'))).toMatch(
        /^DTSTART;TZID=Europe\/Zurich:\d{8}T\d{6}$/,
      );
      expect(bloc.find((l) => l.startsWith('DTEND;'))).toMatch(
        /^DTEND;TZID=Europe\/Zurich:\d{8}T\d{6}$/,
      );
      uiduri.push(bloc.find((l) => l.startsWith('UID:')) as string);
    }
    // UID-uri identice fac ca două slujbe să se topească într-un singur eveniment
    // în calendarul fiecărui abonat, fără niciun semn.
    expect(new Set(uiduri).size).toBe(uiduri.length);
  });
});

describe('feed-ul păstrează diacriticele cu virgulă dedesubt', () => {
  it('nu conține nicio sedilă turcească', () => {
    expect(areVreunul(citeste('program.ics'), CEDILE)).toBe(false);
  });

  // Fără acest control, aserțiunea de mai sus ar fi la fel de adevărată despre
  // un feed care nu mai conține niciun cuvânt românesc.
  it('conține totuși virgulă dedesubt', () => {
    expect(areVreunul(citeste('program.ics'), VIRGULA_DEDESUBT)).toBe(true);
  });
});

describe('paginile construite', () => {
  it('pagina de pornire are secțiunea de program', () => {
    const html = citeste('index.html');
    // „Programul slujbelor”, nu „Programul săptămânii”: titlul din `index.astro`
    // nu numără săptămâni tocmai pentru că numărul lor depinde de dată și de
    // JavaScript. Un titlu care numără ar fi fals în cel puțin una dintre stări.
    expect(html).toContain('Programul slujbelor');
    expect(html).toContain('Bine ați venit în casa Domnului');
  });

  it('declară limba română și diacritice corecte', () => {
    for (const p of ['index.html', 'program/index.html']) {
      const html = citeste(p);
      expect(html, p).toContain('<html lang="ro"');
      expect(html, p).toContain('Sfântul Nicolae');
      expect(areVreunul(html, CEDILE), p).toBe(false);
      expect(areVreunul(html, VIRGULA_DEDESUBT), p).toBe(true);
    }
  });

  /*
   * Legăturile către feed au existat de la Task 6 și nu au dus nicăieri până la
   * Task 11 — nu doar butonul de pe `/program/`, ci și `<link rel="alternate">`
   * din `Base.astro` și „Abonare la program (.ics)” din subsol, adică de trei
   * ori pe FIECARE pagină a sitului.
   *
   * Deci legătura se urmărește până la fișier, în loc să se caute șirul
   * „/program.ics” în pagină: un `toContain` pe text ar fi trecut cu brio în
   * toată perioada în care legătura era ruptă. Și se caută pe toate paginile
   * construite, nu pe una aleasă dinainte, ca o pagină nouă cu o legătură
   * greșită să nu treacă neobservată.
   */
  it('fiecare legătură .ics din ieșire duce la un fișier real', () => {
    const pagini = paginiConstruite();
    expect(pagini.length, 'dist/ nu conține nicio pagină').toBeGreaterThan(0);
    const perechi: [string, string][] = [];
    for (const pagina of pagini) {
      for (const m of citeste(pagina).matchAll(/href="(\/[^"]*\.ics)"/g)) {
        perechi.push([pagina, m[1] as string]);
      }
    }
    expect(perechi.length, 'nicio legătură .ics în tot situl').toBeGreaterThan(0);
    for (const [pagina, href] of perechi) {
      expect(citeste(href.slice(1)), `${href} de pe ${pagina}`).toContain('BEGIN:VCALENDAR');
    }
  });

  /*
   * Aserțiunea de mai sus spune că legăturile care EXISTĂ duc undeva; aceasta
   * spune că ele există. Și sunt numite după textul lor, nu după pagină: o
   * mutație a arătat că „pagina de program are o legătură .ics” este adevărată
   * și cu butonul șters cu totul, fiindcă `<link rel="alternate">` din
   * `Base.astro` stă în `<head>`-ul fiecărei pagini. O aserțiune care nu poate
   * să pice este mai rea decât niciuna: pare că păzește ceva.
   */
  it('păstrează ancorele de abonare pe care le apasă cineva', () => {
    const etichete = [
      ...citeste('program/index.html').matchAll(/<a\b[^>]*href="\/program\.ics"[^>]*>([\s\S]*?)<\/a>/g),
    ].map((m) => (m[1] as string).trim());
    expect(etichete).toContain('† Adaugă programul în calendarul telefonului');
    expect(etichete).toContain('Abonare la program (.ics)');
  });
});
