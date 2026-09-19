# Putting bor-zh.ch into service

Everything in this file needs credentials no agent has, so none of it has been done and
none of it has been tested.

**Status, 2026-09-18: still none of it.** Every step below is outstanding - A-J, K1-K5,
and section L's four live checks. The site has never been deployed, so nothing here has
a live system behind it yet. Phases 1-3 are complete: the schedule, the CMS, the 45 news
posts, the eleven prose pages, the galleries, the events surface, the 87 PDFs, the
QR-bill and the contact form all exist in the repository, so deploying now publishes the
whole site rather than a schedule with no articles on it. Work through it in order;
each step says what a good answer looks like, because "it did not error" is not one.

> **Until the DNS cutover the site lives at `https://<project>.pages.dev/`.** `www.bor-zh.ch`
> still points at the WordPress install that was compromised twice — nothing in this phase
> touches DNS, so parish email cannot break, and nothing you do here changes what that
> hostname serves. **Every verification below must be run against the Pages URL.** A
> `curl -sI https://www.bor-zh.ch/…` returns headers and reads as a pass while telling you
> nothing whatsoever about this build; that is the one mistake in this file that would
> leave you certain of something false.

## A — the repository

**A1. Decide the build branch — and make it the repository's default branch.**

Three things have to name the same branch:

1. `branch:` in `public/admin/config.yml` — what the CMS commits to;
2. Cloudflare Pages' production branch — what gets built and served;
3. **the repository's default branch on GitHub.**

The third is the one that fails without a symptom. GitHub runs `schedule` triggers **only
from the default branch**. If the branch carrying `.github/workflows/rebuild.yml` is not
the default branch, the six-hourly rebuild never fires: no red build, no log line, nothing.
The homepage's "next service" card falls back to its build-time value when JavaScript does
not run, so the rebuild interval *is* the worst-case staleness a visitor without JavaScript
sees — and that bound silently becomes "until somebody publishes something".

`.github/workflows/ci.yml` has the same shape for pushes: it runs on `push` to `main`, on
every pull request, and on the manual button. A push to some other branch runs CI only via
a pull request or by hand.

**And there is a second way to lose the same bound, which has nothing to do with the
branch. GitHub disables a `schedule` trigger after 60 days without repository activity.**
A quiet two months — the priest away, no schedule published, nobody pushing — and the
six-hourly rebuild simply stops, by exactly the route A1 describes and for an unrelated
reason. GitHub does email the repository admin when it happens, so it is not wholly
silent, and this parish publishes most weeks, so it is unlikely; but the six-hour bound is
the product's promise, and this is the other way to lose it. If you ever find the rebuild
has stopped and the branch is right, look here: re-enable it from the Actions tab, and any
push or manual dispatch resets the clock.

The work is on `phase-2-2`; `public/admin/config.yml` says `branch: main`. So either:

- **merge `phase-2-2` into `main` and keep `main` as the default** — simplest, and it needs no
  edits at all; or
- **keep `phase-2-2`**: change that line in `config.yml`, set `phase-2-2` as the default branch
  (GitHub → Settings → General → Default branch), and change the branch filter in
  `ci.yml`.

**Keeping `phase-2-2` without making it the default is the one combination that fails
silently**, which is why `rebuild.yml` says so about itself. Dispatch it by hand from
`phase-2-2` while `main` is the default and the job goes **red** with
`Reconstrucția a fost cerută, dar PROGRAMAREA NU VA RULA DE AICI` — rather than going green
and letting you conclude the schedule works.

The hook **is** posted first, and that is deliberate: the branch check is the workflow's
*second* step, because a guard about branch configuration must not be able to stop the
rebuild it exists to protect. So a red job here means "the rebuild you asked for happened,
and the *scheduled* one never will" — not "nothing was triggered".

**A2.** Create the repository and push:

```bash
cd /Users/stefan/Work/stuff/site-bzh/web
gh repo create <OWNER>/<REPO> --private --source=. --remote=origin --push
```

*Good answer:* `gh repo view <OWNER>/<REPO>` shows the repository, and `git log origin/<branch> -1`
matches your local HEAD.

**A3.** Add the editors as collaborators, with 2FA required (spec §14).

**A4.** Run CI once by hand: Actions → **CI** → *Run workflow* → pick your branch.

