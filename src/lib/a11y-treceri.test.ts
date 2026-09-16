import { describe, expect, it } from 'vitest';
import {
  CONDITII,
  FARA_JS_MOTIVAT,
  TRECERI,
  comandaTrecerii,
  comenziA11y,
  comenzileScriptului,
  citestePachet,
  latimiAuditate,
  moduriAuditate,
  verificaTreceri,
} from '../../scripts/a11y.mjs';

/*
 * WHAT THIS PROVES: no viewport can be counted as audited unless some command
 * in `package.json` actually loads a page at it.
 *
 * `CONDITII` is a declaration. The band-coverage check in `scripts/a11y.mjs`
 * used to measure against it, and a declaration is free: add
 * `tableta: { latime: 850, … }` to `CONDITII`, add nothing else, and every pass
 * went green announcing that 850px was audited while no process had ever opened
 * a page at that width. The same shape hid a second hole - the whole matrix was
 * credited to the selector pass's scratch build too, so the 62rem branch of the
 * week band, which renders there with the picker bar VISIBLE, was audited by
 * nothing at all.
 *
 * The chain that has to hold is: a condition is named by a pass, the pass's
 * command is one `npm run test:all` really reaches, and the pass says which set
 * of pages it loads. `verificaTreceri` asserts all of it and runs before the
 * browser opens on every pass. Every case below is a POSITIVE CONTROL for one
 * link: the claims are all of the form "nothing is missing", and this repository
 * does not accept one of those without a demonstration that the detector fires.
 *
 * The real table is checked here too, against the real `package.json`, so a
 * rename in either file fails in `npm test` rather than three browser launches
 * later.
 */

/** A `package.json` shaped like ours, for the cases that need a broken one. */
const PACHET_BUN = {
  scripts: {
    test: 'vitest run',
    'test:build': 'astro build && vitest run --config vitest.itest.config.ts && node scripts/a11y.mjs',
    'test:all': 'npm run test && npm run test:build && npm run a11y:mobil',
    'a11y:mobil': 'astro build && node scripts/a11y.mjs --mobil',
  },
};

/*
 * The synthetic tables below are a SHAPE, and that is why they are written out
 * in full rather than trimmed to what each case needs.
 *
 * They used to carry `medii: {}` and no scripts-off condition at all. Both were
 * holes in `verificaTreceri` at the time, so the fixtures agreed with the holes -
 * and a fixture is what the next person copies when they add a condition. A
 * synthetic table that could not pass the real rules would have said so here
 * first, in 140 ms, instead of in a review.
 *
 * Every synthetic call passes `{}` as the fourth argument, which is the
 * scripts-off exemption table. A synthetic `TRECERI` gets a synthetic exemption
 * list for the same reason it gets synthetic conditions: the real one names the
 * real `proba` set, and a set these tables do not have is a stale exemption -
 * which the real check correctly reports, and which would then be counted as the
 * failure each case below is looking for.
 */
const TELEFON_PROBA = '(max-width: 34rem)';

const TRECERI_BUNE = {
  implicita: {
    fisier: 'scripts/a11y.mjs', argumente: [], pagini: 'dist',
    conditii: ['birou', 'birouFaraJs'], eticheta: 'i',
  },
  mobil: {
    fisier: 'scripts/a11y.mjs', argumente: ['--mobil'], pagini: 'dist',
    conditii: ['telefon'], eticheta: 'm',
  },
};

const CONDITII_BUNE = {
  birou: { eticheta: 'birou', latime: null, js: true, medii: { [TELEFON_PROBA]: false } },
  birouFaraJs: { eticheta: 'birou, JS oprit', latime: null, js: false, medii: { [TELEFON_PROBA]: false } },
  telefon: { eticheta: 'telefon 390px', latime: 390, js: true, medii: { [TELEFON_PROBA]: true } },
};

describe('tabelul de treceri al auditului', () => {
  it('nu are nimic de reproșat configurației reale', () => {
    const esecuri = verificaTreceri();
    // Printed, not merely asserted: the number below is what a later reader
    // checks a comment against, and vitest hides `console.log` from a test that
    // passes. `process.stdout.write` goes through in both cases.
    const pachet = citestePachet();
    process.stdout.write(
      `\nTreceri (${Object.keys(TRECERI).length}), fiecare pornită din package.json:\n` +
        Object.entries(TRECERI)
          .map(([cheie, t]) => `  ${cheie.padEnd(10)} ${t.pagini.padEnd(6)} ${comandaTrecerii(t)}\n`)
          .join('') +
        `Comenzi de audit găsite în package.json: ${comenziA11y(pachet.scripts).join(' · ')}\n`,
    );
    expect(esecuri).toEqual([]);
  });

  it('chiar găsește comenzi de audit în package.json', () => {
    // Without this the four assertions in `verificaTreceri` could all be silent
    // for the wrong reason - nothing read, nothing to disagree with.
    const gasite = comenziA11y(citestePachet().scripts);
    expect(gasite.length, 'niciun `node scripts/a11y*.mjs` în package.json').toBeGreaterThanOrEqual(
      Object.keys(TRECERI).length,
    );
  });

  it('fiecare condiție din CONDITII e rulată de o trecere', () => {
    const folosite = new Set(Object.values(TRECERI).flatMap((t) => t.conditii as string[]));
    for (const cheie of Object.keys(CONDITII)) expect(folosite, cheie).toContain(cheie);
  });
});

