import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CEDILLAS, COMMA_BELOW } from './cedilla';
import { INDEXABLE } from './site';

/*
 * WHAT THIS PROVES: that the content collection, the schema, the generator and
 * the pages are wired to each other in a real build. No unit test can — every
 * one of them runs against a fixture, and the joint they cannot see is the one
 * where `getCollection` hands `e.date` and `e.id` to a page or an endpoint.
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
 * empty string passes triumphantly. So every read goes through `read`,
 * which fails on a missing or empty file, and every "X is absent" claim is
 * paired with a positive control showing the detector can fire.
 */

const DIST = fileURLToPath(new URL('../../dist/', import.meta.url));
const CONTENT = fileURLToPath(new URL('../content/services/', import.meta.url));

/** RFC 5545 §3.1: the line break in an iCalendar stream is CRLF, always. */
const CRLF = '\r\n';

/** The file's text, having proved there was a file and that it had text in it. */
function read(path: string): string {
  expect(existsSync(DIST + path), `${path} lipsește din dist/`).toBe(true);
  const text = readFileSync(DIST + path, 'utf8');
  expect(text.length, `${path} există dar este gol`).toBeGreaterThan(0);
  return text;
}

/*
 * The forbidden characters are named by CODEPOINT and never written as glyphs,
 * the convention `diacritics.itest.ts` sets and explains: a file that spelled
 * them out could not itself be swept for them, and a `backslash-u` escape is
 * decoded into the literal character on the way to disk in this repo (see
 * CLAUDE.md), so the escape form is not a way round it either.
 *
 * `diacritics.itest.ts` owns the project-wide sweep over `dist/`, and `.ics` is
 * in its extension list, so the feed is covered there too. The assertions below
 * exist because that coverage is silent: nothing in this file would notice if
 * the feed dropped out of that sweep, and the feed is the one artefact where a
 * volunteer's `feast:` reaches a subscriber's phone unedited.
 *
 * The four numbers themselves now come from `./cedilla`, which is the only place
 * in this repository that writes them down. They were a third copy here.
 */

function containsAnyOf(text: string, codepoints: readonly number[]): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const cp = text.codePointAt(i);
    if (cp !== undefined && codepoints.includes(cp)) return true;
  }
  return false;
}

/**
 * RFC 5545 §3.1 unfolding: a continuation line begins with one whitespace
 * character, which is removed along with the CRLF before it. Without this, a
 * property long enough to fold would read as two lines and every per-property
 * assertion below would quietly stop seeing it.
 */
function unfold(ics: string): string[] {
  const lines: string[] = [];
  for (const rawLine of ics.split(CRLF)) {
    if (rawLine.startsWith(' ') && lines.length > 0) lines[lines.length - 1] += rawLine.slice(1);
    else if (rawLine.length > 0) lines.push(rawLine);
  }
  return lines;
}

/** The properties of each VEVENT, unfolded, in order. */
function events(ics: string): string[][] {
  const blocks: string[][] = [];
  let currentEvent: string[] | null = null;
  for (const line of unfold(ics)) {
    if (line === 'BEGIN:VEVENT') currentEvent = [];
    else if (line === 'END:VEVENT') {
      expect(currentEvent, 'END:VEVENT fără BEGIN:VEVENT').not.toBeNull();
      if (currentEvent) blocks.push(currentEvent);
      currentEvent = null;
    } else if (currentEvent) currentEvent.push(line);
  }
  expect(currentEvent, 'BEGIN:VEVENT fără END:VEVENT').toBeNull();
  return blocks;
}

/** Toate paginile HTML din `dist`, ca o cale relativă la `dist`. */
function builtPages(): string[] {
  const found: string[] = [];
  const walk = (relative: string): void => {
    for (const entry of readdirSync(DIST + relative, { withFileTypes: true })) {
      const path = relative + entry.name;
      if (entry.isDirectory()) walk(path + '/');
      else if (entry.name.endsWith('.html')) found.push(path);
    }
  };
  if (existsSync(DIST)) walk('');
  return found.sort();
}

