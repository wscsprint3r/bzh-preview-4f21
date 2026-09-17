import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { ziSchema } from './schema';
import { CATEGORII, articolSchema, paginaSchema, setariSchema } from './schema-continut';

/*
 * CE DOVEDEȘTE FIȘIERUL ACESTA: cele trei scheme chiar resping ce nu trebuie să
 * treacă, nu doar acceptă ce trebuie - și o spun în română, numind câmpul.
 *
 * O schemă este ușor de testat prost. Un test care ia o valoare validă, o
 * împrăștie cu `...` și verifică apoi că schema o acceptă trece la fel de bine
 * și dacă schema nu are nicio regulă: expectativa nu vine din ce ar trebui să
 * fie, ci din aceeași sursă cu lucrul verificat.
 *
 * PRIMA VERSIUNE A ACESTUI FIȘIER A PICAT EXACT ÎN ACEA GROAPĂ, și merită scris
 * aici fiindcă a fost găsită de altcineva. Avea câte un test pentru fiecare
 * REGULĂ, dar niciunul pentru OBLIGATIVITATE: se puteau face neobligatorii 10
 * din cele 11 câmpuri cerute și toate cele 34 de teste rămâneau verzi. Un
 * articol fără dată sau un `setari.yml` fără adresă este tocmai felul în care
 * fișierele astea se strică - omul șterge o linie, build-ul rămâne verde, iar
 * adresa parohiei dispare din subsolul sitului. Lista de mutații fusese scrisă
 * de aceeași mână cu testele, așa că a acoperit numai ce era deja acoperit.
 *
 * Deci: pentru fiecare câmp cerut există un test că lipsa lui pică, și pentru
 * fiecare mesaj există un test pe TEXTUL lui. Un `.toThrow()` gol nu vede
 * diferența dintre mesajul potrivit și unul care numește alt câmp - și chiar
 * asta se întâmplase: `adresa` și `telefon` răspundeau amândouă „Titlul nu
 * poate fi gol.”.
 */

const ARTICOL_MINIM = {
  titlu: 'Hramul parohiei',
  data: '2025-11-05',
  categorie: 'Noutati',
  publicat: true,
};

const PAGINA_MINIMA = { titlu: 'Istoric', cale: 'parohia/istoric', ordine: 10 };

const SETARI_MINIME = {
  nume: 'Parohia Ortodoxă Română Sfântul Nicolae',
  adresa: 'Wehntalerstrasse 451, 8046 Zürich',
  telefon: '076 512 04 52',
  email: 'contact@bor-zh.ch',
};

/** Aceeași valoare, fără un câmp - fără să strice originalul. */
const fara = (obiect: Record<string, unknown>, camp: string) => {
  const copie = { ...obiect };
  delete copie[camp];
  return copie;
};

describe('CATEGORII', () => {
  /*
   * Scrisă cu mâna, nu luată din `CATEGORII`, fiindcă mulțimea asta este un
   * contract între trei task-uri: Task 6 oprește migrarea la o categorie din
   * afara ei, iar Task 11 construiește lista din CMS din ea. Un test care ar
   * compara `CATEGORII` cu ea însăși ar fi mulțumit de orice.
   */
  it('este exact mulțimea pe care o scrie migrarea', () => {
    expect([...CATEGORII]).toEqual(['Noutati', 'Cateheza']);
  });
});

