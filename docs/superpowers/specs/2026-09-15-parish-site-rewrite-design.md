# bor-zh.ch — Parish Site Rewrite

**Design document · 2026-09-15**

Parohia Ortodoxă Română Sfântul Nicolae, Zürich. Replace the WordPress + Elementor Pro site with a static Astro site on Cloudflare Pages, edited through a git-backed CMS.

---

## 1. Why

### Measured, not assumed

| | Today |
|---|---|
| Homepage HTML | 400 KB |
| CSS/JS references in that HTML | 74 |
| Time to fetch the HTML document alone (`curl`) | 5.3 s |
| Active plugins | 19 |
| Filesystem | 2.18 GB |
| Real content | 48 posts, 29 pages, 457 attachments |

The site carries a full Elementor Pro stack (Elementor, Elementor Pro, Essential Addons, Unlimited Elements, Templately, Header Footer Elementor), the Athos theme with `trx_addons`, GiveWP, The Events Calendar, AI Engine, LiteSpeed Cache, Wordfence, Duplicator, All-in-One WP Migration and Migrate Guru — to serve 48 posts and about a dozen real pages.

The database carries two table prefixes, `r15e_` and `wpoi_`, residue from a previous install. Four separate calendar systems have tables in it (`wpoi_em_events`, `wpoi_my_calendar_events`, `wpoi_sc_events`, `wpoi_shepherd_tec_tasks`). There is WooCommerce leftover from the theme demo: 8 products, 3 orders, 3 product variations, plus `cpt_portfolio`, `cpt_services`, `cpt_layouts`, `cpt_testimonials`.

### Security

The site was compromised twice in 18 months. The last incident planted a gsocket reverse shell **outside the webroot**, launched from both `/.profile` and the crontab. The relevant conclusion for this document: the attack surface is PHP execution plus a plugin supply chain, and the fix is to stop executing code on the server at all.

### The editing workflow is the real reason

From `Instructiuni Parohie/Pagina Noutăți.pdf`, publishing one news item today requires:

1. Posts → All Posts → hover an existing post → **EA Duplicator**
2. Edit the duplicate's title and text
3. Open the Noutăți *page* in Elementor
4. Right-click the section → Duplicate
5. Retype the text into the duplicated column
6. If only one item is being added, right-click the other two columns → Advanced → Responsive → Hide on *every* device class
7. Hand-paste the post's URL into the "Citește mai mult" button

Seven steps involving a page builder, for one paragraph of news. The new site must make this:
write, attach a photo, press **Save** — one button, which publishes. (The CMS chrome is
English; see the goals below. Earlier drafts of this document said "press Publică", which was
never a real button.)

---

## 2. Goals and non-goals

**Goals**

- No server-side code execution. No database. No PHP.
- A non-technical editor publishes a news post in under three minutes without help. **The CMS
  chrome is English** — Sveltia ships 29 UI languages and Romanian is not among them, and its
  non-English locales are fetched from a CDN at run time, which this project's CSP blocks. The
  field labels, hints and error messages we author *are* Romanian; the chrome is not, and the printed guide carries the
  translation. **The publish button is labelled `Save`** — not "Save and Publish", which this
  configuration never renders — and pressing it puts the change on the website in about a
  minute, because every commit triggers a build. There is no separate publish step to explain.
  Duplicate and Delete live in a menu behind the **⋮** beside `Save` — accessible name
  *Show Editor Options* — rather than on the toolbar, which matters because duplicating last
  week's day is the whole weekly routine. The menu's "undo" item is **Revert All Changes**,
  not `Discard`: `discard` belongs to the editorial-workflow branch, unreachable under
  `publish_mode: simple`, the same dead branch that made `Save and Publish` unreachable.
  Sveltia renders **no tooltips at all** — every such label is an aria-label, invisible to a
  sighted volunteer, so the printed card must describe what is on screen, not what a screen
  reader would announce. Decap **does** ship a bundled Romanian UI with correct comma-below diacritics
  and no CDN dependencies; it was considered and declined in favour of Sveltia's modern
  editor, phone support, 5 vendored files versus 95, and active development. Recorded so nobody has to
  rediscover the trade.
- A non-technical editor updates the weekly liturgical schedule in under a minute.
- Homepage under 100 KB total, loading in under a second.
- A calm, clearly Orthodox visual identity (direction A, §4).
- Romanian now; German addable later without restructuring.