/**
 * Fiecare referință către feed dintr-o pagină construită.
 *
 * `.ics` ORIUNDE în href, nu neapărat lipit de ghilimeaua de închidere. Forma
 * strânsă — `\.ics"` — a fost chiar gaura pe care acest fișier o astupa cu un
 * nivel mai devreme: `href="/program.ics/"` nu se mai potrivea, deci o
 * referință STRICATĂ ieșea din mulțimea verificată în loc să o facă să pice.
 * Numărul de potriviri scădea de la 2 la 1 și toate testele rămâneau verzi.
 *
 * Regula pe care o lasă în urmă: un tipar care alege ce să verifice trebuie să
 * prindă și formele greșite, altfel „nu s-a potrivit” devine sinonim cu „e în
 * regulă”. Perechea lui este `ICS_REFERENCES` de mai jos, care închide mulțimea
 * numărând — fără el, orice referință care încetează să se potrivească dispare
 * în tăcere, oricât de larg ar fi tiparul.
 */
function icsReferences(html: string): string[] {
  return [...html.matchAll(/href="([^"]*\.ics[^"]*)"/g)].map((m) => m[1] as string);
}

/**
 * Câte referințe către feed poartă fiecare pagină construită.
 *
 * Un număr exact per pagină, nu un minim și nu „măcar una undeva în sit”. Un
 * minim este mulțumit de `<link rel="alternate">` din `<head>`-ul lui
 * `Base.astro`, care ajunge pe fiecare pagină, deci nu poate să vadă nici
 * butonul șters, nici legătura din subsol stricată.
 *
 * MULȚIMEA ESTE ÎNCHISĂ: testul cere ca paginile din `dist` să fie exact
 * cheile de aici. O pagină nouă pică până când cineva îi scrie numărul —
 * inclusiv `admin/index.html` din Task 12, care probabil merită `0`, fiindcă
 * shell-ul CMS-ului nu se construiește din `Base.astro`. Acela este un răspuns
 * care se dă o dată, nu o slăbire a regulii.
 */
const ICS_REFERENCES: Record<string, number> = {
  // `<link rel="alternate">` din `<head>` + „Abonare la program (.ics)” din subsol.
  'index.html': 2,
  // Aceleași două, plus butonul de abonare de la piciorul paginii.
  'program/index.html': 3,
  /*
   * Zero, și este un răspuns, nu o omisiune. `public/admin/index.html` este
   * pagina-gazdă a CMS-ului: o etichetă `<script>` și atât, nu trece prin
   * `Base.astro`, deci nu are `<head>`-ul care poartă `<link rel="alternate">`
   * pe celelalte pagini. Un editor care intră acolo se abonează la calendar de
   * pe `/program/`, ca oricine altcineva.
   */
  'admin/index.html': 0,
};

/** Zilele pe care le are colecția, citite din numele fișierelor — cheia ei primară. */
function collectionDays(): string[] {
  return readdirSync(CONTENT)
    .filter((f) => f.endsWith('.yml'))
    .map((f) => f.slice(0, -'.yml'.length))
    .sort();
}

/**
 * Câte slujbe cuprinde colecția, adunate din toate zilele ei.
 *
 * O numărătoare de linii peste YAML, nu o analiză a lui: fișierele de program
 * scriu fiecare slujbă pe propriul rând, ca `- time: "07:30"`. Dacă cineva trece
 * vreodată la stil flow, numărul de aici scade și testul pică — zgomotos, cerând
 * să fie renumărat, nu în tăcere lăsând feed-ul să piardă slujbe.
 */
function collectionServices(): number {
  let n = 0;
  for (const f of readdirSync(CONTENT).filter((x) => x.endsWith('.yml'))) {
    n += [...readFileSync(CONTENT + f, 'utf8').matchAll(/^[ \t]*-[ \t]*time:/gm)].length;
  }
  return n;
}

