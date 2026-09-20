# Ghidul editorului

Site-ul Parohiei Ortodoxe Române Sfântul Nicolae din Zürich se administrează din `/admin/`,
cu contul GitHub (**Sign In with GitHub**). Adresa exactă a site-ului v-o dă persoana care
se ocupă de el.

Un singur gest explică aproape tot: **nu există buton de publicare separat. `Save` salvează
și publică.** Fiecare salvare pornește o reconstrucție, iar schimbarea apare pe site în
aproximativ un minut. Zilele și articolele trecute dispar singure de pe prima pagină.

## Cum adaug o știre

În `/admin/`, deschideți **Articole** și apăsați **Create New Entry**. Completați:

- **Titlu**;
- **Data** — așază articolul în listă, cel mai nou primul, și apare sub titlu;
- **Categoria** — `Noutati` pentru anunțuri și știri, `Cateheza` pentru articole de
  învățătură; dacă nu sunteți sigur, alegeți `Noutati`;
- **Textul articolului**.

**Imaginea** și **Rezumatul** sunt opționale: rezumatul este un text scurt care apare sub
titlu în liste, iar dacă îl lăsați gol, articolul apare doar cu titlul.

Bifa **Publicat** hotărăște dacă articolul ajunge pe site. Fără bifă, articolul rămâne
doar în `/admin/`: **nu are pagină proprie, nu apare în lista de noutăți și nu intră în
feed** — nici dacă cineva are linkul. Îl puteți bifa oricând și apăsa din nou **`Save`**.

La final, apăsați **`Save`**.

## Cum actualizez programul săptămânii

Programul este colecția **Program liturgic**. Fiecare zi publicată este o intrare, iar
**numele fișierului este data** — de aceea lista este așezată cu cea mai nouă zi prima.

Pentru o săptămână obișnuită, cea mai rapidă cale este să porniți de la săptămâna trecută:

1. Deschideți ziua din săptămâna trecută.
2. Apăsați butonul **⋮** din dreapta lui **`Save`** și alegeți **Duplicate**.
3. Schimbați **Data** și, dacă e nevoie, orele și rândurile de slujbe.
4. Apăsați **`Save`**.

Meniul **⋮** are patru comenzi: **Duplicate**, **Delete**, **Edit Slug** și
**Revert All Changes**.

**Data nu se schimbă singură.** Odată ce ziua a fost publicată, numele fișierului rămâne
cel de la prima salvare; dacă ați greșit data unei zile deja publicate, **ștergeți ziua și
adăugați-o din nou** cu data bună. Nu încercați să o corectați schimbând data în formular.

**Dacă slujbele se anulează, păstrați orele și bifați „Slujbele sunt anulate”.** Nu ștergeți
rândurile: așa ziua rămâne în calendarul celor abonați, cu **ANULAT:** în față, în loc să
dispară fără nicio explicație. O zi ștearsă nu se mai poate explica nimănui.

## Cum adaug poze

Pozele se încarcă din biblioteca media, cu butonul de încărcare din dreapta câmpului
**Imagine** al articolului, al paginii sau al albumului. Fișierele ajung în `/uploads/`,
iar site-ul le preia la următoarea reconstrucție.

- **Miniaturile din bibliotecă pot apărea goale.** Browserul refuză, din motive de
  securitate, adresele de tip `blob:` pe care CMS-ul le folosește pentru previzualizări.
  **Fișierele sunt întregi** și apar normal pe site; nu reîncărcați poza din această
  pricină.
- **Scoateți locația din poză înainte de încărcare.** Pozele păstrează metadatele camerei
  până când site-ul este reconstruit; atunci, copia servită pe site este re-encodată fără
  EXIF și fără GPS. Fișierul original rămâne însă în depozit și în previzualizarea din
  CMS, așa că locația lăsată în poză este la un pas de a fi publicată. Multe telefoane au
  o opțiune de a elimina locația la partajare.

## Cum schimb datele de contact

Deschideți **Setări** → **Datele parohiei**. Acolo sunt numele parohiei, adresa,
telefoanele, adresele de e-mail și conturile cu IBAN. O singură salvare le schimbă peste
tot: în subsolul fiecărei pagini și în calendarul de abonare. Nu există două locuri de
completat.

## Ce fac dacă ceva nu apare pe site

1. **Așteptați câteva minute.** O reconstrucție durează de obicei sub un minut, dar poate
   întârzia.
2. Dacă nu apare nici după câteva minute, **construcția a eșuat**. Veți primi un e-mail de
   la GitHub. **E-mailul nu numește niciun fișier** — spune doar că rularea a eșuat și vă
   dă un link.
3. **Deschideți linkul și citiți partea de sus a paginii rulării.** Dacă acolo apare un
   text în românește, acela este explicația; la depășirea limitei de greutate a paginilor,
   textul numește și paginile afectate.
4. **Dacă nu găsiți nimic care să vă privească, trimiteți e-mailul mai departe persoanei
   care se ocupă de site.** Nu tot ce înroșește o construcție este o greșeală într-un
   fișier de program: ziua sau articolul pe care tocmai l-ați salvat poate fi perfect în
   regulă și publicat.