*Good answer:* every step green. *If `npm ci` fails on chromedriver*, remove the
`DETECT_CHROMEDRIVER_VERSION` line from `.github/workflows/ci.yml` and run
`npm i -D chromedriver@latest` locally instead. *If an audit step fails with "This version
of ChromeDriver only supports Chrome version N"*, the same fix applies from the other side.

## B — Cloudflare Pages

**B1.** Workers & Pages → Create → Pages → Connect to Git → the repository from A2.

**B2.** Production branch: the branch from A1.

**B3.** Framework preset **Astro**; build command `npm run build`; output directory `dist`;
root directory **blank** — this repository's root *is* the site.

**B4.** Environment variables (Production **and** Preview):

| Name | Value |
|---|---|
| `NODE_VERSION` | `22` |
| `TZ` | `Europe/Zurich` |
| `CHROMEDRIVER_SKIP_DOWNLOAD` | `true` |

The third is not cosmetic: without it every production deploy downloads a 16 MB browser
driver it will never run. Verified locally that the build is correct without it.

**B5.** Deploy.

*Good answer:* the build log ends with `[build] Complete!` and contains a line reading
`[csp-hashes] CSP: index.html inline script of NNNN bytes -> 'sha256-…'`. **If that line
is missing, stop** — the policy shipped without the hash and the site's JavaScript is dead,
with no visible symptom, because the page without JavaScript is the designed fallback. Then
`https://<project>.pages.dev/` serves the homepage.

**B6. This deployment is deliberately invisible to search engines, and un-hiding it is a
step of the DNS cutover — not of this checklist.** Every visitor page carries
`<meta name="robots" content="noindex">` and **no** `rel=canonical`, both decided by
`INDEXABLE` in `src/lib/site.ts`.

Two things were wrong before that flag existed, and they are worth understanding rather
than just checking: Cloudflare marks *preview* deployments noindex but not the production
one, so the parish's real schedule was indexable at a hostname that will cease to exist;
and every page declared its canonical URL to be `https://www.bor-zh.ch/…`, which today is
the compromised WordPress install — an instruction to every crawler that the real copy of
this page is over there.

*Good answer:* `curl -s https://<project>.pages.dev/ | grep -i -E 'robots|canonical'`
returns the `noindex` meta and **no** canonical link.

> **At the cutover** (spec §15), set `INDEXABLE = true` and redeploy, in the same change
> that moves DNS. `build-output.itest.ts` asserts the two consequences agree, so the flag
> cannot be half-flipped — but nothing in this repository can tell that the domain has
> moved. Leaving it `false` afterwards gives you a site that is live, correct and invisible
> to every search engine, with nothing failing anywhere. There is deliberately **no**
> `robots.txt` with `Disallow: /`: disallowing the path stops a crawler fetching the page,
> so it never reads the `noindex` it was sent to obey, and a URL already known can stay
> indexed with no content at all.

## C — the OAuth Worker and the GitHub app

**C1.**

```bash
git clone https://github.com/sveltia/sveltia-cms-auth /tmp/sveltia-cms-auth
cd /tmp/sveltia-cms-auth && npm install && npx wrangler deploy
```

Write down the URL it prints — `<WORKER_URL>`.

**C2.** <https://github.com/settings/developers> → New OAuth App. Application name
`Sveltia CMS — Parohia Sfântul Nicolae`; Homepage URL `https://www.bor-zh.ch`;
**Authorization callback URL `<WORKER_URL>/callback`**. Keep the Client ID and generate a
Client secret (shown once).

**C3.** Cloudflare → Workers → `sveltia-cms-auth` → Settings → Variables:
`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` (click **Encrypt**), and `ALLOWED_DOMAINS` =
`www.bor-zh.ch,*.pages.dev`.

## D — the two placeholder lines

**D1.** `public/admin/config.yml`: `repo: <OWNER>/<REPO>` and `base_url: <WORKER_URL>`.

> **The placeholders are accepted, not rejected, so nothing warns you.** Sveltia loads the
> config, renders the sign-in screen and even echoes `<REPO>` back at you. The failure lands
> on the sign-in attempt. If signing in does nothing, check these two lines first.