describe('articolSchema', () => {
  it('acceptă un articol minim', () => {
    expect(articolSchema.parse(ARTICOL_MINIM).titlu).toBe('Hramul parohiei');
  });

  it('acceptă câmpurile neobligatorii când sunt date', () => {
    const a = articolSchema.parse({
      ...ARTICOL_MINIM,
      rezumat: 'Câteva rânduri.',
      imagine: '/media/hram.jpg',
    });
    expect(a.rezumat).toBe('Câteva rânduri.');
    expect(a.imagine).toBe('/media/hram.jpg');
  });

  /*
   * OBLIGATIVITATEA, câmp cu câmp. Fiecare caz șterge exact un câmp și cere ca
   * mesajul să îl numească pe acela; un `.toThrow()` gol ar fi trecut și dacă
   * toate patru ar fi răspuns la fel.
   */
  const CERUTE: [string, RegExp][] = [
    ['titlu', /Articolul trebuie să aibă un titlu\./],
    ['data', /Articolul trebuie să aibă o dată/],
    ['publicat', /trebuie să spună dacă este publicat/],
    ['categorie', /Articolul trebuie să aibă o categorie/],
  ];
  for (const [camp, mesaj] of CERUTE) {
    it(`cere câmpul ${camp}`, () => {
      expect(() => articolSchema.parse(fara(ARTICOL_MINIM, camp))).toThrow(mesaj);
    });
  }

  it('respinge o cheie scrisă greșit, în română', () => {
    // Greșeala cea mai probabilă din CMS, și singura care altfel ar pierde un
    // câmp pe un build verde.
    expect(() => articolSchema.parse({ ...ARTICOL_MINIM, publicatt: true })).toThrow(
      /Câmp necunoscut: publicatt\. Verificați scrierea\./,
    );
  });

  it('cere o dată reală, nu doar ceva în formă de dată', () => {
    expect(() => articolSchema.parse({ ...ARTICOL_MINIM, data: '2025-02-30' })).toThrow(
      /Data trebuie să fie o zi reală/,
    );
    expect(() => articolSchema.parse({ ...ARTICOL_MINIM, data: '2025-13-01' })).toThrow(
      /Data trebuie să fie o zi reală/,
    );
  });

  it('cere forma AAAA-LL-ZZ, nu o dată scrisă oricum', () => {
    expect(() => articolSchema.parse({ ...ARTICOL_MINIM, data: '5 noiembrie 2025' })).toThrow(
      /Data trebuie să fie o zi reală/,
    );
    expect(() => articolSchema.parse({ ...ARTICOL_MINIM, data: '2025-11-5' })).toThrow();
  });

  /*
   * Fără ghilimele, YAML citește `data: 2025-11-05` ca dată calendaristică, nu
   * ca text, și schema primește un `Date`. Mesajul implicit al lui Zod pentru
   * asta este în engleză și vorbește despre tipuri; cel de aici spune ce are de
   * făcut omul. Aceeași capcană a fost deja plătită o dată, la `slujbe`.
   */
  it('spune ce să facă atunci când data este scrisă fără ghilimele', () => {
    expect(() =>
      articolSchema.parse({ ...ARTICOL_MINIM, data: new Date('2025-11-05') }),
    ).toThrow(/Data trebuie scrisă între ghilimele/);
  });

  /*
   * Și NU spune asta în celelalte cazuri de tip greșit. Toate sunt
   * `invalid_type` pentru Zod, așa că un singur mesaj pentru toate îi cerea
   * omului care ȘTERSESE linia să îi pună ghilimele.
   */
  it('nu cere ghilimele când data lipsește sau este null', () => {
    const lipsa = (() => {
      try {
        articolSchema.parse(fara(ARTICOL_MINIM, 'data'));
        return '';
      } catch (e) {
        return (e as Error).message;
      }
    })();
    expect(lipsa).toContain('Articolul trebuie să aibă o dată');
    expect(lipsa).not.toContain('ghilimele');

    expect(() => articolSchema.parse({ ...ARTICOL_MINIM, data: null })).toThrow(
      /Data se scrie ca text, între ghilimele/,
    );
    expect(() => articolSchema.parse({ ...ARTICOL_MINIM, data: 20251105 })).toThrow(
      /Data se scrie ca text, între ghilimele/,
    );
  });

  it('cere o categorie din listă', () => {
    expect(() => articolSchema.parse({ ...ARTICOL_MINIM, categorie: 'Altceva' })).toThrow(
      /Categoria poate fi doar Noutati sau Cateheza\./,
    );
    for (const c of CATEGORII) {
      expect(articolSchema.parse({ ...ARTICOL_MINIM, categorie: c }).categorie).toBe(c);
    }
  });

  it('publicat este un adevărat/fals, nu textul „true”', () => {
    // `publicat: "true"` în frontmatter este un șir, iar un șir nevid ar fi
    // adevărat la orice citire neatentă de mai târziu.
    expect(() => articolSchema.parse({ ...ARTICOL_MINIM, publicat: 'true' })).toThrow(
      /primește doar true sau false/,
    );
  });

  it('respinge un titlu gol sau numai spații', () => {
    expect(() => articolSchema.parse({ ...ARTICOL_MINIM, titlu: '   ' })).toThrow(
      /Titlul nu poate fi gol\./,
    );
  });

  it('respinge un autor gol', () => {
    expect(() => articolSchema.parse({ ...ARTICOL_MINIM, autor: '   ' })).toThrow(
      /Numele autorului nu poate fi gol\./,
    );
  });

  it('are autorul Parohia când nu este dat', () => {
    expect(articolSchema.parse(ARTICOL_MINIM).autor).toBe('Parohia');
  });

  it('păstrează autorul când este dat', () => {
    // Altfel un `.default()` pus peste orice valoare ar trece neobservat.
    expect(articolSchema.parse({ ...ARTICOL_MINIM, autor: 'Pr. Ioan' }).autor).toBe('Pr. Ioan');
  });
});