describe('detectorul de declarații pe care nu le rulează nimeni', () => {
  it('prinde o condiție din CONDITII pe care nicio trecere nu o numește', () => {
    const conditii = { ...CONDITII_BUNE, tableta: { eticheta: 'tableta 850px', latime: 850, js: true, medii: { [TELEFON_PROBA]: false } } };
    const esecuri = verificaTreceri(PACHET_BUN, TRECERI_BUNE, conditii, {});
    expect(esecuri).toHaveLength(1);
    expect(esecuri[0]).toContain('tableta');
    // The message must send the reader to BOTH halves. The old one instructed
    // two things and checked the first, which is how this hole opened.
    expect(esecuri[0]).toContain('TRECERI');
    expect(esecuri[0]).toContain('test:all');
  });

  it('prinde o trecere pe care "npm run test:all" nu o pornește', () => {
    const treceri = {
      ...TRECERI_BUNE,
      larg: { fisier: 'scripts/a11y.mjs', argumente: ['--larg'], pagini: 'dist', conditii: ['birou'], eticheta: 'l' },
    };
    const esecuri = verificaTreceri(PACHET_BUN, treceri, CONDITII_BUNE, {});
    expect(esecuri).toHaveLength(1);
    expect(esecuri[0]).toContain('larg');
    expect(esecuri[0]).toContain('node scripts/a11y.mjs --larg');
  });

  it('prinde o comandă de audit din package.json pe care TRECERI nu o descrie', () => {
    const pachet = {
      scripts: { ...PACHET_BUN.scripts, 'a11y:tableta': 'astro build && node scripts/a11y.mjs --tableta' },
    };
    const esecuri = verificaTreceri(pachet, TRECERI_BUNE, CONDITII_BUNE, {});
    expect(esecuri).toHaveLength(1);
    expect(esecuri[0]).toContain('node scripts/a11y.mjs --tableta');
  });

  it('prinde o trecere care numește o condiție inexistentă', () => {
    const treceri = {
      implicita: { ...TRECERI_BUNE.implicita, conditii: ['birou', 'birouFaraJs', 'inventata'] },
      mobil: TRECERI_BUNE.mobil,
    };
    const esecuri = verificaTreceri(PACHET_BUN, treceri, CONDITII_BUNE, {});
    expect(esecuri).toHaveLength(1);
    expect(esecuri[0]).toContain('inventata');
  });

  it('prinde un package.json fără test:all, în loc să tacă', () => {
    const esecuri = verificaTreceri({ scripts: { test: 'vitest run' } }, TRECERI_BUNE, CONDITII_BUNE, {});
    expect(esecuri.length).toBeGreaterThan(0);
    expect(esecuri[0]).toContain('test:all');
  });

  it('nu se plânge de configurația sintetică întreagă', () => {
    expect(verificaTreceri(PACHET_BUN, TRECERI_BUNE, CONDITII_BUNE, {})).toEqual([]);
  });
});

/*
 * AXA LĂȚIMII, PARTEA CARE LIPSEA: o condiție care nu declară nimic.
 *
 * Verificarea (a) din `verificaPraguri` iterează reuniunea cheilor din `medii`
 * ale condițiilor sub care se încarcă un set de pagini. Cu `medii` gol peste tot,
 * bucla nu are corp și nimeni nu se plânge: măsurat, cu pragul de telefon mutat
 * din 34rem în 30rem, toate cele patru treceri ies 0 — față de 1 pentru exact
 * aceeași mutare cu `medii` populat.
 */