**D2.** `public/admin/start.mjs`: `const CONTACT = 'persoanei care se ocupă de site';` —
it is in the dative, so a real person drops straight in:
`'lui Ion Popescu (ion@exemplu.ch)'`.

**D3.** `npm test && npm run test:build`, then commit and push.

*Good answer:* both exit 0, and Cloudflare deploys the new commit.

## E — the six-hourly rebuild

**E1.** Cloudflare Pages → Settings → Builds & deployments → Deploy hooks → create one (any
name; `rebuild` is the obvious one) on the production branch. Copy its URL.

**E2.** GitHub → Settings → Secrets and variables → Actions → New repository secret, named
exactly **`CF_DEPLOY_HOOK`**, value = that URL.

**E3.** Actions → **Rebuild every six hours** → *Run workflow*, **from the default
branch**.

*Good answer:* the job is green and a new deployment appears in Cloudflare within a minute.

- *If it prints `Secretul CF_DEPLOY_HOOK nu este configurat`*, E2 did not take — check the
  name character for character.
- *If the second step, **Programarea funcționează doar din ramura implicită**, goes red with
  `Reconstrucția a fost cerută, dar PROGRAMAREA NU VA RULA DE AICI`*, you dispatched it from a
  branch that is not the default one. That is A1: the scheduled run would never have
  fired. Either dispatch from the default branch, or make this branch the default. The `curl`
  ran first, so the one-off rebuild you asked for did happen; what is broken is the schedule.

Scheduled runs are best-effort and can be delayed by GitHub; the first real proof is a
deployment appearing in Cloudflare around 03:00 Zürich time.

## F — the headers, which are the only thing no test here can see

`_headers` is parsed by Cloudflare and **never served**, so no request returns it. The only
evidence is the response headers of some other URL.

**F1.**

```bash
curl -sI https://<project>.pages.dev/ | grep -i -E 'content-security-policy|strict-transport|x-content-type|referrer-policy|permissions-policy'
```

*Good answer:* five headers, and the CSP contains `script-src 'self' 'sha256-…'`. **If
`script-src` reads just `'self'`, the site's JavaScript is being refused** — go back to B5.

**F2.**

```bash
curl -sI https://<project>.pages.dev/program.ics | grep -i -E 'content-type|cache-control'
curl -s  https://<project>.pages.dev/program.ics | head -5
```

*Good answer:* `content-type: text/calendar; charset=utf-8`,
`cache-control: public, max-age=3600`, and a body beginning `BEGIN:VCALENDAR`. *If it reads
`text/calendar; charset=utf-8, text/calendar`*, something else is also setting
`Content-Type` and Cloudflare has comma-joined the two values.

**F3.**

```bash
curl -sI https://<project>.pages.dev/admin/ | grep -i -E 'x-robots-tag|content-security-policy'
```

*Good answer:* `x-robots-tag: noindex` **and** the same CSP as F1.

**F4.** Open the homepage in a browser with the console open.

*Good answer:* **no** `Refused to …` messages. This is the live version of the check
`npm run a11y` makes locally.

## G — the first sign-in (the one thing nothing here could reach)

**Open the console (F12) BEFORE pressing "Sign In with GitHub", and keep it open until you
have published a day.** Chrome names both the URL and the directive, so each fix is
mechanical:

| Console says | Do |
|---|---|
| `Refused to load the image 'https://avatars.githubusercontent.com/…'` | already allowed — should not appear |
| `Refused to connect to '<WORKER_URL>/…'` | add that origin to `connect-src` in `public/_headers` |
| `Refused to connect to 'https://github.com/…'` or `raw.githubusercontent.com` | add that origin to `connect-src` |
| `Refused to load the script …` or `Refused to frame …` | **stop and ask** — a new script or frame origin on the page that holds a credential is not a line to add without thinking |

**Five messages are expected and can be ignored**, each measured in a real browser and each
verified to fail gracefully: `unpkg.com/@sveltia/cms/package.json`,
`www.githubstatus.com/api/v2/status.json`, a `date:` logo fetch, and two `blob:` image
refusals. `public/_headers` explains every one.

**If you add anything to the policy, add it to `CSP_EXPECTED` in `scripts/a11y.mjs` too**,
or `npm run a11y` will fail on it — that is the list doing its job. The same list fails when
an expected refusal *stops* appearing, which is what catches an audit that measured nothing.