const DAYS = collectionDays();

describe("this file's detectors can actually fire", () => {
  // Un control care nu poate să eșueze nu verifică nimic. Șirurile se
  // construiesc din coduri, exact ca mulțimile căutate.
  it.each(CEDILLAS)('prinde sedila %i', (cp) => {
    expect(containsAnyOf(`Înăl${String.fromCodePoint(cp)}area`, CEDILLAS)).toBe(true);
  });

  it('does not confuse comma below with cedilla', () => {
    const good = COMMA_BELOW.map((cp) => String.fromCodePoint(cp)).join('');
    expect(containsAnyOf(good, CEDILLAS)).toBe(false);
    expect(containsAnyOf(good, COMMA_BELOW)).toBe(true);
  });

  it('does not fire on a-breve, a-circumflex or i-circumflex', () => {
    const others = [0x0103, 0x00e2, 0x00ee].map((cp) => String.fromCodePoint(cp)).join('');
    expect(containsAnyOf(others, CEDILLAS)).toBe(false);
    expect(containsAnyOf(others, COMMA_BELOW)).toBe(false);
  });

  it('reading a file that does not exist fails, rather than passing vacuously', () => {
    expect(() => read('nu-exista-acest-fisier.ics')).toThrow();
  });

  it('the collection really does have days and services to compare', () => {
    expect(DAYS.length).toBeGreaterThan(0);
    expect(collectionServices()).toBeGreaterThanOrEqual(DAYS.length);
  });
});

describe('the build output', () => {
  it('was generated', () => {
    expect(read('index.html')).toContain('</html>');
  });

  it('includes the schedule page', () => {
    expect(read('program/index.html')).toContain('</html>');
  });

  it('emits the calendar feed', () => {
    expect(read('program.ics')).toContain('BEGIN:VCALENDAR');
  });
});

/*
 * Aserțiunile de mai jos se pot fixa pe conținutul colecției tocmai pentru că
 * feed-ul poartă fiecare zi a ei, oricare ar fi data build-ului.
 */
describe('the calendar feed carries the collection', () => {
  it('opens and closes as a VCALENDAR', () => {
    const ics = read('program.ics');
    const lines = unfold(ics);
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines[lines.length - 1]).toBe('END:VCALENDAR');
    // Un prag legat de conținut, nu un număr ales cu mâna: fiecare VEVENT are
    // cel puțin șase proprietăți între BEGIN și END. Un prag fix ar fi trecut
    // peste un feed retezat dacă parohia publică o singură zi și ar fi picat
    // degeaba dacă publică puține — adică ar fi vorbit despre calendarul
    // parohiei, nu despre fișier.
    expect(lines.length).toBeGreaterThan(events(ics).length * 6);
  });

  /*
   * Fiecare DTSTART și DTEND din feed spune `TZID=Europe/Zurich`. Fără blocul
   * care definește acel TZID, referința rămâne în gol și fiecare client ghicește
   * singur fusul — adică exact ora greșită pe telefonul unui parohian, fără ca
   * fișierul să pară stricat. Blocul este scris de `ics.ts` și nu depinde de
   * conținut, deci lipsa lui înseamnă întotdeauna o regresie.
   */
  it('defines the timezone every event names', () => {
    const lines = unfold(read('program.ics'));
    expect(lines).toContain('BEGIN:VTIMEZONE');
    expect(lines).toContain('TZID:Europe/Zurich');
    expect(lines).toContain('END:VTIMEZONE');
    expect(lines).toContain('BEGIN:DAYLIGHT');
    expect(lines).toContain('BEGIN:STANDARD');
  });

  // Egalitate de mulțimi, nu un exemplu: o zi pierdută pe drumul dintre
  // `getCollection` și feed cade aici, iar o zi adăugată în colecție nu cere
  // nicio modificare în acest test.
  it("carries exactly the collection's days, not one more, not one fewer", () => {
    const ics = read('program.ics');
    const fromFeed = [...ics.matchAll(/^DTSTART;TZID=Europe\/Zurich:(\d{4})(\d{2})(\d{2})T/gm)]
      .map((m) => `${m[1]}-${m[2]}-${m[3]}`);
    expect([...new Set(fromFeed)].sort()).toEqual(DAYS);
  });

  it("carries every service of the collection, not merely every day", () => {
    expect(events(read('program.ics')).length).toBe(collectionServices());
  });

  // Capătul celălalt al lanțului: `time` normalizată de schema, numele compus de
  // `serviceLabel` din `service` + `detail`, praznicul scris de un voluntar.
  it('carries the time, the composed name and the feast all the way into the feed', () => {
    const ics = read('program.ics');
    expect(ics).toContain('DTSTART;TZID=Europe/Zurich:20260914T073000');
    expect(ics).toContain('SUMMARY:Sfânta Liturghie și Parastas');
    expect(ics).toContain('Înălțarea Sfintei Cruci');
  });
});

