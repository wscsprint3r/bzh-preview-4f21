import { describe, expect, it } from 'vitest';
import {
  CONDITIONS,
  NO_AXE_REASONS,
  NO_JS_REASONS,
  UNAUDITED_FEATURES,
  PASSES,
  passCommand,
  a11yCommands,
  scriptCommands,
  readPackageJson,
  auditedWidths,
  widthsByState,
  auditedStates,
  requiredStates,
  conditionFeatures,
  checkBreakpoints,
  checkPasses,
} from '../../scripts/a11y.mjs';

/*
 * WHAT THIS PROVES: no viewport can be counted as audited unless some command
 * in `package.json` actually loads a page at it.
 *
 * `CONDITIONS` is a declaration. The band-coverage check in `scripts/a11y.mjs`
 * used to measure against it, and a declaration is free: add
 * `tablet: { width: 850, … }` to `CONDITIONS`, add nothing else, and every pass
 * went green announcing that 850px was audited while no process had ever opened
 * a page at that width. The same shape hid a second hole - the whole matrix was
 * credited to the picker pass's scratch build too, so the 62rem branch of the
 * week band, which renders there with the picker bar VISIBLE, was audited by
 * nothing at all.
 *
 * The chain that has to hold is: a condition is named by a pass, the pass's
 * command is one `npm run test:all` really reaches, and the pass says which set
 * of pages it loads. `checkPasses` asserts all of it and runs before the
 * browser opens on every pass. Every case below is a POSITIVE CONTROL for one
 * link: the claims are all of the form "nothing is missing", and this repository
 * does not accept one of those without a demonstration that the detector fires.
 *
 * The real table is checked here too, against the real `package.json`, so a
 * rename in either file fails in `npm test` rather than three browser launches
 * later.
 */

/** A `package.json` shaped like ours, for the cases that need a broken one. */
const GOOD_PACKAGE = {
  scripts: {
    test: 'vitest run',
    'test:build': 'astro build && vitest run --config vitest.itest.config.ts && node scripts/a11y.mjs',
    'test:all': 'npm run test && npm run test:build && npm run a11y:mobile',
    'a11y:mobile': 'astro build && node scripts/a11y.mjs --mobile',
  },
};

/*
 * The synthetic tables below are a SHAPE, and that is why they are written out
 * in full rather than trimmed to what each case needs.
 *
 * They used to carry `media: {}` and no scripts-off condition at all. Both were
 * holes in `checkPasses` at the time, so the fixtures agreed with the holes -
 * and a fixture is what the next person copies when they add a condition. A
 * synthetic table that could not pass the real rules would have said so here
 * first, in 140 ms, instead of in a review.
 *
 * Every synthetic call passes `{}` as the fourth argument, which is the
 * scripts-off exemption table. A synthetic `PASSES` gets a synthetic exemption
 * list for the same reason it gets synthetic conditions: the real one names the
 * real `fixture` set, and a set these tables do not have is a stale exemption -
 * which the real check correctly reports, and which would then be counted as the
 * failure each case below is looking for.
 */
const PHONE_QUERY = '(max-width: 34rem)';

const GOOD_PASSES = {
  defaultWidth: {
    file: 'scripts/a11y.mjs', args: [], pages: 'dist',
    conditions: ['desk', 'deskNoJs'], label: 'i',
  },
  mobile: {
    file: 'scripts/a11y.mjs', args: ['--mobile'], pages: 'dist',
    conditions: ['phone', 'phoneNoJs'], label: 'm',
  },
};

/*
 * `phoneNoJs` este aici pentru același motiv pentru care `media` nu mai este
 * gol: fixtura trebuie să treacă regulile adevărate, fiindcă ea este ce copiază
 * următorul om. Fără ea, banda de sub 34rem ar fi auditată numai cu scripturile
 * pornite — exact al șaselea aranjament orb, scris în fixtură.
 */