If sign-in fails with nothing about CSP in the console, the cause is far more likely C2's
callback URL or C3's `ALLOWED_DOMAINS`.

The `blob:` refusals cost the media library its thumbnails. Put that on the editors' card,
so the first person to meet an empty thumbnail does not report it as "the CMS is broken".

## H — the round trip, which is the Phase 1 deliverable

**H1.** In `/admin/`, add next Sunday and press **Save**. (`Save` publishes. There is no
`Publish` button in this configuration.)

*Good answer:* a commit appears on the build branch adding `src/content/services/<date>.yml`.

**H2.** Open that file. *Good answer:* it looks like the seed files — `ora: "08:45"` quoted,
no `praznic: ""`.

**H3.** *Good answer:* the day appears on `/program/` and on the homepage about a minute
later.

**H4.** While a saved day is open, click the **⋮** to the right of `Save`.

*Good answer:* the menu reads **Duplicate · Delete · Edit Slug · Revert All Changes**. That
is the weekly control, and a CMS upgrade that moved it would break the printed card without
breaking a test.

**H5.** The case nothing here could test: open that day again, change the date, save.
*Either* the file is renamed (fine) *or* the build fails with `Fișier de program cu două
date diferite` (the guard working). **Write down which**, and put it on the editors' card.

**H6.** Subscribe to `https://<project>.pages.dev/program.ics` from a phone calendar.

*Good answer:* the services appear at the right local times.

**H7.** Load the homepage with JavaScript disabled.

*Good answer:* all rendered weeks are visible and the picker bar is absent.

**H8.** Lighthouse on the deployed homepage.

*Good answer:* accessibility **100**, performance **≥95**.

**H9. Subscribe to the same feed in Google Calendar, specifically.**
<https://calendar.google.com> → Other calendars **+** → *From URL* →
`https://<project>.pages.dev/program.ics` → Add calendar. Google polls on its own
schedule and can take hours the first time; do this step before H10 and leave it.

*Good answer:* the services appear at the right local times, as in H6. H6 is a phone
client; this one is Google, and the two are separate answers — H10 is why.

**H10. Cancel a test day, and write down what a subscriber actually sees.** This is the
one behaviour on the whole list that decides whether a parishioner learns a Liturgy is
cancelled, and **it has never been observed** — only reported.

1. In `/admin/`, open a future test day, tick **„Slujbele sunt anulate”**, keep the times,
   and press **Save**.
2. Wait for the rebuild, then confirm the feed itself first:
   `curl -s https://<project>.pages.dev/program.ics | grep -A6 -B6 CANCELLED` — the events
   for that day carry `STATUS:CANCELLED` and a `SUMMARY` beginning `ANULAT:`.
3. Refresh Google Calendar (H9) and the phone client (H6), and **write down, for each**,
   which of these you see:
   - the day still shown, struck through or otherwise marked — the good case;
   - the day still shown with the `ANULAT:` prefix and no other marking — also fine, and
     the reason that prefix exists;
   - **the day gone entirely** — the case that matters. A subscriber who had last
     Sunday's Liturgy in their calendar then sees it vanish with no explanation, which is
     indistinguishable from never having been published.

*Why both belts:* ruling #28 shipped an explicit `ANULAT:` marker in the summary **and**
`STATUS:CANCELLED`, precisely because Google's handling of the second was reported rather
than verified. This step is what settles it. If the day vanishes in Google, the `ANULAT:`
prefix is doing all the work and that fact belongs on the editors' card; if both clients
show it, nothing needs changing and the belt-and-braces was cheap.

Then untick and save again, so the test day is not left cancelled.

**H11. Make one build fail on purpose, and write down what the editor actually receives.**
This is the only failure on the whole project that is **not** the editor's, and it is the
one the editor is least equipped to read.

*What it is.* `scripts/check-budget.mjs` fails when a page grows past its limit. For
`/program/` that happens at around **58 published weeks**, because that page renders the
whole schedule by design — browsing ahead is the point and Ctrl+F has to work — so its
weight is the feature and the limit is a statement about how far ahead the parish can
publish before the page stops being a page. Nothing is wrong with anybody's file. But the
CMS commits to the build branch, `ci.yml` runs on that push, and the failure email goes to
**whoever saved last**.