describe('the feed respects the iCalendar format', () => {
  it('separates lines with CRLF, not with LF', () => {
    const ics = read('program.ics');
    expect(ics.endsWith(CRLF)).toBe(true);
    expect(/[^\r]\n/.test(ics), 'LF fără CR înaintea lui').toBe(false);
    expect(/\r[^\n]/.test(ics), 'CR fără LF după el').toBe(false);
  });

  /*
   * CE NU DOVEDEȘTE ACEST TEST: că împăturirea funcționează. Cea mai lungă
   * linie din feed-ul construit are 69 de octeți (`PRODID:`), iar liniile de
   * continuare sunt ZERO — conținutul parohiei nu se apropie de limită. Deci
   * aici scrie „nimic nu e prea lung”, nu „lucrurile lungi se împăturesc”, iar
   * dacă `fold` s-ar strica, acest test ar rămâne verde.
   *
   * Împăturirea este acoperită unde poate fi provocată, în `ics.test.ts`:
   * „continuă liniile împăturite cu un spațiu” (un `feast` de 200 de
   * caractere, cere continuări), „nu rupe un caracter multi-octet în două
   * linii”, și cazul de trei și patru octeți (liniuță lungă, CJK, emoji).
   * Rostul liniei de aici este celălalt: că un `feast` scris de un voluntar
   * nu poate face feed-ul REAL să depășească limita fără să se observe.
   */
  it('never exceeds 75 bytes per line', () => {
    const ics = read('program.ics');
    const lines = ics.split(CRLF);
    // Aceeași grijă ca mai sus: „am citit chiar liniile feed-ului” trebuie să
    // rămână adevărat și pentru o săptămână cu o singură slujbă.
    expect(lines.length).toBeGreaterThan(events(ics).length * 6);
    for (const line of lines) {
      expect(new TextEncoder().encode(line).length, line).toBeLessThanOrEqual(75);
    }
  });

  /*
   * DTSTAMP-ul este singurul câmp pe care acest capăt îl compune singur:
   * `generateIcs` îl primește ca parametru și nu îl validează, tocmai ca
   * ieșirea să fie deterministă în teste. Deci corectitudinea lui se verifică
   * aici sau nicăieri.
   *
   * Proprietatea, nu un exemplu, și fără ceas: forma exactă YYYYMMDDTHHMMSSZ,
   * plus un drum dus-întors prin `Date` care respinge o a 13-a lună sau o oră
   * 99 pe care simpla potrivire de cifre le-ar accepta. O aserțiune despre cât
   * de aproape este de „acum” ar fi tocmai genul de test pe care îl strică
   * trecerea timpului, nu o schimbare de cod.
   */
  it('stamps every event with a valid UTC DTSTAMP', () => {
    const blocks = events(read('program.ics'));
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      const line = block.find((l) => l.startsWith('DTSTAMP:'));
      expect(line, `VEVENT fără DTSTAMP: ${block.join(' | ')}`).toBeDefined();
      const stamp = (line as string).slice('DTSTAMP:'.length);
      const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(stamp);
      expect(m, `DTSTAMP prost format: ${stamp}`).not.toBeNull();
      const [, year, month, day, times, minutes, seconds] = m as RegExpExecArray;
      const d = new Date(Date.UTC(+year, +month - 1, +day, +times, +minutes, +seconds));
      expect(`${d.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`, 'DTSTAMP inexistent').toBe(stamp);
    }
  });

  it('gives every event the required fields and a UID of its own', () => {
    const blocks = events(read('program.ics'));
    expect(blocks.length).toBeGreaterThan(0);
    const uids: string[] = [];
    for (const block of blocks) {
      for (const key of ['UID:', 'DTSTAMP:', 'DTSTART;', 'DTEND;', 'SUMMARY:', 'LOCATION:']) {
        expect(block.some((l) => l.startsWith(key)), `lipsește ${key} din ${block.join(' | ')}`).toBe(true);
      }
      expect(block.find((l) => l.startsWith('DTSTART;'))).toMatch(
        /^DTSTART;TZID=Europe\/Zurich:\d{8}T\d{6}$/,
      );
      expect(block.find((l) => l.startsWith('DTEND;'))).toMatch(
        /^DTEND;TZID=Europe\/Zurich:\d{8}T\d{6}$/,
      );
      /*
       * Și ORDINEA lor, nu doar forma. RFC 5545 §3.6.1 cere ca DTEND să fie
       * după DTSTART, iar un eveniment de lungime zero se desenează
       * imprevizibil — pentru o parohie, ca o slujbă care pare că nu are loc.
       * Aserțiunea de formă de mai sus este la fel de mulțumită de două
       * ștampile egale.
       *
       * Comparație de șiruri: ambele sunt `YYYYMMDDTHHMMSS`, lățime fixă și în
       * același TZID, deci `>` este chiar ordinea cronologică a ceasului de
       * perete. Aritmetica de peste miezul nopții și cea de peste schimbarea
       * orei stau în `ics.test.ts`, unde pot fi construite anume.
       */
      const start = (block.find((l) => l.startsWith('DTSTART;')) as string).split(':')[1] as string;
      const end = (block.find((l) => l.startsWith('DTEND;')) as string).split(':')[1] as string;
      expect(end > start, `DTEND ${end} nu este după DTSTART ${start}`).toBe(true);
      uids.push(block.find((l) => l.startsWith('UID:')) as string);
    }
    // UID-uri identice fac ca două slujbe să se topească într-un singur eveniment
    // în calendarul fiecărui abonat, fără niciun semn.
    expect(new Set(uids).size).toBe(uids.length);
  });
});

