# Phase 3 — "The rest" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the five features spec §19 calls "the rest" — events, galleries, the pastorale/PDF archive, donations with a Swiss QR-bill, and the contact form — without weakening a single Phase 1–2 guarantee.

**Architecture:** Three new content collections (`events`, `galerii`, `documente`) with strict Zod schemas behind the existing pattern; the old albums and all 87 measured PDFs are migrated through `migration/`, PDFs gated rather than re-encoded; `/contact` and `/doneaza` become `pages` entries rendered by dedicated routes that append generated blocks (accounts, QR-bill, form); the parish's three accounts become one structured `accounts` list in the `settings` singleton; the contact form is a pure, unit-tested module plus a thin Cloudflare Pages Function; every new route enters the existing budget and browser-audit machinery.

**Tech Stack:** Astro 7 static output, `astro/zod`, Sveltia CMS, Vitest (unit + integration), headless Chrome via `scripts/a11y.mjs`, `sharp` (images), poppler `pdfinfo` (PDF gate), `swissqrbill` (QR-bill), Cloudflare Pages Functions + Turnstile + Resend (form).

**Spec:** `docs/superpowers/specs/2026-09-15-parish-site-rewrite-design.md` — §5 (IA), §6.3–6.7 (content model), §9 (donations), §10 (contact form), §12 (redirects), §13 (budget), §14 (security), §16 (editor documentation), §19 (phasing). The spec is design authority; where this plan departs from it, the departure and its reason are recorded in the task that departs.

**Branch:** `phase-3`, based on `origin/main` at `decaf0e` — Phase 2 merged, including `08b877f`'s three review fixes: the footer `Pagini` menu, uploads moved to `public/uploads` with the root-absolute `/uploads` public path, and `scripts/csp-hash.mjs`'s `EXPECTED_INLINE` allow-list. This plan is written against that head; where an earlier draft assumed `src/assets/uploads` or automatic script hashing, the steps below say what is true now.

## Status

Last updated 2026-09-18. **Tasks 1-13 are complete.** The phase ran on `phase-3`,
based on `origin/main` at `decaf0e`; every task was reviewed, and the fix rounds a
task needed are named in its State. Task 13's range ends at `HEAD` because this file
ships inside the commit it describes. It was deliberately untracked until then: it
names files that later tasks created, and `referenced-paths.test.ts` sweeps every
tracked file, so an early commit of the plan would have reddened every intermediate
commit with 60-plus unresolved tokens.

| Task | State | Commits |
|---|---|---|
| 1 · the parish's accounts | done, review clean, 3 minors parked | `decaf0e..1083999` |
| 2 · one image resolver | done, review clean, 6 minors parked | `1083999..8d5e0ce` |
| 3 · the three collections | done, 1 fix round, 2 minors parked | `8d5e0ce..ed2d97a` |
| 4 · the two photo albums | done, review clean, 5 minors parked | `ed2d97a..673530a` |
| 5 · 87 PDFs behind a gate | done, review clean, 3 minors parked | `673530a..091cc73` |
| 6 · `/galerie` | done, review clean, 5 minors parked | `091cc73..0e7eeab` |
| 7 · `/evenimente` | done, 2 fix rounds, 4 minors parked | `0e7eeab..571c11e` |
| 8 · `/pastorale` | done, 1 fix round, 6 minors parked | `571c11e..2221048` |
| 9 · `/contact` and `/doneaza` | done, review clean, 5 minors parked | `2221048..8d2fc85` |
| 10 · the account blocks and copy button | done, review clean, 5 minors parked | `8d2fc85..2213679` |
| 11 · the Swiss QR-bill | done, review clean, 5 minors parked | `2213679..2b0deab` |
| 12 · the contact form | done, review clean, 5 minors parked | `2b0deab..07da3b3` |
| 13 · navigation, budgets, handover | done, this task | `07da3b3..HEAD` |

The parked findings are enumerated in each task's review notes under the scratch
ledger, which is git-ignored; the counts above are what survives in the repository.
**One has artifact impact, and it is recorded rather than fixed here.** Task 6 found
that `.gg-item img` and `.album-link img` compile with a parent scope attribute the
`ContentImage` `<img>` does not carry, so the intended hairline border never renders
on an album page or the album index; the repository's pattern for a child component's
element is `.prose :global(img)`. It is a one-word fix, and it is deliberately not in
Task 13's commit: that commit is navigation, budgets and documentation, and a style
change smuggled into it is the mixed commit this paper trail exists to prevent. It
wants a follow-up commit with its own guard.

---

## Global Constraints

Every task's requirements implicitly include this section. Values are copied from `AGENTS.md` and the spec.

