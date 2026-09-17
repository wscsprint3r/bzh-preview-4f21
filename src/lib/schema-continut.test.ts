import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { ziSchema } from './schema';
import { CATEGORII, articolSchema, paginaSchema, setariSchema } from './schema-continut';

/*
 * CE DOVEDEȘTE FIȘIERUL ACESTA: cele trei scheme chiar resping ce nu trebuie să
 * treacă, nu doar acceptă ce trebuie.
 *
 * O schemă este ușor de testat prost. Un test care ia o valoare validă, o
 * împrăștie cu `...` și verifică apoi că schema o acceptă trece la fel de bine
 * și dacă schema nu are nicio regulă: expectativa nu vine din ce ar trebui să
 * fie, ci din aceeași sursă cu lucrul verificat. Pe proiectul acesta s-au găsit
 * până acum șase gărzi care nu puteau pica din exact motivul ăsta.
 *
 * Deci pentru fiecare regulă există aici un caz care PICĂ dacă regula se șterge
 * din schemă. Unde regula e împărțită între scheme - `titluNevid` este folosit
 * de toate trei - cazul se repetă la fiecare, fiindcă ștergerea ei dintr-una
 * singură nu s-ar vedea în testul celeilalte.
 */

const ARTICOL_MINIM = {
  titlu: 'Hramul parohiei',
  data: '2025-11-05',
  categorie: 'Noutati',
  publicat: true,
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

  it('respinge o cheie scrisă greșit, în română', () => {
    // Greșeala cea mai probabilă din CMS, și singura care altfel ar pierde un
    // câmp pe un build verde.
    expect(() => articolSchema.parse({ ...ARTICOL_MINIM, publicatt: true }))
      .toThrow(/Câmp necunoscut: publicatt/);
  });

  it('cere o dată reală, nu doar ceva în formă de dată', () => {
    expect(() => articolSchema.parse({ ...ARTICOL_MINIM, data: '2025-02-30' })).toThrow();
    expect(() => articolSchema.parse({ ...ARTICOL_MINIM, data: '2025-13-01' })).toThrow();
  });

  it('cere forma AAAA-LL-ZZ, nu o dată scrisă oricum', () => {
    expect(() => articolSchema.parse({ ...ARTICOL_MINIM, data: '5 noiembrie 2025' })).toThrow();
    expect(() => articolSchema.parse({ ...ARTICOL_MINIM, data: '2025-11-5' })).toThrow();
  });

  /*
   * Fără ghilimele, YAML citește `data: 2025-11-05` ca dată calendaristică, nu
   * ca text, și schema primește un `Date`. Mesajul implicit al lui Zod pentru
   * asta este în engleză și vorbește despre tipuri; cel de aici spune ce are de
   * făcut omul. Aceeași capcană a fost deja plătită o dată, la `slujbe`.
   */
  it('spune ce să facă atunci când data este scrisă fără ghilimele', () => {
    expect(() => articolSchema.parse({ ...ARTICOL_MINIM, data: new Date('2025-11-05') }))
      .toThrow(/ghilimele/);
  });

  it('cere o categorie din listă', () => {
    expect(() => articolSchema.parse({ ...ARTICOL_MINIM, categorie: 'Altceva' })).toThrow();
    for (const c of CATEGORII) {
      expect(articolSchema.parse({ ...ARTICOL_MINIM, categorie: c }).categorie).toBe(c);
    }
  });

  it('publicat este obligatoriu și nu are implicit', () => {
    // Niciun implicit. Un articol căruia i s-a pierdut `publicat` trebuie să
    // pice build-ul, nu să publice tăcut cele 32 de articole nedatate.
    const { publicat: _, ...fara } = ARTICOL_MINIM;
    expect(() => articolSchema.parse(fara)).toThrow();
  });

  it('publicat este un adevărat/fals, nu textul „true”', () => {
    // `publicat: "true"` în frontmatter este un șir, iar un șir nevid ar fi
    // adevărat la orice citire neatentă de mai târziu.
    expect(() => articolSchema.parse({ ...ARTICOL_MINIM, publicat: 'true' })).toThrow();
  });

  it('respinge un titlu gol sau numai spații', () => {
    expect(() => articolSchema.parse({ ...ARTICOL_MINIM, titlu: '   ' })).toThrow();
  });

  it('respinge un autor gol', () => {
    expect(() => articolSchema.parse({ ...ARTICOL_MINIM, autor: '   ' })).toThrow(/gol/);
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
  const PAGINA_MINIMA = { titlu: 'Istoric', cale: 'parohia/istoric', ordine: 10 };

  it('acceptă o pagină cu titlu și cale', () => {
    const p = paginaSchema.parse(PAGINA_MINIMA);
    expect(p.cale).toBe('parohia/istoric');
  });

  it('acceptă căile celor nouă pagini, cu liniuțe și pe un singur nivel', () => {
    // „Link-uri” și „Servicii liturgice” sunt două dintre cele nouă: dacă
    // expresia ar fi prea strictă, migrarea ar pica pe ele.
    for (const cale of ['istoric', 'link-uri', 'servicii-liturgice', 'parohia/scoala']) {
      expect(paginaSchema.parse({ ...PAGINA_MINIMA, cale }).cale).toBe(cale);
    }
  });

  it('respinge o cale cu slash la început sau la sfârșit', () => {
    // Ruta construiește `/${cale}/`; un slash păstrat ar da `//istoric//`, care
    // dă 404 în timp ce fișierul arată perfect corect.
    expect(() => paginaSchema.parse({ ...PAGINA_MINIMA, cale: '/parohia/istoric' })).toThrow();
    expect(() => paginaSchema.parse({ ...PAGINA_MINIMA, cale: 'parohia/istoric/' })).toThrow();
  });

  it('respinge o cale cu majuscule sau spații', () => {
    expect(() => paginaSchema.parse({ ...PAGINA_MINIMA, cale: 'Parohia/Istoric' })).toThrow();
    expect(() => paginaSchema.parse({ ...PAGINA_MINIMA, cale: 'parohia/is toric' })).toThrow();
  });

  it('respinge o cale cu diacritice, fiindcă URL-ul nu le poartă', () => {
    expect(() => paginaSchema.parse({ ...PAGINA_MINIMA, cale: 'pictură' })).toThrow();
  });

  it('respinge un titlu gol', () => {
    expect(() => paginaSchema.parse({ ...PAGINA_MINIMA, titlu: '  ' })).toThrow();
  });

  it('cere o ordine întreagă', () => {
    expect(() => paginaSchema.parse({ ...PAGINA_MINIMA, ordine: 1.5 })).toThrow();
    expect(() => paginaSchema.parse({ ...PAGINA_MINIMA, ordine: 'prima' })).toThrow();
  });

  it('respinge o cheie scrisă greșit, în română', () => {
    expect(() => paginaSchema.parse({ ...PAGINA_MINIMA, ordinea: 2 }))
      .toThrow(/Câmp necunoscut: ordinea/);
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
  const MINIM = {
    nume: 'Parohia Ortodoxă Română Sfântul Nicolae',
    adresa: 'Wehntalerstrasse 451, 8046 Zürich',
    telefon: '076 512 04 52',
    email: 'contact@bor-zh.ch',
  };

  it('acceptă setările minime', () => {
    expect(setariSchema.parse(MINIM).nume).toContain('Parohia');
  });

  it('respinge un email fără @', () => {
    expect(() => setariSchema.parse({ ...MINIM, email: 'contact' })).toThrow();
  });

  it('respinge cele două valori demo de pe situl vechi', () => {
    // Numite anume fiindcă ele sunt ce se vede azi pe sit: subsolul arată o
    // adresă de temă și un număr de telefon franțuzesc. Migrarea lor ar fi mai
    // rea decât un câmp lăsat gol.
    expect(() => setariSchema.parse({ ...MINIM, email: 'info@website.com' }))
      .toThrow(/demo/);
    expect(() => setariSchema.parse({ ...MINIM, telefon: '+33 877 554 332' }))
      .toThrow(/demo/);
  });

  it('găsește valorile demo în orice câmp, nu doar în cele două de bază', () => {
    // Verificarea trece prin toate câmpurile: altfel al doilea e-mail ar putea
    // purta mai departe exact valoarea pe care primul o respinge.
    expect(() => setariSchema.parse({ ...MINIM, email2: 'info@website.com' }))
      .toThrow(/demo/);
    expect(() => setariSchema.parse({ ...MINIM, telefon2: '+33 877 554 332' }))
      .toThrow(/demo/);
  });

  it('respinge un nume, o adresă sau un telefon gol', () => {
    for (const camp of ['nume', 'adresa', 'telefon']) {
      expect(() => setariSchema.parse({ ...MINIM, [camp]: '   ' }), camp).toThrow();
    }
  });

  it('respinge o cheie scrisă greșit, în română', () => {
    expect(() => setariSchema.parse({ ...MINIM, emial: 'x@y.ch' }))
      .toThrow(/Câmp necunoscut: emial/);
  });

  it('acceptă câmpurile neobligatorii și le verifică forma', () => {
    const s = setariSchema.parse({
      ...MINIM,
      telefon2: '044 000 00 00',
      email2: 'preot@bor-zh.ch',
      iban: 'CH00 0000 0000 0000 0000 0',
      program_vizite: 'Duminica, după Liturghie',
      harta: 'https://maps.example.ch/parohia',
    });
    expect(s.email2).toBe('preot@bor-zh.ch');
    expect(() => setariSchema.parse({ ...MINIM, email2: 'nu-este-email' })).toThrow();
    expect(() => setariSchema.parse({ ...MINIM, harta: 'nu-este-adresa' })).toThrow();
  });

  it('cere https pentru hartă, nu orice schemă de adresă', () => {
    // `javascript:` trece printr-un `z.url()` simplu. Pus într-un `href`, ar fi
    // exact felul de gaură pentru care se rescrie tot situl.
    for (const rea of ['http://maps.example.ch/parohia', 'javascript:alert(1)']) {
      expect(() => setariSchema.parse({ ...MINIM, harta: rea }), rea).toThrow();
    }
    expect(setariSchema.parse({ ...MINIM, harta: 'https://maps.example.ch/x' }).harta)
      .toBe('https://maps.example.ch/x');
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
   * Mecanismul este copiat din `./schema.ts`, nu importat de acolo - motivul
   * este scris în antetul lui `schema-continut.ts`: un import din `./schema`
   * ar strica scripturile de migrare, care rulează sub node simplu, fără ca
   * vreun test de aici să se facă roșu.
   *
   * Prețul copiei este că cele două se pot despărți în tăcere, iar un voluntar
   * care a învățat ce înseamnă „Câmp necunoscut” la program ar întâlni altă
   * formulare la un articol. Testul acesta este singurul lucru care ar observa.
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