**Non-goals** — explicitly out of scope, to be deleted rather than migrated

- Online card payments (GiveWP is installed but the donation page only ever showed bank details).
- User accounts, member areas, comments, newsletter.
- E-commerce. The 8 products and 3 orders are theme demo data.
- Theme demo content: portfolio, services, testimonials, layouts.
- Multiple overlapping event calendars.

---

## 3. Stack

| Layer | Choice | Reason |
|---|---|---|
| Build | **Astro 7.x**, `output: 'static'` | Content collections with Zod schemas; a malformed schedule entry fails the build rather than shipping. Ships zero JS by default. i18n routing built in. Build-time AVIF/WebP generation. |
| CMS | **Sveltia CMS** at `/admin` | Modern rewrite of Decap: GraphQL (whole repo in one request), first-class i18n, works on a phone. Reads Decap config, so Decap is a config-level fallback. |
| Auth | **sveltia-cms-auth** Worker on Cloudflare | GitHub OAuth proxy. One-time ~15 min deploy. |
| Hosting | **Cloudflare Pages** | Free tier verified 2026-09-15: 20,000 files/deploy, 25 MiB/file, 500 builds/month, 20 min build timeout, 2,000 static redirects. Our largest asset is a 13.1 MB PDF; our redirect list is ~80. |
| Contact form | **Pages Function** + Turnstile + Resend | Sends from `send.bor-zh.ch` so SPF/DKIM never touch the root domain's Plesk MX. |
| Repo | GitHub, private or public | Editors are collaborators with personal accounts. |
| Fonts | Self-hosted woff2 subsets | No Google Fonts CDN — privacy, speed, and a tighter CSP. |
| Analytics | Cloudflare Web Analytics | No cookies, no consent banner needed. |

**Version note (corrected 2026-09-15).** This document first said Astro 5.x. Checked against the npm registry: `latest` is **7.3.2**, released 2026-09-08. The 5.x line ended at 5.18.2 on 2026-05-26 and 4.x is already tagged `legacy`. Pinning a rebuild whose entire motivation is security to an unmaintained framework line would be self-defeating, so the project targets 7.x. The v6 and v7 upgrade guides were checked against every API this design depends on: content collections, the `glob` loader, `astro/zod`, `i18n`, `build.inlineStylesheets`, `trailingSlash` and static endpoints are all unchanged. Two consequences worth recording: **Node 22.12.0 or newer** is required from v6, and v6 made endpoints with file extensions inaccessible via a trailing slash — which is precisely the behaviour `/program.ics` needs. One item for Phase 2: v7 replaced remark/rehype with Sätteri as the default Markdown processor, which matters when the 48 posts are migrated, not before.

### On the npm dependency argument

Hugo (a single Go binary, zero npm) was considered and rejected: its templating makes the schedule logic painful and its image pipeline is weaker. The honest counter-argument is that **Astro's dependencies are build-time only** — nothing from `node_modules` reaches a visitor. A compromised build dependency is a real risk and Renovate is in scope (§14), but it is a categorically smaller risk than 19 PHP plugins executing on every request, which is what actually caused the two incidents.

### Client-side JavaScript budget

Only two pieces of JS ship:

1. The week picker and next-service recomputation (§7), inline, **on the homepage only** — `/program` renders every week and ships no JavaScript at all, so it stays searchable with Ctrl+F and fully present in the accessibility tree.
2. Cloudflare Turnstile, on `/contact` only.

The ceiling is **3,800 bytes**, chosen to sit just under Astro's ~4,096-byte inline threshold: above that the script becomes a separate file and both the request count and the caching behaviour change.

Everything else — navigation, galleries, IBAN copy buttons — is HTML and CSS.

---

## 4. Design system — direction A, "Icoană"

Approved from mockups. Warm parchment, oxblood, icon gold; serif throughout; thin gold rules and a cross glyph as the only ornament. Reads like a well-printed parish bulletin.

### Tokens

