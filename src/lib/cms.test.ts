/*
 * WHAT THIS PROVES: that `public/admin/config.yml` is a configuration Sveltia
 * will accept, and that the CMS it is written for is the one that is installed.
 *
 * WHY IT EXISTS. `/admin/` is the only surface in this project with no other
 * test coverage at all: it runs in a browser, against GitHub, behind a sign-in
 * nothing here can perform. Everything else is guarded by a build. A typo in
 * this file is discovered by a volunteer, on the day they try to publish.
 *
 * The one thing that can be checked without a browser is the config, and it can
 * be checked well, because the CMS SHIPS ITS OWN JSON SCHEMA for it -
 * `schema/sveltia-cms.json` inside the package. So the expected shape is taken
 * from the CMS itself, at the exact version installed, and not from anything
 * this repository could get wrong. It is how `locale: ro` was caught: a plausible
 * option, in the plan, that Sveltia has never had.
 *
 * WHAT IT DOES NOT PROVE: that the CMS works. A valid config can still name a
 * repository that does not exist, point at an OAuth worker that was never
 * deployed, or describe a form nobody can use. Signing in, publishing a day and
 * watching it reach the site is Task 12 Step 9, and it needs a person.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { CATEGORIES } from './content-schema';

const require = createRequire(import.meta.url);

/*
 * The package root, reached by climbing out of the entry file.
 *
 * Not `require.resolve('@sveltia/cms/schema/...')`, and not
 * `.../package.json` either: the package's `exports` map publishes exactly one
 * subpath, `.`, so Node refuses every other one by name. Not a literal
 * `node_modules/@sveltia/cms` path either - that would read a folder rather than
 * the package npm resolved, and the two come apart under workspaces and under a
 * hoisted install.
 *
 * Two levels up from `dist/sveltia-cms.mjs` is an assumption about the package's
 * layout, so it is asserted below rather than trusted: `PACKAGE.name` has to come
 * back as `@sveltia/cms`.
 */
const ROOT = dirname(dirname(require.resolve('@sveltia/cms')));
const PACKAGE = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  name: string;
  version: string;
};

const CMS_SCHEMA = JSON.parse(
  readFileSync(join(ROOT, 'schema', 'sveltia-cms.json'), 'utf8'),
) as Record<string, unknown>;

const CONFIG_TEXT = readFileSync(
  new URL('../../public/admin/config.yml', import.meta.url),
  'utf8',
);
const CONFIG = parse(CONFIG_TEXT) as Record<string, unknown>;

/*
 * ADDRESSED BY NAME, THROUGH A PARSER, like `schema.test.ts` does for the
 * `services` collection - and for the reason written there: scanning for a line
 * reading `options:` takes the FIRST one in the file, so adding any other
 * `options:` above the one a test means would move the test onto a different
 * list while it went on passing. Every step throws by name if it is missing, so
 * a renamed collection or field fails loudly instead of comparing against
 * `undefined`.
 *
 * The interfaces are local, and so are the helpers: `schema.test.ts` keeps its
 * own copy for its own two fields, and exporting one across test files would
 * make the two suites share a maintenance surface they do not need.
 */
interface CmsField {
  name: string;
  widget?: string;
  required?: unknown;
  options?: unknown;
  fields?: CmsField[];
}

interface CmsCollection {
  name: string;
  label?: string;
  description?: string;
  folder?: string;
  fields?: CmsField[];
  files?: { name: string; file: string; fields: CmsField[] }[];
}

function collection(name: string): CmsCollection {
  const collections = CONFIG.collections as CmsCollection[] | undefined;
  const matched = collections?.find((c) => c.name === name);
  if (!matched) throw new Error(`config.yml has no collection named "${name}"`);
  return matched;
}

function collectionField(collectionName: string, fieldName: string): CmsField {
  const fields = collection(collectionName).fields ?? [];
  const hit = fields.find((f) => f.name === fieldName);
  if (!hit) throw new Error(`collection "${collectionName}" has no field named "${fieldName}"`);
  return hit;
}

const OUR_PACKAGE = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };

/*
 * Looked up in BOTH sections on purpose. Which one `@sveltia/cms` belongs in is
 * a judgement - it is needed at build time and never at run time, and a static
 * site has no run time to speak of - and this file has no opinion on it. Pinning
 * it exactly is the thing being asserted, and moving the entry must not look
 * like breaking that.
 */
const REQUIRED_VERSION =
  OUR_PACKAGE.dependencies?.['@sveltia/cms'] ?? OUR_PACKAGE.devDependencies?.['@sveltia/cms'];

/*
 * `strict: false` turns off Ajv's own complaints about vocabulary it does not
 * know - the schema carries `markdownDescription` for editors - and `logger:
 * false` silences the "unknown format" notes for `format: regex`, which Ajv
 * does not implement. Neither affects a single assertion below: both concern
 * the schema's own extras, not whether the config matches it.
 */
const validate = new Ajv({ allErrors: true, strict: false, logger: false }).compile(CMS_SCHEMA);