- **Diacritics are comma-below.** U+0218/U+0219 (S/s) and U+021A/U+021B (T/t) are the only correct forms; the U+015E/U+015F/U+0162/U+0163 cedilla forms are a defect. The four numbers live in `src/lib/cedilla.ts` and **nowhere else** — never written as glyphs, hex or `\u` escapes outside it. `src/lib/diacritics-sources.test.ts` sweeps every tracked file and fails naming path and offset; `src/lib/diacritics.itest.ts` sweeps `dist/`.
- **Identifiers are English; Romanian is only what a person reads.** Variables, functions, types, keys, filenames, `it()`/`describe()` names and build diagnostics are English. Romanian stays in page copy, CMS `label:`/`hint:`/`description:`, Zod messages in `src/lib/schema.ts` and `src/lib/content-schema.ts`, and `PAGE_EXPLANATION` in `scripts/check-budget.mjs`.
- **Dates are `YYYY-MM-DD` strings; times are `HH:MM` local strings.** Never a UTC instant for a service or an event. `todayInZurich()`/`timeInZurich()` in `src/lib/week.ts` are the only timezone-aware functions.
- **`#B08B3E` and `#C8A45C` are ornament only — never text.** On the page use `--gold-text`; inside an oxblood panel use `TEXT_ROLES_ON_OXBLOOD` from `src/lib/tokens.ts`. `tokens.test.ts` and `stylesheet.itest.ts` enforce both.
- **The parent directory is not part of this repository.** Never `git add` anything from outside this root; never weaken `.gitignore`. `migration/` reads the 08-22 uploads tree and the 08-27 dump by absolute path and a fresh clone cannot run it.
- **Import Zod as `astro/zod`**, never a direct `zod` dependency.
- **`SERVICE_NAMES` in `src/lib/schema.ts` and `CATEGORIES` in `src/lib/content-schema.ts` must stay identical to the option lists in `public/admin/config.yml`.** Tests fail if they drift.
- **`script-src` in `public/_headers` carries `{{script-hashes}}`, never a hand-written hash and never `'unsafe-inline'`.** `scripts/csp-hash.mjs` substitutes at `astro:build:done`; `headers.itest.ts` asserts the shipped file from the other side.
- **`published: false` means no page at all**, for articles and (by construction) for anything else that gains a visibility flag.
- **The performance budget (spec §13) is enforced, not aspirational.** `PAGE_BUDGET` and `REQUEST_BUDGET` in `scripts/check-budget.mjs` fail on any page without an entry. A limit is raised only with a recorded ruling; this phase records exactly one — `doneaza` moves to 256 KiB for the embedded QR-bill (Task 11), because a payment instrument is not content growth — and no other.
- **Images live in two places, on purpose.** `src/assets/content/` holds migration-written images that go through Astro's pipeline; `public/uploads/` holds CMS uploads, served as-is at `/uploads/…` (settled in `08b877f`; the binary predicate and `binaries.itest.ts` already cover that prefix). `public/documente/` is the PDF tree. SVG is never migrated; `.doc` is never migrated; a PDF is copied only if the gate passes (readable by `pdfinfo`, no `/JavaScript`, `/JS`, `/EmbeddedFile` or `/Launch`).
- **An inline `<script>` is not hashed automatically.** `scripts/csp-hash.mjs` pins `EXPECTED_INLINE` — one entry per page and script, matched by a marker string — and fails the build on anything else, so that a `<script>` injected through content can never be allow-listed. Every inline script this phase adds is registered there, in the same task that adds it.
- **Test verdicts come from the process exit code, never `.vitest/json/output.json`.** Run `rtk proxy npx vitest run …` or `./node_modules/.bin/vitest`. Use `rtk proxy grep` / `rtk proxy diff` / `rtk proxy git` for anything whose output decides a fact.
- **Print what was measured, not only the verdict**, with `process.stdout.write` (a passing test's `console.log` is invisible under the default reporter).
- **`src/lib/content-schema.ts` must stay loadable under plain `node`**: relative imports carry their `.ts` extension, erasable TypeScript only, no `astro:content`. Its child-process test in `content-schema.test.ts` is the guard.

## File Structure

**New libraries**
- `src/lib/accounts.ts` — IBAN normalisation, MOD-97 validation, display grouping, QR-account selection.
- `src/lib/images.ts` — resolves both frontmatter image shapes to Astro `ImageMetadata`.
- `src/lib/documents.itest.ts` — the guard over the 87 committed PDFs and the gate; the plan sketched a shared documents library for path/slug helpers and the implementation needed none, because the route links the schema-validated `data.file` and `migration/slugify.mjs` owns slug generation.
- `src/lib/contact.ts` — pure contact-form logic (validation, honeypot, Turnstile verify, Resend send), all with injected `fetch`.
- `src/lib/qr-bill.ts` — maps an account + settings to a `swissqrbill` data object and renders SVG.

**New content**
- `src/content/events/*.md`, `src/content/galerii/*.md`, `src/content/documente/*.md`
- `src/assets/content/galleries/…` (migrated albums); `public/uploads/…` is the CMS destination `08b877f` declared — this phase adds no files there, only the resolver that renders them.
- `public/documente/*.pdf` (87 files)
- Two additional `src/content/pages/` entries written by migration: `contact.md`, `doneaza.md`

**New components and routes**
- `src/components/ContentImage.astro`, `EventCard.astro`, `GalleryGrid.astro`, `AccountBlock.astro`, `ContactForm.astro`
- `src/pages/galerie/index.astro`, `src/pages/galerie/[slug].astro`
- `src/pages/evenimente/index.astro`, `src/pages/evenimente/[slug].astro`
- `src/pages/pastorale/index.astro`
- `src/pages/contact.astro`, `src/pages/doneaza.astro`
- `functions/api/contact.ts`

**New migration modules**
- `migration/galleries.mjs`, `migration/documents.mjs`, `migration/pdf-gate.mjs`, `migration/slugify.mjs`

**Touched**
- `src/lib/content-schema.ts`, `src/content.config.ts`, `src/content/settings/settings.yml`
- `public/admin/config.yml`, `src/lib/cms.test.ts`
- `src/pages/[...page].astro`, `src/lib/routes.ts` (new), `src/components/SiteHeader.astro`, `src/components/SiteFooter.astro`
- `migration/pages.mjs`, `migration/url-map.mjs`, `migration/run.mjs`, `migration/media.mjs`
- `scripts/check-budget.mjs`, `scripts/a11y.mjs`, `scripts/a11y-picker.mjs`, `src/lib/fixtures.ts`, `src/lib/a11y-passes.test.ts`
- `src/lib/diacritics-sources.test.ts`, `src/lib/binaries.itest.ts`, `src/lib/referenced-paths.test.ts`, `src/lib/build-output.itest.ts`, `public/_headers`
- `.github/workflows/ci.yml`, `package.json`, `docs/url-map.csv`, `docs/handover.md`, `migration/README.md`

---

### Task 1: The parish's accounts, in one place

**Files:**
- Create: `src/lib/accounts.ts`, `src/lib/accounts.test.ts`
- Modify: `src/lib/content-schema.ts` (settings schema), `src/content/settings/settings.yml`, `public/admin/config.yml`, `src/lib/cms.test.ts`, `src/lib/content-schema.test.ts`

**Interfaces:**
- Produces: `normalizeIban(iban: string): string`, `isValidIban(iban: string): boolean`, `formatIban(iban: string): string`, `qrAccount(accounts: Account[]): Account | undefined`, `interface Account { label; iban; holder; bank; qr_bill }`.
- The `settings` singleton's shape changes: `iban`/`iban2` are **removed**, `accounts: Account[]` is added. Later tasks (10, 11) consume `settings.accounts`.

**Why:** spec §9 requires each IBAN in a bordered block; §18's open question (which account is which) is answered by the old site's own pages — 5501 P is general giving, 5502 K is the building fund, and `servicii-liturgice` carries a third Credit Suisse account. One list means the copy blocks and the QR-bill cannot disagree about an IBAN.

- [ ] **Step 1: Write the failing account tests**

```ts
// src/lib/accounts.test.ts
import { describe, expect, it } from 'vitest';
import { formatIban, isValidIban, normalizeIban, qrAccount } from './accounts';

const ACCOUNTS = [
  { label: 'Susținerea parohiei', iban: 'CH54 0021 5215 3048 5501 P', holder: 'X', bank: 'UBS', qr_bill: false },
  { label: 'Spațiul bisericii', iban: 'CH11 0021 5215 3048 5502 K', holder: 'X', bank: 'UBS', qr_bill: true },
];

describe('IBAN handling', () => {
  it('strips spaces and hyphens and uppercases', () => {
    expect(normalizeIban('ch54 0021-5215 3048 5501 p')).toBe('CH540021521530485501P');
  });

  it('accepts the parish accounts as printed on the old site', () => {
    expect(isValidIban('CH54 0021 5215 3048 5501 P')).toBe(true);
    expect(isValidIban('CH11 0021 5215 3048 5502 K')).toBe(true);
    expect(isValidIban('CH85 0483 5035 8248 3100 0')).toBe(true);
  });

  it('POSITIVE CONTROL: rejects a transposed digit and a truncated IBAN', () => {
    expect(isValidIban('CH54 0021 5215 3048 5502 P')).toBe(false);
    expect(isValidIban('CH54 0021 5215 3048 5501')).toBe(false);
  });

  it('groups display in fours, keeping the last group short', () => {
    expect(formatIban('ch540021521530485501p')).toBe('CH54 0021 5215 3048 5501 P');
  });
});

describe('the QR account', () => {
  it('is the single flagged entry', () => {
    expect(qrAccount(ACCOUNTS)?.iban).toBe('CH11 0021 5215 3048 5502 K');
  });

  it('is undefined when none is flagged', () => {
    expect(qrAccount(ACCOUNTS.map((a) => ({ ...a, qr_bill: false })))).toBeUndefined();
  });
});
```

If any of the three parish IBANs fails MOD-97, **stop and surface the value** — do not weaken the check; a wrong IBAN sends money somewhere else.

- [ ] **Step 2: Run it and watch it fail**

Run: `./node_modules/.bin/vitest run src/lib/accounts.test.ts`
Expected: FAIL — `Cannot find module './accounts'`.

- [ ] **Step 3: Implement `src/lib/accounts.ts`**

```ts
/** One account the parish publishes, as the settings singleton stores it. */
export interface Account {
  label: string;
  iban: string;
  holder: string;
  bank: string;
  qr_bill: boolean;
}

export function normalizeIban(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase();
}

/**
 * ISO 7064 MOD-97-10, the IBAN checksum. Country-agnostic on purpose: a future
 * German IBAN is not silently accepted by shape alone.
 */
export function isValidIban(value: string): boolean {
  const iban = normalizeIban(value);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const digit = char >= 'A' ? char.charCodeAt(0) - 55 : Number(char);
    remainder = (remainder * 10 + digit) % 97;
  }
  return remainder === 1;
}

/** Display form: groups of four, space-separated. */
export function formatIban(value: string): string {
  return normalizeIban(value).replace(/(.{4})(?=.)/g, '$1 ');
}

export function qrAccount(accounts: Account[]): Account | undefined {
  return accounts.find((account) => account.qr_bill);
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `./node_modules/.bin/vitest run src/lib/accounts.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Extend the settings schema**

In `src/lib/content-schema.ts`, above `settingsSchema` (which stays `strictObject` with `strictKeys`), add `import { isValidIban } from './accounts.ts';` and:

```ts
const accountSchema = z.strictObject(
  {
    label: nonEmptyText('Contul trebuie să aibă o denumire.', 'Denumirea contului nu poate fi goală.'),
    iban: z
      .string({ error: () => 'IBAN-ul se scrie ca text.' })
      .trim()
      .refine(isValidIban, { message: 'IBAN-ul nu este valid. Verificați cifrele.' }),
    holder: nonEmptyText('Contul trebuie să aibă un titular.', 'Titularul nu poate fi gol.'),
    bank: nonEmptyText('Contul trebuie să aibă o bancă.', 'Numele băncii nu poate fi gol.'),
    qr_bill: z.boolean({ error: () => 'Câmpul qr_bill primește doar true sau false.' }).default(false),
  },
  strictKeys,
);
```

Add to `settingsSchema`'s object: `accounts: z.array(accountSchema),` and delete `iban` and `iban2`. Add a second `.superRefine`:

```ts
  .superRefine((value, ctx) => {
    const flagged = value.accounts.filter((account) => account.qr_bill);
    if (flagged.length > 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['accounts'],
        message: 'Un singur cont poate purta codul QR; debifați restul.',
      });
    }
  })
```

- [ ] **Step 6: Write the settings file**

`src/content/settings/settings.yml` gains, after `email:`:

```yaml
accounts:
  - label: "Donații pentru susținerea parohiei"
    iban: "CH54 0021 5215 3048 5501 P"
    holder: "Rumänisch-Orthodoxe Kirchgemeinde St. Nikolaus"
    bank: "UBS (Schweiz) AG"
    qr_bill: false
  - label: "Donații pentru un spațiu mai încăpător"
    iban: "CH11 0021 5215 3048 5502 K"
    holder: "Rumänisch-Orthodoxe Kirchgemeinde St. Nikolaus"
    bank: "UBS (Schweiz) AG"
    qr_bill: true
  - label: "Plăți pentru serviciile liturgice"
    iban: "CH85 0483 5035 8248 3100 0"
    holder: "Rumänisch-Orthodoxe Kirchgemeinde St. Nikolaus"
    bank: "Credit Suisse (Schweiz) AG"
    qr_bill: false
```

- [ ] **Step 7: Update the CMS form**

In `public/admin/config.yml`'s settings `fields:`, remove `iban` and `iban2`, add:

```yaml
          - name: accounts
            label: Conturi
            label_singular: Cont
            widget: list
            summary: "{{fields.label}} — {{fields.iban}}"
            hint: >
              Conturile parohiei. Un singur cont poate purta bifa pentru cod QR,
              cel afișat pe pagina Donează.
            fields:
              - name: label
                label: Denumirea contului
                widget: string
              - name: iban
                label: IBAN
                widget: string
              - name: holder
                label: Titular
                widget: string
              - name: bank
                label: Banca
                widget: string
              - name: qr_bill
                label: Cod QR pe pagina Donează
                widget: boolean
                default: false
```

- [ ] **Step 8: Extend the config-sync test**

In `src/lib/cms.test.ts`, add to `describe('the CMS form, checked against the schemas the build enforces')`:

```ts
  it('offers the accounts as a list and keeps no second IBAN field', () => {
    const settings = collection('settings').files?.[0];
    expect(settings, 'settings has no file block').toBeDefined();
    const names = (settings?.fields ?? []).map((f) => f.name);
    expect(names).toContain('accounts');
    expect(names).not.toContain('iban');
    expect(names).not.toContain('iban2');
  });
```

- [ ] **Step 9: Run the full unit suite**

Run: `rtk proxy npx vitest run`
Expected: exit 0; the new accounts tests and the updated schema/config tests pass.

- [ ] **Step 10: Commit**

```bash
git add src/lib/accounts.ts src/lib/accounts.test.ts src/lib/content-schema.ts \
  src/content/settings/settings.yml public/admin/config.yml src/lib/cms.test.ts
git commit -m "feat: one structured list for the parish's three accounts"
```

---

### Task 2: One image resolver for both frontmatter shapes

**Files:**
- Create: `src/lib/images.ts`, `src/lib/images.test.ts`, `src/components/ContentImage.astro`
- Modify: `src/pages/noutati/[slug].astro`, `src/lib/build-output.itest.ts`

**Interfaces:**
- Produces: `imageKey(value): string | null`, `resolveImage(value): ImageMetadata | null`, `publicUpload(value): string | null`, and `ContentImage.astro` with props `{ image: string; alt: string; widths?: string; loading?: 'lazy' | 'eager' }`.
- Consumes **two shapes that render differently**: migration-written `../../assets/content/…` (an Astro asset: processed, hashed, responsive) and CMS-written `/uploads/…` (`public/uploads`, served byte-for-byte as a plain `<img>`; `08b877f` settled that pair). `/src/…` is not served; the resolver refuses it, and the dist guard that rejects `/src/` references already exists.

**Why now:** `public/admin/config.yml` records this as the Phase 3 integration gap. Until an image-bearing component exists, an uploaded image reaches the repository and no page, on a green build.

- [ ] **Step 1: Confirm the pair this task must honour (no code)**

```bash
/usr/bin/grep -n "media_folder\|public_folder" public/admin/config.yml
/usr/bin/grep -n "UPLOADS_PREFIX\|public/uploads" src/lib/diacritics-sources.test.ts | head -5
```

Expected: `public/uploads` and `/uploads`, and the binary predicate already covering the uploads prefix. **Do not** add a fixture under `public/uploads/` for tests — `08b877f` already made that tree decodable, swept, and distinguishable from editor content by its own guards.

- [ ] **Step 2: Write the failing resolver tests**

```ts
// src/lib/images.test.ts
import { describe, expect, it } from 'vitest';
import { imageKey, publicUpload, resolveImage } from './images';

describe('imageKey', () => {
  it('normalises the migration shape to a repository path', () => {
    expect(imageKey('../../assets/content/2024/05/x.jpg')).toBe('src/assets/content/2024/05/x.jpg');
  });

  it('refuses the unserved /src/ shape outright', () => {
    expect(imageKey('/src/assets/uploads/x.png')).toBeNull();
  });

  it('refuses anything else that is not the migration shape', () => {
    expect(imageKey('')).toBeNull();
    expect(imageKey('https://example.com/x.jpg')).toBeNull();
    expect(imageKey('../../../etc/passwd')).toBeNull();
  });
});

describe('publicUpload', () => {
  it('recognises the CMS shape as a served path', () => {
    expect(publicUpload('/uploads/2026/09/x.png')).toBe('/uploads/2026/09/x.png');
  });

  it('refuses a path that could escape /uploads', () => {
    expect(publicUpload('/uploads/../secret.png')).toBeNull();
    expect(publicUpload('/uploads')).toBeNull();
  });
});

describe('resolveImage', () => {
  it('resolves a real migration-shaped file to metadata with dimensions', () => {
    const image = resolveImage('../../assets/content/2024/05/AdobeStock_298003333.jpeg');
    expect(image?.width).toBeGreaterThan(0);
    expect(image?.height).toBeGreaterThan(0);
  });

  it('does NOT resolve a public upload: it is not an Astro asset', () => {
    expect(resolveImage('/uploads/2026/09/x.png')).toBeNull();
  });

  it('gives null for a migration path that resolves to nothing', () => {
    expect(resolveImage('../../assets/content/2024/05/missing.png')).toBeNull();
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `./node_modules/.bin/vitest run src/lib/images.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `src/lib/images.ts`**

```ts
import type { ImageMetadata } from 'astro';

const MODULES = import.meta.glob<ImageMetadata>('/src/assets/**/*.{jpeg,jpg,png,webp,avif}', {
  eager: true,
  import: 'default',
});

/** The repository path a migration-written frontmatter value names, or null. */
export function imageKey(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.startsWith('/')) return null;
  const at = trimmed.indexOf('assets/');
  if (at === -1 || /^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null;
  const key = `src/${trimmed.slice(at)}`;
  return key.includes('/../') ? null : key;
}

/** The served URL a CMS upload names, or null. `/src/…` is not one. */
export function publicUpload(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith('/uploads/')) return null;
  const rest = trimmed.slice('/uploads/'.length);
  if (rest === '' || rest.includes('..') || rest.includes('//')) return null;
  return trimmed;
}

export function resolveImage(value: string): ImageMetadata | null {
  const key = imageKey(value);
  if (key === null) return null;
  return MODULES[`/${key}`] ?? null;
}
```

- [ ] **Step 5: Run the resolver tests, then add the component**

Run: `./node_modules/.bin/vitest run src/lib/images.test.ts`
Expected: PASS. Then `src/components/ContentImage.astro`:

```astro
---
import { Image } from 'astro:assets';
import { publicUpload, resolveImage } from '../lib/images';

interface Props {
  image: string;
  alt: string;
  widths?: string;
  loading?: 'lazy' | 'eager';
}

const { image, alt, widths = '100vw', loading = 'lazy' } = Astro.props;
/*
 * TWO SHAPES, TWO RENDERINGS, AND A MISSING PATH FAILS THE BUILD.
 * The migration's `../../assets/content/…` is an Astro asset: imported, hashed
 * and served as responsive AVIF/WebP. The CMS's `/uploads/…` is a committed
 * public file, served byte-for-byte and NOT an Astro asset, so it cannot go
 * through `<Image>`; a plain `<img>` is the honest rendering. Anything else —
 * including the unserved `/src/…` namespace the CMS no longer writes — is a
 * build error, because `image` is an unvalidated string and this is the only
 * place a wrong path is ever caught.
 */
const asset = resolveImage(image);
const upload = publicUpload(image);
if (asset === null && upload === null) {
  throw new Error(
    `Imaginea nu a fost găsită: „${image}”. Folosiți o cale de tipul ` +
      '../../assets/content/… sau /uploads/…, nu /src/….',
  );
}
const widthsList = widths.split(',').map((w) => Number(w.trim())).filter((w) => w > 0);
---

{asset !== null ? (
  <Image
    src={asset}
    alt={alt}
    widths={widthsList.length > 0 ? widthsList : undefined}
    sizes={widths}
    loading={loading}
    decoding="async"
  />
) : (
  <img src={upload} alt={alt} loading={loading} decoding="async" />
)}
```

- [ ] **Step 6: Render the article image**

In `src/pages/noutati/[slug].astro`, after the meta paragraph and before `.prose`:

```astro
    {entry.data.image && (
      <div class="article-image">
        <ContentImage image={entry.data.image} alt={title} widths="(max-width: 34rem) 90vw, 40rem" loading="eager" />
      </div>
    )}
```

with `import ContentImage from '../../components/ContentImage.astro';` and a scoped `.article-image { margin: 0 0 1.75rem; max-width: var(--masura); border: 1px solid var(--rule); }`. Leave `ArticleCard` text-only: cards are a list, and images there would change the measured `/noutati` budget for no content gain.

- [ ] **Step 7: Assert the built page carries a real image**

In `src/lib/build-output.itest.ts`'s news-pages describe, add:

```ts
  it('a frontmatter image on a published article reaches the page as a real file', () => {
    const withImage = publishedArticleFiles().filter((f) => Boolean(f.frontmatter.image));
    expect(withImage.length, 'no published article has a frontmatter image').toBeGreaterThan(0);
    const html = read(`noutati/${withImage[0]!.slug}/index.html`);
    const match = html.match(/<img[^>]+src="(\/_astro\/[^"]+)"/);
    expect(match, 'no built image on the article page').not.toBeNull();
    expect(existsSync(`dist${match![1]}`), `${match![1]} is missing from dist/`).toBe(true);
  });
```

- [ ] **Step 8: Run everything the component touched**

Run: `rtk proxy npx vitest run && npm run check && npm run test:build`
Expected: exit 0 each; `test:build` includes the dist integration tests, among them the existing "no built page references the unserved `/src/` namespace" guard, which this component can never trip because the resolver refuses that shape.

- [ ] **Step 9: Commit**

```bash
git add src/lib/images.ts src/lib/images.test.ts src/components/ContentImage.astro \
  src/pages/noutati/[slug].astro src/lib/build-output.itest.ts
git commit -m "feat: resolve both frontmatter image shapes, and render one"
```

---

### Task 3: The three collections

**Files:**
- Modify: `src/lib/content-schema.ts`, `src/content.config.ts`, `public/admin/config.yml`, `src/lib/cms.test.ts`, `src/lib/content-schema.test.ts`
- Create: `src/content/events/.gitkeep`, `src/content/galerii/.gitkeep`, `src/content/documente/.gitkeep`

**Interfaces:**
- Produces: `eventSchema`, `gallerySchema`, `documentSchema` and their `Event`, `Gallery`, `Document` types; collections `events`, `galerii`, `documente` on `getCollection`.
- Slug convention: the **filename is the slug** for all three. Events: an event saved with the slug `hram-2026` becomes `/evenimente/hram-2026/`; galleries: `sfintele-pasti-2024.md` → `/galerie/sfintele-pasti-2024/`. Migration and CMS both write this shape.

- [ ] **Step 1: Write the failing schema tests**

In `src/lib/content-schema.test.ts`, mirroring the existing style (valid parse, Romanian message by name, strict-key rejection, one positive control per refinement):

```ts
describe('the events schema', () => {
  const event = {
    title: 'Concert de colinde',
    start_date: '2026-12-19',
    time: '18:00',
    location: 'Capela Sf. Katharina',
    description: 'Concertul corului parohial.',
  };

  it('accepts a minimal event and leaves end_date absent', () => {
    const parsed = eventSchema.parse(event);
    expect(parsed.start_date).toBe('2026-12-19');
    expect(parsed.end_date).toBeUndefined();
  });

  it('rejects an end_date before the start, naming the field', () => {
    expect(() => eventSchema.parse({ ...event, end_date: '2026-12-18' })).toThrow(/înainte/);
  });

  it('rejects a time that is not HH:MM and normalises 9:30', () => {
    expect(() => eventSchema.parse({ ...event, time: '25:00' })).toThrow(/18:00/);
    expect(eventSchema.parse({ ...event, time: '9:30' }).time).toBe('09:30');
  });

  it('rejects a misspelled key', () => {
    expect(() => eventSchema.parse({ ...event, locatie: 'x' })).toThrow(/Câmp necunoscut/);
  });
});

describe('the galleries schema', () => {
  const gallery = {
    title: 'Sfintele Paști 2024',
    date: '2024-05-05',
    cover: '../../assets/content/galleries/2024/05/a.jpg',
    images: [{ file: '../../assets/content/galleries/2024/05/a.jpg' }],
  };

  it('accepts one image and leaves its description absent', () => {
    expect(gallerySchema.parse(gallery).images[0]!.description).toBeUndefined();
  });

  it('rejects an empty image list, naming the field', () => {
    expect(() => gallerySchema.parse({ ...gallery, images: [] })).toThrow(/cel puțin o imagine/);
  });
});

describe('the documents schema', () => {
  const document = {
    title: 'Pastorală',
    date: '2025-04-20',
    file: '/documente/pastorala-invierii-2025.pdf',
  };

  it('accepts a PDF under /documente/', () => {
    expect(documentSchema.parse(document).file).toBe('/documente/pastorala-invierii-2025.pdf');
  });

  it('rejects a file that is not a /documente/ PDF', () => {
    expect(() => documentSchema.parse({ ...document, file: '/uploads/x.pdf' })).toThrow(/documente/);
  });
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `./node_modules/.bin/vitest run src/lib/content-schema.test.ts`
Expected: FAIL — `eventSchema is not defined`.

- [ ] **Step 3: Implement the schemas**

In `src/lib/content-schema.ts`, using the existing `nonEmptyText`, `realDate`, `strictKeys` helpers:

```ts
const HOURS = /^([01]?\d|2[0-3]):[0-5]\d$/;

const optionalTime = z
  .string()
  .regex(HOURS, 'Ora se scrie ca 18:00.')
  .transform((value) => {
    const [hours, minutes] = value.split(':');
    return `${hours.padStart(2, '0')}:${minutes}`;
  })
  .optional();

export const eventSchema = z
  .strictObject(
    {
      title: nonEmptyText('Evenimentul trebuie să aibă un titlu.', 'Titlul nu poate fi gol.'),
      start_date: realDate,
      end_date: realDate.optional(),
      time: optionalTime,
      location: nonEmptyText('Evenimentul trebuie să aibă un loc.', 'Locul nu poate fi gol.'),
      image: z.string().trim().optional(),
      poster: z.string().trim().optional(),
      description: z.string().trim().optional(),
    },
    strictKeys,
  )
  .refine((event) => event.end_date === undefined || event.end_date >= event.start_date, {
    message: 'Data de sfârșit nu poate fi înainte de data de început.',
    path: ['end_date'],
  })
  .describe('Un eveniment de pe /evenimente.');

export const gallerySchema = z
  .strictObject(
    {
      title: nonEmptyText('Galeria trebuie să aibă un titlu.', 'Titlul nu poate fi gol.'),
      date: realDate,
      cover: nonEmptyText('Galeria trebuie să aibă o copertă.', 'Coperta nu poate fi goală.'),
      images: z
        .array(
          z.strictObject(
            {
              file: nonEmptyText('Imaginea trebuie să aibă o cale.', 'Calea imaginii nu poate fi goală.'),
              description: z.string().trim().optional(),
            },
            strictKeys,
          ),
        )
        .min(1, { message: 'Galeria trebuie să conțină cel puțin o imagine.' }),
    },
    strictKeys,
  )
  .describe('Un album foto de pe /galerie.');

export const documentSchema = z
  .strictObject(
    {
      title: nonEmptyText('Documentul trebuie să aibă un titlu.', 'Titlul nu poate fi gol.'),
      date: realDate,
      file: z
        .string()
        .trim()
        .regex(/^\/documente\/[a-z0-9-]+\.pdf$/, {
          message:
            'Fișierul trebuie să fie un PDF din /documente/, de exemplu /documente/pastorala-2025.pdf.',
        }),
      author: z.string().trim().optional(),
    },
    strictKeys,
  )
  .describe('O pastorală sau alt document PDF de pe /pastorale.');

export type Event = z.infer<typeof eventSchema>;
export type Gallery = z.infer<typeof gallerySchema>;
export type Document = z.infer<typeof documentSchema>;
```

- [ ] **Step 4: Register the collections**

In `src/content.config.ts`, three `defineCollection` calls mirroring `articles` (glob `**/*.md`, no `generateId` override), then:

```ts
export const collections = { services, articles, pages, settings, events, galerii, documente };
```

- [ ] **Step 5: Add the CMS collections**

In `public/admin/config.yml`, append after `pages` (mirroring its structure and comment style; full YAML as written in the repository's Phase 3 working notes):

```yaml
  - name: events
    label: Evenimente
    label_singular: Eveniment
    folder: src/content/events
    extension: md
    format: yaml-frontmatter
    create: true
    delete: true
    slug: "{{slug}}"
    summary: "{{start_date}} — {{title}}"
    description: >
      Evenimentele parohiei. Apar pe pagina Evenimente, cele viitoare primele.
    fields:
      - { name: title, label: Titlu, widget: string }
      - name: start_date
        label: Data începutului
        widget: datetime
        date_format: YYYY-MM-DD
        time_format: false
        picker_utc: false
      - name: end_date
        label: Data sfârșitului
        widget: datetime
        date_format: YYYY-MM-DD
        time_format: false
        picker_utc: false
        required: false
        hint: Lăsați gol dacă evenimentul ține o singură zi.
      - name: time
        label: Ora
        widget: string
        required: false
        hint: Ora de început, scrisă ca 18:00.
      - { name: location, label: Locul, widget: string }
      - { name: image, label: Imagine, widget: image, required: false }
      - name: poster
        label: Afiș (PDF)
        widget: string
        required: false
        hint: Calea din /documente/, dacă există un afiș.
      - { name: description, label: Descriere scurtă, widget: text, required: false }
      - { name: body, label: Detalii, widget: markdown, required: false }

  - name: galerii
    label: Galerii foto
    label_singular: Galerie
    folder: src/content/galerii
    extension: md
    format: yaml-frontmatter
    create: true
    delete: true
    slug: "{{slug}}"
    summary: "{{date}} — {{title}}"
    description: >
      Albumele foto. Fiecare album are o copertă și o listă de imagini.
    fields:
      - { name: title, label: Titlu, widget: string }
      - name: date
        label: Data
        widget: datetime
        date_format: YYYY-MM-DD
        time_format: false
        picker_utc: false
      - { name: cover, label: Copertă, widget: image }
      - name: images
        label: Imagini
        label_singular: Imagine
        widget: list
        summary: "{{fields.description}}"
        fields:
          - { name: file, label: Imaginea, widget: image }
          - { name: description, label: Descriere, widget: string, required: false }

  - name: documente
    label: Documente
    label_singular: Document
    folder: src/content/documente
    extension: md
    format: yaml-frontmatter
    create: true
    delete: true
    slug: "{{slug}}"
    summary: "{{date}} — {{title}}"
    description: >
      Pastoralele și alte documente PDF, afișate pe pagina Pastorale.
      Fișierele se pun manual în /documente/ înainte de a le înregistra aici.
    fields:
      - { name: title, label: Titlu, widget: string }
      - name: date
        label: Data
        widget: datetime
        date_format: YYYY-MM-DD
        time_format: false
        picker_utc: false
      - { name: file, label: "Fișier (calea din /documente/)", widget: string }
      - { name: author, label: Autor, widget: string, required: false }
```

- [ ] **Step 6: Extend `cms.test.ts`**

Add the three names to the label/description loop and one required-field check per collection:

```ts
  it('the new collections require their schema-required fields', () => {
    for (const field of ['title', 'start_date', 'location']) {
      expect(collectionField('events', field).required).not.toBe(false);
    }
    for (const field of ['title', 'date', 'cover', 'images']) {
      expect(collectionField('galerii', field).required).not.toBe(false);
    }
    for (const field of ['title', 'date', 'file']) {
      expect(collectionField('documente', field).required).not.toBe(false);
    }
  });
```

- [ ] **Step 7: Run the unit suite and the config check**

Run: `rtk proxy npx vitest run && npm run check`
Expected: exit 0 for both.

- [ ] **Step 8: Commit**

```bash
git add src/lib/content-schema.ts src/lib/content-schema.test.ts src/content.config.ts \
  public/admin/config.yml src/lib/cms.test.ts src/content/events src/content/galerii src/content/documente
git commit -m "feat: events, galleries and documents as content collections"
```

---

### Task 4: Migrate both photo albums

**Files:**
- Create: `migration/galleries.mjs`, `migration/galleries.test.mjs`
- Modify: `migration/media.mjs` (one new tree constant), `migration/run.mjs`
- Create (output): `src/content/galerii/sfintele-pasti-2024.md`, `src/content/galerii/imagini-de-la-slujbe.md`, and the images under `src/assets/content/galleries/…`

**Interfaces:**
- Consumes: `migrateImages(sources, repoRoot?, uploadsRoot?)` from `migration/media.mjs` (returns `Map<src, repoRelativePath>`); `query(sql)` from `migration/db.mjs`; the legacy file tree at `/Users/stefan/Work/stuff/site-bzh/backup-2026-08-22/web01/htdocs/`.
- Produces: `parseLegacyGallery(html): { date: string; description: string; file: string }[]` (pure), `galleryIdsFromElementor(json): number[]` (pure), `extractGalleries(): Promise<{ albums: number; images: number }>`; each gallery file validated by `gallerySchema.parse` before writing.

**Measured before writing a line (2026-09-18, discovery run recorded in the task report):** the WP album is the page `evenimente`, carrying **one** `image-gallery` widget whose entries live under `settings.wp_gallery` — **15 images** (the page's other two ids are header images, not gallery entries). The legacy album is `htdocs/galerie.html`: **10 `<img>` tags, 9 unique files, 10 caption blocks**, dates 2001–2003; `galerie/14.jpg`'s caption block has an **empty date** (`<h5 class="m-0"></h5>Zürich`), and `galerie/15.jpg` appears twice with identical caption. The directory holds 18 files; `17.jpg`–`25.jpg` are referenced by no HTML file and carry no captions.

**Controller rulings on the corpus:**
- The WP parser reads `settings.wp_gallery` (the measured shape; `settings.gallery` is `[]` on this dump). A widget with no entries stops the run by name.
- The WP album is its **15** widget entries; the two header images are excluded.
- Album dates: WP **2024-05-05** (Orthodox Easter, the feast the heading names) — the page's `post_date` 2024-05-14 is an edit stamp, not the event; legacy **2001-12-20** (the earliest captioned image, the parish's opening service).
- The legacy album is the **9 unique captioned files**; the duplicate `galerie/15.jpg` tag is collapsed, and the 9 uncaptioned directory files are excluded.
- The per-image historic dates are content and are kept: each image's `description` is `"<date> — <caption>"` where a date exists, and the bare caption where it does not (`galerie/14.jpg` → `Zürich`).
- The parser must **count tags, unique files and caption blocks separately** and stop when they disagree with the measured constants — the earlier sketch's regex silently mis-paired image 14 with image 15's date under a non-greedy match, which is exactly the class of failure this migration's guards exist to stop.

- [ ] **Step 1: Discovery — the WP album's attachment ids and the page's real date**

```bash
node --input-type=module -e "
import { start, stop, query } from './migration/db.mjs';
await start();
try {
  const rows = await query(\"SELECT p.post_name, p.post_date, pm.meta_value FROM wpoi_posts p JOIN wpoi_postmeta pm ON pm.post_id=p.ID AND pm.meta_key='_elementor_data' WHERE p.post_name='evenimente' AND p.post_type='page'\");
  console.log('rows', rows.length, 'date', rows[0]?.[1]);
  const ids = [...String(rows[0]?.[2] ?? '').matchAll(/\"id\":(\d+)/g)].map((m) => Number(m[1]));
  console.log('candidate ids', ids.length, ids.slice(0, 25).join(','));
  const files = await query('SELECT ID, guid FROM wpoi_posts WHERE post_type=\'attachment\' AND ID IN (' + ids.join(',') + ')');
  console.log('attachments', files.length);
  for (const [id, guid] of files) console.log(id, guid.split('/').pop());
} finally { await stop(); }
"
```

Expected: one row; **17** `"id":` matches of which **15** are the widget's `wp_gallery` entries and 2 are page-header images (`3-3Evenimente-poza-header-*.jpg`); the widget's `settings.gallery` is `[]`. If the measured shape differs again, stop and report.

- [ ] **Step 2: Discovery — the legacy captions**

```bash
node --input-type=module -e "
import { readFileSync } from 'node:fs';
const html = readFileSync('/Users/stefan/Work/stuff/site-bzh/backup-2026-08-22/web01/htdocs/galerie.html', 'utf8');
const items = [...html.matchAll(/<img[^>]+src=\"(galerie\/[^\"]+)\"[\s\S]*?<h5[^>]*>([^<]+)<\/h5>\s*([^<]*)/g)];
console.log('items', items.length);
for (const m of items) console.log(m[1], '|', m[2].trim(), '|', m[3].trim());
"
```

Expected: **10 tags, 9 unique files, 10 caption blocks**, dates 2001–2003, with `galerie/14.jpg` carrying an empty date element and `galerie/15.jpg` appearing twice. Any other shape stops the run by name.

- [ ] **Step 3: Write the pure parser tests first**

```js
// migration/galleries.test.mjs
import { describe, expect, it } from 'vitest';
import { galleryIdsFromElementor, legacyAlbumItems, parseLegacyGallery } from './galleries.mjs';

const LEGACY = `
  <h5 class="mb-4">Imagini de la slujbe:</h5>
  <img src="galerie/8.jpg" alt="" width="160px" height="128px">
  <div class="media-body"><h5 class="m-0">20.12.2001</h5>Deschiderea oficiala a parohiei</div>
  <img src="galerie/10.jpg" alt="">
  <div class="media-body"><h5>8.06.2002</h5>Botezul pruncului Andrei Munteanu</div>
  <img src="galerie/14.jpg" alt="">
  <div class="media-body"><h5 class="m-0"></h5>Zürich</div>
  <img src="galerie/15.jpg" alt="">
  <div class="media-body"><h5>06.12.2003</h5>Zürich</div>
  <img src="galerie/15.jpg" alt="">
  <div class="media-body"><h5>06.12.2003</h5>Zürich</div>`;

describe('the legacy album parser', () => {
  it('pairs each image tag with the caption block that follows it, empty date included', () => {
    expect(parseLegacyGallery(LEGACY)).toEqual([
      { file: 'galerie/8.jpg', date: '20.12.2001', caption: 'Deschiderea oficiala a parohiei' },
      { file: 'galerie/10.jpg', date: '8.06.2002', caption: 'Botezul pruncului Andrei Munteanu' },
      { file: 'galerie/14.jpg', date: '', caption: 'Zürich' },
      { file: 'galerie/15.jpg', date: '06.12.2003', caption: 'Zürich' },
      { file: 'galerie/15.jpg', date: '06.12.2003', caption: 'Zürich' },
    ]);
  });

  it('POSITIVE CONTROL: an image tag with no caption block stops the run by name', () => {
    expect(() => parseLegacyGallery('<img src="galerie/9.jpg" alt="">')).toThrow(/galerie\/9\.jpg/);
  });
});

describe('the legacy album items', () => {
  it('collapses the duplicate file and folds the date into the description', () => {
    expect(legacyAlbumItems(parseLegacyGallery(LEGACY))).toEqual([
      { file: 'galerie/8.jpg', description: '20.12.2001 — Deschiderea oficiala a parohiei' },
      { file: 'galerie/10.jpg', description: '8.06.2002 — Botezul pruncului Andrei Munteanu' },
      { file: 'galerie/14.jpg', description: 'Zürich' },
      { file: 'galerie/15.jpg', description: '06.12.2003 — Zürich' },
    ]);
  });

  it('POSITIVE CONTROL: a tag count that disagrees with the measured corpus stops the run', () => {
    const six = `${LEGACY}<img src="galerie/16.jpg" alt=""><div><h5>06.12.2003</h5>Zürich</div>`;
    expect(() => legacyAlbumItems(parseLegacyGallery(six), { tags: 10, unique: 9 }))
      .toThrow(/10/);
  });
});

describe('the Elementor gallery ids', () => {
  it('reads the ids out of the widget entries under settings.wp_gallery, in document order', () => {
    const json = JSON.stringify([
      { elType: 'widget', widgetType: 'image-gallery', settings: { wp_gallery: [{ id: 11 }, { id: 22 }], gallery: [] } },
      { elType: 'widget', widgetType: 'heading', settings: {} },
    ]);
    expect(galleryIdsFromElementor(json)).toEqual([11, 22]);
  });

  it('POSITIVE CONTROL: a blob with only the empty settings.gallery yields an empty list', () => {
    const json = JSON.stringify([
      { elType: 'widget', widgetType: 'image-gallery', settings: { gallery: [{ id: 11 }] } },
    ]);
    expect(galleryIdsFromElementor(json)).toEqual([]);
  });
});
```

- [ ] **Step 4: Run them and watch them fail**

Run: `./node_modules/.bin/vitest run migration/galleries.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 5: Implement `migration/galleries.mjs`**

Structure (mirror `pages.mjs`: pure builders exported, one I/O `extractGalleries`):

```js
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { gallerySchema } from '../src/lib/content-schema.ts';
import { assertImageReferences, rewriteImageSources } from './articles.mjs';
import { query } from './db.mjs';
import { normalize } from './diacritics.mjs';
import { migrateImages } from './media.mjs';

export const GALLERIES_DIR = 'src/content/galerii';
export const LEGACY_HTML =
  '/Users/stefan/Work/stuff/site-bzh/backup-2026-08-22/web01/htdocs/galerie.html';
export const LEGACY_ROOT =
  '/Users/stefan/Work/stuff/site-bzh/backup-2026-08-22/web01/htdocs';

/** The measured shape of the legacy page (2026-09-18 discovery). */
export const LEGACY_EXPECTED = { tags: 10, unique: 9 };

/**
 * One entry per <img> TAG, in document order, duplicates kept. Each caption is
 * the block that follows its own image; the split is on the `<img` boundary, so
 * a caption can never be paired with the NEXT image - the non-greedy
 * alternative silently paired galerie/14.jpg (empty date) with image 15's
 * caption when it was measured.
 */
export function parseLegacyGallery(html) {
  const items = [];
  for (const segment of html.split(/(?=<img\b)/).slice(1)) {
    const src = segment.match(/<img[^>]+src="(galerie\/[^"]+)"/)?.[1];
    if (!src) continue;
    const block = segment.match(/<h5[^>]*>([^<]*)<\/h5>\s*([^<]*)/);
    if (!block) {
      throw new Error(
        `galerie.html: ${src} has no caption block. A caption is this album's only content; ` +
          'do not migrate an image without one.',
      );
    }
    items.push({ file: src, date: block[1].trim(), caption: normalize(block[2].trim()) });
  }
  if (items.length === 0) throw new Error('galerie.html: no captioned image found.');
  return items;
}

