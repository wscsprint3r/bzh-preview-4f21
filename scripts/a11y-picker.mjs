/*
 * The only audit that ever sees the week picker's bar.
 *
 * ===========================================================================
 * WHY A SEPARATE BUILD, AND WHY IT CANNOT BE FOLDED INTO THE OTHER PASSES.
 *
 * `WeekPicker` reveals its bar only when the page renders TWO OR MORE
 * weeks - `sections.length > 1` - because with one week both arrows would be
 * disabled and the bar would restate the heading beneath it. The parish's
 * published schedule is one week for most of the year, so on almost every real
 * build the bar stays `hidden`, and axe skips hidden elements. Its label
 * contrast, its arrows' accessible names and its focus ring are checked by
 * nothing at all.
 *
 * So this builds the site a second time, into a scratch directory, with
 * `src/lib/fixtures.ts`'s multi-week days as the content, audits that, and
 * deletes it. The fixtures are built through `daySchema`, so they can only
 * contain days the CMS could actually produce; and because the build is
 * temporary, NO INVENTED LITURGICAL CONTENT EVER REACHES `src/content/services/`,
 * which stays the parish's real published schedule. Nothing here writes to the
 * repository.
 * ===========================================================================
 *
 * THE FIXTURE DATES ARE SHIFTED BY WHOLE WEEKS, and that is what keeps this
 * pass alive. Both pages render only weeks that are not yet over, so the fixed
 * dates in `fixtures.ts` stop producing two future weeks at the end of 2026 -
 * after which the bar would stay hidden and this pass would audit nothing while
 * still reporting a pass. The offset is the whole number of weeks between
 * `FIXTURE_TODAY`'s Monday and today's Monday, so every weekday, the deliberate
 * gap week and the ordering survive it exactly; today that offset is usually
 * zero and the fixture is used verbatim. The offset is printed, and the checks
 * below fail if the bar is not actually there.
 *
 * ---------------------------------------------------------------------------
 * THE WIDTHS ARE `PASSES.picker`'s, IN `a11y.mjs`, AND THE WIDE ONE IS NEW.
 *
 * This pass used to run at the default width and at 390px, and the band check
 * credited it with the whole of `CONDITIONS` - 1100px included - because that
 * check read the declaration rather than the passes. So `WeekBand`'s
 * `min-width: 62rem` branch was audited by NOTHING: the three passes over
 * `dist/` reach 1100px but there the bar is `hidden` and axe skips it, and this
 * pass, the only one where the bar is visible, never reached 992px. Seven days
 * on one row, the week with the most services and the most visitors of the year,
 * with the picker bar showing - the single combination nothing on this project
 * had ever looked at, and invisible by accident rather than by decision.
 *
 * `wide` is in the pass now, and the gap was closed by adding the width rather
 * than by exempting the band.
 * ---------------------------------------------------------------------------
 * WHAT THIS PASS COVERS, AND WHAT IT STILL DOES NOT.
 *
 * axe, once the bar is visible, covers the label's contrast against the page
 * and the arrows' accessible names. It does NOT cover:
 *
 *   - the focus ring. axe does not evaluate `:focus-visible`. The check below
 *     tabs to the arrow with a real key press and reads the computed outline,
 *     because an `outline: none` added to the component's scoped styles would
 *     delete the ring of the site's first non-link controls with no axe
 *     violation and no failing test to show for it.
 *   - the disabled arrow's colour. axe skips disabled controls, and WCAG 1.4.3
 *     exempts them. The check below only asserts the state is signalled
 *     visually as well as semantically - the arrow's colour changes - rather
 *     than claiming a contrast ratio for it.
 * ---------------------------------------------------------------------------
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Key } from 'selenium-webdriver';
import { build } from 'esbuild';
import { Scalar, stringify } from 'yaml';
import { runAudit } from './a11y.mjs';

const ROOT = process.cwd();
const MS_PER_DAY = 86_400_000;

/*
 * ===========================================================================
 * THE CONTENT THE SCRATCH BUILD IS GIVEN, AND WHY IT IS A TABLE.
 *
 * `src/` is copied wholesale, and then these collections are replaced: the
 * parish's real schedule becomes `FIXTURE_DAYS`, and the events collection -
 * empty in the real repository - becomes `FIXTURE_EVENTS`, which is the only
 * reason a `/evenimente/<slug>/` page exists for axe to look at. `galerii` is
 * cleared rather than replaced: the fixture build audits no album page, and
 * copying the real albums' images into it would make every run process two
 * dozen photographs for pages the picker bar does not touch.
 *
 * THE TABLE IS THE MECHANISM, NOT A DESCRIPTION OF IT. `main` clears
 * `CLEARED_COLLECTIONS` and writes each `FIXTURE_SWAPS` entry, so a collection
 * cannot be listed here and skipped there. `src/lib/a11y-passes.test.ts` holds
 * the table against `fixtures.ts`: every `FIXTURE_*` array the module exports
 * must appear here, so a new fixture that nobody swapped in is a red unit test
 * rather than a page that quietly left the audit.
 *
 * `key` is the field whose value becomes the file name - `date` for a service
 * day, `slug` for an event - and it is stripped from the frontmatter, because
 * the file name is the primary key in both collections. `frontmatter` says
 * whether the file carries `---` delimiters: a service day is a `.yml` file,
 * which is YAML top to bottom, while an event is a `.md` file whose fields live
 * in YAML frontmatter and whose body is markdown. Writing an event without the
 * delimiters produces a file Astro parses as an empty entry with a long body,
 * which fails the schema - measured, on this task's first run.
 * `DATE_KEYS` are shifted by the whole-week offset below, INCLUDING when the
 * key is one of them: a service day's file name is its date and moves with the
 * others, or the fixture ages out while today advances. Everything not in
 * `DATE_KEYS` is written verbatim.
 * ===========================================================================
 */