function errors(config: unknown): string[] {
  return validate(config)
    ? []
    : (validate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message ?? ''}`.trim());
}

describe('the config validator can actually fire', () => {
  /*
   * The positive control, and not a made-up one: EXACTLY the mistakes the
   * plan's version of this file had. `locale: ro` looks like a natural
   * option - Sveltia has never had it, and the root of the configuration
   * forbids unknown keys, so the CMS would have rejected the whole file.
   */
  it('rejects `locale: ro`, the option that does not exist', () => {
    expect(errors({ ...CONFIG, locale: 'ro' })).not.toEqual([]);
  });

  it('rejects a config with no backend', () => {
    const without = { ...CONFIG };
    delete without.backend;
    expect(errors(without)).not.toEqual([]);
  });

  it('rejects an unknown key inside a collection', () => {
    const broken = JSON.parse(JSON.stringify(CONFIG)) as {
      collections: Record<string, unknown>[];
    };
    broken.collections[0].invented_field = true;
    expect(errors(broken)).not.toEqual([]);
  });
});

describe('the CMS config, against the schema Sveltia publishes', () => {
  it('was really read, not merely opened', () => {
    // A guard that reads a file has to prove it read
    // something: an empty file would make every assertion below pass
    // vacuously, and empty YAML parses to `null`.
    expect(CONFIG_TEXT.length).toBeGreaterThan(0);
    expect(CONFIG).not.toBeNull();
    expect(Object.keys(CMS_SCHEMA).length).toBeGreaterThan(0);
  });

  it('is valid', () => {
    expect(errors(CONFIG)).toEqual([]);
  });
});

describe('the CMS form, checked against the schemas the build enforces', () => {
  it('the CMS categories are identical to CATEGORIES', () => {
    // Same mechanism, same reason as SERVICE_NAMES in Phase 1: a dropdown that
    // offers a value the build then rejects hands the volunteer a failed deploy
    // for picking an option this file gave them.
    const field = collectionField('articles', 'category');
    expect(field.options).toEqual([...CATEGORIES]);
  });

  it('every collection has a label and a description in Romanian', () => {
    for (const name of ['articles', 'pages', 'settings']) {
      const c = collection(name);
      expect(c.label, `${name} has no label`).toBeTruthy();
      expect(c.label).not.toMatch(/^[a-z_]+$/); // not the raw key
      // The test name promises a description too, so it checks one: a label
      // alone leaves the volunteer with no sentence about what the collection
      // is for.
      expect(c.description, `${name} has no description`).toBeTruthy();
    }
  });

  it("the schema's required fields are required in the CMS too", () => {
    // Otherwise the volunteer saves a valid-looking entry and the BUILD fails,
    // somewhere they will never see it.
    for (const field of ['title', 'date', 'published', 'category']) {
      expect(collectionField('articles', field).required).not.toBe(false);
    }
  });

  it('offers the accounts as a list and keeps no second IBAN field', () => {
    const settings = collection('settings').files?.[0];
    expect(settings, 'settings has no file block').toBeDefined();
    const names = (settings?.fields ?? []).map((f) => f.name);
    expect(names).toContain('accounts');
    expect(names).not.toContain('iban');
    expect(names).not.toContain('iban2');
  });

  /*
   * TWO DIFFERENT PATHS, AND FOR TWO ROUNDS THIS TEST CONFLATED THEM. It pinned
   * `media_folder` and `public_folder` to the same string as a "matched pair",
   * checking neither against what the build does with it.
   *
   * `media_folder` is where the file is committed: `public/uploads`, which the
   * host serves directly. `public_folder` is the URL prefix the CMS writes into
   * markdown and frontmatter: `/uploads`. It MUST be root-absolute - Sveltia
   * aborts its own startup on a relative one, measured by the `/admin/` browser
   * pass, which then saw only 2 of its 5 expected requests - and it must not
   * point into `/src/`, which the host does not serve.
   */
  it('media_folder and public_folder are a served pair, not two separate guesses', () => {
    expect(CONFIG.media_folder).toBe('public/uploads');
    expect(CONFIG.public_folder).toBe('/uploads');
  });

  it('the pair writes a served URL, not the unserved /src/ namespace', () => {
    expect(
      String(CONFIG.public_folder).startsWith('/'),
      'public_folder must be root-absolute; Sveltia aborts on a relative one',
    ).toBe(true);
    expect(
      String(CONFIG.public_folder).startsWith('/src/'),
      'public_folder points into /src/, which is not a URL the host serves',
    ).toBe(false);
    expect(
      String(CONFIG.public_folder).endsWith('/'),
      'public_folder is a prefix without a trailing slash, or /uploads + /x.jpg doubles it',
    ).toBe(false);
  });
});

describe('the CMS version', () => {
  /*
   * Pre-1.0, with a single maintainer, and changes that can break the
   * configuration between two minor versions. A caret range would pull in a
   * new version at the next install - including on the build server, where
   * nobody is watching - and the first evidence would be an `/admin/` that no longer starts.
   */
  it('is pinned exactly, with no range', () => {
    expect(REQUIRED_VERSION, '@sveltia/cms is not required in package.json').toBeDefined();
    // No range: no `^`, no `~`, no `*`, no `x`.
    expect(REQUIRED_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('reads the @sveltia/cms package itself', () => {
    // Without this, "two levels above the entry file" would be an
    // assumption about the package's layout that nobody verifies, and
    // the schema the configuration was validated against could come from anywhere.
    expect(PACKAGE.name).toBe('@sveltia/cms');
  });

  it('is the installed version itself', () => {
    // Otherwise `package.json` could pin one version, while the schema the
    // configuration above was validated against comes from a different one.
    expect(PACKAGE.version).toBe(REQUIRED_VERSION);
  });
});