describe('paginaSchema', () => {
  it('acceptă o pagină cu titlu și cale', () => {
    expect(paginaSchema.parse(PAGINA_MINIMA).cale).toBe('parohia/istoric');
  });

  it('acceptă căile celor nouă pagini, cu liniuțe și pe un singur nivel', () => {
    // „Link-uri” și „Servicii liturgice” sunt două dintre cele nouă: dacă
    // expresia ar fi prea strictă, migrarea ar pica pe ele.
    for (const cale of ['istoric', 'link-uri', 'servicii-liturgice', 'parohia/scoala']) {
      expect(paginaSchema.parse({ ...PAGINA_MINIMA, cale }).cale).toBe(cale);
    }
  });

  const CERUTE: [string, RegExp][] = [
    ['titlu', /Pagina trebuie să aibă un titlu\./],
    ['cale', /Pagina trebuie să aibă o cale/],
    ['ordine', /Pagina trebuie să aibă o ordine/],
  ];
  for (const [camp, mesaj] of CERUTE) {
    it(`cere câmpul ${camp}`, () => {
      expect(() => paginaSchema.parse(fara(PAGINA_MINIMA, camp))).toThrow(mesaj);
    });
  }

  it('respinge o cale cu slash la început sau la sfârșit', () => {
    // Ruta construiește `/${cale}/`; un slash păstrat ar da `//istoric//`, care
    // dă 404 în timp ce fișierul arată perfect corect.
    for (const cale of ['/parohia/istoric', 'parohia/istoric/']) {
      expect(() => paginaSchema.parse({ ...PAGINA_MINIMA, cale }), cale).toThrow(
        /fără slash la început sau la sfârșit/,
      );
    }
  });

  it('respinge o cale cu majuscule sau spații', () => {
    for (const cale of ['Parohia/Istoric', 'parohia/is toric']) {
      expect(() => paginaSchema.parse({ ...PAGINA_MINIMA, cale }), cale).toThrow(
        /litere mici, cifre și liniuțe/,
      );
    }
  });

  it('respinge o cale cu diacritice, fiindcă URL-ul nu le poartă', () => {
    expect(() => paginaSchema.parse({ ...PAGINA_MINIMA, cale: 'pictură' })).toThrow(
      /fără diacritice/,
    );
  });

  it('respinge un titlu gol', () => {
    expect(() => paginaSchema.parse({ ...PAGINA_MINIMA, titlu: '  ' })).toThrow(
      /Titlul paginii nu poate fi gol\./,
    );
  });

  it('cere o ordine întreagă', () => {
    expect(() => paginaSchema.parse({ ...PAGINA_MINIMA, ordine: 1.5 })).toThrow(
      /Ordinea trebuie să fie un număr întreg/,
    );
    expect(() => paginaSchema.parse({ ...PAGINA_MINIMA, ordine: 'prima' })).toThrow(
      /Ordinea se scrie ca număr/,
    );
  });

  it('respinge o cheie scrisă greșit, în română', () => {
    expect(() => paginaSchema.parse({ ...PAGINA_MINIMA, ordinea: 2 })).toThrow(
      /Câmp necunoscut: ordinea\./,
    );
  });

  it('acceptă câmpurile neobligatorii când sunt date', () => {
    const p = paginaSchema.parse({
      ...PAGINA_MINIMA,
      descriere: 'Istoricul parohiei.',
      imagine: '/media/biserica.jpg',
    });
    expect(p.descriere).toBe('Istoricul parohiei.');
  });
});