export const FIXTURE_SWAPS = [
  { collection: 'services', fixtures: 'FIXTURE_DAYS', key: 'date', extension: 'yml', frontmatter: false },
  { collection: 'events', fixtures: 'FIXTURE_EVENTS', key: 'slug', extension: 'md', frontmatter: true },
];

/** Every content directory the scratch tree loses before the fixture build. */
export const CLEARED_COLLECTIONS = ['services', 'events', 'galerii'];

/** The fields the whole-week offset moves. Everything else is written as it is. */
const DATE_KEYS = new Set(['date', 'start_date', 'end_date']);

/**
 * A date as a QUOTED YAML scalar, the way every content file in the repository
 * writes one.
 *
 * A plain `2026-09-05` is read back as a `Date`, not as text, and `eventSchema`
 * rejects that by name - `start_date` is a `YYYY-MM-DD` string because a
 * service time and an event date must not depend on the build machine's
 * timezone. The migrated files quote their dates for the same reason; this is
 * what makes the fixture files indistinguishable from a volunteer's.
 */
function quotedDate(value) {
  const scalar = new Scalar(value);
  scalar.type = 'QUOTE_DOUBLE';
  return scalar;
}

/**
 * Writes one swap's fixtures under `root/src/content/<collection>/` and returns
 * the file names it wrote.
 *
 * THE KEY FIELD IS A FIELD LIKE ANY OTHER. `swap.key` is the value the file
 * name is made of - `date` for a service day, `slug` for an event - and when
 * that key is itself a date the file name IS the date, so it has to move with
 * the offset exactly as the frontmatter dates do. Reading the key out of the
 * entry before the shift, as this code once did, wrote the services under their
 * `FIXTURE_TODAY` names forever: the pass stayed green only while today's ISO
 * week happened to match the fixture's, and the red, months later, would have
 * pointed at the picker rather than at the fixture. The unit guard is
 * `a11y-passes.test.ts`'s "a swap shifts what its collection keys on".
 *
 * A `body` property on an item is written BELOW the closing `---`, where the
 * CMS puts the markdown it extracts; it must not become a frontmatter field,
 * and a swap whose files have no frontmatter refuses one rather than dropping
 * it silently.
 */