/** Unique files, date folded into the description; a count drift stops the run. */
export function legacyAlbumItems(items, expected = LEGACY_EXPECTED) {
  if (items.length !== expected.tags) {
    throw new Error(
      `galerie.html: ${items.length} image tags, but the measured corpus has ${expected.tags}. ` +
        'The page has changed; re-derive the corpus before migrating it.',
    );
  }
  const seen = new Set();
  const unique = [];
  for (const item of items) {
    if (seen.has(item.file)) continue;
    seen.add(item.file);
    unique.push({
      file: item.file,
      description: item.date === '' ? item.caption : `${item.date} — ${item.caption}`,
    });
  }
  if (unique.length !== expected.unique) {
    throw new Error(
      `galerie.html: ${unique.length} unique files, but the measured corpus has ${expected.unique}.`,
    );
  }
  return unique;
}

/** The attachment ids of the image-gallery widget, from `settings.wp_gallery`. */
export function galleryIdsFromElementor(json) {
  const ids = [];
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node === null || typeof node !== 'object') return;
    if (node.widgetType === 'image-gallery' && Array.isArray(node.settings?.wp_gallery)) {
      for (const item of node.settings.wp_gallery) if (item?.id) ids.push(Number(item.id));
    }
    for (const value of Object.values(node)) walk(value);
  };
  try {
    walk(JSON.parse(json));
  } catch {
    // An unreadable blob is an empty gallery here; the caller's count guard
    // stops the run before anything is written.
  }
  return ids;
}
```

`extractGalleries()` then: starts from the two discovery queries, maps attachment guids through `migrateImages` (both albums in one call), builds frontmatter with `cover` = the first image, `images` = `{ file, description? }` (WP entries have no descriptions; legacy entries carry theirs). For the legacy tree, add a `migrateLegacyImages(paths, root)` to `media.mjs` that runs the same decode/re-encode/`MAX_EDGE` path with `uploadsRoot` set to `LEGACY_ROOT` and destination `src/assets/content/galleries/legacy/…` — **with the same second lock**: `isInside(LEGACY_ROOT, resolved)` before every read, mirroring `requireUploads`/`isInside` for the uploads tree, because the legacy tree sits outside the repository too and a path that escapes it is the failure those two functions exist for. Validate each frontmatter with `gallerySchema.parse` before writing; write markdown-relative paths into the content file with the existing `markdownPath` shape (`../../assets/content/…`).

- [ ] **Step 6: Wire the orchestrator and run the migration**

In `migration/run.mjs`, call `extractGalleries()` after `extractPages()` and add `albums`/`galleryImages` to the summary and to `mustBePositive`. Run on this machine:

```bash
node migration/run.mjs
```

Expected: summary reports **2 albums** and **24 gallery images** (15 + 9); exit code 0. Then:

```bash
git status --short   # only the two gallery files and the new images besides Phase 2's outputs
rtk proxy npx vitest run migration/galleries.test.mjs
```

- [ ] **Step 7: Commit**

```bash
git add migration/galleries.mjs migration/galleries.test.mjs migration/media.mjs migration/run.mjs \
  src/content/galerii src/assets/content/galleries