const GOOD_CONDITIONS = {
  desk: { label: 'desk', width: null, js: true, media: { [PHONE_QUERY]: false } },
  deskNoJs: { label: 'desk, JS off', width: null, js: false, media: { [PHONE_QUERY]: false } },
  phone: { label: 'phone 390px', width: 390, js: true, media: { [PHONE_QUERY]: true } },
  phoneNoJs: { label: 'phone 390px, JS off', width: 390, js: false, media: { [PHONE_QUERY]: true } },
};

describe("the audit's pass table", () => {
  it('has nothing to complain about in the real configuration', () => {
    const failures = checkPasses();
    // Printed, not merely asserted: the number below is what a later reader
    // checks a comment against, and vitest hides `console.log` from a test that
    // passes. `process.stdout.write` goes through in both cases.
    const pkg = readPackageJson();
    process.stdout.write(
      `\nPasses (${Object.keys(PASSES).length}), each started from package.json:\n` +
        Object.entries(PASSES)
          .map(([key, t]) => `  ${key.padEnd(10)} ${t.pages.padEnd(6)} ${passCommand(t)}\n`)
          .join('') +
        `Audit commands found in package.json: ${a11yCommands(pkg.scripts).join(' · ')}\n`,
    );
    expect(failures).toEqual([]);
  });

  it('really does find audit commands in package.json', () => {
    // Without this the four assertions in `checkPasses` could all be silent
    // for the wrong reason - nothing read, nothing to disagree with.
    const found = a11yCommands(readPackageJson().scripts);
    expect(found.length, 'no `node scripts/a11y*.mjs` in package.json').toBeGreaterThanOrEqual(
      Object.keys(PASSES).length,
    );
  });

  it('every condition in CONDITIONS is run by a pass', () => {
    const used = new Set(Object.values(PASSES).flatMap((t) => t.conditions as string[]));
    for (const key of Object.keys(CONDITIONS)) expect(used, key).toContain(key);
  });
});

describe('the detector for declarations nobody runs', () => {
  it('catches a condition in CONDITIONS that no pass names', () => {
    const conditions = { ...GOOD_CONDITIONS, tablet: { label: 'tablet 850px', width: 850, js: true, media: { [PHONE_QUERY]: false } } };
    const failures = checkPasses(GOOD_PACKAGE, GOOD_PASSES, conditions, {});
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('tablet');
    // The message must send the reader to BOTH halves. The old one instructed
    // two things and checked the first, which is how this hole opened.
    expect(failures[0]).toContain('PASSES');
    expect(failures[0]).toContain('test:all');
  });

  it('catches a pass that "npm run test:all" does not start', () => {
    const passes = {
      ...GOOD_PASSES,
      wide: { file: 'scripts/a11y.mjs', args: ['--wide'], pages: 'dist', conditions: ['desk'], label: 'l' },
    };
    const failures = checkPasses(GOOD_PACKAGE, passes, GOOD_CONDITIONS, {});
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('wide');
    expect(failures[0]).toContain('node scripts/a11y.mjs --wide');
  });

  it('catches an audit command in package.json that PASSES does not describe', () => {
    const pkg = {
      scripts: { ...GOOD_PACKAGE.scripts, 'a11y:tableta': 'astro build && node scripts/a11y.mjs --tableta' },
    };
    const failures = checkPasses(pkg, GOOD_PASSES, GOOD_CONDITIONS, {});
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('node scripts/a11y.mjs --tableta');
  });

  it('catches a pass naming a condition that does not exist', () => {
    const passes = {
      defaultWidth: { ...GOOD_PASSES.defaultWidth, conditions: ['desk', 'deskNoJs', 'invented'] },
      mobile: GOOD_PASSES.mobile,
    };
    const failures = checkPasses(GOOD_PACKAGE, passes, GOOD_CONDITIONS, {});
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('invented');
  });

  it('catches a package.json with no test:all, instead of staying quiet', () => {
    const failures = checkPasses({ scripts: { test: 'vitest run' } }, GOOD_PASSES, GOOD_CONDITIONS, {});
    expect(failures.length).toBeGreaterThan(0);
    expect(failures[0]).toContain('test:all');
  });

  it('does not complain about the whole synthetic configuration', () => {
    expect(checkPasses(GOOD_PACKAGE, GOOD_PASSES, GOOD_CONDITIONS, {})).toEqual([]);
  });
});