*What to do, once, before you hand the site over:*

1. On a branch, set `PAGE_BUDGET['program/index.html']` in `scripts/check-budget.mjs` to
   `1024`, commit and push. CI will go red on `npm run budget`.
2. Open the **failure e-mail** GitHub sends you and write down here what it contains. This
   repository cannot see or change that e-mail, and `README.md` now tells the editors it
   names no file — which is a claim nobody here has ever checked against a real one.
3. Follow its link. At the top of the run page there should be a red box with the Romanian
   paragraph — the same words the `npm run budget` step prints, put there by a workflow
   annotation so the editor does not have to find and expand a step in an English
   interface. Write down whether it is there and whether it is readable.
4. Revert the change.

*Who it belongs to.* You. If it ever fires for real, the decision is either to raise the
limit — which means accepting a heavier page — or to accept that `/program/` cannot hold
more than about a year and a bit of schedule. Neither is a decision an editor can make from
the CMS, and the message says so in Romanian. Tell the editors, at the training session,
that a red build which names no file is one to forward to you and forget about.

## I — Phase 2: the migrated content

Phase 2 is complete in the repository. Nothing here needs a new service: the content and
its routes ship with the site. This section is what to know about them when you bring it
up, and what to hand Phase 4.

**What now exists.**

- **Routes**: `/noutati/`, one `/noutati/<slug>/` per published post, `/rss.xml`, and the
  nine prose pages at their new paths (`/parohia/istoric/`, `/servicii-liturgice/`,
  `/resurse/doxologia/`, …), with the old paths mapped in `docs/url-map.csv`. The footer
  carries a **Pagini** menu built from the pages collection's `order`, so all nine are
  reachable from every visitor page; `src/lib/build-output.itest.ts` fails if one of them
  loses its only link. The routes Phase 2 did not build — `/events`, `/galerie`,
  `/pastorale`, `/contact`, `/doneaza` — are Phase 3.
- **CMS collections** in `/admin/`: **Articole** (create and delete), **Pagini** (the
  nine files, edit only) and **Setări** (the singleton carrying the parish's address,
  phone, e-mail and IBANs). Labels are Romanian; field keys are English. Uploads go to
  `public/uploads` and are written as `/uploads/…`, an absolute URL the host serves;
  `src/lib/cms.test.ts` asserts the pair and `src/lib/binaries.itest.ts` decodes every
  committed upload. They are served as uploaded — no Astro AVIF/WebP variants — unlike the
  migrated media under `src/assets/content/`.
- **A page's `image` field is stored but not rendered.** The CMS offers **Imagine** on a
  **Pagină** and `pageSchema` accepts it, but no route reads it: `[...page].astro` renders
  the title and the prose only. No page sets it today. This is a pre-existing Phase 2 gap,
  recorded rather than discovered later — a page meant to carry a hero image needs the
  render added first.
- **`docs/url-map.csv`** — 55 data rows at the end of Phase 2, one per old path, emitted by
  `migration/url-map.mjs` (section L carries the current count, 144). **Nothing serves it
  yet**; it is Phase 4's input for `_redirects`. The 32 held-back posts keep their rows, so
  an old link reaches `/noutati/<slug>/` and 404s until the parish dates and publishes that
  post.

**Adding a post.** `/admin/` → **Articole** → **Create New Entry**, then title, date,
category, text and optionally an image. `Save` is the only button and it commits.
`Publicat` decides whether the post appears: unchecked it exists in the CMS and nowhere
else — no page, no list entry, no feed item. Check it and save again to publish. The
same behaviour is asserted against the build by `src/lib/build-output.itest.ts`.

**Rerunning the migration.** It needs Docker and the backups that live **outside this
repository** (the parent directory holds the 2026-08-27 database dump and the 08-22
`uploads/` tree), so a fresh clone cannot run it:

```bash
node migration/run.mjs
```

It destroys and recreates the `bzh-migration` container, loads the dump, and rewrites
`src/content/articles/`, `src/content/pages/`, `src/assets/content/` and
`docs/url-map.csv`. It is deterministic: rerunning must produce byte-identical output
(spec §11). **Not run here** — this repository does not carry the backups; the command
is real and `migration/README.md` describes what it needs.