git commit -m "feat(migration): the Easter 2024 and legacy albums, with their captions"
```

---

### Task 5: Migrate all 87 PDFs behind a gate

**Files:**
- Create: `migration/slugify.mjs`, `migration/slugify.test.mjs`, `migration/pdf-gate.mjs`, `migration/pdf-gate.test.mjs`, `migration/documents.mjs`, `migration/documents.test.mjs`
- Create: `src/lib/documents.itest.ts`
- Modify: `migration/url-map.mjs`, `migration/pages.test.mjs` (the existing file that holds the URL-map cases), `migration/run.mjs`, `src/lib/diacritics-sources.test.ts`, `src/lib/binaries.itest.ts`, `.github/workflows/ci.yml`, `migration/README.md`
- Output: `public/documente/*.pdf` (87), `src/content/documente/*.md` (87), `docs/url-map.csv` (rows added)

**Interfaces:**
- Produces: `slugify(value: string): string`, `documentSlug(relativePath: string): string`; `gatePdf(path): { ok: boolean; reason?: string }` (shells `pdfinfo`/`pdfinfo -js`, pure verdict parser exported for tests); `extractDocuments(): Promise<{ documents: number; bytes: number }>`; `PDF_GATE` list imported by the committed-artefact test.
- Consumes: `HTDOCS_ROOT`-relative legacy trees and `UPLOADS_ROOT` (uploads PDFs), all measured 2026-09-18: uploads 10 (35.0 MB), `revista/` 26 (135.7 MB), `pastorala/` 43 (22.6 MB), `files/` 8 (3.8 MB); every one opens with `pdfinfo` and none reports JavaScript.

**Security ruling (recorded):** the gate, not a re-distill. `pdfinfo` readability is the decode test and `pdfinfo -js` plus a byte scan for `/EmbeddedFile` and `/Launch` is the payload test; a file failing either is dropped by name, the same shape as `sharp`'s decode-or-drop. This is weaker than re-encoding and is stated as such in `migration/README.md`: it does not rewrite the bytes, and browser PDF viewers do not execute document JavaScript.

- [ ] **Step 1: Write the slug and gate tests**

```js
// migration/slugify.test.mjs
import { describe, expect, it } from 'vitest';
import { documentSlug, slugify } from './slugify.mjs';

describe('slugify', () => {
  it('transliterates the Romanian letters explicitly', () => {
    expect(slugify('Pastorala Pogorârea Duhului Sfânt 2025')).toBe('pastorala-pogorarea-duhului-sfant-2025');
    expect(slugify('Duminica Ortodoxiei')).toBe('duminica-ortodoxiei');
    expect(slugify('Școala parohială')).toBe('scoala-parohiala');
  });

  it('collapses runs and trims the edges', () => {
    expect(slugify('  9 001 2022  PASTORALA   INVIEREA  ')).toBe('9-001-2022-pastorala-invierea');
  });

  it('is deterministic across runs', () => {
    expect(slugify('Doxologia_18_2019')).toBe(slugify('Doxologia_18_2019'));
  });
});

describe('documentSlug', () => {
  it('strips the extension and the directory', () => {
    expect(documentSlug('pastorala/PASTORALA INVIEREA DOMNULUI RO 2019.pdf'))
      .toBe('pastorala-invierea-domnului-ro-2019');
  });

  it('resolves a collision by prefixing the tree it came from', () => {
    expect(documentSlug('files/Pastorala 2020.pdf', 'files')).toBe('files-pastorala-2020');
  });
});
```

```js
// migration/pdf-gate.test.mjs
import { describe, expect, it } from 'vitest';
import { gateVerdict } from './pdf-gate.mjs';

describe('the PDF gate verdict', () => {
  it('passes a readable file with no JavaScript', () => {
    expect(gateVerdict({ opened: true, javascript: '', bytes: 'x y' }).ok).toBe(true);
  });

  it('POSITIVE CONTROL: fails an unreadable file, naming it', () => {
    expect(gateVerdict({ opened: false, javascript: '', bytes: '' })).toEqual({
      ok: false,
      reason: 'pdfinfo could not read it',
    });
  });

  it('POSITIVE CONTROL: fails a file that reports JavaScript', () => {
    expect(gateVerdict({ opened: true, javascript: 'JavaScript: 2', bytes: '' }).ok).toBe(false);
  });

  it('POSITIVE CONTROL: fails a file carrying an embedded file or launch action', () => {
    expect(gateVerdict({ opened: true, javascript: '', bytes: '/EmbeddedFile' }).ok).toBe(false);
    expect(gateVerdict({ opened: true, javascript: '', bytes: '/Launch' }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `./node_modules/.bin/vitest run migration/slugify.test.mjs migration/pdf-gate.test.mjs`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `migration/slugify.mjs` and `migration/pdf-gate.mjs`**

`slugify` maps the six Romanian letters by their own codepoints before `NFD` (comma-below does not decompose): `ș→s, ț→t, ă→a, â→a, î→i, Ș→S, Ț→T, Ă→A, Â→A, Î→I`, then `NFD`, strip `\p{M}`, lower-case, non-alphanumerics to `-`, collapse, trim. `documentSlug(relativePath, treePrefix?)` strips `.pdf`, takes the basename, and prefixes `treePrefix` when given to resolve a collision — the collision rule is: two source files whose slugs collide both gain their tree prefix; a single one keeps the bare slug. The extractor asserts determinism by computing every slug twice and comparing.

`gatePdf(path)` runs `execFileSync('pdfinfo', [path])` and `execFileSync('pdfinfo', ['-js', path])`, reads the raw bytes with `readFileSync` for the `/EmbeddedFile` and `/Launch` scan, and returns `gateVerdict({ opened, javascript, bytes })`. `gateVerdict` is pure and unit-tested; the shelling wrapper is exercised by `documents.test.mjs` against the two real corpus files listed in its fixture.

- [ ] **Step 4: Write the document-title and collision tests**

```js
// migration/documents.test.mjs
import { describe, expect, it } from 'vitest';
import { documentTitle, documentDate } from './documents.mjs';

describe('document titles', () => {
  it('turns the Doxologia filename into a Romanian title', () => {
    expect(documentTitle('revista/doxologia_18_2019.pdf'))
      .toBe('Revista Doxologia nr. 18 — 2019');
  });

  it('turns the measured pastorale filename shapes into titles', () => {
    expect(documentTitle('pastorala/PASTORALA INVIEREA DOMNULUI RO 2019.pdf'))
      .toBe('Pastorală la Învierea Domnului 2019');
    expect(documentTitle('pastorala/9 002 2024 PASTORALA NASTEREA DOMNULUI RO 2024_site.pdf'))
      .toBe('Pastorală la Nașterea Domnului 2024');
  });

  it('POSITIVE CONTROL: a filename no rule recognises stops the run by name', () => {
    expect(() => documentTitle('pastorala/ceva-necunoscut.pdf')).toThrow(/ceva-necunoscut\.pdf/);
  });

  it('falls back to the humanised name for the uploads pastorale and Doxologia issues', () => {
    expect(documentTitle('wp-content/uploads/2025/03/Pastorala-Duminica-Ortodoxiei-2025.pdf'))
      .toBe('Pastorală Duminica Ortodoxiei 2025');
  });
});

describe('document dates', () => {
  it('reads the year out of the name and defaults to 1 January', () => {
    expect(documentDate('revista/doxologia_18_2019.pdf')).toBe('2019-01-01');
    expect(documentDate('pastorala/9 001 2022 PASTORALA INVIEREA DOMNULUI RO 2022.pdf')).toBe('2022-01-01');
  });

  it('POSITIVE CONTROL: refuses a name with no year', () => {
    expect(() => documentDate('pastorala/fara-an.pdf')).toThrow(/fara-an\.pdf/);
  });
});
```

The title rules are a **closed table of measured patterns** (the 10 uploads, the 43 pastorale, the 26 Doxologia, the 8 `files/`), each with an example asserted; a filename matching none stops the migration naming the file. This is the one place the plan deliberately uses a match-or-stop rule rather than a general parser, because a wrong title on a pastoral letter is content nobody can verify mechanically.

- [ ] **Step 5: Implement `migration/documents.mjs`**

`extractDocuments()` walks the measured trees (`UPLOADS_ROOT` for `application/pdf` attachments via `query`, and `HTDOCS_ROOT/{revista,pastorala,files}` via `readdir`), computes slugs (collision rule above), gates every file, copies passing files byte-for-byte to `public/documente/<slug>.pdf` with `copyFile` (copy, never re-encode — the recorded ruling), writes one `src/content/documente/<slug>.md` per file with frontmatter `{ title, date, file: '/documente/<slug>.pdf', ...(author ? { author } : {}) }`, validating through `documentSchema.parse` before every write, and returns the count. A file failing the gate is **dropped by name and counted in the summary** — the run prints `PDFs skipped: N` and the names, and exits non-zero if the dropped set is not empty, because the corpus was measured as 87 clean files.

- [ ] **Step 6: Extend the URL map**

In `migration/url-map.mjs`, `redirectRows` gains a fourth argument `documents: [{ from, to }]`; the old path is the legacy absolute path (`/revista/doxologia_18_2019.pdf`) or the uploads path as the site served it (`/wp-content/uploads/2025/03/….pdf`), and the new path is `/documente/<slug>.pdf`. `writeUrlMap` reads the document map emitted by `extractDocuments` (return it from the extractor and pass it through `run.mjs`) and appends the rows. Extend `migration/pages.test.mjs`'s URL-map cases: a document row survives, and the total for a synthetic corpus is pages + fixed + posts + documents.

- [ ] **Step 7: Wire `run.mjs` and run the migration**

Add `extractDocuments()` after `extractGalleries()`; summary gains `documents written`, `PDFs skipped` and `bytes copied`; `documents written` joins `mustBePositive`, and a non-empty skipped list sets `process.exitCode = 1`. Then:

```bash
node migration/run.mjs
```

Expected: `documents written: 87`, `PDFs skipped: 0`; `docs/url-map.csv` grows by 87 rows (55 → 142; assert the printed redirects count matches `55 + 87` before continuing).

- [ ] **Step 8: Committed-artefact guard, and the sweeps it needs**

- `src/lib/documents.itest.ts`: walks `public/documente/*.pdf`; asserts the tree exists and holds 87 files; runs the same `gateVerdict` over every committed file via `pdfinfo` (so the gate cannot be bypassed by a hand-added PDF); asserts every `src/content/documente/*.md` names a file that exists; prints the measured count. Positive control: `gateVerdict({opened:false, …})` fails, as in the unit test.
- `src/lib/diacritics-sources.test.ts`: the predicate now covers the favicon, `src/assets/content/`, and `public/uploads/`; add `public/documente/` with `extension === 'pdf'` as a fourth arm, and assert it in the existing positive-control test beside the other three (`isBinary('public/documente/x.pdf') === true`, `isBinary('public/documente/x.html') === false`).
- `src/lib/binaries.itest.ts`: the PDF tree is not decodable by `sharp`, so it stays out of that file; `documents.itest.ts` is its replacement guarantee, named in the comment beside the predicate arm.
- `.github/workflows/ci.yml`: add a step before `npm test`:

```yaml
      - run: sudo apt-get update && sudo apt-get install -y poppler-utils
```

`migration/README.md` gains a "Requirements" bullet for poppler (`pdfinfo`) beside Docker, and a "PDF gate" section stating the ruling, the measured 87 and the drop-by-name behaviour.

- [ ] **Step 9: Run the gates**

Run: `rtk proxy npx vitest run && npm run test:build && npm run check`
Expected: exit 0 each; `documents.itest.ts` prints 87 PDFs gated, 0 failures.

- [ ] **Step 10: Commit**

```bash
git add migration/slugify.mjs migration/slugify.test.mjs migration/pdf-gate.mjs \
  migration/pdf-gate.test.mjs migration/documents.mjs migration/documents.test.mjs \
  migration/url-map.mjs migration/pages.test.mjs migration/run.mjs migration/README.md \
  public/documente src/content/documente docs/url-map.csv \
  src/lib/documents.itest.ts src/lib/diacritics-sources.test.ts src/lib/binaries.itest.ts \
  .github/workflows/ci.yml
git commit -m "feat(migration): all 87 PDFs, gated and copied, with redirects"
```

---

### Task 6: `/galerie`

**Files:**
- Create: `src/components/GalleryGrid.astro`, `src/pages/galerie/index.astro`, `src/pages/galerie/[slug].astro`
- Modify: `scripts/check-budget.mjs`, `src/lib/build-output.itest.ts`

**Interfaces:**
- Consumes: `getCollection('galerii')`, sorted by `date` descending with an `id` tiebreak (mirror `publishedArticles`'s sort shape); `ContentImage` for cover and each image.
- Produces: `/galerie/` and `/galerie/<slug>/`; album pages carry the caption text under each image.

- [ ] **Step 1: Write the routes**

`src/pages/galerie/index.astro` renders `<h1>Galerie</h1>` and, per album, a link card with the cover and the title/date; empty state in the same shape as `/noutati`'s. `[slug].astro` mirrors `noutati/[slug].astro`'s `getStaticPaths`/`render` structure, with `GalleryGrid.astro` rendering:

```astro
---
import { dayHeading } from '../lib/date-ro';
import ContentImage from './ContentImage.astro';
import type { Gallery } from '../lib/content-schema';

interface Props { gallery: { id: string; data: Gallery } }
const { gallery } = Astro.props;
---

<ul class="gg">
  {gallery.data.images.map((image) => (
    <li class="gg-item">
      <ContentImage image={image.file} alt={image.description ?? ''} widths="(max-width: 34rem) 45vw, 15rem" />
      {image.description && <p class="gg-caption">{image.description}</p>}
    </li>
  ))}
</ul>
```

with a two-column phone grid / three-column desktop grid in scoped styles taken from the palette tokens only. **Alt policy, recorded:** a description is the caption and the alt; an image without one renders `alt=""` and no caption, because inventing a sentence for a photograph is worse than declaring it decorative, and the CMS field invites the parish to write one.

- [ ] **Step 2: Budgets and the built-page set**

Add to `PAGE_BUDGET` and `REQUEST_BUDGET` in `scripts/check-budget.mjs` (measure first, then set; the values below are starting limits with their headroom stated):

```js
  'galerie/index.html': 24 * 1024,
  'galerie/*': 60 * 1024,   // one album's grid; measured after the first build
```

`REQUEST_BUDGET`: `'galerie/index.html': 6` (one cover per album), `'galerie/*': 48` (the 20-image album's thumbnails, plus room). In `src/lib/build-output.itest.ts`, add both files to `ICS_REFERENCES` (`'galerie/index.html': 2`, and one `'galerie/<slug>/index.html': 2` per real album), because that test asserts set equality against `builtPages()`.

- [ ] **Step 3: Build, audit, measure, adjust**

```bash
npm run test:build
```

Expected: exit 0. Then read the budget output and adjust the two new limits to the measured bytes with the same headroom convention the file documents (1.4–1.9× the measured largest), and record the measured numbers in the `PAGE_BUDGET` comment beside the limits.

- [ ] **Step 4: Commit**

```bash
git add src/components/GalleryGrid.astro src/pages/galerie scripts/check-budget.mjs src/lib/build-output.itest.ts
git commit -m "feat: photo albums at /galerie, under the budget and the audit"
```

---

### Task 7: `/evenimente`

**Files:**
- Create: `src/components/EventCard.astro`, `src/pages/evenimente/index.astro`, `src/pages/evenimente/[slug].astro`
- Modify: `scripts/check-budget.mjs`, `src/lib/build-output.itest.ts`, `src/lib/fixtures.ts`, `scripts/a11y-picker.mjs`, `src/lib/a11y-passes.test.ts`

**Interfaces:**
- Consumes: `getCollection('events')`; `todayInZurich()` for the upcoming/past split; a shared `eventSlug(id)` helper in `src/lib/events.ts` that returns the id unchanged (filename is the slug) so the route and future links agree.
- Produces: `/evenimente/` (upcoming first, then „Trecute”, Romanian empty state when there are none) and `/evenimente/<slug>/` detail pages with title, dates, time, location, description, optional poster link into `/documente/`.

- [ ] **Step 1: Write the routes and the empty state**

The index computes `const { today } = nowInZurich();`, splits `start_date >= today`, and renders the same sentence shape `/noutati` uses when empty: „Nu sunt evenimente anunțate pentru perioada următoare.” Past events render under an `<h2>Trecute</h2>` only when they exist. The detail route mirrors `noutati/[slug].astro`.

- [ ] **Step 2: A synthetic event so the detail layout is audited**

The parish has **no events**, so `dist/` would never render a detail page and the audit would cover a layout nobody has seen. In `src/lib/fixtures.ts`, add `FIXTURE_EVENTS` (one event with `end_date`, one without, one past) built through `eventSchema.parse`. In `scripts/a11y-picker.mjs`, after the services swap, `rmSync` `src/content/events` and `src/content/galerii` in the scratch tree and write the fixture files the same way services are written. Extend `src/lib/a11y-passes.test.ts`'s fixture-shape guards if it enumerates what the picker swaps (add the new collections to that enumeration).

- [ ] **Step 3: Budgets and built-page set**

`PAGE_BUDGET`: `'evenimente/index.html': 20 * 1024`, `'evenimente/*': 24 * 1024` (the prefix, like `noutati/*`, so the first real event does not fail a volunteer's Save). `REQUEST_BUDGET`: `'evenimente/index.html': 4`, `'evenimente/*': 6`. `ICS_REFERENCES`: `'evenimente/index.html': 2`; detail pages cannot be listed while the collection is empty — the prefix budget plus the picker fixture is the coverage, and the plan states that explicitly here rather than leaving it implicit.

- [ ] **Step 4: Build, audit, measure, adjust**

Run: `npm run test:build && npm run a11y:picker`
Expected: exit 0; the picker pass prints the event detail page among the audited pages.

- [ ] **Step 5: Commit**

```bash
git add src/components/EventCard.astro src/pages/evenimente src/lib/events.ts \
  scripts/check-budget.mjs src/lib/build-output.itest.ts src/lib/fixtures.ts \
  scripts/a11y-picker.mjs src/lib/a11y-passes.test.ts
git commit -m "feat: events at /evenimente, with a fixture so the detail page is audited"
```

---

### Task 8: `/pastorale`, and the prose links the new files fix

**Files:**
- Create: `src/pages/pastorale/index.astro`
- Modify: `migration/articles.mjs`, `migration/pages.mjs`, `migration/articles.test.mjs`/`pages.test.mjs`, `scripts/check-budget.mjs`, `src/lib/build-output.itest.ts`
- Output: rewritten links in the migrated markdown (26 revista PDFs, the upload PDFs, 11 cursuri images)

**Interfaces:**
- Consumes: `getCollection('documente')`, sorted date-descending with an `id` tiebreak.
- Produces: `/pastorale/` listing every document as a titled link into `/documente/<slug>.pdf`; `rewriteDocumentLinks(markdown, map)` and `linkImagesIn(html)` in the migration.

- [ ] **Step 1: The route**

`src/pages/pastorale/index.astro` mirrors `/noutati`'s shape: `<h1>Pastorale</h1>`, one `<article>` per document with `<h2><a href={document.data.file}>{title}</a></h2>`, date and author beneath. No detail route: the document *is* the file.

- [ ] **Step 2: Rewrite the old-host PDF links in the migration**

`rewriteDocumentLinks(markdown, map)` replaces every `https://www.bor-zh.ch/<old path>` whose old path appears in the document map with the new `/documente/<slug>.pdf` (absolute site path — these are downloads, not images, and a relative path would be wrong across route depths). **A URL that looks like a PDF the map does not contain stops the run by name** — that is the guard that keeps a future corpus from silently keeping a dead link. Run it in `extractArticles` and `extractPages` after `rewriteImageSources`. Add unit cases to the existing test files: a mapped link rewrites; an unmapped PDF-shaped link is a named error; a non-PDF old-host page link is left alone (Phase 4 owns those).

- [ ] **Step 3: Migrate the eleven cursuri full-size images**

`migration/pages.mjs` gains `linkImagesIn(html)` (anchors whose `href` is an uploads image, no visible text) collected alongside `imagesIn`, migrated in the same `migrateImages` call, and rewritten so the anchor points at the migrated full-size file with the thumbnail's text as its name — turning the stripped empty anchors into usable links. Guard: the `<a href uploads-image>` count must equal the number rewritten, and the pure `linkImagesIn` gets a positive control for an anchor with no image href.

- [ ] **Step 4: Rerun the migration, then budgets**

```bash
node migration/run.mjs
```

Expected: exit 0; `git diff --stat` shows only the expected link rewrites and the new images.

```js
// scripts/check-budget.mjs
  'pastorale/index.html': 30 * 1024,
```

`REQUEST_BUDGET`: `'pastorale/index.html': 4`. `ICS_REFERENCES`: `'pastorale/index.html': 2`.

- [ ] **Step 5: Assert the links landed**

In `src/lib/build-output.itest.ts`, add to the prose-pages describe:

```ts
  it('the migrated prose no longer links at the old host for a file we now host', () => {
    const hosted = builtPages().map((page) => readFileSync(DIST + page, 'utf8')).join('\n');
    const dead = [...hosted.matchAll(/href="https:\/\/www\.bor-zh\.ch\/[^"]+\.(?:pdf|jpg|jpeg|png)"/g)]
      .map((m) => m[0]);
    expect(dead, `links to files the old host no longer needs to serve:\n${dead.join('\n')}`)
      .toEqual([]);
  });
```

- [ ] **Step 6: Run everything**

Run: `npm run test:build && rtk proxy npx vitest run`
Expected: exit 0 each.

- [ ] **Step 7: Commit**

```bash
git add src/pages/pastorale scripts/check-budget.mjs src/lib/build-output.itest.ts \
  migration/articles.mjs migration/pages.mjs migration/articles.test.mjs migration/pages.test.mjs \
  src/content/articles src/content/pages src/assets/content
git commit -m "feat: /pastorale, and the old-host file links now point at our own copies"
```

---

### Task 9: `/contact` and `/doneaza` — migrated prose behind dedicated routes

**Files:**
- Create: `src/lib/routes.ts`, `src/lib/routes.test.ts`, `src/pages/contact.astro`, `src/pages/doneaza.astro`
- Modify: `migration/pages.mjs`, `migration/pages.test.mjs`, `src/pages/[...page].astro`, `scripts/check-budget.mjs`, `src/lib/build-output.itest.ts`

**Interfaces:**
- Produces: `RESERVED_PATHS: ReadonlySet<string>` with values `'contact'`, `'doneaza'`; `stripAccountBlocks(html, slug): string` (pure, in `migration/pages.mjs`).
- The migration writes two more pages entries, so `PAGES` grows 9 → 11; the `pages` collection's `path` for these is exactly `contact` and `doneaza`, which is why `[...page].astro` must skip them.

**Why the prose is stripped of its account text:** those paragraphs print an IBAN that Task 10 now renders from `settings.accounts`, and two copies of an IBAN is the one duplication this project has already paid for. `servicii-liturgice` is **not** stripped: its account is not one the generated blocks render, so its prose stays as it is.

- [ ] **Step 1: Discovery — the two page titles and the account blocks**

```bash
node --input-type=module -e "
import { start, stop, query } from './migration/db.mjs';
await start();
try {
  const pages = await query(\"SELECT post_name, post_title, LENGTH(post_content) FROM wpoi_posts WHERE post_type='page' AND post_status='publish' AND post_name IN ('contact','doneaza')\");
  console.log(pages);
  for (const slug of ['contact','doneaza','servicii-liturgice']) {
    const [row] = await query(\"SELECT post_content FROM wpoi_posts WHERE post_type='page' AND post_name='\" + slug + \"'\");
    const text = String(row?.[0] ?? '');
    console.log(slug, 'IBAN occurrences:', (text.match(/CH\d{2}/g) ?? []).join(','));
    console.log(slug, 'paragraphs:', [...text.matchAll(/<p[^>]*>[\s\S]*?<\/p>/g)].length);
  }
} finally { await stop(); }
"
```

Expected: `contact` and `doneaza` each contain exactly one IBAN and the paragraph carrying it; `servicii-liturgice` contains its own. Record the titles exactly (they are compared against the table, and the table's title check stops the run on a mismatch).

- [ ] **Step 2: Add the two entries and the strip guard to the migration**

`PAGES` gains, in `order` terms after the nine (100 and 110):

```js
  { slug: 'contact', path: 'contact', title: '<measured>', order: 100, stripAccounts: true },
  { slug: 'doneaza', path: 'doneaza', title: '<measured>', order: 110, stripAccounts: true },
```

`stripAccountBlocks(html, slug)` removes every paragraph whose text contains an IBAN (`/CH\d{2}[0-9A-Z ]{17,}/`); it throws when the number removed is not exactly `1` for the two slugs that declare `stripAccounts`, naming the file and the count — the same "a guard must find its subject" rule as the title and image-count guards. Apply it in `extractPages` before `toMarkdown`. Unit cases in `migration/pages.test.mjs`: one IBAN paragraph is removed and the surrounding directions survive; an IBAN-free page throws when stripping is declared; two IBAN paragraphs throw.

- [ ] **Step 3: `RESERVED_PATHS` and the route split**

```ts
// src/lib/routes.ts
/**
 * Pages entries whose URL is built by a dedicated route, not by [...page].astro.
 * One list, imported by both sides, so a page cannot be built twice or skipped.
 */
