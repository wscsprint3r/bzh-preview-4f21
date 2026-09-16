# Putting bor-zh.ch into service

Everything in this file needs credentials no agent has, so none of it has been done and
none of it has been tested. Work through it in order; each step says what a good answer
looks like, because "it did not error" is not one.

> **During Phase 1 the site lives at `https://<project>.pages.dev/`.** `www.bor-zh.ch`
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

The work is on `phase-1`; `public/admin/config.yml` says `branch: main`. So either:

- **merge `phase-1` into `main` and keep `main` as the default** — simplest, and it needs no
  edits at all; or
- **keep `phase-1`**: change that line in `config.yml`, set `phase-1` as the default branch
  (GitHub → Settings → General → Default branch), and change the branch filter in
  `ci.yml`.

**Keeping `phase-1` without making it the default is the one combination that fails
silently**, which is why `rebuild.yml` refuses to run from a non-default branch: dispatch it
by hand from `phase-1` while `main` is the default and it stops and says so, rather than
posting the hook and letting you conclude the schedule works.

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
`[hashuri-csp] CSP: index.html script inline de NNNN octeți -> 'sha256-…'`. **If that line
is missing, stop** — the policy shipped without the hash and the site's JavaScript is dead,
with no visible symptom, because the page without JavaScript is the designed fallback. Then
`https://<project>.pages.dev/` serves the homepage.

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

**D2.** `public/admin/pornire.mjs`: `const CONTACT = 'persoanei care se ocupă de site';` —
it is in the dative, so a real person drops straight in:
`'lui Ion Popescu (ion@exemplu.ch)'`.

**D3.** `npm test && npm run test:build`, then commit and push.

*Good answer:* both exit 0, and Cloudflare deploys the new commit.

## E — the six-hourly rebuild

**E1.** Cloudflare Pages → Settings → Builds & deployments → Deploy hooks → create one (any
name; `rebuild` is the obvious one) on the production branch. Copy its URL.

**E2.** GitHub → Settings → Secrets and variables → Actions → New repository secret, named
exactly **`CF_DEPLOY_HOOK`**, value = that URL.

**E3.** Actions → **Reconstruire la fiecare șase ore** → *Run workflow*, **from the default
branch**.

*Good answer:* the job is green and a new deployment appears in Cloudflare within a minute.

- *If it prints `Secretul CF_DEPLOY_HOOK nu este configurat`*, E2 did not take — check the
  name character for character.
- *If it prints `Programarea rulează doar din ramura implicită`*, you dispatched it from a
  branch that is not the default one. That is A1: the scheduled run would never have
  fired. Either dispatch from the default branch, or make this branch the default.

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
`www.githubstatus.com/api/v2/status.json`, a `data:` logo fetch, and two `blob:` image
refusals. `public/_headers` explains every one.

**If you add anything to the policy, add it to `CSP_ASTEPTAT` in `scripts/a11y.mjs` too**,
or `npm run a11y` will fail on it — that is the list doing its job. The same list fails when
an expected refusal *stops* appearing, which is what catches an audit that measured nothing.

If sign-in fails with nothing about CSP in the console, the cause is far more likely C2's
callback URL or C3's `ALLOWED_DOMAINS`.

The `blob:` refusals cost the media library its thumbnails. Put that on the editors' card,
so the first person to meet an empty thumbnail does not report it as "the CMS is broken".

## H — the round trip, which is the Phase 1 deliverable

**H1.** In `/admin/`, add next Sunday and press **Save**. (`Save` publishes. There is no
`Publish` button in this configuration.)

*Good answer:* a commit appears on the build branch adding `src/content/slujbe/<date>.yml`.

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

## I — finish

**I1.** Print the editors' card and hand it out at the training session. Every row on it was
read off a running CMS.

**I2.**

```bash
git tag -a phase-1 -m "Phase 1: liturgical schedule and CMS"
git push --tags
```

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