export function writeFixtureFiles(root, swap, items, addDays, offset) {
  const dir = join(root, 'src/content', swap.collection);
  mkdirSync(dir, { recursive: true });
  const names = [];
  for (const item of items) {
    const { [swap.key]: keyValue, body, ...rest } = item;
    if (body !== undefined && !swap.frontmatter) {
      throw new Error(
        `${swap.collection} is a file with no frontmatter, so it has nowhere to put a body; ` +
          `the fixture entry ${JSON.stringify(keyValue)} carries one.`,
      );
    }
    const name =
      DATE_KEYS.has(swap.key) && typeof keyValue === 'string'
        ? addDays(keyValue, offset)
        : String(keyValue);
    const shifted = Object.fromEntries(
      Object.entries(rest).map(([key, value]) => [
        key,
        DATE_KEYS.has(key) && typeof value === 'string' ? quotedDate(addDays(value, offset)) : value,
      ]),
    );
    const frontmatter = stringify(shifted, { lineWidth: 0 });
    names.push(name);
    writeFileSync(
      join(dir, `${name}.${swap.extension}`),
      swap.frontmatter
        ? `---\n${frontmatter}---\n${typeof body === 'string' ? `\n${body}\n` : ''}`
        : frontmatter,
    );
  }
  return names;
}

/*
 * `fixtures.ts` and `week.ts` are TypeScript with extensionless imports, which
 * Node cannot load. esbuild bundles them into one ES module in the scratch
 * directory and that is imported - the same compiler Astro and Vitest already
 * use on these files, so what runs here is what the site and the tests run.
 */