export const RESERVED_PATHS = new Set(['contact', 'doneaza']);
```

`[...page].astro`'s `getStaticPaths` filters `!RESERVED_PATHS.has(entry.data.path)`. `src/lib/routes.test.ts` asserts the set's members are exactly the two dedicated route files' pathnames (read `src/pages/` via `readdirSync`), and that no `pages` content file declares a reserved path without a dedicated route — the failure mode being a page that exists in the CMS and no route builds.

- [ ] **Step 4: The two routes**

Each mirrors `[...page].astro`'s transform pipeline (`normalizeHeadingLevels` + `stripEmptyAnchors` on `entry.rendered` before `render`), loading its entry with `getEntry('pages', 'contact')` / `getEntry('pages', 'doneaza')`. The route adds a lead paragraph and, from Task 10 onward, the generated blocks; this task ships the prose alone so its review is about content, not components.

- [ ] **Step 5: Built-page set and budgets**

`ICS_REFERENCES` gains `'contact/index.html': 2` and `'doneaza/index.html': 2`. `PAGE_BUDGET` gains `'contact/index.html': 24 * 1024` and `'doneaza/index.html': 32 * 1024`; `REQUEST_BUDGET` gains `2` for each (form/Turnstile arrives in Task 12 and its request accounting is decided there). The `prose pages` count assertion (currently `toBe(9)`) becomes `toBe(11)` — an explicit contract change, recorded in the test's comment.

- [ ] **Step 6: Rerun the migration, then the suite**

```bash
node migration/run.mjs && npm run test:build && rtk proxy npx vitest run
```

Expected: exit 0 each; `run.mjs` reports 11 pages written.

- [ ] **Step 7: Commit**

```bash
git add src/lib/routes.ts src/lib/routes.test.ts src/pages/contact.astro src/pages/doneaza.astro \
  src/pages/[...page].astro migration/pages.mjs migration/pages.test.mjs \
  scripts/check-budget.mjs src/lib/build-output.itest.ts src/content/pages docs/url-map.csv