/*
 * AXA LĂȚIMII, PARTEA CARE LIPSEA: o condiție care nu declară nimic.
 *
 * Verificarea (a) din `checkBreakpoints` iterează reuniunea cheilor din `media`
 * ale condițiilor sub care se încarcă un set de pagini. Cu `media` gol peste tot,
 * bucla nu are corp și nimeni nu se plânge: măsurat, cu pragul de telefon mutat
 * din 34rem în 30rem, toate cele patru treceri ies 0 — față de 1 pentru exact
 * aceeași mutare cu `media` populat.
 */
describe('a condition must declare what it expects of the CSS', () => {
  it('catches a condition with an empty media', () => {
    const conditions = { ...GOOD_CONDITIONS, phone: { ...GOOD_CONDITIONS.phone, media: {} } };
    const failures = checkPasses(GOOD_PACKAGE, GOOD_PASSES, conditions, {});
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('phone');
    expect(failures[0]).toContain('media');
  });

  it('catches a condition missing media altogether', () => {
    const withoutMedia = { label: 'phone 390px', width: 390, js: true } as unknown as typeof GOOD_CONDITIONS.phone;
    const failures = checkPasses(GOOD_PACKAGE, GOOD_PASSES, { ...GOOD_CONDITIONS, phone: withoutMedia }, {});
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('phone');
  });

  it('control: the same tables with media populated have nothing to complain about', () => {
    expect(checkPasses(GOOD_PACKAGE, GOOD_PASSES, GOOD_CONDITIONS, {})).toEqual([]);
  });

  it('every real condition declares at least one query', () => {
    for (const [key, c] of Object.entries(CONDITIONS)) {
      expect(Object.keys((c as { media: Record<string, boolean> }).media), key).not.toHaveLength(0);
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
describe('every set of pages is audited with scripts off too', () => {
  const TWO_PAGE_SETS = {
    ...GOOD_PASSES,
    fixture: { file: 'scripts/a11y-picker.mjs', args: [], pages: 'fixture', conditions: ['desk'], label: 'p' },
  };
  const TWO_SET_PACKAGE = {
    scripts: {
      ...GOOD_PACKAGE.scripts,
      'test:all': 'npm run test && npm run test:build && npm run a11y:mobile && npm run a11y:picker',
      'a11y:picker': 'node scripts/a11y-picker.mjs',
    },
  };

  it('catches a set of pages with no js: false condition at all', () => {
    const failures = checkPasses(TWO_SET_PACKAGE, TWO_PAGE_SETS, GOOD_CONDITIONS, {});
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('fixture');
    expect(failures[0]).toContain('OFF');
    // Mesajul trebuie să trimită la toate trei verigile, ca și cel de lățime.
    expect(failures[0]).toContain('CONDITIONS');
    expect(failures[0]).toContain('test:all');
    expect(failures[0]).toContain('NO_JS_REASONS');
  });

  it('catches the no-JS conditions being deleted from the main set', () => {
    // Exact mutația din raport: `dist` rămâne auditat numai cu scripturile
    // pornite. Fără verificarea asta, nimic nu se schimbă la culoare.
    const passes = {
      defaultWidth: { ...GOOD_PASSES.defaultWidth, conditions: ['desk'] },
      mobile: { ...GOOD_PASSES.mobile, conditions: ['phone'] },
    };
    const conditions = { desk: GOOD_CONDITIONS.desk, phone: GOOD_CONDITIONS.phone };
    const failures = checkPasses(GOOD_PACKAGE, passes, conditions, {});
    expect(failures.filter((e) => e.includes('OFF'))).toHaveLength(1);
    expect(failures.some((e) => e.includes('dist'))).toBe(true);
  });

  it('a written reason exempts it', () => {
    expect(checkPasses(TWO_SET_PACKAGE, TWO_PAGE_SETS, GOOD_CONDITIONS, { fixture: 'because yes' })).toEqual([]);
  });

  it('catches a stale reason, for a set that REALLY does have a no-JS pass', () => {
    // Cealaltă direcție, ca la comenzile din package.json: o scuză de care nu
    // mai are nimeni nevoie rămâne în cod arătând ca o regulă.
    const failures = checkPasses(GOOD_PACKAGE, GOOD_PASSES, GOOD_CONDITIONS, { dist: 'because yes' });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('dist');
    expect(failures[0]).toContain('NO_JS_REASONS');
  });

  it('catches a reason for a set of pages nobody audits', () => {
    const failures = checkPasses(GOOD_PACKAGE, GOOD_PASSES, GOOD_CONDITIONS, { invented: 'because yes' });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('invented');
  });

  it('auditedStates does not mix the sets up', () => {
    expect(auditedStates('dist', TWO_PAGE_SETS, GOOD_CONDITIONS)).toEqual({
      passes: ['defaultWidth', 'mobile'], withJs: true, withoutJs: true,
    });
    expect(auditedStates('fixture', TWO_PAGE_SETS, GOOD_CONDITIONS)).toEqual({
      passes: ['fixture'], withJs: true, withoutJs: false,
    });
  });

  it('the real configuration: dist is audited in both states, fixture is exempt with a reason', () => {
    const dist = auditedStates('dist');
    const fixture = auditedStates('fixture');
    process.stdout.write(
      `\nJavaScript states per page set:\n` +
        `  dist    JS on ${dist.withJs} · JS off ${dist.withoutJs}  (${dist.passes.join(', ')})\n` +
        `  fixture JS on ${fixture.withJs} · JS off ${fixture.withoutJs}  (${fixture.passes.join(', ')})\n` +
        `  exempt: ${Object.keys(NO_JS_REASONS).join(', ') || '(none)'}\n`,
    );
    expect(dist.withoutJs, 'dist must be audited without JavaScript too').toBe(true);
    expect(NO_JS_REASONS).not.toHaveProperty('dist');
    expect(fixture.withoutJs ? undefined : NO_JS_REASONS.fixture, 'fixture with no JS pass and no reason').toBeTruthy();
  });

  it('every exempt set is a set some pass really audits', () => {
    const pageSets = new Set(Object.values(PASSES).map((t) => (t as { pages: string }).pages));
    for (const key of Object.keys(NO_JS_REASONS)) expect(pageSets, key).toContain(key);
  });
});

describe('what a package.json script runs', () => {
  it('follows npm run chains', () => {
    const { commands, problems } = scriptCommands(GOOD_PACKAGE.scripts, 'test:all');
    expect(problems).toEqual([]);
    expect(commands).toContain('node scripts/a11y.mjs');
    expect(commands).toContain('node scripts/a11y.mjs --mobile');
    expect(commands).toContain('astro build');
    // `npm run X` is replaced by what X runs, never left as a command itself.
    expect(commands.filter((c: string) => c.startsWith('npm run'))).toEqual([]);
  });

  it('stops on a circular chain instead of spinning', () => {
    const { commands } = scriptCommands({ a: 'npm run b', b: 'npm run a && echo gata' }, 'a');
    expect(commands).toEqual(['echo gata']);
  });

  it('says when a named script does not exist', () => {
    const { problems } = scriptCommands({ 'test:all': 'npm run lipsa' }, 'test:all');
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('lipsa');
  });
});

describe('widths are counted per set of pages', () => {
  it('does not mix the sets up', () => {
    const passes = {
      one: { file: 'f', args: [], pages: 'dist', conditions: ['desk', 'phone'], label: 'u' },
      two: { file: 'g', args: [], pages: 'fixture', conditions: ['desk'], label: 'd' },
    };
    expect(auditedWidths('dist', 756, passes, GOOD_CONDITIONS)).toEqual({ passes: ['one'], widths: [390, 756] });
    // This is finding A2 in one line: the scratch build is audited by one pass
    // at one width, and 390 belongs to a pass that never loads these pages.
    expect(auditedWidths('fixture', 756, passes, GOOD_CONDITIONS)).toEqual({ passes: ['two'], widths: [756] });
  });

  it('a set of pages nobody audits gets no width at all', () => {
    expect(auditedWidths('inexistent', 756, GOOD_PASSES, GOOD_CONDITIONS)).toEqual({ passes: [], widths: [] });
  });

  it('puts the measured width in place of the undeclared one', () => {
    const passes = { one: { file: 'f', args: [], pages: 'dist', conditions: ['desk'], label: 'u' } };
    expect(auditedWidths('dist', 1234, passes, GOOD_CONDITIONS).widths).toEqual([1234]);
  });

  it('the two real sets are audited by different passes', () => {
    const dist = auditedWidths('dist', 756);
    const fixture = auditedWidths('fixture', 756);
    expect(dist.passes.length).toBeGreaterThan(0);
    expect(fixture.passes.length).toBeGreaterThan(0);
    expect(dist.passes).not.toEqual(fixture.passes);
    process.stdout.write(
      `\nWidths audited per page set:\n` +
        `  dist    ${dist.widths.join(', ')}px  (${dist.passes.join(', ')})\n` +
        `  fixture ${fixture.widths.join(', ')}px  (${fixture.passes.join(', ')})\n`,
    );
  });
});

/*
 * ===========================================================================
 * TOT CE CERE CSS-UL, FAȚĂ ÎN FAȚĂ CU TOT CE RULEAZĂ SUITA, ÎN AMBELE SENSURI.
 *
 * Garda aceasta a fost verde și oarbă de ȘASE ori, găsită de patru oameni:
 * praguri scrise de mână; lățimi declarate pe care nu le rula nimeni; axa
 * JavaScript, pe care n-o indexa nimic; `media: {}`, care făcea comparația o
 * buclă fără corp; verificarea (a), care mergea într-un singur sens; și
 * acoperirea socotită pe SETUL de pagini în loc de bandă, așa că o lățime își
 * putea pierde trecerea fără scripturi fără să pice nimic.
 *
 * Șase instanțe, o singură formă: garda compara o declarație cu un subiect pe
 * unele axe și nu pe altele, și tăcea despre ce nu indexa. Cazurile de mai jos
 * sunt controalele pozitive ale restatementului — câte unul pe fiecare direcție,
 * fiindcă o afirmație de forma „nu lipsește nimic" nu se primește aici fără o
 * demonstrație că detectorul chiar se declanșează. Rulează în ~140 ms, înainte de
 * patru porniri de Chrome.
 * ===========================================================================
 */

/** Un prag derivat, în forma în care îl întoarce `breakpointsFromCss()`. */
function breakpoint(text: string, px: number, limit: number, source = 'index.html') {
  return { limit, px, texts: new Set([text]), sources: new Set([source]) };
}

/** O trăsătură de mediu care nu este o lățime, în aceeași formă. */
function feature(name: string, source = 'index.html') {
  return { name, sources: new Set([source]), conditions: new Set([`@media (${name}: reduce)`]) };
}

const GOOD_OPTIONS = { passTable: GOOD_PASSES, conditions: GOOD_CONDITIONS, reasons: {}, unaudited: {} };
const BREAKPOINT_34 = breakpoint('(max-width: 34rem)', 544, 544);
const GOOD_DERIVED = { breakpoints: [BREAKPOINT_34], features: [], problems: [] };

describe('breakpoints derived from the CSS against what the conditions declare', () => {
  it('control: the whole synthetic tables have nothing to complain about', () => {
    expect(checkBreakpoints(GOOD_DERIVED, 756, 'dist', GOOD_OPTIONS).failures).toEqual([]);
  });

  it('(a) catches a declared query the CSS no longer has', () => {
    // Pragul s-a mutat din 34rem în 30rem: acum pică în AMBELE sensuri.
    const movedBreakpoint = { breakpoints: [breakpoint('(max-width: 30rem)', 480, 480)], features: [], problems: [] };
    const failures = checkBreakpoints(movedBreakpoint, 756, 'dist', GOOD_OPTIONS).failures;
    expect(failures.some((e: string) => e.includes('the built CSS no longer has a breakpoint there'))).toBe(true);
    expect(failures.some((e: string) => e.includes('no condition names'))).toBe(true);
  });

  it("(a') catches a CSS breakpoint no condition names — the fifth arrangement", () => {
    /*
     * Aranjamentul exact, în mic: `media` rămâne nevid (deci verificarea lui
     * trece), dar pragul de 62rem nu mai e numit de nicio condiție. Înainte de
     * linia asta, toate cele patru treceri și toată suita ieșeau 0 cu pragul
     * mutat la 60rem și tipărit în ieșire.
     */
    const withSecond = {
      breakpoints: [BREAKPOINT_34, breakpoint('(min-width: 62rem)', 992, 991)],
      features: [],
      problems: [],
    };
    const failures = checkBreakpoints(withSecond, 756, 'dist', GOOD_OPTIONS).failures;
    expect(failures.filter((e: string) => e.includes('no condition names'))).toHaveLength(1);
    expect(failures[0]).toContain('992px');
    expect(failures[0]).toContain('media');
  });

  it("(a') does not complain about the same breakpoint when a condition declares it", () => {
    // Cealaltă jumătate a controlului: roșul depinde de absența declarației.
    const conditions = {
      ...GOOD_CONDITIONS,
      desk: { ...GOOD_CONDITIONS.desk, media: { [PHONE_QUERY]: false, '(min-width: 62rem)': false } },
    };
    const withSecond = {
      breakpoints: [BREAKPOINT_34, breakpoint('(min-width: 62rem)', 992, 991)],
      features: [],
      problems: [],
    };
    const failures = checkBreakpoints(withSecond, 756, 'dist', { ...GOOD_OPTIONS, conditions }).failures;
    expect(failures.filter((e: string) => e.includes('no condition names'))).toEqual([]);
  });
});

describe('coverage is a property of the pair (band, script state)', () => {
  it('catches a band audited only with scripts on — the sixth arrangement', () => {
    /*
     * Mutația măsurată înainte de a exista verificarea: scoate `phoneNoJs`
     * din CONDITIONS și din PASSES.mobil și nu pică nimic — nici garda unitară,
     * nici cele două treceri peste `dist` — deși banda de sub 34rem rămâne
     * auditată numai cu scripturile pornite, adică tocmai acolo unde selectorul
     * ascunde toate săptămânile în afară de una și unde citește cea mai mare
     * parte a parohiei. Ieșirea spunea în continuare „JS pornit · JS oprit”:
     * adevărat despre SET, fals despre bandă.
     */
    const passTable = { ...GOOD_PASSES, mobile: { ...GOOD_PASSES.mobile, conditions: ['phone'] } };
    const failures = checkBreakpoints(GOOD_DERIVED, 756, 'dist', { ...GOOD_OPTIONS, passTable }).failures;
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('OFF');
    expect(failures[0]).toContain('0-544px');
    // Mesajul trebuie să spună și ce se rulează pe cealaltă stare, altfel cititorul
    // vede o bandă „neauditată" lângă o ieșire care zice că setul e auditat în ambele.
    expect(failures[0]).toContain('On the other state');
  });

  it('catches the top band left without a state too', () => {
    const passTable = { ...GOOD_PASSES, defaultWidth: { ...GOOD_PASSES.defaultWidth, conditions: ['desk'] } };
    const failures = checkBreakpoints(GOOD_DERIVED, 756, 'dist', { ...GOOD_OPTIONS, passTable }).failures;
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('OFF');
    expect(failures[0]).toContain('545-∞px');
  });

  it('a written reason exempts the scripts-off state, as in checkPasses', () => {
    const passTable = { ...GOOD_PASSES, mobile: { ...GOOD_PASSES.mobile, conditions: ['phone'] } };
    const options = { ...GOOD_OPTIONS, passTable, reasons: { dist: 'because yes' } };
    expect(checkBreakpoints(GOOD_DERIVED, 756, 'dist', options).failures).toEqual([]);
  });

  it('widthsByState mixes up neither the sets nor the states', () => {
    expect(widthsByState('dist', 756, GOOD_PASSES, GOOD_CONDITIONS)).toEqual({
      withJs: [390, 756], withoutJs: [390, 756],
    });
    const passTable = { ...GOOD_PASSES, mobile: { ...GOOD_PASSES.mobile, conditions: ['phone'] } };
    expect(widthsByState('dist', 756, passTable, GOOD_CONDITIONS)).toEqual({ withJs: [390, 756], withoutJs: [756] });
    expect(widthsByState('inexistent', 756, GOOD_PASSES, GOOD_CONDITIONS)).toEqual({ withJs: [], withoutJs: [] });
  });

  it('requiredStates asks for both states, or only one when a reason is written', () => {
    expect(requiredStates('dist', {}).map((s: { key: string }) => s.key)).toEqual(['withJs', 'withoutJs']);
    expect(requiredStates('fixture', { fixture: 'because yes' }).map((s: { key: string }) => s.key)).toEqual(['withJs']);
  });
});

/*
 * AXA PE CARE GARDA N-O INDEXEAZĂ DELOC, și care a fost acolo tot timpul.
 *
 * `widthComparisons()` consuma comparațiile de lățime, iar restul era cercetat numai
 * după cuvântul „width". Deci `@media (prefers-reduced-motion: reduce)` a trecut
 * prin fiecare versiune a gărzii, inclusiv prin cele două scrise anume ca să
 * închidă aranjamente oarbe, fără o linie de ieșire. Asta este verificarea care
 * face din următoarea trăsătură o construcție roșie, nu a șaptea constatare.
 */
describe('every media feature that is not a width is named, with a reason', () => {
  it('catches a feature nobody has named', () => {
    const derived = { breakpoints: [BREAKPOINT_34], features: [feature('prefers-color-scheme')], problems: [] };
    const failures = checkBreakpoints(derived, 756, 'dist', GOOD_OPTIONS).failures;
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('prefers-color-scheme');
    expect(failures[0]).toContain('UNAUDITED_FEATURES');
  });

  it('a written reason exempts it', () => {
    const derived = { breakpoints: [BREAKPOINT_34], features: [feature('prefers-color-scheme')], problems: [] };
    const options = { ...GOOD_OPTIONS, unaudited: { 'prefers-color-scheme': 'because yes' } };
    expect(checkBreakpoints(derived, 756, 'dist', options).failures).toEqual([]);
  });

  it('catches a reason that has fallen behind the stylesheets', () => {
    // Cealaltă direcție, ca la NO_JS_REASONS și la comenzile din package.json.
    const options = { ...GOOD_OPTIONS, unaudited: { 'prefers-reduced-motion': 'because yes' } };
    const failures = checkBreakpoints(GOOD_DERIVED, 756, 'dist', options).failures;
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('prefers-reduced-motion');
    expect(failures[0]).toContain('no longer contains');
  });

  it('features are checked even when the CSS produced no breakpoint', () => {
    // Fără asta, întoarcerea devreme pentru „niciun prag" ar sări peste (c) — o
    // ieșire timpurie care ascunde o verificare este exact forma plătită aici.
    const derived = { breakpoints: [], features: [feature('print')], problems: [] };
    const failures = checkBreakpoints(derived, 756, 'dist', GOOD_OPTIONS).failures;
    expect(failures.some((e: string) => e.includes('print'))).toBe(true);
  });

  it('reads the features out of an @media condition, the widths do not', () => {
    expect(conditionFeatures('(max-width: 34rem)')).toEqual([]);
    expect(conditionFeatures('(width>=62rem)')).toEqual([]);
    expect(conditionFeatures('(prefers-reduced-motion: reduce)')).toEqual(['prefers-reduced-motion']);
    expect(conditionFeatures('screen and (max-width: 34rem)')).toEqual(['screen']);
    expect(conditionFeatures('print')).toEqual(['print']);
    expect(conditionFeatures('(min-width: 62rem) and (prefers-color-scheme: dark)')).toEqual([
      'prefers-color-scheme',
    ]);
    // Ce nu recunoaște trebuie să iasă la iveală, nu să dispară: o gardă care își
    // derivă subiectul poate verifica numai ce a recunoscut.
    expect(conditionFeatures('(min-resolution: 2dppx)')).toEqual(['min-resolution']);
  });

  it('the real configuration: every exemption has a written reason, not just a key', () => {
    const entries = Object.entries(UNAUDITED_FEATURES as Record<string, string>);
    process.stdout.write(
      `\nUnaudited media features (${entries.length}):\n` +
        entries.map(([name, reason]) => `  ${name}: ${reason.split('\n')[0]}…\n`).join(''),
    );
    expect(entries.length, 'the list is empty — (c) would have nothing to compare').toBeGreaterThan(0);
    for (const [name, reason] of entries) {
      expect(reason.length, `${name} has no written reason`).toBeGreaterThan(80);
    }
  });
});

/*
 * ULTIMA LISTĂ CARE MICȘOREAZĂ SUBIECTUL, și singura care nu trebuia să spună
 * nimic. O pagină numită în `NO_AXE_REASONS` nu este auditată de nicio trecere,
 * iar CSS-ul ei iese odată cu ea din setul de praguri derivat — deci este exact
 * forma pe care fișierul acesta o tratează peste tot altundeva cu un motiv scris
 * lângă intrare. Ca vector simplu, era cea mai ieftină ieșire dintr-o construcție
 * roșie: adaugi o cale și pagina dispare din audit fără să semneze nimeni.
 */
describe('every page taken out of the axe audit says why', () => {
  it('catches an exclusion with no written reason', () => {
    const failures = checkPasses(GOOD_PACKAGE, GOOD_PASSES, GOOD_CONDITIONS, {}, { 'admin/index.html': '' });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('admin/index.html');
    expect(failures[0]).toContain('NO_AXE_REASONS');
  });

  it('catches a reason too short to be a reason too', () => {
    const failures = checkPasses(GOOD_PACKAGE, GOOD_PASSES, GOOD_CONDITIONS, {}, { 'a/page.html': 'because yes' });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('a/page.html');
  });

  it('control: an exclusion with a written reason does not complain', () => {
    const reason = 'a'.repeat(60);
    expect(checkPasses(GOOD_PACKAGE, GOOD_PASSES, GOOD_CONDITIONS, {}, { 'a/page.html': reason })).toEqual([]);
  });

  it('the real configuration: every exclusion has its reason beside it', () => {
    const entries = Object.entries(NO_AXE_REASONS as Record<string, string>);
    process.stdout.write(
      `\nPages taken out of the axe audit (${entries.length}):\n` +
        entries.map(([path, reason]) => `  ${path}: ${reason.split('\n')[0]}…\n`).join(''),
    );
    expect(entries.length, 'the list is empty — the check would have nothing to compare').toBeGreaterThan(0);
    for (const [path, reason] of entries) expect(reason.trim().length, path).toBeGreaterThan(40);
  });
});