describe('the feed keeps the comma-below diacritics', () => {
  it('contains no Turkish cedilla', () => {
    expect(containsAnyOf(read('program.ics'), CEDILLAS)).toBe(false);
  });

  // Fără acest control, aserțiunea de mai sus ar fi la fel de adevărată despre
  // un feed care nu mai conține niciun cuvânt românesc.
  it('does contain comma below', () => {
    expect(containsAnyOf(read('program.ics'), COMMA_BELOW)).toBe(true);
  });
});

describe('paginile construite', () => {
  it('the homepage has the schedule section', () => {
    const html = read('index.html');
    // „Programul slujbelor”, nu „Programul săptămânii”: titlul din `index.astro`
    // nu numără săptămâni tocmai pentru că numărul lor depinde de dată și de
    // JavaScript. Un titlu care numără ar fi fals în cel puțin una dintre stări.
    expect(html).toContain('Programul slujbelor');
    expect(html).toContain('Bine ați venit');
  });

  it('declares the Romanian language and correct diacritics', () => {
    for (const p of ['index.html', 'program/index.html']) {
      const html = read(p);
      expect(html, p).toContain('<html lang="ro"');
      expect(html, p).toContain('Sfântul Nicolae');
      expect(containsAnyOf(html, CEDILLAS), p).toBe(false);
      expect(containsAnyOf(html, COMMA_BELOW), p).toBe(true);
    }
  });

  /*
   * TREI GENERAȚII ALE ACELEIAȘI GREȘELI, pentru cine scrie a patra.
   *
   * 1. „href-ul apare în pagină” — `toContain('/program.ics')`. Verde tot timpul
   *    cât legătura a fost moartă, fiindcă atributul exista și fișierul nu.
   * 2. „href-ul pe care îl găsesc duce undeva” — se urmărea fiecare potrivire
   *    până la fișier. Mai bine, dar tiparul cerea `.ics` lipit de ghilimea:
   *    `href="/program.ics/"` nu se mai potrivea, deci IEȘEA din mulțimea
   *    verificată. Potrivirile scădeau de la 2 la 1 și nimic nu pica.
   * 3. Acesta. Tiparul prinde și formele greșite (`icsReferences`), iar numărul
   *    de referințe al fiecărei pagini este fixat (`ICS_REFERENCES`), deci o
   *    referință care încetează să se potrivească PICĂ în loc să dispară.
   *
   * De fiecare dată aserțiunea vorbea despre referințele găsite, nu despre
   * referințele care ar trebui să existe. Numărul este cel care închide
   * mulțimea; urmărirea până la fișier este cea care o leagă de realitate.
   * Trebuie amândouă: fără număr, un tipar larg tot pierde în tăcere ce nu se
   * potrivește; fără urmărire, numărul e mulțumit de o cale care nu există.
   */
  it('carries exactly the expected references to the feed, on every page', () => {
    const pages = builtPages();
    expect(pages.length, 'dist/ nu conține nicio pagină').toBeGreaterThan(0);
    expect(pages, 'o pagină construită nedeclarată în REFERINTE_ICS').toEqual(
      Object.keys(ICS_REFERENCES).sort(),
    );
    for (const page of pages) {
      expect(icsReferences(read(page)).length, page).toBe(ICS_REFERENCES[page]);
    }
  });

  it('every .ics reference in the output leads to a real file', () => {
    const pairs: [string, string][] = [];
    for (const page of builtPages()) {
      for (const href of icsReferences(read(page))) pairs.push([page, href]);
    }
    expect(pairs.length, 'nicio referință .ics în tot situl').toBeGreaterThan(0);
    for (const [page, href] of pairs) {
      // Absolută de la rădăcină, altfel `dist` + href nu este calea servită și
      // aserțiunea de mai jos ar întreba altceva decât pare că întreabă.
      expect(href.startsWith('/'), `${href} de pe ${page} nu este absolută`).toBe(true);
      /*
       * Interogarea și fragmentul se taie, fiindcă nu fac parte din calea pe
       * care o servește gazda: `/program.ics?v=2` livrează chiar acest fișier.
       * Tiparul de mai sus trebuie să fie WIDE, ca o referință stricată să nu
       * scape neverificată; aici trebuie să fie EXACT, ca o referință corectă
       * să nu pice degeaba. Lărgimea și severitatea nu se pun în același loc.
       * `/program.ics/` nu este atins de tăietura asta și pică în continuare —
       * o cale de director nu este un fișier.
       */
      const path = href.slice(1).split(/[?#]/)[0] as string;
      expect(read(path), `${href} de pe ${page}`).toContain('BEGIN:VCALENDAR');
    }
  });

  /*
   * Cele două de mai sus numără referințele și le urmăresc până la fișier.
   * Niciuna nu poate deosebi o ancoră de un `<link>`: butonul șters și un
   * `<link>` rătăcit pus în locul lui țin numărul tot la trei și tot rezolvă.
   * Aceasta numește ancorele după TEXTUL lor, adică după ce apasă cineva.
   *
   * Prima formă a ei — „pagina de program are o legătură .ics” — era adevărată
   * și cu butonul șters cu totul, fiindcă `<link rel="alternate">` din
   * `Base.astro` stă în `<head>`-ul fiecărei pagini. O aserțiune care nu poate
   * să pice este mai rea decât niciuna: pare că păzește ceva.
   */
  /*
   * INDEXAREA ȘI CANONICUL SUNT O SINGURĂ DECIZIE CU DOUĂ CONSECINȚE, iar o
   * construcție întoarsă pe jumătate este ce se previne aici.
   *
   * În Faza 1 situl stă la `<project>.pages.dev`, în timp ce `www.bor-zh.ch`
   * răspunde încă cu instalarea WordPress compromisă. Deci nu există un canonic
   * care merită emis — cel pe care îl dădea `Astro.site` trimitea motoarele de
   * căutare chiar la instalarea aceea — și gazda temporară nu are ce căuta într-un
   * index. `INDEXABLE` din `lib/site.ts` decide amândouă, iar testul acesta
   * verifică amândouă direcțiile: cu steagul pe `false` fiecare pagină are meta
   * noindex și niciun canonic, cu el pe `true` exact invers. Așa nu se poate
   * întoarce una fără cealaltă la mutarea domeniului.
   */
  it('every visitor page matches INDEXABLE, in both directions', () => {
    /*
     * `admin/index.html` este în afara acestui test, pe cale, și rămâne așa. Nu
     * trece prin `Base.astro`, poartă propriul `noindex, nofollow` plus
     * `X-Robots-Tag` din `_headers`, și trebuie să rămână neindexată PENTRU
     * TOTDEAUNA — inclusiv după mutarea domeniului, când steagul se întoarce.
     * Fără excluderea asta, testul ar cere la mutare un canonic pe shell-ul
     * CMS-ului și niciun noindex pe el, adică exact pe dos.
     */
    const pages = builtPages().filter((p) => p !== 'admin/index.html');
    expect(pages.length, 'dist/ nu conține nicio pagină de vizitator').toBeGreaterThan(0);
    expect(builtPages(), 'admin/index.html chiar trebuie să existe, ca excluderea să însemne ceva')
      .toContain('admin/index.html');
    const canonicals: string[] = [];
    for (const page of pages) {
      const html = read(page);
      const canonical = [...html.matchAll(/<link\b[^>]*rel="canonical"[^>]*href="([^"]*)"/g)].map((m) => m[1] as string);
      const noindex = /<meta\b[^>]*name="robots"[^>]*content="[^"]*noindex/.test(html);
      expect(canonical.length, `canonice pe ${page}`).toBe(INDEXABLE ? 1 : 0);
      expect(noindex, `meta robots noindex pe ${page}`).toBe(!INDEXABLE);
      canonicals.push(...canonical);
    }
    /*
     * Nu se verifică aici ce GAZDĂ numește canonicul. După mutarea domeniului
     * `www.bor-zh.ch` va fi chiar situl acesta, deci ar fi gazda corectă; astăzi
     * ar fi cea compromisă. Diferența nu este în ieșire, ci în ce servește DNS-ul,
     * și niciun test din depozitul acesta nu poate să o vadă. Ce se poate ține
     * este cuplarea: cât timp nu suntem indexabili, nu se emite niciun canonic.
     */
    process.stdout.write(
      `\nINDEXABIL=${INDEXABLE} peste ${pages.length} pagină(i) de vizitator: ` +
        `${canonicals.length} canonic(e), ${INDEXABLE ? 0 : pages.length} meta noindex.\n`,
    );
  });

  it('keeps the subscribe anchors somebody actually clicks', () => {
    const labels = [
      ...read('program/index.html').matchAll(/<a\b[^>]*href="\/program\.ics"[^>]*>([\s\S]*?)<\/a>/g),
    ].map((m) => (m[1] as string).trim());
    expect(labels).toContain('† Adaugă programul în calendarul telefonului');
    expect(labels).toContain('Abonare la program (.ics)');
  });
});