git commit -m "feat: /contact and /doneaza as dedicated routes over migrated prose"
```

---

### Task 10: The account blocks, and a copy button that needs no framework

**Files:**
- Create: `src/components/AccountBlock.astro`, `src/lib/copy-script.mjs` (the inline script source), `src/lib/copy-script.test.ts`
- Modify: `src/pages/contact.astro`, `src/pages/doneaza.astro`, `scripts/check-budget.mjs`, `src/lib/build-output.itest.ts`

**Interfaces:**
- Consumes: `settings.accounts`, `formatIban`.
- Produces: `AccountBlock.astro` with props `{ account: Account }` (markup only); `COPY_SCRIPT: string` from `copy-script.mjs`, emitted **once per route page**, and registered in `scripts/csp-hash.mjs`'s `EXPECTED_INLINE` — `08b877f` made that list the only way an inline script may reach `script-src`.

**Departure from spec §3, recorded:** the spec says only the week picker and Turnstile ship JavaScript and calls the IBAN copy button HTML-and-CSS. Copying to the clipboard requires script. The ruling: one more tiny inline script, on the pages that show accounts, progressive so the IBAN text is visible and selectable without it — and registered deliberately, so content can never inject one.

- [ ] **Step 1: Write the script tests**

```ts
// src/lib/copy-script.test.ts
import { describe, expect, it } from 'vitest';
import { COPY_SCRIPT } from './copy-script';

