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
 * layout, so it is asserted below rather than trusted: `PACHET.name` has to come
 * back as `@sveltia/cms`.
 */
const RADACINA = dirname(dirname(require.resolve('@sveltia/cms')));
const PACHET = JSON.parse(readFileSync(join(RADACINA, 'package.json'), 'utf8')) as {
  name: string;
  version: string;
};

const SCHEMA_CMS = JSON.parse(
  readFileSync(join(RADACINA, 'schema', 'sveltia-cms.json'), 'utf8'),
) as Record<string, unknown>;

const CONFIG_TEXT = readFileSync(
  new URL('../../public/admin/config.yml', import.meta.url),
  'utf8',
);
const CONFIG = parse(CONFIG_TEXT) as Record<string, unknown>;

const PACHET_PROPRIU = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { dependencies: Record<string, string> };

/*
 * `strict: false` turns off Ajv's own complaints about vocabulary it does not
 * know - the schema carries `markdownDescription` for editors - and `logger:
 * false` silences the "unknown format" notes for `format: regex`, which Ajv
 * does not implement. Neither affects a single assertion below: both concern
 * the schema's own extras, not whether the config matches it.
 */
const valideaza = new Ajv({ allErrors: true, strict: false, logger: false }).compile(SCHEMA_CMS);

function erori(config: unknown): string[] {
  return valideaza(config)
    ? []
    : (valideaza.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message ?? ''}`.trim());
}

describe('validatorul de configurație poate să se declanșeze', () => {
  /*
   * Controlul pozitiv, și nu unul inventat: EXACT greșelile pe care le avea
   * versiunea din plan a acestui fișier. `locale: ro` arată ca o opțiune
   * firească - Sveltia nu a avut-o niciodată, iar rădăcina configurației
   * interzice cheile necunoscute, deci CMS-ul ar fi respins tot fișierul.
   */
  it('respinge `locale: ro`, opțiunea care nu există', () => {
    expect(erori({ ...CONFIG, locale: 'ro' })).not.toEqual([]);
  });

  it('respinge o configurație fără backend', () => {
    const fara = { ...CONFIG };
    delete fara.backend;
    expect(erori(fara)).not.toEqual([]);
  });

  it('respinge o cheie necunoscută într-o colecție', () => {
    const stricat = JSON.parse(JSON.stringify(CONFIG)) as {
      collections: Record<string, unknown>[];
    };
    stricat.collections[0].chestie_inventata = true;
    expect(erori(stricat)).not.toEqual([]);
  });
});

describe('configurația CMS, față de schema pe care o publică Sveltia', () => {
  it('a fost citită, nu doar deschisă', () => {
    // O gardă care citește un fișier trebuie să dovedească faptul că a citit
    // ceva: un fișier gol ar face ca fiecare aserțiune de mai jos să treacă în
    // gol, iar YAML-ul gol se parsează în `null`.
    expect(CONFIG_TEXT.length).toBeGreaterThan(0);
    expect(CONFIG).not.toBeNull();
    expect(Object.keys(SCHEMA_CMS).length).toBeGreaterThan(0);
  });

  it('este validă', () => {
    expect(erori(CONFIG)).toEqual([]);
  });
});

describe('versiunea CMS-ului', () => {
  /*
   * Pre-1.0, cu un singur întreținător, și schimbări care pot să rupă
   * configurația între două versiuni minore. O plajă cu accent ar aduce o
   * versiune nouă la următoarea instalare - inclusiv pe serverul de build, unde
   * nimeni nu se uită - iar prima dovadă ar fi un `/admin/` care nu mai pornește.
   */
  it('este fixată exact, fără plajă', () => {
    const ceruta = PACHET_PROPRIU.dependencies['@sveltia/cms'];
    expect(ceruta, '@sveltia/cms lipsește din dependencies').toBeDefined();
    expect(ceruta).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('se citește chiar pachetul @sveltia/cms', () => {
    // Fără asta, „două niveluri mai sus de fișierul de intrare" ar fi o
    // presupunere despre structura pachetului pe care nimeni nu o verifică, iar
    // schema după care s-a validat configurația ar putea veni de oriunde.
    expect(PACHET.name).toBe('@sveltia/cms');
  });

  it('este chiar versiunea instalată', () => {
    // Altfel `package.json` ar putea să fixeze o versiune, iar schema după care
    // s-a validat configurația de mai sus să vină din alta.
    expect(PACHET.version).toBe(PACHET_PROPRIU.dependencies['@sveltia/cms']);
  });
});
