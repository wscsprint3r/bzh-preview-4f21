# bor-zh.ch

Site-ul Parohiei Ortodoxe Române Sfântul Nicolae din Zürich.

Astro (static) · Sveltia CMS · Cloudflare Pages.
Specificația: `docs/superpowers/specs/2026-09-15-parish-site-rewrite-design.md`
Regulile de lucru: `AGENTS.md` (`CLAUDE.md` este o legătură simbolică spre el).

## Pentru cei care actualizează programul

Deschideți `https://<project>.pages.dev/admin/` și intrați cu contul GitHub
(**Sign In with GitHub**). Adresa exactă v-o dă persoana care se ocupă de site.

> **<https://www.bor-zh.ch/> este deocamdată vechiul site.** Până la mutarea
> domeniului, acolo răspunde instalarea WordPress pe care o înlocuim; nu se
> administrează de acolo și nimic văzut acolo nu spune nimic despre site-ul nou.

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

Dacă ceva nu apare pe site după câteva minute, construcția a eșuat. Veți primi un
e-mail de la GitHub. **E-mailul acela nu numește niciun fișier** — spune doar că a
eșuat, și dă un link; nimic din acest depozit nu poate scrie în el, dar pagina rulării
are sus textul în românește. Deschideți linkul și citiți ce scrie sus, pe pagină: textul
în românește este explicația și vă spune ce s-a întâmplat.

Dacă nu găsiți nimic care să vă privească — și de cele mai multe ori nu vă va
privi — **anunțați persoana care se ocupă de site și lăsați-o în seama ei.** Nu
tot ce înroșește o construcție este o greșeală într-un fișier de program; ziua pe
care tocmai ați salvat-o poate fi perfect în regulă și publicată.

## Pentru cei care adaugă o noutate

Tot în `/admin/`, în secțiunea **Articole**. Apăsați **Create New Entry**,
completați **Titlu**, **Data**, **Categoria** și **Textul articolului**, și, dacă
vreți, atașați o fotografie la câmpul **Imagine**.

**`Save` salvează și declanșează reconstrucția** — nu există un al doilea buton.
Dacă bifa **Publicat** este pusă, articolul apare pe prima pagină și la
`/noutati/` în aproximativ un minut. Dacă nu este pusă, articolul **nu apare
nicăieri pe site și nu are pagină proprie**, nici măcar dacă cineva are linkul:
rămâne doar în `/admin/`, în listă, gata de publicat. Îl puteți bifa oricând și
apăsa din nou **`Save`**.

- **Categoria**: `Noutati` pentru anunțuri și știri, `Cateheza` pentru articole
  de învățătură. Dacă nu sunteți sigur, alegeți `Noutati`.
- **Rezumatul** este opțional: un text scurt care apare sub titlu în liste. Dacă
  îl lăsați gol, articolul apare doar cu titlul.
- **Data** așază articolul în listă, cel mai nou primul, și apare sub titlu. Ea
  nu se schimbă singură: dacă ați greșit-o, corectați-o și salvați.

**Ghidul complet pentru editare** — programul săptămânii, noutățile, pozele și datele de
contact — este în `docs/ghid-editor.md`.

## Dezvoltare

```bash
npm install
npm run dev        # http://localhost:4321 · CMS-ul la http://localhost:4321/admin/
npm test           # teste unitare
npm run check      # verificarea de tipuri (astro check)
npm run test:all   # build + integrare + patru treceri cu un browser adevărat
npm run budget     # verifică bugetul de performanță
```

**Adresa locală a CMS-ului este `/admin/`, cu bară la final.** Serverul de
dezvoltare al lui Astro servește `public/` ca fișiere statice și nu rezolvă
singur indexul unui director, așa că `/admin/` răspundea 404, iar
`/admin/index.html` răspundea 200 — în timp ce Cloudflare Pages și serverul din
`scripts/a11y.mjs` rezolvau amândouă directorul, deci nici producția, nici
auditurile nu vedeau nimic. Integrarea `directory-indexes` din
`astro.config.mjs` rescrie cererea numai în `astro dev`. `/admin` fără bară
rămâne 404, fiindcă `trailingSlash: 'always'` spune că adresa este cea cu bară.