describe('the copy script', () => {
  it('stays under a byte ceiling that keeps it inline', () => {
    expect(Buffer.byteLength(COPY_SCRIPT, 'utf8')).toBeLessThan(1024);
  });

  it('reads the IBAN from the button it belongs to, not from a page-wide lookup', () => {
    expect(COPY_SCRIPT).toContain('data-copy');
    expect(COPY_SCRIPT).toContain('closest');
  });

  it('reveals buttons rather than hiding them, so the no-JS state is text only', () => {
    expect(COPY_SCRIPT).toContain('hidden = false');
  });
});
```

- [ ] **Step 2: Implement, and register the script**

`src/lib/copy-script.mjs` exports a string of plain JS (not a module): it selects `[data-copy]` buttons, unhides them, and on click writes the button's `data-copy` value with `navigator.clipboard.writeText`, switching the button's text to „Copiat” for two seconds. No imports.

`AccountBlock.astro` renders markup only. The `<script is:inline set:html={COPY_SCRIPT}></script>` goes **once** in `src/pages/contact.astro` and once in `src/pages/doneaza.astro`, after the last block — never inside the component, because two accounts on one page would emit two identical scripts and `unexpectedInlineScripts` counts entries, so a duplicate would fail the build naming page and hash.

In `scripts/csp-hash.mjs`:

```js
export const EXPECTED_INLINE = [
  { page: 'index.html', marker: 'data-picker-label' },
  { page: 'contact/index.html', marker: 'data-copy' },
  { page: 'doneaza/index.html', marker: 'data-copy' },
];
```

Extend `src/lib/csp-hash.test.ts` with the same positive-control shape the existing cases use: a `found` containing the contact script passes; one containing an extra script on the contact page fails; a build missing the contact script fails. Then run `rtk proxy npx vitest run src/lib/csp-hash.test.ts`.

```astro
---
import type { Account } from '../lib/accounts';
import { formatIban } from '../lib/accounts';
interface Props { account: Account }
const { account } = Astro.props;
---

<div class="ab">
  <p class="ab-label">{account.label}</p>
  <p class="ab-iban">{formatIban(account.iban)}</p>
  <p class="ab-meta">{account.holder} · {account.bank}</p>
  <button class="ab-copy" type="button" hidden data-copy={account.iban}>Copiază IBAN</button>
</div>
```

Styled from tokens only (`.ab-copy` uses `--oxblood` on `--raised`; the button's own colour rules stay in this component so the hover trap documented in `SiteHeader.astro` cannot bite). Both routes render one block per account, `/doneaza` after the prose.

- [ ] **Step 3: Budget and audit**

Run: `npm run test:build && npm run a11y`
Expected: exit 0. The `[csp-hashes]` output must now name the three registered scripts, and a build in which the contact script went missing must have failed — verify the positive control locally by temporarily renaming the `data-copy` marker and watching the build stop by name. `headers.itest.ts`'s "script-src names exactly the hashes of the built inline scripts, not one more" is the other side of that guarantee. If `check-budget.mjs` counts inline script bytes per page, set the new limits from the measured numbers and record them.

- [ ] **Step 4: Commit**

```bash
git add src/components/AccountBlock.astro src/lib/copy-script.mjs src/lib/copy-script.test.ts \
  scripts/csp-hash.mjs src/lib/csp-hash.test.ts src/pages/contact.astro src/pages/doneaza.astro \
  scripts/check-budget.mjs src/lib/build-output.itest.ts
git commit -m "feat: the account blocks, with a copy button the CSP set names"
```

---

### Task 11: The Swiss QR-bill

**Files:**
- Create: `src/lib/qr-bill.ts`, `src/lib/qr-bill.test.ts`
- Modify: `package.json` (devDependency), `src/lib/content-schema.ts`, `src/content/settings/settings.yml`, `public/admin/config.yml`, `src/lib/cms.test.ts`, `src/pages/doneaza.astro`, `scripts/check-budget.mjs`

**Interfaces:**
- Consumes: `qrAccount(settings.accounts)`, a new `settings.creditor_address` object.
- Produces: `buildQrBill(account: Account, creditor: CreditorAddress): QrBillData`, `renderQrBillSvg(data): string` (an SVG string embedded once at build time; no client code).

**Spec §9 and §17:** the QR-bill must be validated with one real test transfer before launch — out of reach of this repository, so it is a handover item (Task 13).

- [ ] **Step 1: Resolve the library API before writing the wrapper**

```bash
npm install --save-dev swissqrbill@4.4.1
node --input-type=module -e "
const m = await import('swissqrbill');
console.log(Object.keys(m));
console.log(String((m.SwissQRBill ?? m.default)?.toString?.() ?? '').slice(0, 400));
"
ls node_modules/swissqrbill/dist
```

Record what was printed in the test file's header comment: the constructor's data shape and how SVG output is produced. The registry measured 4.4.1 as the latest (MIT, published 2026-08-14); pin it exactly, like `@sveltia/cms`, because a static build has no way to notice a breaking change until the page renders.

- [ ] **Step 2: The creditor address**

`settingsSchema` gains

```ts
      creditor_address: z.strictObject(
        {
          street: nonEmptyText('Adresa completă a titularului trebuie să aibă strada.', 'Strada nu poate fi goală.'),
          house_number: z.string().trim().optional(),
          postal_code: nonEmptyText('Codul poștal lipsește.', 'Codul poștal nu poate fi gol.'),
          town: nonEmptyText('Localitatea lipsește.', 'Localitatea nu poate fi goală.'),
          country: z.string().trim().length(2, { message: 'Codul țării are două litere, de exemplu CH.' }),
        },
        strictKeys,
      ),
```

with the measured holder address from the old site in `settings.yml` (`Wehntalerstrasse` / `451` / `8046` / `Zürich` / `CH`) and a CMS field group. `cms.test.ts`'s accounts test gains `creditor_address` in the names it expects.

- [ ] **Step 3: Tests for the mapping and the rendering**

```ts
// src/lib/qr-bill.test.ts
import { describe, expect, it } from 'vitest';
import { buildQrBill, renderQrBillSvg } from './qr-bill';

const ACCOUNT = {
  label: 'Spațiul bisericii',
  iban: 'CH11 0021 5215 3048 5502 K',
  holder: 'Rumänisch-Orthodoxe Kirchgemeinde St. Nikolaus',
  bank: 'UBS (Schweiz) AG',
  qr_bill: true,
};
const CREDITOR = { street: 'Wehntalerstrasse', house_number: '451', postal_code: '8046', town: 'Zürich', country: 'CH' };

describe('the QR-bill', () => {
  it('maps the account and the creditor address into the library data shape', () => {
    const data = buildQrBill(ACCOUNT, CREDITOR);
    expect(data.creditor.name).toBe(ACCOUNT.holder);
    expect(data.creditor.street).toBe('Wehntalerstrasse');
    expect(data.iban).toBe('CH110021521530485502K');
  });

  it('renders an SVG with no script and deterministic bytes', () => {
    const first = renderQrBillSvg(buildQrBill(ACCOUNT, CREDITOR));
    const second = renderQrBillSvg(buildQrBill(ACCOUNT, CREDITOR));
    expect(first.startsWith('<svg')).toBe(true);
    expect(first).not.toMatch(/<script/i);
    expect(first).toBe(second);
  });

  it('POSITIVE CONTROL: refuses an IBAN the checksum rejects', () => {
    expect(() => buildQrBill({ ...ACCOUNT, iban: 'CH54 0021 5215 3048 5502 P' }, CREDITOR))
      .toThrow();
  });
});
```

- [ ] **Step 4: Render it on `/doneaza`**

The route embeds the SVG once, inside the section for the flagged account, with a short Romanian paragraph stating what it is and that the amount is filled in by the donor (open amount — no `amount` in the data). The SVG must carry no hex colours that `stylesheet.itest.ts` would catch: QR-bills are black on white by specification, so the SVG keeps its own literal colours and the page must not restyle it — add it to the page as raw markup, not as a background image.

- [ ] **Step 5: Run everything**

Run: `rtk proxy npx vitest run && npm run test:build && npm run check`
Expected: exit 0 each.

- [ ] **Step 6: Commit**

```bash
git add src/lib/qr-bill.ts src/lib/qr-bill.test.ts package.json package-lock.json \
  src/lib/content-schema.ts src/content/settings/settings.yml public/admin/config.yml \
  src/lib/cms.test.ts src/pages/doneaza.astro scripts/check-budget.mjs