describe('setariSchema', () => {
  it('acceptă setările minime', () => {
    expect(setariSchema.parse(SETARI_MINIME).nume).toContain('Parohia');
  });

  const CERUTE: [string, RegExp][] = [
    ['nume', /Setările trebuie să cuprindă numele parohiei\./],
    ['adresa', /Setările trebuie să cuprindă adresa parohiei\./],
    ['telefon', /Setările trebuie să cuprindă numărul de telefon\./],
    ['email', /Setările trebuie să cuprindă o adresă de e-mail\./],
  ];
  for (const [camp, mesaj] of CERUTE) {
    it(`cere câmpul ${camp}`, () => {
      expect(() => setariSchema.parse(fara(SETARI_MINIME, camp))).toThrow(mesaj);
    });
  }

  /*
   * FIECARE MESAJ ÎȘI NUMEȘTE PROPRIUL CÂMP. Ajutorul comun de dinainte dădea
   * un singur text pentru trei câmpuri, așa că golirea numărului de telefon
   * răspundea „Titlul nu poate fi gol.” - adevărat despre cod, fals despre ce
   * făcuse omul. Testul vechi era un `.toThrow()` gol și nu putea vedea asta.
   */
  const GOALE: [string, RegExp][] = [
    ['nume', /Numele parohiei nu poate fi gol\./],
    ['adresa', /Adresa parohiei nu poate fi goală\./],
    ['telefon', /Numărul de telefon nu poate fi gol\./],
  ];
  for (const [camp, mesaj] of GOALE) {
    it(`spune care câmp este gol, nu „titlul”, pentru ${camp}`, () => {
      const cerere = () => setariSchema.parse({ ...SETARI_MINIME, [camp]: '   ' });
      expect(cerere).toThrow(mesaj);
      expect(cerere).not.toThrow(/Titlul/);
    });
  }

  it('respinge un email fără @', () => {
    expect(() => setariSchema.parse({ ...SETARI_MINIME, email: 'contact' })).toThrow(
      /Adresa de e-mail nu este validă\./,
    );
  });

  it('respinge cele două valori demo de pe situl vechi', () => {
    // Numite anume fiindcă ele sunt ce se vede azi pe sit: subsolul arată o
    // adresă de temă și un număr de telefon franțuzesc. Migrarea lor ar fi mai
    // rea decât un câmp lăsat gol.
    expect(() => setariSchema.parse({ ...SETARI_MINIME, email: 'info@website.com' })).toThrow(
      /rămășiță demo de pe situl vechi/,
    );
    expect(() => setariSchema.parse({ ...SETARI_MINIME, telefon: '+33 877 554 332' })).toThrow(
      /rămășiță demo de pe situl vechi/,
    );
  });

  it('găsește valorile demo în orice câmp, nu doar în cele două de bază', () => {
    // Verificarea trece prin toate câmpurile: altfel al doilea e-mail ar putea
    // purta mai departe exact valoarea pe care primul o respinge.
    expect(() => setariSchema.parse({ ...SETARI_MINIME, email2: 'info@website.com' })).toThrow(
      /rămășiță demo/,
    );
    expect(() => setariSchema.parse({ ...SETARI_MINIME, telefon2: '+33 877 554 332' })).toThrow(
      /rămășiță demo/,
    );
  });

  it('respinge o cheie scrisă greșit, în română', () => {
    expect(() => setariSchema.parse({ ...SETARI_MINIME, emial: 'x@y.ch' })).toThrow(
      /Câmp necunoscut: emial\./,
    );
  });

  it('acceptă câmpurile neobligatorii și le verifică forma', () => {
    const s = setariSchema.parse({
      ...SETARI_MINIME,
      telefon2: '044 000 00 00',
      email2: 'preot@bor-zh.ch',
      iban: 'CH00 0000 0000 0000 0000 0',
      program_vizite: 'Duminica, după Liturghie',
      harta: 'https://maps.example.ch/parohia',
    });
    expect(s.email2).toBe('preot@bor-zh.ch');
    expect(() => setariSchema.parse({ ...SETARI_MINIME, email2: 'nu-este-email' })).toThrow(
      /A doua adresă de e-mail nu este validă\./,
    );
  });

  it('cere https pentru hartă, nu orice schemă de adresă', () => {
    // `javascript:` trece printr-un `z.url()` simplu. Pus într-un `href`, ar fi
    // exact felul de gaură pentru care se rescrie tot situl.
    for (const rea of [
      'nu-este-adresa',
      'http://maps.example.ch/parohia',
      'javascript:alert(1)',
      'data:text/html,x',
      '//maps.example.ch/parohia',
    ]) {
      expect(() => setariSchema.parse({ ...SETARI_MINIME, harta: rea }), rea).toThrow(
        /Adresa hărții trebuie să înceapă cu https/,
      );
    }
    expect(setariSchema.parse({ ...SETARI_MINIME, harta: 'https://maps.example.ch/x' }).harta).toBe(
      'https://maps.example.ch/x',
    );
  });
});