describe('o condiție trebuie să declare ce așteaptă de la CSS', () => {
  it('prinde o condiție cu medii gol', () => {
    const conditii = { ...CONDITII_BUNE, telefon: { ...CONDITII_BUNE.telefon, medii: {} } };
    const esecuri = verificaTreceri(PACHET_BUN, TRECERI_BUNE, conditii, {});
    expect(esecuri).toHaveLength(1);
    expect(esecuri[0]).toContain('telefon');
    expect(esecuri[0]).toContain('medii');
  });

  it('prinde o condiție căreia îi lipsește medii cu totul', () => {
    const faraMedii = { eticheta: 'telefon 390px', latime: 390, js: true } as unknown as typeof CONDITII_BUNE.telefon;
    const esecuri = verificaTreceri(PACHET_BUN, TRECERI_BUNE, { ...CONDITII_BUNE, telefon: faraMedii }, {});
    expect(esecuri).toHaveLength(1);
    expect(esecuri[0]).toContain('telefon');
  });

  it('control: aceleași tabele cu medii populat nu au nimic de reproșat', () => {
    expect(verificaTreceri(PACHET_BUN, TRECERI_BUNE, CONDITII_BUNE, {})).toEqual([]);
  });

  it('fiecare condiție reală declară cel puțin o interogare', () => {
    for (const [cheie, c] of Object.entries(CONDITII)) {
      expect(Object.keys((c as { medii: Record<string, boolean> }).medii), cheie).not.toHaveLength(0);
    }
  });
});

/*
 * AXA JAVASCRIPT-ULUI, care până acum nu era indexată de nimic.
 *
 * Ștergerea celor trei condiții cu `js: false` lăsa verde tot — patru treceri cu
 * browser și toată suita unitară — deși singurul audit care randează săptămânile
 * ascunse de selector dispăruse. O trecere care se poate șterge fără să pice ceva
 * este o trecere pe care nu se bazează nimeni.
 */
describe('fiecare set de pagini este auditat și cu scripturile oprite', () => {
  const DOUA_SETURI = {
    ...TRECERI_BUNE,
    proba: { fisier: 'scripts/a11y-selector.mjs', argumente: [], pagini: 'proba', conditii: ['birou'], eticheta: 'p' },
  };
  const PACHET_DOUA = {
    scripts: {
      ...PACHET_BUN.scripts,
      'test:all': 'npm run test && npm run test:build && npm run a11y:mobil && npm run a11y:selector',
      'a11y:selector': 'node scripts/a11y-selector.mjs',
    },
  };

  it('prinde un set de pagini fără nicio condiție cu js: false', () => {
    const esecuri = verificaTreceri(PACHET_DOUA, DOUA_SETURI, CONDITII_BUNE, {});
    expect(esecuri).toHaveLength(1);
    expect(esecuri[0]).toContain('proba');
    expect(esecuri[0]).toContain('OPRITE');
    // Mesajul trebuie să trimită la toate trei verigile, ca și cel de lățime.
    expect(esecuri[0]).toContain('CONDITII');
    expect(esecuri[0]).toContain('test:all');
    expect(esecuri[0]).toContain('FARA_JS_MOTIVAT');
  });

  it('prinde ștergerea condițiilor fără JS din setul principal', () => {
    // Exact mutația din raport: `dist` rămâne auditat numai cu scripturile
    // pornite. Fără verificarea asta, nimic nu se schimbă la culoare.
    const treceri = { ...TRECERI_BUNE, implicita: { ...TRECERI_BUNE.implicita, conditii: ['birou'] } };
    const esecuri = verificaTreceri(PACHET_BUN, treceri, CONDITII_BUNE, {});
    expect(esecuri.filter((e) => e.includes('OPRITE'))).toHaveLength(1);
    expect(esecuri.some((e) => e.includes('dist'))).toBe(true);
  });

  it('un motiv scris îl scutește', () => {
    expect(verificaTreceri(PACHET_DOUA, DOUA_SETURI, CONDITII_BUNE, { proba: 'fiindcă da' })).toEqual([]);
  });

  it('prinde un motiv rămas în urmă, pentru un set care CHIAR are trecere fără JS', () => {
    // Cealaltă direcție, ca la comenzile din package.json: o scuză de care nu
    // mai are nimeni nevoie rămâne în cod arătând ca o regulă.
    const esecuri = verificaTreceri(PACHET_BUN, TRECERI_BUNE, CONDITII_BUNE, { dist: 'fiindcă da' });
    expect(esecuri).toHaveLength(1);
    expect(esecuri[0]).toContain('dist');
    expect(esecuri[0]).toContain('FARA_JS_MOTIVAT');
  });

  it('prinde un motiv pentru un set de pagini pe care nu-l auditează nimeni', () => {
    const esecuri = verificaTreceri(PACHET_BUN, TRECERI_BUNE, CONDITII_BUNE, { inventat: 'fiindcă da' });
    expect(esecuri).toHaveLength(1);
    expect(esecuri[0]).toContain('inventat');
  });

  it('moduriAuditate nu amestecă seturile', () => {
    expect(moduriAuditate('dist', DOUA_SETURI, CONDITII_BUNE)).toEqual({
      treceri: ['implicita', 'mobil'], cuJs: true, faraJs: true,
    });
    expect(moduriAuditate('proba', DOUA_SETURI, CONDITII_BUNE)).toEqual({
      treceri: ['proba'], cuJs: true, faraJs: false,
    });
  });

  it('configurația reală: dist e auditat în ambele stări, proba e scutită cu motiv', () => {
    const dist = moduriAuditate('dist');
    const proba = moduriAuditate('proba');
    process.stdout.write(
      `\nStări JavaScript pe set de pagini:\n` +
        `  dist  JS pornit ${dist.cuJs} · JS oprit ${dist.faraJs}  (${dist.treceri.join(', ')})\n` +
        `  proba JS pornit ${proba.cuJs} · JS oprit ${proba.faraJs}  (${proba.treceri.join(', ')})\n` +
        `  scutite: ${Object.keys(FARA_JS_MOTIVAT).join(', ') || '(niciunul)'}\n`,
    );
    expect(dist.faraJs, 'dist trebuie auditat și fără JavaScript').toBe(true);
    expect(FARA_JS_MOTIVAT).not.toHaveProperty('dist');
    expect(proba.faraJs ? undefined : FARA_JS_MOTIVAT.proba, 'proba fără JS și fără motiv').toBeTruthy();
  });

  it('fiecare set scutit este un set pe care chiar îl auditează o trecere', () => {
    const seturi = new Set(Object.values(TRECERI).map((t) => (t as { pagini: string }).pagini));
    for (const cheie of Object.keys(FARA_JS_MOTIVAT)) expect(seturi, cheie).toContain(cheie);
  });
});