**Known content anomalies, left faithful to the old site.** These are the parish's words
and nobody has edited them; they are for the parish to fix in the CMS:

- `src/content/pages/scoala-parohiala.md`, the „Încurajare” paragraph: repeated fragments
  around „Credința este cea care” and the Corinthians quotation. The old site served
  exactly this text.
- `src/content/pages/revista-doxologia.md`: the heading `## Revista Doxologia` appears 31
  times, once per magazine cover, because the old page used a heading as a caption. The
  correct shape is one heading with 31 covers under it.

**Old-site links in the migrated prose, for Phase 4.** The markdown carries 53 absolute
`https://www.bor-zh.ch/` links, none rewritten: 2 in articles and 51 in pages. 28 point
at PDFs in legacy static directories outside `uploads/` — 26 under `/revista/` (the
Doxologia issues) and 2 under `/files/` (the study texts). Of the remaining 25, 24 point
into `wp-content/uploads/`: 11 full-size images on `cursuri-de-pictura`, 8 `.doc` study
files on `studii` and 5 PDFs (the 2024 pastoral letter and four Doxologia issues). The
25th is not an upload: it is the old-site page link for the pastoral letter. Phase 4 has
to decide what all 53 redirect to before the old host goes away.

**`/?p=<id>` short links are covered by nothing here.** The URL map is old-path to
new-path only and carries no WordPress IDs, `_redirects` cannot match a query string,
and the dump that could supply the IDs lives outside this repository. Phase 4 needs a
Pages Function for them, or an explicit recorded decision to let those short links die —
and that decision is due before the IDs become unrecoverable.

**Check it from the repository.**

```bash
TZ=Europe/Zurich npm run test:all && TZ=Europe/Zurich npm run check
```

*Good answer:* both exit 0. The integration tests read the built `dist/` — every
published post's page, the nine prose routes, the feed, the unpublished posts' absence
and the settings singleton — and the browser passes audit every built page.

## J — finish

**J1.** Print the editors' card and hand out at the training session. Every row on it was
read off a running CMS.

**J2.**

```bash
git tag -a phase-2 -m "Phase 2: the migrated content"
git push --tags
```

## K — the contact form

The form on `/contact/` is the only server-side code on the site: a Cloudflare
Pages Function at `functions/api/contact.ts`, which verifies Turnstile and forwards the
message through Resend. Nothing in this repository can reach either service — the pure
logic is tested with an injected `fetch` — so every step here is one only a deployed
site and a real inbox can answer. Until they are done, the form's script is shipped and
its endpoint is live; what is missing is the configuration that makes it work.

**K1. The Turnstile widget.** In the Cloudflare dashboard → **Turnstile** → **Add
widget**, create one for the Pages project's hostname (`<project>.pages.dev` is enough
while testing; add `www.bor-zh.ch` before the launch). Put the **site key** in the Pages
project's **build** environment as `PUBLIC_TURNSTILE_SITE_KEY` and the **secret key** in
its **runtime** environment (Settings → Variables and Secrets → Production) as
`TURNSTILE_SECRET_KEY`. A build with no site key renders the form's fallback paragraph
instead of the form — that is the designed state, not a failure.

*Good answer:* the deployed `/contact/` renders the form, the widget draws inside it, and
a submission with the widget unsolved comes back with
„Verificarea de securitate a eșuat.”

**K2. Resend.** Add `send.bor-zh.ch` as a sending domain in Resend and add the SPF, DKIM
and DMARC records it shows **on that subdomain only**. Never edit the root domain's MX
or SPF: parish mail is served elsewhere, and the whole point of the subdomain is that
setting up the form cannot break it (spec §10). Create an API key and set
`RESEND_API_KEY` and `CONTACT_TO` in the Pages project's runtime environment.
`CONTACT_FROM` defaults to `contact@send.bor-zh.ch`; set it only if the verified sender
changes.

*Good answer:* Resend reports the domain **Verified**; `dig txt send.bor-zh.ch` shows the
records it asked for; the root domain's own records are untouched.

**K3. The IP rate limit.** Add a Cloudflare WAF rate-limiting rule on `/api/contact`
(for example: more than 5 POSTs per minute from one IP → block for a minute). Resend's
free tier allows 100 messages a day, and this rule is what keeps a scripted sender from
spending them.