async function bundle(source, output) {
  await build({
    entryPoints: [join(ROOT, source)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    // Nothing left external, so the module is self-contained and can live
    // outside the repository. `astro/zod` comes along; that is only a copy of
    // Zod inside a throwaway generator, never a second copy inside the site.
    outfile: output,
    logLevel: 'silent',
  });
  return import(pathToFileURL(output).href);
}

/** The SHA-256 of a file, or null when it does not exist. */
function fileDigest(path) {
  return existsSync(path) ? createHash('sha256').update(readFileSync(path)).digest('hex') : null;
}

async function main() {
  /*
   * `realpathSync`, because on macOS `os.tmpdir()` is `/var/...`, a symlink to
   * `/private/var/...`. Vite resolves the project root through the symlink and
   * the module ids through it too, then fails to match them - measured, as
   * "No cached compile metadata found for .../index.astro" with a doubled path
   * in the message. Handing it the real path makes both spellings the same one.
   */
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'picker-')));
  try {
    const fixtures = await bundle('src/lib/fixtures.ts', join(scratch, 'fixtures.mjs'));
    const week = await bundle('src/lib/week.ts', join(scratch, 'week.mjs'));
    const today = week.todayInZurich();
    const offset = Math.round(
      (Date.parse(`${week.weekStart(today)}T00:00:00Z`) -
        Date.parse(`${week.weekStart(fixtures.FIXTURE_TODAY)}T00:00:00Z`)) /
        MS_PER_DAY,
    );
    if (offset % 7 !== 0) throw new Error(`The offset ${offset} is not a whole number of weeks.`);

    const project = join(scratch, 'project');
    mkdirSync(project);
    for (const name of ['src', 'public', 'scripts', 'astro.config.mjs', 'tsconfig.json', 'package.json']) {
      cpSync(join(ROOT, name), join(project, name), { recursive: true });
    }
    // Symlinked, not copied: the fixture build must run the same Astro, the
    // same Sveltia bundle and the same fonts as the real one.
    symlinkSync(join(ROOT, 'node_modules'), join(project, 'node_modules'));

    /*
     * A CACHE OF THE SCRATCH BUILD'S OWN, with only the image cache shared.
     * The default `cacheDir` resolves under the symlinked `node_modules`, so
     * the scratch build wrote its fixture entries into the repository's
     * `data-store.json`; the next real build then rendered fabricated services
     * and events from that cache. The wrapper config points Astro at a
     * directory inside the scratch, which dies with it. `assets/` alone is
     * symlinked back in: it is content-addressed image data that cannot become
     * a page, and sharing it is what keeps a run from re-encoding the whole
     * site. The digest guard around the build is the positive control.
     */
    const cache = join(project, 'cache');
    mkdirSync(cache, { recursive: true });
    const sharedAssets = join(ROOT, 'node_modules/.astro/assets');
    if (existsSync(sharedAssets)) symlinkSync(sharedAssets, join(cache, 'assets'));
    const pickerConfig = join(project, 'astro.picker.config.mjs');
    writeFileSync(
      pickerConfig,
      `import base from './astro.config.mjs';\n` +
        `export default { ...base, cacheDir: ${JSON.stringify(cache)} };\n`,
    );

    for (const collection of CLEARED_COLLECTIONS) {
      const dir = join(project, 'src/content', collection);
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
    }

    console.log(`Fixture build in ${project}`);
    console.log(`  today ${today} · FIXTURE_TODAY ${fixtures.FIXTURE_TODAY} · offset ${offset} days`);

    for (const swap of FIXTURE_SWAPS) {
      const items = fixtures[swap.fixtures];
      if (!Array.isArray(items) || items.length === 0) {
        throw new Error(`fixtures.ts exports no non-empty array named ${swap.fixtures}.`);
      }
      const names = writeFixtureFiles(project, swap, items, week.addDays, offset);
      console.log(`  ${swap.collection}: ${items.length} file(s): ${names.join(', ')}`);
    }

    /*
     * THE SCRATCH BUILD MUST NOT WRITE THE REPOSITORY'S CONTENT CACHE.
     *
     * `node_modules` is symlinked into the scratch project so both builds run
     * the same Astro, and Astro's default `cacheDir` is `node_modules/.astro` -
     * so until this was pinned the scratch build wrote its FIXTURE entries into
     * the repository's `data-store.json`, through the symlink, and deleted
     * them from `src/` when the scratch was removed. The next real build then
     * rendered fabricated events and fabricated services from the cache: the
     * invented liturgical content the fixtures exist to keep out of this
     * repository, back in through the side door, and `npm run test:all` went
     * red on its second run at `build-output.itest.ts`. A fresh clone cannot
     * see it, which is exactly why it needs a check here.
     *
     * `cacheDir` is redirected to a directory inside the scratch, and the
     * ASSETS cache alone is shared back in - that one is content-addressed
     * image data, cannot become a page, and sharing it is what keeps a run
     * from re-encoding the whole site. The digest below is the positive
     * control: any future path that lets the scratch build write the
     * repository's store fails the pass, loudly.
     */
    const repoStore = join(ROOT, 'node_modules/.astro/data-store.json');
    const storeBefore = fileDigest(repoStore);
    execFileSync(
      process.execPath,
      [join(ROOT, 'node_modules/astro/bin/astro.mjs'), 'build', '--root', project, '--config', 'astro.picker.config.mjs'],
      { stdio: 'inherit', cwd: project },
    );
    if (fileDigest(repoStore) !== storeBefore) {
      console.error(
        "the scratch build wrote into the repository's content-layer cache.\n" +
          '    Fixture entries left in node_modules/.astro/data-store.json are rendered by the\n' +
          '    next real build, so fabricated services and events appear in the site built in\n' +
          '    this checkout while every test still passes.\n' +
          '    DO NOT WEAKEN THIS CHECK. Give the scratch build its own cacheDir and keep the\n' +
          "    repository's data-store.json untouched, or delete the polluted store and\n" +
          '    fix the sharing.',
      );
      return false;
    }

    /*
     * THE FIXTURE REALLY RENDERED THE PAGES IT EXISTS FOR. The parish has no
     * events, so `/evenimente/<slug>/` is audited in this build and nowhere
     * else: if the fixture stopped being written - a rename, a schema change, a
     * collection quietly dropped from `FIXTURE_SWAPS` - the audit would run over
     * the index alone and report a pass, which is the one outcome this check
     * exists to make impossible. The failure names the fixture, because the
     * repair is always in `src/lib/fixtures.ts`, never in the audit.
     */
    const eventPages = fixtures.FIXTURE_EVENTS.map((e) => `evenimente/${e.slug}/index.html`);
    const missingEventPages = eventPages.filter((page) => !existsSync(join(project, 'dist', page)));
    if (missingEventPages.length > 0) {
      console.error(
        `The fixture build produced no page for: ${missingEventPages.join(', ')}.\n` +
          '    These pages are the only reason /evenimente/<slug>/ is audited at all - the\n' +
          '    parish has no events, so a build without them renders the index and nothing else,\n' +
          '    and this pass would audit a layout nobody has seen while reporting a pass.\n' +
          '    DO NOT DELETE FIXTURE_EVENTS, AND DO NOT WEAKEN THIS CHECK. Fix the fixture in\n' +
          '    src/lib/fixtures.ts, or the swap in FIXTURE_SWAPS.',
      );
      return false;
    }
    console.log(`  event detail page(s) in this audit: ${eventPages.join(', ')}`);

    /*
     * THE BODY REACHES THE PAGE. `public/admin/config.yml` offers events a
     * „Detalii” markdown widget, which Sveltia extracts BELOW the frontmatter,
     * so `eventSchema` never sees it - and for a while no route rendered it
     * either: the volunteer's text saved, and appeared nowhere. The rich
     * fixture event carries a plain-sentence body and the built page must
     * contain that sentence. This is the only build in the whole suite where
     * an event body is rendered at all, so without this check the text could
     * be dropped again with every audit still green.
     */
    for (const event of fixtures.FIXTURE_EVENTS) {
      if (typeof event.body !== 'string' || event.body.trim() === '') continue;
      const page = join(project, 'dist', 'evenimente', event.slug, 'index.html');
      const html = readFileSync(page, 'utf8');
      if (!html.includes(event.body.trim())) {
        console.error(
          `The detail page for ${event.slug} does not render its fixture body.\n` +
            '    The CMS offers events a „Detalii” markdown field, so text that no page shows\n' +
            '    is silently discarded for the volunteer who typed it.\n' +
            '    DO NOT DELETE THE BODY AND DO NOT WEAKEN THIS CHECK. Render the markdown in\n' +
            '    src/pages/evenimente/[slug].astro the way noutati/[slug].astro does.',
        );
        return false;
      }
      console.log(`  body rendered below the frontmatter of evenimente/${event.slug}/index.html`);
    }

    /*
     * RETURNED, NOT `process.exit`ed. `process.exit` inside a `try` terminates
     * the process without unwinding, so the `finally` below never runs and every
     * run leaves a few megabytes of copied `public/` behind in the temp
     * directory. Found by counting four of them.
     */
    return await runAudit({
      dist: join(project, 'dist'),
      pass: 'picker',
      extraCheck: checkPickerBar,
    });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/*
 * The checks that only this build can make. Returns null when everything holds,
 * or the first problem as a sentence.
 */
async function checkPickerBar(driver, condition, url) {
  if (!condition.js) return null; // the bar is revealed by script; without it there is nothing to check
  await driver.get(url('index.html'));

  /*
   * THE WEEK COUNT IS READ BEFORE THE BAR, and the count is judged first.
   *
   * When the fixture ages out completely the homepage takes its "nothing
   * published yet" branch and never renders `WeekPicker` at all, so a
   * check that dereferenced the bar first answered "the .picker bar is missing from
   * the page" - true, alarming, and pointing at the component instead of at the
   * fixture that actually aged. Measured by shifting the fixture a year into the
   * past. Both stale states now give the same instruction, and "the bar is
   * missing" is kept for the case it really describes: two weeks rendered and no
   * bar in the markup.
   */
  const state = await driver.executeScript(`
    const sections = [...document.querySelectorAll('section[data-week]')];
    const bar = document.querySelector('.picker');
    if (!bar) return { sections: sections.length, noBar: true };
    const label = bar.querySelector('[data-picker-label]');
    const prev = bar.querySelector('[data-picker-prev]');
    const next = bar.querySelector('[data-picker-next]');
    return {
      sections: sections.length,
      visible: sections.filter((s) => !s.hidden).length,
      barHidden: bar.hidden,
      barDisplay: getComputedStyle(bar).display,
      label: label ? label.textContent.trim() : null,
      interval: (sections.find((s) => !s.hidden) || {}).dataset?.interval ?? null,
      prevName: prev ? prev.getAttribute('aria-label') : null,
      nextName: next ? next.getAttribute('aria-label') : null,
      prevDisabled: prev ? prev.disabled : null,
      prevColour: prev ? getComputedStyle(prev).color : null,
      nextColour: next ? getComputedStyle(next).color : null,
    };
  `);

  if (state.sections < 2) {
    /*
     * The message names the fixture, not the symptom, on purpose. Someone will
     * meet this failure on a quiet morning months from now, and the cheap way
     * out - deleting the pass, or relaxing the check to "one week is fine" -
     * leaves the bar audited by nothing while the build goes green again. The
     * repair is always in `fixtures.ts`.
     */
    return (
      `the fixture build rendered ${state.sections} week(s), not at least two.\n` +
      '    Below two weeks the picker bar stays hidden, axe skips it, and this pass ' +
      'checks absolutely nothing — while passing.\n' +
      '    DO NOT DELETE THE PASS AND DO NOT WEAKEN THE CHECK. Add days to FIXTURE_DAYS in ' +
      'src/lib/fixtures.ts, in at least two different ISO weeks that have not ended yet.'
    );
  }
  if (state.noBar) {
    return (
      `the page renders ${state.sections} weeks, but contains no .picker bar at all.\n` +
      '    The WeekPicker component is no longer mounted on the homepage.'
    );
  }
  if (state.barHidden || state.barDisplay === 'none') {
    return `the picker bar stayed hidden (hidden=${state.barHidden}, display=${state.barDisplay}) — axe does not see it.`;
  }
  if (state.visible !== 1) return `the picker leaves ${state.visible} weeks visible, not one.`;
  if (!state.label) return "the picker's label is empty.";
  if (state.label !== state.interval) {
    return `the label (\u201e${state.label}\u201d) is not the interval of the week on show (\u201e${state.interval}\u201d).`;
  }
  if (!state.prevName || !state.nextName) return "one of the picker's arrows has no accessible name.";
  if (state.prevDisabled !== true) {
    return 'the \u201eback\u201d arrow is not disabled on the first week, so the disabled state cannot be checked.';
  }
  // Not a contrast claim: a disabled control is exempt from WCAG 1.4.3 and axe
  // skips it. This only asserts the state is visible as well as semantic.
  if (state.prevColour === state.nextColour) {
    return `the disabled arrow has exactly the colour of the active one (${state.prevColour}) — the state is invisible.`;
  }

  /*
   * THE FOCUS RING, WITH A REAL KEY PRESS. `:focus-visible` does not match on
   * programmatic focus, so `el.focus()` would read the unfocused outline and
   * agree with a deleted ring. Tabbing is what a keyboard user does.
   */
  let focusRing = null;
  for (let i = 0; i < 40; i += 1) {
    await driver.actions().sendKeys(Key.TAB).perform();
    focusRing = await driver.executeScript(`
      const a = document.activeElement;
      if (!a || !a.matches('.picker [data-picker-next]')) return null;
      const s = getComputedStyle(a);
      return { style: s.outlineStyle, width: s.outlineWidth, colour: s.outlineColor, offset: s.outlineOffset };
    `);
    if (focusRing) break;
  }
  if (focusRing === null) return 'the \u201eforward\u201d arrow could not be reached with Tab in 40 steps.';
  if (focusRing.style === 'none' || parseFloat(focusRing.width) === 0) {
    return `the \u201eforward\u201d arrow has no focus ring under keyboard navigation (outline: ${focusRing.style} ${focusRing.width}).`;
  }
  console.log(
    `  picker: ${state.sections} weeks, one visible, label \u201e${state.label}\u201d; ` +
      `focus ring ${focusRing.colour} ${focusRing.style} ${focusRing.width} at ${focusRing.offset}; ` +
      `disabled arrow ${state.prevColour} against ${state.nextColour}`,
  );
  return null;
}

/*
 * GUARDED, unlike before: `src/lib/a11y-passes.test.ts` imports `FIXTURE_SWAPS`
 * and `CLEARED_COLLECTIONS` from this module to hold them against `fixtures.ts`,
 * and an import that ran a browser build would make the unit suite unusable.
 * `scripts/a11y.mjs` guards its command line the same way and for the same
 * reason.
 */
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit((await main()) ? 0 : 1);
}
