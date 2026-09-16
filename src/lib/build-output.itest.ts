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
 * regulă”. Perechea lui este `REFERINTE_ICS` de mai jos, care închide mulțimea
 * numărând — fără el, orice referință care încetează să se potrivească dispare
 * în tăcere, oricât de larg ar fi tiparul.
 */
function referinteIcs(html: string): string[] {
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
const REFERINTE_ICS: Record<string, number> = {
  // `<link rel="alternate">` din `<head>` + „Abonare la program (.ics)” din subsol.
  'index.html': 2,
  // Aceleași două, plus butonul de abonare de la piciorul paginii.
  'program/index.html': 3,
};

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
    const ics = citeste('program.ics');
    const linii = desfasoara(ics);
    expect(linii[0]).toBe('BEGIN:VCALENDAR');
    expect(linii[linii.length - 1]).toBe('END:VCALENDAR');
    // Un prag legat de conținut, nu un număr ales cu mâna: fiecare VEVENT are
    // cel puțin șase proprietăți între BEGIN și END. Un prag fix ar fi trecut
    // peste un feed retezat dacă parohia publică o singură zi și ar fi picat
    // degeaba dacă publică puține — adică ar fi vorbit despre calendarul
    // parohiei, nu despre fișier.
    expect(linii.length).toBeGreaterThan(evenimente(ics).length * 6);
  });

  /*
   * Fiecare DTSTART și DTEND din feed spune `TZID=Europe/Zurich`. Fără blocul
   * care definește acel TZID, referința rămâne în gol și fiecare client ghicește
   * singur fusul — adică exact ora greșită pe telefonul unui parohian, fără ca
   * fișierul să pară stricat. Blocul este scris de `ics.ts` și nu depinde de
   * conținut, deci lipsa lui înseamnă întotdeauna o regresie.
   */
  it('definește fusul orar pe care îl numesc toate evenimentele', () => {
    const linii = desfasoara(citeste('program.ics'));
    expect(linii).toContain('BEGIN:VTIMEZONE');
    expect(linii).toContain('TZID:Europe/Zurich');
    expect(linii).toContain('END:VTIMEZONE');
    expect(linii).toContain('BEGIN:DAYLIGHT');
    expect(linii).toContain('BEGIN:STANDARD');
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

  /*
   * CE NU DOVEDEȘTE ACEST TEST: că împăturirea funcționează. Cea mai lungă
   * linie din feed-ul construit are 69 de octeți (`PRODID:`), iar liniile de
   * continuare sunt ZERO — conținutul parohiei nu se apropie de limită. Deci
   * aici scrie „nimic nu e prea lung”, nu „lucrurile lungi se împăturesc”, iar
   * dacă `impatureste` s-ar strica, acest test ar rămâne verde.
   *
   * Împăturirea este acoperită unde poate fi provocată, în `ics.test.ts`:
   * „continuă liniile împăturite cu un spațiu” (un `praznic` de 200 de
   * caractere, cere continuări), „nu rupe un caracter multi-octet în două
   * linii”, și cazul de trei și patru octeți (liniuță lungă, CJK, emoji).
   * Rostul liniei de aici este celălalt: că un `praznic` scris de un voluntar
   * nu poate face feed-ul REAL să depășească limita fără să se observe.
   */
  it('nu depășește 75 de octeți pe linie', () => {
    const ics = citeste('program.ics');
    const linii = ics.split(CRLF);
    // Aceeași grijă ca mai sus: „am citit chiar liniile feed-ului” trebuie să
    // rămână adevărat și pentru o săptămână cu o singură slujbă.
    expect(linii.length).toBeGreaterThan(evenimente(ics).length * 6);
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
      const start = (bloc.find((l) => l.startsWith('DTSTART;')) as string).split(':')[1] as string;
      const sfarsit = (bloc.find((l) => l.startsWith('DTEND;')) as string).split(':')[1] as string;
      expect(sfarsit > start, `DTEND ${sfarsit} nu este după DTSTART ${start}`).toBe(true);
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
   * TREI GENERAȚII ALE ACELEIAȘI GREȘELI, pentru cine scrie a patra.
   *
   * 1. „href-ul apare în pagină” — `toContain('/program.ics')`. Verde tot timpul
   *    cât legătura a fost moartă, fiindcă atributul exista și fișierul nu.
   * 2. „href-ul pe care îl găsesc duce undeva” — se urmărea fiecare potrivire
   *    până la fișier. Mai bine, dar tiparul cerea `.ics` lipit de ghilimea:
   *    `href="/program.ics/"` nu se mai potrivea, deci IEȘEA din mulțimea
   *    verificată. Potrivirile scădeau de la 2 la 1 și nimic nu pica.
   * 3. Acesta. Tiparul prinde și formele greșite (`referinteIcs`), iar numărul
   *    de referințe al fiecărei pagini este fixat (`REFERINTE_ICS`), deci o
   *    referință care încetează să se potrivească PICĂ în loc să dispară.
   *
   * De fiecare dată aserțiunea vorbea despre referințele găsite, nu despre
   * referințele care ar trebui să existe. Numărul este cel care închide
   * mulțimea; urmărirea până la fișier este cea care o leagă de realitate.
   * Trebuie amândouă: fără număr, un tipar larg tot pierde în tăcere ce nu se
   * potrivește; fără urmărire, numărul e mulțumit de o cale care nu există.
   */
  it('poartă exact referințele așteptate către feed, pe fiecare pagină', () => {
    const pagini = paginiConstruite();
    expect(pagini.length, 'dist/ nu conține nicio pagină').toBeGreaterThan(0);
    expect(pagini, 'o pagină construită nedeclarată în REFERINTE_ICS').toEqual(
      Object.keys(REFERINTE_ICS).sort(),
    );
    for (const pagina of pagini) {
      expect(referinteIcs(citeste(pagina)).length, pagina).toBe(REFERINTE_ICS[pagina]);
    }
  });

  it('fiecare referință .ics din ieșire duce la un fișier real', () => {
    const perechi: [string, string][] = [];
    for (const pagina of paginiConstruite()) {
      for (const href of referinteIcs(citeste(pagina))) perechi.push([pagina, href]);
    }
    expect(perechi.length, 'nicio referință .ics în tot situl').toBeGreaterThan(0);
    for (const [pagina, href] of perechi) {
      // Absolută de la rădăcină, altfel `dist` + href nu este calea servită și
      // aserțiunea de mai jos ar întreba altceva decât pare că întreabă.
      expect(href.startsWith('/'), `${href} de pe ${pagina} nu este absolută`).toBe(true);
      /*
       * Interogarea și fragmentul se taie, fiindcă nu fac parte din calea pe
       * care o servește gazda: `/program.ics?v=2` livrează chiar acest fișier.
       * Tiparul de mai sus trebuie să fie LARG, ca o referință stricată să nu
       * scape neverificată; aici trebuie să fie EXACT, ca o referință corectă
       * să nu pice degeaba. Lărgimea și severitatea nu se pun în același loc.
       * `/program.ics/` nu este atins de tăietura asta și pică în continuare —
       * o cale de director nu este un fișier.
       */
      const cale = href.slice(1).split(/[?#]/)[0] as string;
      expect(citeste(cale), `${href} de pe ${pagina}`).toContain('BEGIN:VCALENDAR');
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
  it('păstrează ancorele de abonare pe care le apasă cineva', () => {
    const etichete = [
      ...citeste('program/index.html').matchAll(/<a\b[^>]*href="\/program\.ics"[^>]*>([\s\S]*?)<\/a>/g),
    ].map((m) => (m[1] as string).trim());
    expect(etichete).toContain('† Adaugă programul în calendarul telefonului');
    expect(etichete).toContain('Abonare la program (.ics)');
  });
});