*Good answer:* the rule exists and fires — Security → Events shows the block when it
does.

**K4. One real round trip.** From the deployed site, send one message with a real
address in the form. Then reply to the message from the parish inbox.

*Good answer:* the message arrives at `CONTACT_TO`; its **Reply-To** is the sender's
address, so the reply lands with the sender rather than at
`contact@send.bor-zh.ch`. Nothing is stored anywhere — the Function forwards and
forgets (spec §10).

**K5. The security origins, live.** The deployed page is the only place the Turnstile
origins in `public/_headers` are exercised: every local audit builds without a site key,
so the widget never loads there. Open the browser console on `/contact/` and submit once.

*Good answer:* no Content-Security-Policy violation for
`https://challenges.cloudflare.com` in the console, and the K4 message arrives.

## L — Phase 3: the rest

Phase 3 is complete in the repository. The routes, the collections, the PDFs and the
QR-bill all ship with the site; the only service it needs beyond Phase 2's is the form's,
which is section K. This section is what to know about them when you bring the site up,
and what to hand Phase 4.

**What now exists.**

- **Routes**: `/galerie/` with one page per album (`/galerie/<slug>/`), `/evenimente/`
  with one page per event (`/evenimente/<slug>/` — there is no real detail page until
  the parish creates its first event, and its layout is audited through the picker
  fixture rather than through a page in `dist/`), `/pastorale/` (the PDF list), and
  `/contact/` and `/doneaza/` as dedicated routes over their migrated prose plus
  generated blocks. The header carries **eight** links; the footer carries the full
  sitemap — a fixed **Site** list (Program, Noutăți, Evenimente, Galerie, Pastorale)
  beside the **Pagini** menu, which now has eleven entries. `build-output.itest.ts`
  fails if any prose page loses its inbound link from any visitor page.
- **CMS collections** in `/admin/`: **Evenimente**, **Galerii foto** and **Documente**,
  beside Phase 2's three. A gallery's images and an event's image go through the same
  resolver as an article's, so both shapes render: the migration's
  `src/assets/content/…` through Astro's image pipeline, a CMS upload at `/uploads/…`
  as-is.
- **87 PDFs** under `public/documente/` (about 197 MiB), copied from the old host by
  `migration/` behind a gate: each file must open with `pdfinfo`, and its raw bytes are
  scanned for `/EmbeddedFile` and `/Launch`; "no JavaScript" is judged by
  `pdfinfo -js`, not by a byte scan. **The gate does not rewrite the bytes** — that
  ruling, and why the byte scan is narrower than it looks, are in
  `migration/README.md` and `migration/pdf-gate.mjs`. The files are therefore the old
  bytes, with a browser's PDF viewer as the execution boundary.
- **The QR-bill** on `/doneaza/`, generated at build from the account flagged `qr_bill`
  in Setări and embedded as raw SVG. It is an **open** bill: currency CHF, no amount,
  so the donor fills in the sum in their banking app.
- **The contact form** on `/contact/`; its configuration is section K.
- **`docs/url-map.csv`** now carries **144 data rows**, 87 of them the PDFs. Nothing
  serves the file yet: it is Phase 4's input.

**What to hand Phase 4.**

- **The 87 PDF redirect rows.** One row per old `/pastorala/…`, `/files/…`,
  `wp-content/uploads/…` or `/revista/…` path, pointing at `/documente/<slug>.pdf`.
  The old paths are **percent-encoded per segment**, because that is the form a browser
  requested; copy each token verbatim and do not re-encode it. Two measured decisions
  are Phase 4's: the design spec's `/wp-content/*` 410 rules **shadow** the ten uploads
  301s unless the specific document rows are emitted above the wildcard, and the CSV is
  sorted by old path, so the ordering in `_redirects` must be deliberate rather than
  the file's order.
- **The album and event URL rows, which do not exist and must be decided.** The old
  photo album was the WordPress page `/evenimente/`, and the legacy static album was
  `/galerie.html`. `/evenimente/` now serves the events index, so the old album content
  cannot also redirect there and no row maps it to `/galerie/sfintele-pasti-2024/`;
  `/galerie.html` has no row either. The old Events Calendar URLs are in the same
  position. Before the old host goes away, Phase 4 has to decide what each of them
  does.