describe('ce rulează un script din package.json', () => {
  it('urmărește lanțurile de npm run', () => {
    const { comenzi, probleme } = comenzileScriptului(PACHET_BUN.scripts, 'test:all');
    expect(probleme).toEqual([]);
    expect(comenzi).toContain('node scripts/a11y.mjs');
    expect(comenzi).toContain('node scripts/a11y.mjs --mobil');
    expect(comenzi).toContain('astro build');
    // `npm run X` is replaced by what X runs, never left as a command itself.
    expect(comenzi.filter((c: string) => c.startsWith('npm run'))).toEqual([]);
  });

  it('se oprește pe un lanț circular în loc să se învârtă', () => {
    const { comenzi } = comenzileScriptului({ a: 'npm run b', b: 'npm run a && echo gata' }, 'a');
    expect(comenzi).toEqual(['echo gata']);
  });

  it('spune când un script numit nu există', () => {
    const { probleme } = comenzileScriptului({ 'test:all': 'npm run lipsa' }, 'test:all');
    expect(probleme).toHaveLength(1);
    expect(probleme[0]).toContain('lipsa');
  });
});

describe('lățimile se socotesc pe set de pagini', () => {
  it('nu amestecă seturile', () => {
    const treceri = {
      unu: { fisier: 'f', argumente: [], pagini: 'dist', conditii: ['birou', 'telefon'], eticheta: 'u' },
      doi: { fisier: 'g', argumente: [], pagini: 'proba', conditii: ['birou'], eticheta: 'd' },
    };
    expect(latimiAuditate('dist', 756, treceri, CONDITII_BUNE)).toEqual({ treceri: ['unu'], latimi: [390, 756] });
    // This is finding A2 in one line: the scratch build is audited by one pass
    // at one width, and 390 belongs to a pass that never loads these pages.
    expect(latimiAuditate('proba', 756, treceri, CONDITII_BUNE)).toEqual({ treceri: ['doi'], latimi: [756] });
  });

  it('un set de pagini pe care nu-l auditează nimeni nu primește nicio lățime', () => {
    expect(latimiAuditate('inexistent', 756, TRECERI_BUNE, CONDITII_BUNE)).toEqual({ treceri: [], latimi: [] });
  });

  it('pune lățimea măsurată în locul celei nedeclarate', () => {
    const treceri = { unu: { fisier: 'f', argumente: [], pagini: 'dist', conditii: ['birou'], eticheta: 'u' } };
    expect(latimiAuditate('dist', 1234, treceri, CONDITII_BUNE).latimi).toEqual([1234]);
  });

  it('cele două seturi reale sunt auditate de treceri diferite', () => {
    const dist = latimiAuditate('dist', 756);
    const proba = latimiAuditate('proba', 756);
    expect(dist.treceri.length).toBeGreaterThan(0);
    expect(proba.treceri.length).toBeGreaterThan(0);
    expect(dist.treceri).not.toEqual(proba.treceri);
    process.stdout.write(
      `\nLățimi auditate pe set de pagini:\n` +
        `  dist  ${dist.latimi.join(', ')}px  (${dist.treceri.join(', ')})\n` +
        `  proba ${proba.latimi.join(', ')}px  (${proba.treceri.join(', ')})\n`,
    );
  });
});