```css
--parchment:   #FAF6EE;  /* page ground                        */
--raised:      #FFFDF8;  /* cards, feast rows                  */
--rule:        #E3D9C6;  /* hairlines                          */
--oxblood:     #6B1F26;  /* headings, primary action  10.5:1   */
--oxblood-dk:  #54171D;  /* hover                              */
--gold-text:   #8A6A28;  /* service times, links       4.7:1   */
--gold:        #B08B3E;  /* ORNAMENT ONLY — never text 2.9:1   */
--gold-lt:     #C8A45C;  /* borders, rules, † glyph            */
--ink:         #2A211C;  /* body text                 14.6:1   */
--muted:       #6E5C4E;  /* secondary text             5.9:1   */
--faint:       #7E6C52;  /* eyebrow labels             4.7:1   */
```

### Type

- **Display** — Cormorant Garamond 500/600: wordmark, headings, dates, service times.
- **Body** — Spectral 300/400: prose, navigation, captions.

Both self-hosted, subset to `latin` + `latin-ext`. **The subset must include U+0218–U+021B** (Ș ș Ț ț with comma below, not cedilla) — Romanian text rendered with Turkish cedilla forms is the classic tell of a carelessly built Romanian site. Verify against the string `Înălțarea Sfintei Cruci · Sfânta Liturghie · Duminică · Spovedanie`.

### Rules

- Ornament is a `†` glyph (U+2020) and gold hairlines. **Not `✝` U+271D** — it is in none of the eight shipped font files, so it would render from an OS fallback; `†` is present, and is the conventional feast-day mark in Romanian Orthodox calendars. No drop shadows, no gradients except the hero scrim.
- Feast days are marked by a `--raised` background and a 2px `--gold-lt` top rule, never by colour alone (accessibility).
- "Zi de post" is a bordered text tag, never an icon alone.
### Contrast — a correction to the mockups

Ratios computed against `--parchment`, not eyeballed:

| Token | Ratio | Verdict |
|---|---|---|
| `--ink` #2A211C | 14.6:1 | passes |
| `--oxblood` #6B1F26 | 10.5:1 | passes |
| `--muted` #6E5C4E | 5.9:1 | passes |
| `--gold-text` #8A6A28 | 4.7:1 | passes |
| `--faint` #7E6C52 | 4.7:1 | passes |
| `--gold` #B08B3E | **2.95:1** | **fails at every size** |

