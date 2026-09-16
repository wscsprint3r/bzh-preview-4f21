# bor-zh.ch

Site-ul Parohiei Ortodoxe Române Sfântul Nicolae din Zürich.

Astro (static) · Sveltia CMS · Cloudflare Pages.
Specificația: `docs/superpowers/specs/2026-09-15-parish-site-rewrite-design.md`
Regulile de lucru: `AGENTS.md` (`CLAUDE.md` este o legătură simbolică spre el).

## Pentru cei care actualizează programul

Deschideți <https://www.bor-zh.ch/admin/> și intrați cu contul GitHub
(**Sign In with GitHub**).

Pentru o săptămână obișnuită: deschideți o zi din săptămâna trecută, apăsați
butonul **⋮** din dreapta lui `Save` și alegeți **Duplicate**, schimbați data și
orele dacă e nevoie, apoi **Save**.

**`Save` publică.** Nu există un al doilea buton și nici unul scris „Publish”:
fiecare salvare declanșează o reconstrucție, iar schimbarea ajunge pe site în
aproximativ un minut. Zilele trecute dispar singure de pe prima pagină.

Două lucruri care se uită ușor:

- **Data este și numele fișierului și nu se schimbă singură.** Dacă o zi
  publicată are data greșită, ștergeți-o și adăugați-o din nou.
- **Dacă slujbele se anulează, păstrați orele și bifați „Slujbele sunt
  anulate”.** Dacă ștergeți rândurile, cei abonați la calendar rămân cu vechiul
  program și nu află de anulare.

Dacă ceva nu apare pe site după câteva minute, construcția a eșuat — verificați
e-mailul primit de la GitHub, care spune ce fișier are problema.

## Dezvoltare

```bash
npm install
npm run dev        # http://localhost:4321
npm test           # teste unitare
npm run test:all   # tot ce rulează și în CI
npm run budget     # verifică bugetul de performanță
```

`npm run test:all` înseamnă: testele unitare, construcția, testele de integrare
peste `dist/`, apoi patru treceri cu un Chrome adevărat peste paginile
construite — la lățimea implicită, la 390px (telefon), la 1100px (peste pragul
de 62rem) și peste o construcție de probă cu mai multe săptămâni, singura în
care se vede bara selectorului de săptămână. Fiecare trecere servește paginile
cu antetele din `dist/_headers` și pică la orice încălcare de
Content-Security-Policy neprevăzută.

## Cum ajunge pe internet

Cloudflare Pages construiește din ramura de producție la fiecare commit.
În plus, `.github/workflows/rebuild.yml` cere o reconstrucție la fiecare șase
ore: fără JavaScript, cartonașul „Următoarea slujbă” rămâne cu valoarea de la
construcție, deci intervalul dintre reconstrucții este exact cât de veche poate
fi informația pentru un vizitator fără JavaScript.

Antetele de securitate sunt în `public/_headers`. **Fișierul nu este servit
niciodată**, deci singurul mod de a vedea ce a făcut este să citiți antetele
altei adrese:

```bash
curl -sI https://www.bor-zh.ch/ | grep -i content-security-policy
curl -sI https://www.bor-zh.ch/program.ics | grep -i content-type
```

A doua comandă trebuie să răspundă `text/calendar; charset=utf-8`. Nimic din
acest depozit nu poate verifica asta: o construcție statică pierde antetul pus
de `src/pages/program.ics.ts`, așa că tipul pe care îl primește telefonul unui
abonat este hotărât acolo și nicăieri altundeva.

## Reguli care nu se încalcă

- `#B08B3E` și `#C8A45C` sunt doar ornament. Nu se folosesc niciodată pentru
  text — pică testul de contrast WCAG (2,95:1 și 2,18:1). Vezi
  `src/lib/tokens.ts`.
- Datele se păstrează ca `YYYY-MM-DD`, orele ca `HH:MM`, ora locală. Niciodată
  ca momente UTC.
- Lista de slujbe din `public/admin/config.yml` trebuie să rămână identică cu
  `NUME_SLUJBE` din `src/lib/schema.ts`.
- Diacriticele românești sunt cu virgulă dedesubt, nu cu sedilă. Cele două
  perechi arată la fel în fonturile sitului, deci se verifică numai după cod,
  niciodată din ochi. Vezi `AGENTS.md`.