- **Eight `.doc` links** in the migrated `studii` page still point at the old host by
  design: the spec never migrates `.doc`, and what they should do is Phase 4's ruling.
- **The `?p=<id>` short links are unchanged from Phase 2** (section I): the URL map
  carries no WordPress IDs, `_redirects` cannot match a query string, and the dump that
  could supply the IDs lives outside this repository. Phase 4 needs a Pages Function
  for them, or an explicit recorded decision to let those links die.
- **`/sitemap-index.xml` does not exist.** Spec §5's IA lists it beside the routes, and
  the build emits no sitemap; it was recorded as out of Phase 3's spec §19 scope. Phase 4
  decides whether to emit one — Astro's sitemap integration or a route of our own — and
  submits it to Search Console (spec §14 step 5).

**Unverified until it is deployed.**

1. **The Turnstile/Resend round trip** — steps K1-K5. The Function's logic is
   unit-tested with an injected `fetch`; no run in this repository has ever reached
   either service.
2. **The QR-bill test transfer** (spec §9). The bill is byte-stable and structurally
   correct, and no bank app has scanned this exact payload. Make one small real
   transfer from the deployed `/doneaza/` and confirm the recipient, IBAN, currency and
   reference arrive as printed. A wrong reference field produces a payment nobody can
   reconcile.
3. **The Cloudflare IP rate-limit rule** — step K3. It exists only in the dashboard;
   nothing in this repository can see it fire.
4. **PDF response headers.** Nothing here can see what Cloudflare sends for a PDF, and
   the gate cannot rewrite the bytes, so this is the last control on a file the parish
   uploads and the site serves. Check one:

   ```bash
   curl -sI https://<project>.pages.dev/documente/pastorala-invierea-domnului-ro-2019.pdf \
     | grep -i -E 'content-type|cache-control|x-content-type-options'
   ```

   *Good answer:* `content-type: application/pdf` and the sitewide
   `x-content-type-options: nosniff`. The cache header is Cloudflare's default —
   nothing in this repository sets one for the PDFs — so write down what you see rather
   than assuming it.

**A declared gap, not an open question.** Text contrast inside the QR-bill's inline SVG
cannot be judged by axe: it treats any SVG node as a graphic and returns an
`incomplete`, so `scripts/a11y.mjs` prints those nodes as an exempt set on every run
and still fails on every other incomplete. The bill is black on white by the
specification, and the test transfer in point 2 is what exercises the bill itself.

**Check it from the repository.**

```bash
TZ=Europe/Zurich npm run test:all && TZ=Europe/Zurich npm run check
```

*Good answer:* both exit 0. The integration tests read the built `dist/` — every new
route, the collections, the 87 PDFs, the QR-bill and the form's fallback — and the four
browser passes audit every built page, including the phone and wide widths and the
picker fixture that renders the week the JavaScript hides.

## What still cannot be verified from this repository

Say "unverified" about these, not "should work".

1. **That Cloudflare applies `_headers` at all.** Step F1.
2. **The `.ics` `Content-Type`.** A static build discards the header
   `src/pages/program.ics.ts` sets, so this rule decides it and nothing else can see it.
   Step F2.
3. **Everything the OAuth flow touches.** `img-src avatars.githubusercontent.com` is in the
   policy and has never been exercised; the Worker origin is **not** in `connect-src` and
   may need to be. Step G.
4. **Whether CI passes on GitHub's runners.** The same commands, in the same order, with the
   same `TZ`, from a clean tree, pass locally. The runner-specific risk is
   Chrome/chromedriver version skew, which `DETECT_CHROMEDRIVER_VERSION` exists to absorb —
   itself unverified until A4.
5. **Whether the Cloudflare build container can run this build.** Verified only that the
   build needs no devDependencies beyond what `npm ci` installs, and that it works with
   chromedriver's download skipped.
6. **Lighthouse scores.** Step H8.
7. **The six-hourly rebuild firing.** Step E3.
8. **Everything Phase 3 added that a deployment decides.** Section L's four unverified
   items — the form's round trip, the QR-bill's test transfer, the rate-limit rule and
   the PDFs' response headers — plus the QR-bill's SVG text, which axe cannot judge.
   Section L is where each is written out.