git commit -m "feat: a Swiss QR-bill for the building fund, generated at build"
```

---

### Task 12: The contact form

**Files:**
- Create: `src/lib/contact.ts`, `src/lib/contact.test.ts`, `functions/api/contact.ts`, `src/components/ContactForm.astro`
- Modify: `public/_headers`, `scripts/a11y.mjs` (`CSP_EXPECTED`), `src/lib/referenced-paths.test.ts`, `src/pages/contact.astro`, `.github/workflows/ci.yml`?, `docs/handover.md`

**Interfaces:**
- Produces: `validateContact(fields): { ok: true; values } | { ok: false; errors }`; `verifyTurnstile(token, ip, fetchFn): Promise<boolean>`; `sendEmail(payload, config, fetchFn): Promise<{ ok: boolean; status: number }>`; `functions/api/contact.ts` exporting `onRequestPost` with no dependencies beyond `Response`/`fetch`.
- Env at runtime: `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`, `CONTACT_TO`, `CONTACT_FROM` (defaults to `contact@send.bor-zh.ch`). Build-time: `PUBLIC_TURNSTILE_SITE_KEY` decides whether the form renders at all.

**Unverifiable here, by construction:** the live siteverify and Resend round trip. The repository tests the pure logic with injected `fetch`; the handover carries what only a deployed Worker and a real inbox can answer.

- [ ] **Step 1: The pure logic, TDD**

Test cases (injected `fetch`):
- `validateContact`: requires `name`, `email` (shape), `message` (min length); honeypot field `website` must be empty; a filled honeypot returns `{ ok: false }` **without** any fetch being called (assert the fake was not touched).
- `verifyTurnstile`: posts `secret` + `response` + `remoteip` form-encoded to `https://challenges.cloudflare.com/turnstile/v0/siteverify`; true only when the fake replies `{ success: true }`; a network rejection is false, never an unhandled throw.
- `sendEmail`: posts JSON to `https://api.resend.com/emails` with `Authorization: Bearer …`, `from`, `to`, `reply_to` = the sender's address, subject `Formular de contact — <name>`, and both `text` (the message) and `html` (escaped); a non-2xx response is `{ ok: false }`.
- Escape test: a message containing `<script>` appears escaped in `html` and verbatim in `text`.

- [ ] **Step 2: The Function adapter**

```ts
// functions/api/contact.ts
import { sendEmail, validateContact, verifyTurnstile } from '../../src/lib/contact';

interface Env {
  TURNSTILE_SECRET_KEY: string;
  RESEND_API_KEY: string;
  CONTACT_TO: string;
  CONTACT_FROM?: string;
}

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }) => {
  const form = await request.formData();
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  const turnstileToken = String(form.get('cf-turnstile-response') ?? '');
  const ip = request.headers.get('CF-Connecting-IP') ?? '';
  if (!(await verifyTurnstile(turnstileToken, ip, fetch))) {
    return json(400, { ok: false, error: 'Verificarea de securitate a eșuat.' });
  }

  const result = validateContact({
    name: form.get('name'),
    email: form.get('email'),
    message: form.get('message'),
    website: form.get('website'),
  });
  if (!result.ok) return json(400, { ok: false, errors: result.errors });

  const sent = await sendEmail(
    { ...result.values, ip },
    {
      apiKey: env.RESEND_API_KEY,
      to: env.CONTACT_TO,
      from: env.CONTACT_FROM ?? 'contact@send.bor-zh.ch',
    },
    fetch,
  );
  if (!sent.ok) return json(502, { ok: false, error: 'Mesajul nu a putut fi trimis.' });
  return json(200, { ok: true });
};

export const onRequest = () => new Response('Metodă nepermisă.', { status: 405 });
```

The honeypot check runs **before** the Turnstile call only if the tests demand it; keep the order stated in the tests (honeypot first, because it costs nothing and the fake-fetch assertion is what holds it).

- [ ] **Step 3: The page**

`ContactForm.astro` renders the form when `import.meta.env.PUBLIC_TURNSTILE_SITE_KEY` is set: a `<form method="post" action="/api/contact">` with `name`, `email`, `message`, the honeypot `<p class="hp" aria-hidden="true">` input `website`, a Turnstile container and `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer>`. Without the key, the route renders the parish's phone and address plus „Formularul va fi disponibil în curând.” and no form. A `<noscript>` paragraph says the form needs JavaScript and names the phone.

**The form's inline script is emitted unconditionally**, on every `/contact` build, key or no key — it attaches to the form when one exists and returns otherwise. This is not tidiness: `EXPECTED_INLINE` is a static set checked at `astro:build:done`, so a script whose presence depended on a deploy-time variable would make the expected set depend on the environment, and a no-key preview would fail the build for a script that is correctly absent. Register it in `scripts/csp-hash.mjs`:

```js
  { page: 'contact/index.html', marker: 'data-contact-form' },
```

and extend `src/lib/csp-hash.test.ts` with the matching positive controls (present passes; missing fails; an extra script on `/contact` fails).

- [ ] **Step 4: CSP and its expected list**

`public/_headers`'s `Content-Security-Policy` gains `https://challenges.cloudflare.com` in `script-src` (before `{{script-hashes}}`) and a new `frame-src https://challenges.cloudflare.com`. `CSP_EXPECTED` in `scripts/a11y.mjs` is unchanged unless a browser run shows a refusal; the audits run without a site key, so the widget never loads — that gap is written into the constant's comment: the Turnstile origins are unexercised by every local audit and the handover's form step is what checks them live. The external Turnstile script is `src`-bearing, so `csp-hash.mjs` skips it — the origin in `script-src` is what admits it, and the inline form handler is admitted only by its registered hash.

- [ ] **Step 5: Remove the stale exemption and run the guards**

`src/lib/referenced-paths.test.ts`'s `ABSENT_ON_PURPOSE` drops `'functions/api/contact.ts'` (naming a real file there now fails the "no exemption has quietly become real" check — which is the test doing its job). Run:

```bash
rtk proxy npx vitest run && npm run test:build && npm run check
```

Expected: exit 0. Add `'contact/index.html'` request-budget room per the measured output (the Turnstile script is external; the budget counts references, so re-measure and record).

- [ ] **Step 6: Handover**

`docs/handover.md` gains "K — the contact form": create the Turnstile widget and put `PUBLIC_TURNSTILE_SITE_KEY` in the Pages build environment and `TURNSTILE_SECRET_KEY` in the Function's; verify `send.bor-zh.ch` in Resend (SPF/DKIM/DMARC on the subdomain only, never the root — spec §10) and set `RESEND_API_KEY`; set `CONTACT_TO`; add the Cloudflare IP rate-limit rule; send one real message through the deployed site and one reply to its `reply_to`. Each step says what a good answer looks like.

- [ ] **Step 7: Commit**

```bash
git add src/lib/contact.ts src/lib/contact.test.ts functions src/components/ContactForm.astro \
  scripts/csp-hash.mjs src/lib/csp-hash.test.ts public/_headers scripts/a11y.mjs \
  src/lib/referenced-paths.test.ts src/pages/contact.astro docs/handover.md scripts/check-budget.mjs
git commit -m "feat: the contact form, from pure logic to a Pages Function"
```

---

### Task 13: Navigation, the footer sitemap, and the phase's paper trail

**Files:**
- Modify: `src/components/SiteHeader.astro`, `src/components/SiteFooter.astro`, `scripts/check-budget.mjs` (final limits), `docs/handover.md`, `docs/superpowers/plans/2026-09-18-phase-3-the-rest.md` (Status table), `AGENTS.md` (only if a new rule was established)

**Interfaces:**
- Consumes: every route built above.
- Produces: the settled navigation and the phase's closing documentation.

- [ ] **Step 1: The header — eight links, measured again**

The user's ruling: the measured five plus `Evenimente`, `Contact`, `Donează`. Update the file's header comment („FIVE LINKS…") to say eight and that the footer carries the rest. The phone row will wrap; measure it with `npm run a11y:mobile` and adjust only the existing 34rem rule's gaps if the wrap is worse than two lines. The audit's derived-breakpoint guard fails if a new breakpoint is introduced, which is the desired outcome: no new breakpoint.

- [ ] **Step 2: The footer — the collection menu gains the fixed routes**

`08b877f` already builds the `Pagini` nav from the `pages` collection, so `contact` and `doneaza` enter it automatically once Task 9 adds their entries (their `order` puts them after the nine). What it cannot carry are the routes that are not `pages` entries: add a fixed „Site" list beside it — Program, Noutăți, Evenimente, Galerie, Pastorale — each an `<li><a>`, styled by the existing `.sf-nav` rules. Then run `npm run test:build`: `build-output.itest.ts`'s "every prose page is linked from every visitor page" is the guard that the menu still reaches all eleven, and it is the reason the footer click-path is a tested property rather than a rendering.

- [ ] **Step 3: Final measured limits and the phase's Status table**

Run `npm run test:build` on a clean build, read the budget table output, and set every new page's limits to the measured bytes with the file's documented headroom. Add a Status table to this plan's top (Task | State | Commits), matching Phase 2's.

- [ ] **Step 4: The phase section of the handover**

`docs/handover.md` gains a "Phase 3" section: what now exists (routes, collections, the 87 PDFs, the QR-bill, the form), what to hand Phase 4 (the PDF redirect rows, the album and event URL rows, the `?p=` question that is unchanged), and every unverified live item (Turnstile/Resend round trip, the QR-bill test transfer, the Cloudflare IP rate-limit rule, PDF response headers).

- [ ] **Step 5: The whole-phase verification**

```bash
TZ=Europe/Zurich npm run test:all
TZ=Europe/Zurich npm run check
git status --short && git diff-index --quiet HEAD && echo CLEAN
```

Then the fresh-clone check, exactly as Phase 2 ran it (a clone that has not run the migration must still be green):

```bash
git clone . /tmp/phase-3-clone && cd /tmp/phase-3-clone && npm ci && TZ=Europe/Zurich npm run test:all && TZ=Europe/Zurich npm run check
```

Expected: every command exits 0; the codepoint sweeps print zero occurrences; the budget prints every page with a limit.

- [ ] **Step 6: Commit**

```bash
git add src/components/SiteHeader.astro src/components/SiteFooter.astro \
  scripts/check-budget.mjs docs/handover.md docs/superpowers/plans/2026-09-18-phase-3-the-rest.md AGENTS.md
git commit -m "docs: navigation, budgets and the Phase 3 handover"
```

---

## Self-review against the spec

- §5 IA: `/pastorale`, `/evenimente`, `/evenimente/[slug]`, `/galerie`, `/galerie/[slug]`, `/contact`, `/doneaza` — Tasks 6–9. `/sitemap-index.xml` was listed in the IA but is not in Phase 3's spec §19 scope; recorded as out of scope here.
- §6.3/6.5/6.6: the three schemas — Task 3, populated by Tasks 4–5.
- §6.7: the settings singleton gains `accounts` and `creditor_address` — Tasks 1, 11.
- §9: bordered blocks, copy buttons, QR-bill, open amount, the test-transfer caveat — Tasks 10, 11, 13.
- §10: Function, Turnstile server-side, honeypot, Resend from `send.bor-zh.ch`, no storage, IP rate limit — Task 12 (rate limit and DNS are handover because they are outside the repository).
- §12: the URL map grows with every new old path; Phase 4 still owns `_redirects` — Tasks 5, 9.
- §13/§14/§16: every new page budgeted and audited; CSP extended by two named origins only; the editors' documentation delta is the CMS collections' own labels/hints plus the handover.
- §19: this is Phase 3 entire; Phase 4 is untouched.

**Known gaps stated rather than implied:** the Turnstile origins are unexercised by local audits (no site key), the QR-bill needs a real transfer, PDFs ship as bytes with a gate instead of a re-encode, and `/evenimente/<slug>/` has no real page until the parish creates its first event — its layout is audited only through the picker fixture.