The approved mockups set the **service times** and the small uppercase eyebrow labels in `#B08B3E` and `#99866A`. Both fail WCAG AA — `#B08B3E` fails even the 3:1 large-text threshold. Since the accessibility budget in §13 is 100, the implementation must use `--gold-text` (#8A6A28) for times and links and `--faint` (#7E6C52) for labels. `#B08B3E` and `#C8A45C` survive as **ornament only**: hairlines, borders, the ✝ glyph, the feast-row top rule.

Visually this is a small darkening; nothing about the approved direction changes.

---

## 5. Information architecture

Homepage layout: **program-first** — short hero, then the week's services as a five-column band, then news.

```
/                          Acasă  (hero · week band · noutăți)
/program                   Program liturgic
/program.ics               Calendar subscription feed
/noutati                   Noutăți index
/noutati/[slug]            Article
/servicii-liturgice        Servicii liturgice (botez, cununie, înmormântare…)
/pastorale                 Pastorale (PDF list)
/comunitate/scoala         Școala parohială
/comunitate/pictura        Cursuri de pictură
/evenimente                Evenimente
/evenimente/[slug]         Event detail
/galerie                   Galerii foto
/galerie/[slug]            Gallery
/resurse/catehism          Catehism
/resurse/doxologia         Revista Doxologia
/resurse/studii            Studii
/resurse/linkuri           Link-uri utile
/parohia/consiliul         Consiliul Parohial
/parohia/istoric           Istoric
/contact                   Contact
/doneaza                   Donează
/rss.xml                   Feed
/sitemap-index.xml         Sitemap
```

**Dropped**: `Sfinții Zilei` becomes an outbound link to `calendar.doxologia.ro` rather than a maintained page — it was plugin-generated and nobody in the parish should own updating it daily.

**German-ready**: Astro i18n is configured with `defaultLocale: 'ro'` and `locales: ['ro', 'de']` from day one, but only `ro` has content. Adding German later means adding files under `src/content/*/de/`, not restructuring routes.

---

## 6. Content model

Astro content collections, each with a Zod schema; Sveltia's `config.yml` mirrors them. Schema is the single source of truth — if the CMS writes something the schema rejects, the build fails before deploy and nothing broken goes live.

### 6.1 `slujbe` — the weekly schedule

One file per service day. `src/content/slujbe/2026-09-14.md`:

```yaml
---
data: 2026-09-14
praznic: "Înălțarea Sfintei Cruci"     # optional
praznic_mare: true                      # optional — gold treatment
zi_de_post: true                        # optional
anulat: false                           # optional
note: ""                                # optional free text, shown under the day
locatie: ""                             # optional; empty = the usual chapel
slujbe:
  - ora: "07:30"
    slujba: "Utrenia"
  - ora: "08:30"
    slujba: "Sfânta Liturghie"
    detaliu: "și Parastas"              # optional
---
```

Zod validation: `data` is a real date; `ora` matches `/^([01]?\d|2[0-3]):[0-5]\d$/`; `slujbe` has at least one entry unless `anulat` is true; `praznic_mare` implies `praznic` is non-empty.

**Why one file per day rather than one per week**: past days fall out of the current view automatically without anyone deleting them; `.ics` events map one-to-one; the filename is the date, so ordering and de-duplication are free; and "duplicate last week" in the CMS is a per-entry action the editor already understands.

**Editor affordances in Sveltia** — these are what make it fast enough to actually get used:

- `slujba` is a **select**, not free text: Utrenia · Sfânta Liturghie · Vecernie · Spovedanie · Acatist · Paraclisul Maicii Domnului · Sfântul Maslu · Litie · Parastas · Priveghere · Denie · Liturghia Darurilor mai înainte sfințite · Botez · Cununie · Altceva (free text). Consistent naming without anyone having to be careful.
- Default times pre-filled by weekday (Wed 17:00/18:30, Fri 17:00/18:30, Sat 15:30/17:00, Sun 08:45/10:00), matching the parish's standing rhythm.
- The collection is sorted newest-first so last week is always the first thing on screen to duplicate.

### 6.2 `articole` — news posts

```yaml
titlu, data, autor (default "Parohia"), imagine, rezumat,
categorie (Noutăți | Anunțuri | Cateheză), publicat, body (markdown)
```

Rendering the index from this collection is what eliminates the seven-step Elementor ritual: a published post appears on `/noutati` and on the homepage automatically.

**`publicat: false` is the archive's holding pen, not a draft state.** §11 imports 31 posts whose dates were destroyed by a bulk import. They are real parish writing and they are not publishable as dated news, so they arrive unpublished with `data` set to the import stamp they carry. Two consequences the build must honour: an unpublished post is absent from `/noutati`, from the homepage and from `/rss.xml`, and it has **no page of its own** — otherwise "unpublished" would mean "reachable by anyone with the link", which is not what the parish was offered.

### 6.3 `evenimente`

```yaml
titlu, data_inceput, data_sfarsit?, ora?, loc, imagine, afis (PDF)?, descriere
```

### 6.4 `pagini` — editable prose pages

Markdown body plus optional hero image, for Istoric, Catehism, Studii, Școala, Pictură, Consiliul, Servicii liturgice, Link-uri utile.

### 6.5 `galerii`

```yaml
titlu, data, acoperire, imagini: [{ fisier, descriere? }]
```

### 6.6 `documente` — pastorale and other PDFs

```yaml
titlu, data, fisier, autor?
```

10 PDFs totalling 36.7 MB, largest 13.1 MB — all under Cloudflare's 25 MiB per-file limit, so they live in the repo. No external object store needed.

### 6.7 `setari` — site settings singleton

Parish name, address, phone numbers, email addresses, both IBANs, opening hours, social links, map URL, footer text. **Editable in the CMS**, so changing a phone number never requires a developer.

This also fixes standing errors on the live site: the footer currently shows `info@website.com` and a French phone number `+33 877 554 332`, both Athos theme demo leftovers.

---

## 7. The "today" problem

A static build freezes at deploy time, but "următoarea slujbă" and "săptămâna curentă" depend on the current date. By Wednesday a Sunday-built homepage would be advertising services that have already happened.

**Solution — progressive enhancement plus a nightly rebuild:**

1. The build emits `/program/date.json`: every service day from 60 days past to 365 days future. For a year of a typical parish week that is roughly 2–3 KB gzipped.
2. The HTML ships the **full upcoming list**, server-rendered. Without JavaScript the visitor sees every scheduled service — correct, just not focused.
3. ~1 KB of inline JS computes the current ISO week in `Europe/Zurich` and reveals the matching week, hiding the rest. Always correct, no rebuild required, no layout shift beyond the initial reveal.
4. A GitHub Actions cron at 03:00 Europe/Zurich rebuilds nightly, so the served HTML and any crawler's view stay honest. ~30 of the 500 monthly builds.

**Timezone discipline**: the build pins `TZ=Europe/Zurich`. Dates are stored as plain `YYYY-MM-DD` and times as `HH:MM` local — never as UTC instants, because a service at 10:00 is at 10:00 regardless of daylight saving.

---

## 8. Calendar feed

`/program.ics`, generated at build:

- One `VEVENT` per service.
- `UID` stable across rebuilds: `<date>-<index>@bor-zh.ch`. Stability matters — a changing UID makes subscribers' calendars re-add every event on every rebuild.
- `DTSTART;TZID=Europe/Zurich`, with the `VTIMEZONE` block included.
- `SUMMARY` = service name (plus `detaliu`), `LOCATION` = chapel address, `DESCRIPTION` = praznic and notes.
- Cancelled days emit `STATUS:CANCELLED` rather than disappearing, so subscribers see the cancellation.
- `Cache-Control: max-age=3600` — clients refetch hourly.

Plus a per-day "Adaugă în calendar" link for people who want one service rather than a subscription.

---

## 9. Donations

Two UBS accounts appear on the live site — `CH54 0021 5215 3048 5501 P` (contact page) and `CH11 0021 5215 3048 5502 K` (donation page), holder "Rumänisch-Orthodoxe Kirchgem. St. Nikolaus ZH Zürich". Which is for general giving and which for the building fund is an open question (§18).

- Each IBAN in a bordered block with a copy-to-clipboard button.
- A **Swiss QR-bill** (QR-Rechnung) generated at build from `setari` using the `swissqrbill` library. This is the correct static solution: every Swiss banking app scans it, TWINT's bill-scan included.
- A caveat to state plainly: a *TWINT-branded* static QR code requires a TWINT business account and is not something a static site can generate. The QR-bill covers the same use case for Swiss donors without one.
- The QR-bill must be validated with one real test transfer before launch. A wrong reference field produces a payment nobody can reconcile.

---

## 10. Contact form

`functions/api/contact.ts` — a Cloudflare Pages Function, the only server-side code on the site.

- Cloudflare Turnstile, verified server-side. Honeypot field as a second filter.
- Sends via Resend to the parish addresses. Free tier as of 2026: 3,000/month, **100/day** — the daily cap is the binding one, and it is far above a parish's realistic volume.
- **Sends from `send.bor-zh.ch`**, a dedicated subdomain. Its SPF, DKIM and DMARC records are added to that subdomain only, so the root domain's existing Plesk MX and SPF are never edited. This removes any chance of breaking parish email while setting up the form.
- No submissions are stored anywhere. The Function forwards and forgets.
- Rate limit by IP via a Cloudflare rule.

This replaces exposing `r-enoiu@gmx.ch` and `consiliu.parohiazurich@yahoo.com` as scrapeable `mailto:` links, which is how they are published today.

---

## 11. Migration

Scripted and repeatable, not retyped. Rerunning must produce identical output.

### Source

`backup-2026-08-27/database.sql.gz` (28.3 MB gzipped, 352 MB raw) and `backup-2026-08-27/htdocs.tar.gz` (1.5 GB).

### Steps

1. **Load** the dump into a disposable MariaDB container. Import `wpoi_*` only — `r15e_*` is dead residue from a previous install.
2. **Posts** — `wpoi_posts` where `post_type = 'post'` and `post_status = 'publish'`. **Measured 2026-09-16: 45 rows, not 48.** These use normal `post_content`; convert HTML → Markdown with Turndown, stripping Elementor wrapper markup.

   **The archive has lost its dates, and that is a content decision rather than a bug.** 20 posts are stamped `2024-06-08` and 11 more `2024-05-21` — bulk-import timestamps, not publication dates. Several are the same annual feast written fresh each year: three *Hristos a înviat!*, three *Postul Paștelui*, three *Moșii de toamnă*. Only two pairs are byte-identical (`sarbatorirea-sfantului-ierarh-nicolae` with `sfantul-ierarh-nicolae`, and `mosii-de-toamna` with `mosii-de-toamna-2`); the rest are genuinely different texts. **Ruling: migrate all 45. The ~14 carrying a genuine date publish; the 31 undated ones import with `publicat: false`**, so the parish dates, merges or discards them in the CMS. Publishing them as-is would open `/noutati` with twenty posts sharing one day and three near-identical Easter articles; dropping them would discard a decade of parish writing that survives nowhere else once the old site goes.

3. **Pages** — **not the hard part, and this section used to say it was.** The claim was that Elementor keeps page content in `_elementor_data` and **not** in `post_content`, so a lossy tree-walker would be needed and a human would have to restore the meaning. **Measured across all ten real prose pages on 2026-09-16: `post_content` carries the full prose in clean HTML**, behind a constant preamble — `<p>Layouts: Popup</p>`, then a breadcrumb line like `Parohia noastră > Istoric` — which strips mechanically. `istoric` alone is 6,994 characters of real paragraphs.

   So the text needs Turndown and a preamble strip, not a tree-walk. `_elementor_data` is still read, but only for **image placement**, and only where `post_content`'s own `<img>` tags do not already carry it. Hand-review is still wanted — headings and ordering deserve a human eye — but it restores polish rather than meaning.

4. **Media** — **measured 2026-09-16: 457 attachments**, not 653: 409 images (266 jpg, 129 png, 13 jpeg, 1 webp), 24 SVG, 10 PDF, 9 `.doc`, 2 MP4, 2 TTF, 1 MP3. Discard every file matching `-WxH.ext`; keep originals; downscale to a 2400px long edge and re-encode. Astro regenerates responsive AVIF/WebP at build.

   **Re-encoding is also the sanitisation step, and that is why it is not optional.** This media comes off a server compromised twice. Decoding and re-encoding every raster through `sharp` destroys anything embedded in a file that merely looks like an image, and a file that fails to decode is not an image and is dropped by name. **SVG is not re-encodable and is a script-injection vector: SVGs are dropped unless individually reviewed**, and `.doc` files are not migrated at all.
5. **Rewrite** `wp-content/uploads/...` URLs to `src/assets/...` paths.
6. **Emit** frontmatter matching the Zod schemas, then run `astro check` and a full build. **A build failure is a migration bug**, not something to fix by loosening the schema.
7. **URL map** — emit `old path → new path` as CSV, which generates `_redirects` (§12).

### Not migrated

The liturgical schedule has no historical value; start fresh from the current week. Theme demo content, WooCommerce data, GiveWP records (39 `give_payment` rows, all from the unused/test Stripe setup) and the four calendar plugins' tables are dropped.

---

## 12. Redirects

Generated into `_redirects`, all 301:

- `/program-liturgic/` → `/program/`
- Every migrated post and page slug → its new path
- `/feed/` → `/rss.xml`
- `/?p=<id>` forms via the ID→slug map

Plus a deliberate set of **410 Gone** rules for `/wp-admin/*`, `/wp-login.php`, `/xmlrpc.php` and `/wp-content/*`. Bots will keep probing these for years; 410 tells them to stop, and keeps the logs readable.

Well under the 2,000-redirect free-tier limit.

**Canonical host stays `www.bor-zh.ch`** — every existing backlink and the site's own identity use it. The apex redirects to `www`.

---

## 13. Performance budget

| Metric | Budget | Today |
|---|---|---|
| Homepage HTML | ≤ 30 KB | 400 KB |
| CSS | ≤ 15 KB | part of 74 refs |
| JS | ≤ 3,800 B | part of 74 refs |
| Requests (homepage) | ≤ 12 | ~90 (74 CSS/JS + 16 images) |
| LCP on 4G | < 1.2 s | HTML alone takes 5.3 s |
| Lighthouse performance | ≥ 95 | — |
| Lighthouse accessibility | 100 | — |

Budgets are enforced in CI; exceeding them fails the build.

---

## 14. Security posture

The whole point of the project. What changes:

- **No PHP, no database, no server-side execution** except the contact Function, which has no filesystem and no persistence.
- **The only writable surface is the GitHub repo.** 2FA required for every collaborator. Removing an editor is removing a collaborator — instant, auditable, and it cannot be undone by a shared password nobody rotated.
- **Every change is a commit.** Who changed what, when, and how to revert it, for free.
- `_headers` sets a strict CSP: `default-src 'self'; img-src 'self' data:; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'none'; form-action 'self'`, plus HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` and a restrictive `Permissions-Policy`.
- **Sveltia is self-hosted** from the repo rather than loaded from a CDN, so `script-src 'self'` holds on `/admin` too.
- Renovate keeps build dependencies current; Dependabot alerts on the repo.
- No cookies, so no consent banner — which also means nothing to get wrong under revDSG/GDPR.

---

## 15. Cutover

1. Build and migrate to a preview URL (`bzh.pages.dev`). Parish reviews content there.
2. **Mail rehearsal before anything else.** Parish email lives on the Plesk host. Record every current DNS record. When nameservers move to Cloudflare, re-create MX, SPF, DKIM and any autodiscover records verbatim, then **send and receive a test message in both directions before touching the A/CNAME records.** Mail breaking is the one failure the parish will feel immediately.
3. Point `www` at Pages; apex 301s to `www`.
4. Old site → `old.bor-zh.ch`.
5. Submit the sitemap; monitor 404s for 30 days and add redirects for anything the map missed.

### On keeping the old site online

You chose to keep the old WordPress running read-only for a while, which is a reasonable safety net. Done literally, it keeps a twice-compromised PHP application on the internet.

**Recommendation: serve a static snapshot instead.** `wget --mirror` the old site, host the HTML on Cloudflare Pages under `old.bor-zh.ch`, add `X-Robots-Tag: noindex`, and switch the Plesk box off. You keep every page for reference and lose nothing — except the attack surface, which is the reason for the project.

If the live WordPress must genuinely stay up: `noindex`, HTTP basic auth in front of it, `/wp-admin` blocked at the firewall to your IP only, and **a hard shutdown date written into the plan**, not left to drift.

---

## 16. Editor documentation

The `Instructiuni Parohie` PDFs are replaced by a short Romanian guide in the repo plus a printable one-page card for the parish office:

- Cum adaug o știre
- Cum actualizez programul săptămânii (și cum duplic săptămâna trecută)
- Cum adaug poze
- Cum schimb datele de contact
- Ce fac dacă ceva nu apare pe site

That last one matters. When a build fails, the editor sees nothing happen and has no way to know why. A GitHub Actions failure hook emails both the editor and the maintainer, **in Romanian**, naming the file and the problem.

---

## 17. Risks

| Risk | Mitigation |
|---|---|
| Sveltia CMS is a small project | Decap-compatible config; falling back is a config change, not a rewrite |
| Elementor JSON extraction is lossy | All ~12 real pages hand-reviewed; budget time for it |
| Editors need GitHub accounts | One onboarding session, printed card, accounts created for them |
| Romanian diacritics render with cedilla | Verify U+0218–U+021B in the font subset against a test string |
| Swiss QR-bill payload wrong | One real test transfer before launch |
| DNS move breaks parish email | Mail rehearsal before the A record flips (§15.2) |
| Old WordPress stays exposed | Static snapshot instead of a live instance (§15) |
| Nightly rebuild quota | ~30 of 500 monthly builds |

---

## 18. Open questions

1. Which IBAN is general giving and which is the building fund?
2. Confirm `info@website.com` and `+33 877 554 332` in the footer are demo leftovers to delete. (They almost certainly are.)
3. May the Consiliul Parohial members' names be published, as they are today?
4. Is there an existing parish logo file, or is the wordmark to be set in Cormorant?
5. Who besides the priest gets an editor account?

---

## 19. Phasing

**Phase 1 — Foundation.** Astro skeleton, design system, `slujbe` collection, `/program`, program-first homepage, Sveltia CMS + OAuth worker, deploy to preview. *At the end of this phase the parish can already edit the schedule.*

**Phase 2 — Content.** Migration scripts, 45 posts (§11), `/noutati` and `/rss.xml`, the homepage's news section, nine prose pages, the `setari` singleton, and the media pipeline. The nine are Istoric, Consiliul, Catehism, Studii, Doxologia, Link-uri, Școala, Pictură and Servicii liturgice; `/contact` and `/doneaza` wait for Phase 3, which owns the form and the QR-bill their pages are mostly about.

**Phase 3 — The rest.** Events, galleries, pastorale/PDFs, donations with QR-bill, contact form.

**Phase 4 — Cutover.** Redirects, DNS and mail rehearsal, old-site snapshot, launch, editor training.

Phase 1 delivers the single biggest win — the weekly schedule stops being page-builder surgery — and is independently shippable.