describe('setari.yml', () => {
  const CALE = fileURLToPath(new URL('../content/setari/setari.yml', import.meta.url));

  /*
   * Fișierul chiar livrat, trecut prin chiar schema care îl păzește. Build-ul
   * l-ar valida oricum, dar abia după ce pornește Astro; aici pică în suita de
   * unități, unde se citește eroarea.
   */
  it('fișierul livrat trece prin schemă', () => {
    const brut: unknown = parse(readFileSync(CALE, 'utf8'));
    const s = setariSchema.parse(brut);
    expect(s.nume).toContain('Sfântul Nicolae');
    expect(s.email).toContain('@');
  });

  it('nu poartă mai departe niciuna dintre cele două valori demo', () => {
    // Controlul pozitiv pentru testul de deasupra: dacă `superRefine` ar fi
    // scos, testul acesta ar trece degeaba, așa că el verifică textul brut.
    const text = readFileSync(CALE, 'utf8');
    expect(text).not.toContain('info@website.com');
    expect(text).not.toContain('+33 877 554 332');
  });
});

describe('mesajul pentru chei necunoscute', () => {
  /*
   * `cheiStricte` se importă acum din `./schema.ts`, nu se mai copiază: o
   * singură sursă pentru amândouă. Testul rămâne fiindcă el fixează TEXTUL -
   * schimbarea formulării în `schema.ts` trebuie să fie o faptă văzută, nu una
   * care se strecoară în patru colecții deodată.
   */
  it('este cuvânt cu cuvânt același ca la schema programului', () => {
    const cheieRea = { publicatt: true };
    const aici = articolSchema.safeParse({ ...ARTICOL_MINIM, ...cheieRea });
    const acolo = ziSchema.safeParse({
      slujbe: [{ ora: '10:00', slujba: 'Sfânta Liturghie' }],
      ...cheieRea,
    });
    expect(aici.success).toBe(false);
    expect(acolo.success).toBe(false);
    // Tipat structural, fiindcă cele două scheme dau rezultate de tipuri
    // diferite; aici nu ne interesează decât mesajul.
    const mesaj = (r: { error?: { issues: readonly { message: string }[] } }) =>
      r.error?.issues[0]?.message ?? '';
    // Scris cu mâna, nu luat dintr-una dintre scheme: altfel două mesaje
    // stricate la fel ar fi de acord între ele pe vecie.
    expect(mesaj(aici)).toBe('Câmp necunoscut: publicatt. Verificați scrierea.');
    expect(mesaj(acolo)).toBe(mesaj(aici));
  });
});

describe('import din node simplu', () => {
  /*
   * SINGURA GARDĂ PENTRU EXTENSIA `.ts`. Scripturile de migrare (Task 6 și 7)
   * sunt `.mjs` rulate direct de node, care rezolvă specificatorii relativi
   * literal: `'./date-ro'` în loc de `'./date-ro.ts'` aruncă
   * ERR_MODULE_NOT_FOUND. Vite, Astro și vitest rezolvă amândouă formele, deci
   * restul suitei nu ar vedea niciodată regresia - de aceea aici se pornește un
   * proces node adevărat.
   */
  const RADACINA = fileURLToPath(new URL('../..', import.meta.url));
  const ruleaza = (specificator: string) =>
    spawnSync(
      process.execPath,
      ['-e', `import('${specificator}').then((m) => { if (!m.articolSchema) process.exit(3); })`],
      { cwd: RADACINA, encoding: 'utf8' },
    );

  it('se poate importa din node simplu, fără Astro și fără vitest', () => {
    const r = ruleaza('./src/lib/schema-continut.ts');
    expect(r.stderr).not.toContain('ERR_MODULE_NOT_FOUND');
    expect(r.status, r.stderr).toBe(0);
  });

  it('controlul pozitiv: aceeași verificare chiar pică fără extensie', () => {
    // Dacă și asta ar ieși cu 0, testul de deasupra nu ar dovedi nimic.
    const r = ruleaza('./src/lib/schema-continut');
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('ERR_MODULE_NOT_FOUND');
  });
});
