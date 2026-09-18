import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
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
import { CLEARED_COLLECTIONS, FIXTURE_SWAPS, writeFixtureFiles } from '../../scripts/a11y-picker.mjs';
import * as fixtures from './fixtures';
import { addDays } from './week';

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
 * `phoneNoJs` is here for the same reason `media` is no longer empty: the
 * fixture has to pass the real rules, because it is what the next person
 * copies. Without it, the band below 34rem would be audited only with
 * scripts on — exactly the sixth blind arrangement, written into the
 * fixture.
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
 * THE WIDTH AXIS, THE PART THAT WAS MISSING: a condition that declares
 * nothing.
 *
 * Assertion (a) in `checkBreakpoints` iterates the union of the `media` keys
 * of the conditions under which a set of pages loads. With `media` empty
 * everywhere, the loop has no body and nobody complains: measured, with the
 * phone threshold moved from 34rem to 30rem, all four passes come out at 0
 * — against 1 for the exact same move with `media` populated.
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
 * THE JAVASCRIPT AXIS, which until now was indexed by nothing.
 *
 * Deleting the three conditions with `js: false` left everything green —
 * four browser passes and the whole unit suite — even though the only
 * audit that renders the weeks the selector hides had disappeared. A pass
 * that can be deleted without anything failing is a pass nobody relies on.
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
    // The message must point to all three links, just like the width one.
    expect(failures[0]).toContain('CONDITIONS');
    expect(failures[0]).toContain('test:all');
    expect(failures[0]).toContain('NO_JS_REASONS');
  });

  it('catches the no-JS conditions being deleted from the main set', () => {
    // Exactly the mutation from the report: `dist` stays audited only with
    // scripts on. Without this check, nothing changes color.
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
    // The other direction, as with the commands in package.json: an excuse
    // nobody needs any more stays in the code looking like a rule.
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
 * EVERYTHING THE CSS DEMANDS, FACE TO FACE WITH EVERYTHING THE SUITE RUNS, IN BOTH DIRECTIONS.
 *
 * This guard was green and blind SIX times, found by four people:
 * hand-written thresholds; declared widths that nobody ran; the JavaScript
 * axis, which nothing indexed; `media: {}`, which made the comparison a
 * loop with no body; assertion (a), which went in only one direction; and
 * coverage counted on the SET of pages instead of on the band, so a width
 * could lose its scripts-off pass without anything failing.
 *
 * Six instances, one single shape: the guard compared a declaration against
 * a subject along some axes and not others, and was silent about what it
 * did not index. The cases below are the positive controls of the
 * restatement — one per direction, because a claim of the form "nothing is
 * missing" is not accepted here without a demonstration that the detector
 * actually fires. Runs in ~140 ms, before four Chrome launches.
 * ===========================================================================
 */

/** A derived breakpoint, in the shape `breakpointsFromCss()` returns it. */
function breakpoint(text: string, px: number, limit: number, source = 'index.html') {
  return { limit, px, texts: new Set([text]), sources: new Set([source]) };
}

/** A media feature that is not a width, in the same shape. */
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
    // The breakpoint moved from 34rem to 30rem: now it fails in BOTH directions.
    const movedBreakpoint = { breakpoints: [breakpoint('(max-width: 30rem)', 480, 480)], features: [], problems: [] };
    const failures = checkBreakpoints(movedBreakpoint, 756, 'dist', GOOD_OPTIONS).failures;
    expect(failures.some((e: string) => e.includes('the built CSS no longer has a breakpoint there'))).toBe(true);
    expect(failures.some((e: string) => e.includes('no condition names'))).toBe(true);
  });

  it("(a') catches a CSS breakpoint no condition names — the fifth arrangement", () => {
    /*
     * The exact arrangement, in miniature: `media` stays non-empty (so its
     * own check passes), but the 62rem breakpoint is no longer named by any
     * condition. Before this line, all four passes and the whole suite came
     * out at 0 with the breakpoint moved to 60rem and printed in the output.
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
    // The other half of the control: the red depends on the declaration's absence.
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
     * The mutation measured before the check existed: remove `phoneNoJs`
     * from CONDITIONS and from PASSES.mobile and nothing fails — not the
     * unit guard, not the two passes over `dist` — even though the band
     * below 34rem stays audited only with scripts on, which is exactly
     * where the selector hides every week but one and where most of the
     * parish reads. The output still said "JS on · JS off": true of the
     * SET, false of the band.
     */
    const passTable = { ...GOOD_PASSES, mobile: { ...GOOD_PASSES.mobile, conditions: ['phone'] } };
    const failures = checkBreakpoints(GOOD_DERIVED, 756, 'dist', { ...GOOD_OPTIONS, passTable }).failures;
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('OFF');
    expect(failures[0]).toContain('0-544px');
    // The message must also say what runs in the other state, otherwise the reader
    // sees a band "unaudited" beside an output that says the set is audited in both.
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
 * THE AXIS THE GUARD DOES NOT INDEX AT ALL, and which had been there the
 * whole time.
 *
 * `widthComparisons()` consumed the width comparisons, and the rest was only
 * scanned for the word "width". So `@media (prefers-reduced-motion: reduce)`
 * passed through every version of the guard, including the two written
 * specifically to close blind arrangements, without a single line of
 * output. This is the check that turns the next feature into a red build,
 * not a seventh finding.
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
    // The other direction, as with NO_JS_REASONS and the commands in package.json.
    const options = { ...GOOD_OPTIONS, unaudited: { 'prefers-reduced-motion': 'because yes' } };
    const failures = checkBreakpoints(GOOD_DERIVED, 756, 'dist', options).failures;
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('prefers-reduced-motion');
    expect(failures[0]).toContain('no longer contains');
  });

  it('features are checked even when the CSS produced no breakpoint', () => {
    // Without this, the early return for "no breakpoint" would skip over (c) — an
    // early exit that hides a check is exactly the shape paid for here.
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
    // What it does not recognise must come to light, not disappear: a guard that
    // derives its own subject can only check what it recognised.
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
 * THE LAST LIST THAT SHRINKS THE SUBJECT, and the only one that did not have
 * to say anything. A page named in `NO_AXE_REASONS` is not audited by any
 * pass, and its CSS leaves the derived set of breakpoints along with it —
 * so it is exactly the shape this file treats everywhere else with a
 * reason written beside the entry. As a plain lever, it was the cheapest
 * way out of a red build: add a path and the page disappears from the
 * audit without anyone signing off.
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

/*
 * ===========================================================================
 * THE FIXTURE BUILD'S CONTENT, HELD AGAINST WHAT THE PICKER SWAPS IN.
 *
 * The picker builds a second site from `fixtures.ts` so the browser can audit
 * markup the real content never renders - the week picker's bar, and now the
 * `/evenimente/<slug>/` page, which the parish has no events to produce. That
 * build is the ONLY place those pages are audited, so a fixture that quietly
 * stopped being written would leave a layout covered by nothing while the pass
 * reported a pass: the failure shape this project keeps paying for.
 *
 * `FIXTURE_SWAPS` in `scripts/a11y-picker.mjs` is the mechanism - `main` clears
 * `CLEARED_COLLECTIONS` and writes exactly those entries - and the assertions
 * below hold it against the module that owns the fixtures, in both directions.
 * A new `FIXTURE_*` array added to `fixtures.ts` without an entry in the table
 * fails here; so does a table entry naming an array that no longer exists.
 * ===========================================================================
 */

/** Every `FIXTURE_*` array `fixtures.ts` exports - the whole subject of the swap. */
function fixtureArrays(): [string, unknown[]][] {
  const found: [string, unknown[]][] = [];
  for (const [name, value] of Object.entries(fixtures)) {
    if (name.startsWith('FIXTURE_') && Array.isArray(value)) found.push([name, value]);
  }
  return found;
}

describe('the fixtures the picker swaps into the scratch build', () => {
  it('has something on both sides to compare', () => {
    // A guard that reads nothing passes vacuously; both sides are asserted
    // non-empty before anything is compared.
    expect(FIXTURE_SWAPS.length).toBeGreaterThan(0);
    expect(fixtureArrays().length).toBeGreaterThan(0);
  });

  it('swaps in every FIXTURE_* array fixtures.ts exports, and no invented name', () => {
    expect(fixtureArrays().map(([name]) => name).sort()).toEqual(
      FIXTURE_SWAPS.map((swap) => swap.fixtures).sort(),
    );
  });

  it('clears every collection it writes, once each', () => {
    for (const swap of FIXTURE_SWAPS) {
      expect(CLEARED_COLLECTIONS, swap.collection).toContain(swap.collection);
      expect(swap.key.length, `${swap.fixtures} names no key field`).toBeGreaterThan(0);
      // A `.md` file without the flag is written as bare YAML and parsed as an
      // entry with no fields at all - a failed fixture build, measured once.
      expect(typeof swap.frontmatter, `${swap.collection} does not say whether its files carry frontmatter`)
        .toBe('boolean');
    }
    // The same collection twice would overwrite one fixture with the other.
    expect(new Set(FIXTURE_SWAPS.map((swap) => swap.collection)).size).toBe(FIXTURE_SWAPS.length);
  });

  it('the events fixture holds the shapes the detail layout is audited in', () => {
    const events = fixtures.FIXTURE_EVENTS;
    expect(events.length, 'no fixture event - the detail page would be audited by nothing')
      .toBeGreaterThanOrEqual(3);
    expect(new Set(events.map((e) => e.slug)).size, 'two fixture events share a slug')
      .toBe(events.length);
    // The two date layouts: the range and the single day.
    expect(
      events.filter((e) => e.end_date !== undefined).length,
      'no fixture event has an end_date - the range layout would be audited by nothing',
    ).toBeGreaterThan(0);
    expect(
      events.filter((e) => e.end_date === undefined).length,
      'no fixture event is a single day - that layout would be audited by nothing',
    ).toBeGreaterThan(0);
    // The index's two sections, anchored to FIXTURE_TODAY so the picker's
    // whole-week shift keeps them on the same sides of "today".
    expect(
      events.filter((e) => e.start_date < fixtures.FIXTURE_TODAY).length,
      'no fixture event is past - the index would lose its „Trecute” section',
    ).toBeGreaterThan(0);
    expect(
      events.filter((e) => e.start_date >= fixtures.FIXTURE_TODAY).length,
      'no fixture event is upcoming - the index would lose its list',
    ).toBeGreaterThan(0);
  });
});

/*
 * ===========================================================================
 * THE OFFSET REACHES THE FILE NAME.
 *
 * The picker rewrites the fixtures into a scratch build, shifting every date
 * field by the whole number of weeks between `FIXTURE_TODAY` and today - the
 * mechanism that keeps the pass alive as the calendar moves away from 2026.
 * For an event the shifted dates live in the frontmatter, but for a SERVICE
 * DAY THE FILE NAME IS THE DATE, and the first version of the swap read the
 * key field out of the item before the shift ran: the services were written
 * under their FIXTURE_TODAY names forever. Nothing failed while today's ISO
 * week happened to equal the fixture's, which is why the defect could only be
 * seen by reading the names the writer produces at a non-zero offset.
 *
 * `writeFixtureFiles` is the function `main` writes the scratch content with,
 * so these cases exercise the real writer rather than a re-implementation of
 * its rules. The offset is chosen non-zero and not a multiple of 7 from the
 * fixture above; the zero-offset case is the control that the fix does not
 * distort the verbatim path.
 * ===========================================================================
 */
describe('a swap shifts what its collection keys on', () => {
  const SHIFT = 14;

  /** The swap table entry for a collection, or a failure naming the table. */
  function swapFor(collection: string) {
    const swap = FIXTURE_SWAPS.find((s) => s.collection === collection);
    if (!swap) throw new Error(`FIXTURE_SWAPS no longer contains the ${collection} swap`);
    return swap;
  }

  /** A scratch root, removed even when an assertion throws. */
  function inScratch(run: (root: string) => void) {
    const root = mkdtempSync(join(tmpdir(), 'fixture-swap-'));
    try {
      run(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  it('moves a date-keyed file name by the same offset as the date fields', () => {
    inScratch((root) => {
      const names = writeFixtureFiles(root, swapFor('services'), fixtures.FIXTURE_DAYS, addDays, SHIFT);
      expect(names, 'the names returned are the ones written').toEqual(
        fixtures.FIXTURE_DAYS.map((day) => addDays(day.date, SHIFT)),
      );
      for (const name of names) {
        expect(existsSync(join(root, 'src/content/services', `${name}.yml`)), name).toBe(true);
      }
      // The unshifted name must be ABSENT, not merely joined by the shifted
      // one: a writer that emitted both would satisfy the loop above.
      expect(existsSync(join(root, 'src/content/services', `${fixtures.FIXTURE_DAYS[0].date}.yml`))).toBe(
        false,
      );
    });
  });

  it('control: offset zero writes the fixture dates unchanged', () => {
    inScratch((root) => {
      const names = writeFixtureFiles(root, swapFor('services'), fixtures.FIXTURE_DAYS, addDays, 0);
      expect(names).toEqual(fixtures.FIXTURE_DAYS.map((day) => day.date));
    });
  });

  it('leaves a slug file name alone and still shifts the dates beside it', () => {
    inScratch((root) => {
      const swap = swapFor('events');
      const names = writeFixtureFiles(root, swap, fixtures.FIXTURE_EVENTS, addDays, SHIFT);
      expect(names).toEqual(fixtures.FIXTURE_EVENTS.map((event) => event.slug));
      const first = fixtures.FIXTURE_EVENTS[0];
      const text = readFileSync(join(root, 'src/content/events', `${first.slug}.md`), 'utf8');
      const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
      expect(block, `${first.slug}.md has no frontmatter block`).not.toBeNull();
      const frontmatter = parseYaml((block as RegExpExecArray)[1] as string) as Record<string, string>;
      expect(frontmatter.start_date).toBe(addDays(first.start_date, SHIFT));
    });
  });
});