**CI rulează `npm run check` pe lângă `npm run test:all`**
(`.github/workflows/ci.yml`), iar `test:all` nu îl conține: o eroare de tipuri
trece local și pică în CI. Rulați-le pe amândouă înainte să publicați.

`npm run test:all` înseamnă: testele unitare, construcția, testele de integrare
peste `dist/`, apoi patru treceri cu un Chrome adevărat peste paginile
construite — la lățimea implicită, la 390px (telefon), la 1100px (peste pragul
de 62rem) și peste o construcție de probă cu mai multe săptămâni, singura în
care se vede bara selectorului de săptămână; ultima rulează la toate trei
lățimile, fiindcă rândul de șapte zile al Săptămânii Mari *cu bara vizibilă* nu
apare în nicio altă construcție.

Fiecare trecere servește paginile cu antetele `_headers` **ale construcției pe
care o auditează** și pică la orice încălcare de Content-Security-Policy
neprevăzută. Primele trei citesc `dist/_headers`; trecerea cu selectorul citește
`_headers`-ul construcției de probă — același conținut, altă construcție, nu
`dist/_headers`.

## Cum ajunge pe internet

**Punerea în funcțiune — crearea depozitului, Cloudflare Pages, Worker-ul de
autentificare, cârligul de reconstrucție și verificările de după — este în
`docs/handover.md`, pas cu pas.** Nimic din ce e acolo nu a fost încă făcut.

Cloudflare Pages construiește din ramura de producție la fiecare commit.
În plus, `.github/workflows/rebuild.yml` cere o reconstrucție la fiecare șase
ore: fără JavaScript, cartonașul „Următoarea slujbă” rămâne cu valoarea de la
construcție, deci intervalul dintre reconstrucții este exact cât de veche poate
fi informația pentru un vizitator fără JavaScript.

Antetele de securitate sunt în `public/_headers`. **Fișierul nu este servit
niciodată**, deci singurul mod de a vedea ce a făcut este să citiți antetele
altei adrese:

```bash
curl -sI https://<proiect>.pages.dev/ | grep -i content-security-policy
curl -sI https://<proiect>.pages.dev/program.ics | grep -i content-type
```

**Adresa `pages.dev`, niciodată `www.bor-zh.ch`.** Până la mutarea domeniului,
pe domeniu răspunde vechiul WordPress: aceleași comenzi date acolo întorc
antete și arată ca o verificare trecută, deși nu spun nimic despre construcția
aceasta.

A doua comandă trebuie să răspundă `text/calendar; charset=utf-8`. Nimic din
acest depozit nu poate verifica asta: o construcție statică pierde antetul pus
de `src/pages/program.ics.ts`, așa că tipul pe care îl primește telefonul unui
abonat este hotărât acolo și nicăieri altundeva. Restul verificărilor de acest
fel sunt în `docs/handover.md`, pasul F.

## Reguli care nu se încalcă

- `#B08B3E` și `#C8A45C` sunt doar ornament. Nu se folosesc niciodată pentru
  text — pică testul de contrast WCAG (2,95:1 și 2,18:1). Vezi
  `src/lib/tokens.ts`.
- Datele se păstrează ca `YYYY-MM-DD`, orele ca `HH:MM`, ora locală. Niciodată
  ca momente UTC.
- Lista de slujbe din `public/admin/config.yml` trebuie să rămână identică cu
  `SERVICE_NAMES` din `src/lib/schema.ts`.
- Diacriticele românești sunt cu virgulă dedesubt, nu cu sedilă. Cele două
  perechi arată la fel în fonturile sitului, deci se verifică numai după cod,
  niciodată din ochi. Vezi `AGENTS.md`.
