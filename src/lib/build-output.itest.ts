import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import type { ArticleEntry } from './articles';
import { articleSlug, publishedArticles } from './articles';
import { CEDILLAS, COMMA_BELOW } from './cedilla';
import { eventSlug } from './events';
import { INDEXABLE } from './site';

/*
 * WHAT THIS PROVES: that the content collection, the schema, the generator and
 * the pages are wired to each other in a real build. No unit test can — every
 * one of them runs against a fixture, and the joint they cannot see is the one
 * where `getCollection` hands `e.date` and `e.id` to a page or an endpoint.
 *
 * It reads `dist/`, so it runs only after a build: `npm run test:build`.
 *
 * NOTHING HERE MAY PIN A DATE AGAINST THE PAGES. The homepage and `/program/`
 * render only the current and future weeks, so `toContain('data-week=
 * "2026-W38"')` would pass today and start failing on 21 September 2026 — a
 * red suite caused by the calendar rather than by a change anyone made. The
 * `.ics` is different in kind: it emits every seeded day whatever the build
 * date, so date-specific claims belong there and only there.
 *
 * A GUARD THAT READS A FILE MUST PROVE IT READ SOMETHING. `existsSync` answers
 * a different question from "did I get bytes", and `not.toMatch` against an
 * empty string passes triumphantly. So every read goes through `read`,
 * which fails on a missing or empty file, and every "X is absent" claim is
 * paired with a positive control showing the detector can fire.
 */

const DIST = fileURLToPath(new URL('../../dist/', import.meta.url));
const CONTENT = fileURLToPath(new URL('../content/services/', import.meta.url));
const ARTICLES = fileURLToPath(new URL('../content/articles/', import.meta.url));
const PAGES_CONTENT = fileURLToPath(new URL('../content/pages/', import.meta.url));
const GALERII = fileURLToPath(new URL('../content/galerii/', import.meta.url));
const EVENTS = fileURLToPath(new URL('../content/events/', import.meta.url));

/** RFC 5545 §3.1: the line break in an iCalendar stream is CRLF, always. */
const CRLF = '\r\n';

/** The file's text, having proved there was a file and that it had text in it. */
function read(path: string): string {
  expect(existsSync(DIST + path), `${path} is missing from dist/`).toBe(true);
  const text = readFileSync(DIST + path, 'utf8');
  expect(text.length, `${path} exists but is empty`).toBeGreaterThan(0);
  return text;
}

/*
 * The forbidden characters are named by CODEPOINT and never written as glyphs,
 * the convention `diacritics.itest.ts` sets and explains: a file that spelled
 * them out could not itself be swept for them, and a `backslash-u` escape is
 * decoded into the literal character on the way to disk in this repo (see
 * CLAUDE.md), so the escape form is not a way round it either.
 *
 * `diacritics.itest.ts` owns the project-wide sweep over `dist/`, and `.ics` is
 * in its extension list, so the feed is covered there too. The assertions below
 * exist because that coverage is silent: nothing in this file would notice if
 * the feed dropped out of that sweep, and the feed is the one artefact where a
 * volunteer's `feast:` reaches a subscriber's phone unedited.
 *
 * The four numbers themselves now come from `./cedilla`, which is the only place
 * in this repository that writes them down. They were a third copy here.
 */

function containsAnyOf(text: string, codepoints: readonly number[]): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const cp = text.codePointAt(i);
    if (cp !== undefined && codepoints.includes(cp)) return true;
  }
  return false;
}

/**
 * RFC 5545 §3.1 unfolding: a continuation line begins with one whitespace
 * character, which is removed along with the CRLF before it. Without this, a
 * property long enough to fold would read as two lines and every per-property
 * assertion below would quietly stop seeing it.
 */
function unfold(ics: string): string[] {
  const lines: string[] = [];
  for (const rawLine of ics.split(CRLF)) {
    if (rawLine.startsWith(' ') && lines.length > 0) lines[lines.length - 1] += rawLine.slice(1);
    else if (rawLine.length > 0) lines.push(rawLine);
  }
  return lines;
}

/** The properties of each VEVENT, unfolded, in order. */
function events(ics: string): string[][] {
  const blocks: string[][] = [];
  let currentEvent: string[] | null = null;
  for (const line of unfold(ics)) {
    if (line === 'BEGIN:VEVENT') currentEvent = [];
    else if (line === 'END:VEVENT') {
      expect(currentEvent, 'END:VEVENT with no BEGIN:VEVENT').not.toBeNull();
      if (currentEvent) blocks.push(currentEvent);
      currentEvent = null;
    } else if (currentEvent) currentEvent.push(line);
  }
  expect(currentEvent, 'BEGIN:VEVENT with no END:VEVENT').toBeNull();
  return blocks;
}

/** Every HTML page in `dist`, as a path relative to `dist`. */
function builtPages(): string[] {
  const found: string[] = [];
  const walk = (relative: string): void => {
    for (const entry of readdirSync(DIST + relative, { withFileTypes: true })) {
      const path = relative + entry.name;
      if (entry.isDirectory()) walk(path + '/');
      else if (entry.name.endsWith('.html')) found.push(path);
    }
  };
  if (existsSync(DIST)) walk('');
  return found.sort();
}

/**
 * Every reference to the feed from a built page.
 *
 * `.ics` ANYWHERE in the href, not necessarily glued to the closing quote. The
 * tight form — `\.ics"` — was exactly the hole this file was patching one
 * level earlier: `href="/program.ics/"` no longer matched, so a BROKEN
 * reference fell outside the checked set instead of failing it. The match
 * count dropped from 2 to 1 and every test stayed green.
 *
 * The rule it leaves behind: a pattern that chooses what to check must also
 * catch the wrong forms, otherwise "did not match" becomes a synonym for "is
 * fine". Its counterpart is `ICS_REFERENCES` below, which closes the set by
 * counting — without it, any reference that stops matching disappears
 * silently, no matter how wide the pattern is.
 */
function icsReferences(html: string): string[] {
  return [...html.matchAll(/href="([^"]*\.ics[^"]*)"/g)].map((m) => m[1] as string);
}

/**
 * How many references to the feed each built page carries.
 *
 * An exact number per page, not a minimum and not "at least one somewhere
 * on the site". A minimum is satisfied by the `<link rel="alternate">` in
 * the `<head>` of `Base.astro`, which reaches every page, so it cannot see
 * either a deleted button or a broken footer link.
 *
 * THE SET IS CLOSED: the test requires that the pages in `dist` be exactly
 * the keys here. A new page fails until somebody writes its number in —
 * including `admin/index.html`, which deserves `0`, because the CMS shell is
 * not built from `Base.astro`. That is an answer given once, not a weakening
 * of the rule.
 *
 * THE ARTICLE, GALLERY AND EVENT PAGES ARE THE PARTS THAT ARE DERIVED, and the
 * reason is not convenience. One article page exists per published post, one
 * gallery page per album and one event page per event, so a hand-written list of
 * thirteen would make the next post the parish publishes fail this suite until a
 * developer edits a test - a red build sent to the volunteer who pressed Save,
 * for a page that is not wrong. The COUNT for those pages is still written by
 * hand below (every one of them goes through `Base.astro` and the footer, so
 * each carries exactly two), and the set comes from the content files, which is
 * the same subject `articleFiles()`, `galleryFiles()` and `eventFiles()` already
 * give the guards below. A page under `noutati/` that is not a published
 * article's page, under `galerie/` that is not an album's, or under
 * `evenimente/` that is not an event's, matches none of them and fails.
 */
const ICS_REFERENCES: Record<string, number> = {
  // `<link rel="alternate">` in `<head>` + „Abonare la program (.ics)” in the footer.
  'index.html': 2,
  // The same two, plus the subscribe button at the foot of the page.
  'program/index.html': 3,
  /*
   * Zero, and it is an answer, not an omission. `public/admin/index.html` is
   * the CMS's host page: one `<script>` tag and nothing else, it does not go
   * through `Base.astro`, so it does not have the `<head>` that carries
   * `<link rel="alternate">` on the other pages. An editor who goes there
   * subscribes to the calendar from `/program/`, like anyone else.
   */
  'admin/index.html': 0,
  // The same two as the homepage; neither index subscribes on its own.
  'noutati/index.html': 2,
  'galerie/index.html': 2,
  /*
   * `/pastorale/` goes through `Base.astro` and the footer like every other
   * visitor page, so it carries the same two references. The documents
   * themselves are downloads and have no feed.
   */
  'pastorale/index.html': 2,
  /*
   * The events index carries the same two. Its detail pages are derived from the
   * content files like the article and album pages above - none exists today,
   * because the parish has no events, and the first one the parish saves gets
   * its count here without anybody editing this file. The layout of a detail
   * page is audited by the picker's fixture build, which is a different build
   * and not what this set describes.
   */
  'evenimente/index.html': 2,
  /*
   * THE NINE PROSE PAGES, named one by one rather than derived, and the
   * difference from the article entries below is deliberate: the nine are a
   * fixed contract (the CMS does not create them), so a tenth appearing here
   * is a decision somebody made rather than a post the parish published.
   * Each goes through `Base.astro` and the footer like every other visitor
   * page, so each carries the same two references.
   */
  'parohia/istoric/index.html': 2,
  'parohia/consiliul/index.html': 2,
  'servicii-liturgice/index.html': 2,
  'comunitate/scoala/index.html': 2,
  'comunitate/pictura/index.html': 2,
  'resurse/catehism/index.html': 2,
  'resurse/studii/index.html': 2,
  'resurse/doxologia/index.html': 2,
  'resurse/linkuri/index.html': 2,
};

/**
 * The hand-written counts plus one entry per published article page, per album
 * page and per event page.
 *
 * The derivation is by SLUG, the public URL, so it cannot be satisfied by a
 * page whose directory happens to carry the collection id with its date
 * prefix - that page would exist and not be listed here, and the set equality
 * in the test below would fail.
 */
function expectedIcsReferences(): Record<string, number> {
  const expected = { ...ICS_REFERENCES };
  for (const f of publishedArticleFiles()) {
    expected[`noutati/${f.slug}/index.html`] = 2;
  }
  for (const f of galleryFiles()) {
    expected[`galerie/${f.slug}/index.html`] = 2;
  }
  for (const f of eventFiles()) {
    expected[`evenimente/${f.slug}/index.html`] = 2;
  }
  return expected;
}

/** The days the collection has, read from the file names — its primary key. */
function collectionDays(): string[] {
  return readdirSync(CONTENT)
    .filter((f) => f.endsWith('.yml'))
    .map((f) => f.slice(0, -'.yml'.length))
    .sort();
}

/**
 * How many services the collection holds, added up across all its days.
 *
 * A line count over the YAML, not a parse of it: the schedule files write
 * each service on its own line, like `- time: "07:30"`. If someone ever
 * switches to flow style, the number here drops and the test fails —
 * loudly, demanding to be recounted, rather than silently letting the feed
 * lose services.
 */
function collectionServices(): number {
  let n = 0;
  for (const f of readdirSync(CONTENT).filter((x) => x.endsWith('.yml'))) {
    n += [...readFileSync(CONTENT + f, 'utf8').matchAll(/^[ \t]*-[ \t]*time:/gm)].length;
  }
  return n;
}

/**
 * Every article content file, its public slug and its parsed frontmatter.
 *
 * THE SUBJECT COMES FROM THE CONTENT FILES, NOT FROM `dist/`. A guard that
 * derives its subject from the artifact it checks can only check what it
 * recognised - and what a walk of `dist/noutati/` would fail to recognise is
 * precisely the page that should not exist, which is the one the unpublished
 * guard below is about. The collection is the source, the slug is the single
 * rule from `articles.ts` that the route also uses, and both directions are
 * asserted: every published article has a page, no unpublished one does.
 *
 * `parseYaml` rather than the schema: this reads what the files SAY so a
 * mismatch between a file and the built output can fail here. Validation is
 * `articleSchema`'s job, and it has already run by the time this suite does.
 */
function articleFiles(): { file: string; slug: string; frontmatter: Record<string, unknown> }[] {
  return readdirSync(ARTICLES)
    .filter((file) => file.endsWith('.md'))
    .sort()
    .map((file) => {
      const text = readFileSync(ARTICLES + file, 'utf8');
      const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
      expect(block, `${file} has no frontmatter block`).not.toBeNull();
      const frontmatter = parseYaml((block as RegExpExecArray)[1] as string) as Record<string, unknown>;
      return { file, slug: articleSlug(file.slice(0, -'.md'.length)), frontmatter };
    });
}

/** The article content files that say `published: true`. */
function publishedArticleFiles(): { file: string; slug: string; frontmatter: Record<string, unknown> }[] {
  return articleFiles().filter((f) => f.frontmatter.published === true);
}

/**
 * Every gallery content file, its public slug and its parsed frontmatter.
 *
 * THE SAME SUBJECT RULE AS `articleFiles`: the expected set comes from the
 * CONTENT FILES, not from a walk of `dist/`, which could only ever confirm
 * what the route already produced. There is no `published` flag on a gallery -
 * every file in the collection is an album the parish means to show - so the
 * slug is the file name without its extension, which is the id Astro's loader
 * gives the entry and the value the route turns into `/galerie/<slug>/`.
 */
function galleryFiles(): { file: string; slug: string; frontmatter: Record<string, unknown> }[] {
  return readdirSync(GALERII)
    .filter((file) => file.endsWith('.md'))
    .sort()
    .map((file) => {
      const text = readFileSync(GALERII + file, 'utf8');
      const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
      expect(block, `${file} has no frontmatter block`).not.toBeNull();
      const frontmatter = parseYaml((block as RegExpExecArray)[1] as string) as Record<string, unknown>;
      return { file, slug: file.slice(0, -'.md'.length), frontmatter };
    });
}

/**
 * Every event content file, its public slug and its parsed frontmatter.
 *
 * THE SAME SUBJECT RULE AS `articleFiles` AND `galleryFiles`: the expected set
 * comes from the CONTENT FILES, not from a walk of `dist/`, which could only
 * ever confirm what the route already produced. There is no `published` flag on
 * an event, so every file in the collection gets a page, and the slug is the
 * file name without its extension - the value `eventSlug` returns and the route
 * turns into `/evenimente/<slug>/`. The collection is empty today, and that is
 * exactly why the derivation exists rather than a hand-written key: the first
 * event the parish saves must not be a red build.
 */
function eventFiles(): { file: string; slug: string; frontmatter: Record<string, unknown> }[] {
  return readdirSync(EVENTS)
    .filter((file) => file.endsWith('.md'))
    .sort()
    .map((file) => {
      const text = readFileSync(EVENTS + file, 'utf8');
      const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
      expect(block, `${file} has no frontmatter block`).not.toBeNull();
      const frontmatter = parseYaml((block as RegExpExecArray)[1] as string) as Record<string, unknown>;
      return { file, slug: eventSlug(file.slice(0, -'.md'.length)), frontmatter };
    });
}

/**
 * Every `<img>`'s alt text, in document order.
 *
 * ONE TAG AT A TIME, because Astro serialises an empty alt as the bare boolean
 * attribute `alt`, not `alt=""` - measured on the Task 6 build. A pattern
 * looking for `alt="..."` sees every non-empty alt and none of the empty ones,
 * which is exactly backwards for a policy whose whole point is that they are
 * empty. The control in "this file's detectors can actually fire" proves both
 * readings.
 */
function altTexts(html: string): string[] {
  return [...html.matchAll(/<img\b[^>]*>/g)].map((m) => {
    const tag = m[0] as string;
    const alt = /\salt(?:="([^"]*)")?(?=[\s>])/.exec(tag);
    expect(alt, `an <img> with no alt attribute: ${tag}`).not.toBeNull();
    return alt?.[1] ?? '';
  });
}

/**
 * Every prose page content file, its public route and its parsed frontmatter.
 *
 * THE SIBLING OF `articleFiles`, and the subject rule is the same one: the
 * expected set comes from the CONTENT FILES, not from a walk of `dist/`, which
 * would only ever confirm what `[...page].astro` already produced. `slug` is
 * the public URL here too - for a page that is `frontmatter.path`, the value
 * `pageSchema` validates and the route turns into `/${path}/`. The file name
 * is not the route (`istoric.md` serves `/parohia/istoric/`), so a guard that
 * read the directory instead would check nine pages that do not exist and miss
 * the nine that do.
 */
function pageFiles(): { file: string; slug: string; frontmatter: Record<string, unknown> }[] {
  return readdirSync(PAGES_CONTENT)
    .filter((file) => file.endsWith('.md'))
    .sort()
    .map((file) => {
      const text = readFileSync(PAGES_CONTENT + file, 'utf8');
      const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
      expect(block, `${file} has no frontmatter block`).not.toBeNull();
      const frontmatter = parseYaml((block as RegExpExecArray)[1] as string) as Record<string, unknown>;
      return { file, slug: String(frontmatter.path ?? ''), frontmatter };
    });
}

const DAYS = collectionDays();

describe("this file's detectors can actually fire", () => {
  // A control that cannot fail proves nothing. The strings are built from
  // codepoints, exactly like the sets being searched for.
  it.each(CEDILLAS)('catches cedilla %i', (cp) => {
    expect(containsAnyOf(`Înăl${String.fromCodePoint(cp)}area`, CEDILLAS)).toBe(true);
  });

  it('does not confuse comma below with cedilla', () => {
    const good = COMMA_BELOW.map((cp) => String.fromCodePoint(cp)).join('');
    expect(containsAnyOf(good, CEDILLAS)).toBe(false);
    expect(containsAnyOf(good, COMMA_BELOW)).toBe(true);
  });

  it('does not fire on a-breve, a-circumflex or i-circumflex', () => {
    const others = [0x0103, 0x00e2, 0x00ee].map((cp) => String.fromCodePoint(cp)).join('');
    expect(containsAnyOf(others, CEDILLAS)).toBe(false);
    expect(containsAnyOf(others, COMMA_BELOW)).toBe(false);
  });

  it('reading a file that does not exist fails, rather than passing vacuously', () => {
    expect(() => read('nu-exista-acest-fisier.ics')).toThrow();
  });

  /*
   * The alt reader is a detector with a wrong direction available to it: the
   * build serialises an empty alt as a bare `alt` attribute, so a pattern for
   * `alt="..."` alone would report the captioned images and miss every
   * decorative one. Both readings are pinned here, and a tag with no alt at
   * all is a failure rather than an empty string.
   */
  it('reads a bare alt as empty, a written one as its text, and neither as an error', () => {
    expect(altTexts('<img src="x" alt>')).toEqual(['']);
    expect(altTexts('<img src="x" alt="">')).toEqual(['']);
    expect(altTexts('<img alt="Icoană" src="x">')).toEqual(['Icoană']);
    expect(() => altTexts('<img src="x">')).toThrow();
  });

  it('the collection really does have days and services to compare', () => {
    expect(DAYS.length).toBeGreaterThan(0);
    expect(collectionServices()).toBeGreaterThanOrEqual(DAYS.length);
  });

  /*
   * THE ARTICLE CORPUS'S SHAPE, asserted as properties rather than as today's
   * counts. The parish dates and publishes the archived posts from the CMS,
   * and `ci.yml` runs `test:build` on that push: a test pinned to "45 files,
   * 13 published" would send a red build to the volunteer who pressed Save,
   * for a change that is exactly what the site is for. The properties below
   * are the ones every guard further down depends on, and none can go
   * vacuous - `articleFiles()` reads a real directory, and each count carries
   * the positive control that fails when the corpus is empty or one-sided.
   */
  it('the article corpus has both kinds of post, each with a slug of its own', () => {
    const files = articleFiles();
    expect(files.length, 'no article file at all - the guards below would prove nothing')
      .toBeGreaterThan(0);
    const published = files.filter((f) => f.frontmatter.published === true);
    const unpublished = files.filter((f) => f.frontmatter.published === false);
    // Positive controls for the guards that iterate one kind each: the page
    // and feed guards need a published post, the no-page guard needs an
    // archived one, and an empty set makes its guard a loop over nothing.
    expect(published.length, 'no published article - the page and feed guards would prove nothing')
      .toBeGreaterThan(0);
    expect(unpublished.length, 'no unpublished article - the no-page guard would prove nothing')
      .toBeGreaterThan(0);
    /*
     * `published` is a required boolean in `articleSchema`, so the two sets
     * partition the corpus. A file whose flag was lost, or written as the
     * string `"true"`, is in neither set and the sum falls short here.
     */
    expect(published.length + unpublished.length, 'a file is neither published nor unpublished')
      .toBe(files.length);
    /*
     * F3's property, where it can fail: the public slug is the file name minus
     * its date prefix, and two files sharing one slug would share one URL -
     * the second page would overwrite the first with nothing else failing.
     * Compared against the corpus's own size, not a number from today.
     */
    expect(new Set(files.map((f) => f.slug)).size, 'two articles share a slug')
      .toBe(files.length);
  });
});

describe('the build output', () => {
  it('was generated', () => {
    expect(read('index.html')).toContain('</html>');
  });

  it('includes the schedule page', () => {
    expect(read('program/index.html')).toContain('</html>');
  });

  it('emits the calendar feed', () => {
    expect(read('program.ics')).toContain('BEGIN:VCALENDAR');
  });
});

/*
 * THE NEWS PAGES AND THE FEED. `/noutati`, the article pages and `/rss.xml`
 * are three surfaces built from one filter; these assertions are the joint
 * between the content files and what was actually written to dist.
 */
describe('the news pages', () => {
  it('every published article has a page of its own, with its body on it', () => {
    const published = publishedArticleFiles();
    expect(published.length, 'no published article - the guard would prove nothing')
      .toBeGreaterThan(0);
    let bodiesChecked = 0;
    for (const f of published) {
      const html = read(`noutati/${f.slug}/index.html`);
      /*
       * The body reached the page, not merely the title. A page whose markdown
       * failed to render looks completely correct - header, title, footer - so
       * the assertion is on the `.prose` block, which is where the body lands
       * and nowhere else.
       *
       * TAGS ARE STRIPPED AND WHITESPACE COLLAPSED, and the opening tag's own
       * `>` is consumed, because the natural empty shape is
       * `<div class="prose" ...></div></article>`: read without the strip it
       * leaves `</div>`, which trims to non-empty and lets this guard pass
       * while checking nothing. Measured by emptying one built page's prose
       * with its closing tag intact.
       *
       * The floor is the property the guard exists for - prose reached the
       * page - not a corpus count. The shortest body measured is 180
       * characters of text (the 24 December 2024 pastoral letter), so 100 is
       * well under the shortest real post and no ordinary content edit comes
       * near it. A file with no body is not asserted about at all.
       */
      const source = readFileSync(ARTICLES + f.file, 'utf8');
      const body = source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
      if (body.length === 0) continue;
      bodiesChecked += 1;
      const afterOpen = html.split('<div class="prose"')[1] ?? '';
      const prose = afterOpen.slice(afterOpen.indexOf('>') + 1).split('</article>')[0] ?? '';
      const text = prose.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      expect(text, `${f.slug} has a body in its file but nothing in .prose`).not.toBe('');
      expect(text.length, `${f.slug} has a body in its file but no prose in .prose`)
        .toBeGreaterThan(100);
    }
    // Without this, a corpus of empty bodies would make the loop above pass
    // while checking nothing.
    expect(bodiesChecked, 'no published article has a body to check').toBeGreaterThan(0);
  });

  it('no unpublished article has a page of its own in dist/', () => {
    /*
     * "Unpublished" must not mean "reachable by anyone with the link". Taken
     * from the CONTENT FILES rather than from the built output, because a
     * guard that derives its subject from the artifact it checks can only
     * check what it recognised - and what it would fail to recognise here is
     * precisely the page that should not exist.
     */
    const unpublished = articleFiles()
      .filter((f) => f.frontmatter.published === false)
      .map((f) => f.slug);
    expect(unpublished.length, 'no unpublished article - the guard would prove nothing')
      .toBeGreaterThan(0);
    for (const slug of unpublished) {
      expect(existsSync(`${DIST}noutati/${slug}/index.html`), `${slug} must not have a page`)
        .toBe(false);
    }
  });

  /*
   * F5: THE MIGRATED BODY IMAGES, PROVEN TO RENDER. The migration wrote each
   * body `src` as `../../assets/content/<rest>`, and whether Astro's markdown
   * pipeline resolves that shape is not something the migration or the schema
   * can know - a broken body `<img>` fails nothing and 404s silently. So the
   * built page is read, every `<img>` is found, and each `src` is followed to
   * a real file inside `dist/`. A raw `assets/content/...` path is not
   * root-relative and would fail the second assertion; a rewritten
   * `/_astro/...` hashed asset is what this expects to see, and the measured
   * srcs are printed so a later reader can check the claim against a run.
   */
  it('a body image in a published article resolves to a real file in dist/', () => {
    const withImages = publishedArticleFiles().filter((f) =>
      /!\[[^\]]*\]\([^)]+\)/.test(readFileSync(ARTICLES + f.file, 'utf8')),
    );
    expect(
      withImages.length,
      'no published article carries a body image - the guard would prove nothing',
    ).toBeGreaterThan(0);

    const measured: string[] = [];
    for (const f of withImages) {
      const html = read(`noutati/${f.slug}/index.html`);
      const srcs = [...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1] as string);
      expect(srcs.length, `${f.slug} has a markdown image but no <img> in its built page`)
        .toBeGreaterThan(0);
      for (const src of srcs) {
        measured.push(`${f.slug} -> ${src}`);
        // Root-relative, or `DIST + path` is not the file the host serves.
        expect(src.startsWith('/'), `${src} on ${f.slug} is not root-relative`).toBe(true);
        const path = (src.split(/[?#]/)[0] as string).slice(1);
        expect(existsSync(DIST + path), `${src} on ${f.slug} does not resolve inside dist/`)
          .toBe(true);
        // And not the migration's own path, which would be an attribute that
        // 404s: the asset pipeline is what must have rewritten it.
        expect(path.includes('assets/content'), `${src} is the unmigrated path, not a built asset`)
          .toBe(false);
      }
    }
    process.stdout.write(`\nArticle body images:\n${measured.map((m) => `  ${m}`).join('\n')}\n`);
  });

  it('a frontmatter image on a published article reaches the page as a real file', () => {
    const withImage = publishedArticleFiles().filter((f) => Boolean(f.frontmatter.image));
    for (const f of withImage) {
      const html = read(`noutati/${f.slug}/index.html`);
      const match = html.match(/<img[^>]+src="(\/_astro\/[^"]+)"/);
      expect(match, `${f.slug} has a frontmatter image but no built image on its page`).not.toBeNull();
      expect(existsSync(`dist${match![1]}`), `${match![1]} is missing from dist/`).toBe(true);
    }

    /*
     * WHY THERE IS NO `length > 0` CONTROL ABOVE, and the corpus fact it rests
     * on: the three articles that carry a frontmatter image are all archived
     * (`published: false` - the import destroyed their dates), and an archived
     * post has no page, which the guard above proves. A non-zero control would
     * therefore be a red build over the corpus rather than over a defect, and
     * the parish dating and publishing one of the three must not be the thing
     * that turns it red. The subject is derived from the content, so the loop
     * above starts checking the day that happens. The half that can fire today
     * is the other direction, below: a published article whose frontmatter
     * carries no image must render no wrapper at all.
     */
    const without = publishedArticleFiles().filter((f) => !f.frontmatter.image);
    expect(without.length, 'no published article without a frontmatter image - the control would prove nothing')
      .toBeGreaterThan(0);
    for (const f of without) {
      expect(read(`noutati/${f.slug}/index.html`), `${f.slug} renders an image its frontmatter does not carry`)
        .not.toContain('class="article-image"');
    }
  });
});

/*
 * THE NINE PROSE PAGES, FROM ONE ROUTE. `[...page].astro` builds a page per
 * entry in the `pages` collection; these assertions are the joint between the
 * content files and what was written to dist.
 */
describe('the prose pages', () => {
  it('every page in the collection has exactly one built file', () => {
    /*
     * The expected set comes from the CONTENT FILES, which the route cannot
     * edit - not from walking `dist/`, which would only ever confirm what the
     * route already produced.
     *
     * NINE IS A CONTRACT, not a corpus count: the nine prose pages are fixed
     * (the CMS does not create them), so pinning the number is what makes an
     * emptied collection a failure rather than a loop over nothing. Posts are
     * the other case - they grow every time the parish publishes - and their
     * guards hold properties instead.
     */
    const paths = pageFiles().map((f) => f.slug);
    expect(paths.length, 'no page - the guard would prove nothing').toBe(9);
    for (const path of paths) {
      expect(existsSync(`${DIST}${path}/index.html`), `missing /${path}/`).toBe(true);
    }
  });

  /*
   * REACHABILITY, WHICH "A FILE EXISTS" DOES NOT CHECK. The nine routes were
   * exactly that - routes. On the Phase 2 build, seven of them had no inbound
   * link on any built page: `getStaticPaths` had built them, every guard above
   * found their files, and a page nobody can navigate to looks identical to one
   * everybody can. The footer's `Pagini` menu is the sitewide answer, and this
   * asserts the property rather than the component: every prose page is linked
   * from every visitor page.
   *
   * The subject is the CONTENT FILES (nine fixed pages), not a walk of `dist/`.
   * The universal is `builtPages()` minus `admin/`, which is the CMS and carries
   * no site chrome; that set is the footer's reach, so a page the footer is
   * missing from fails here rather than being silently excluded.
   */
  it('every prose page is linked from every visitor page', () => {
    const paths = pageFiles().map((f) => f.slug);
    expect(paths.length, 'no page - the guard would prove nothing').toBe(9);
    const visitorPages = builtPages().filter((p) => !p.startsWith('admin/'));
    expect(
      visitorPages.length,
      'no built visitor page - the guard would prove nothing',
    ).toBeGreaterThan(0);

    const missing: string[] = [];
    for (const path of paths) {
      const needle = `href="/${path}/"`;
      const carriers = visitorPages.filter((p) => readFileSync(DIST + p, 'utf8').includes(needle));
      if (carriers.length !== visitorPages.length) {
        missing.push(`${path} (${carriers.length}/${visitorPages.length})`);
      }
    }
    process.stdout.write(
      `\nProse-page inbound links: ${paths.length} page(s) against ${visitorPages.length} visitor page(s).\n`,
    );
    expect(
      missing,
      `prose pages not linked from every visitor page: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('every built page really has content, not just a title', () => {
    /*
     * A page whose body failed to render looks completely correct: header,
     * title, footer. Measured on the real corpus with tags stripped, the
     * shortest of the nine is `/parohia/consiliul/` at 291 characters - it is
     * a list of council members' names beside their portraits, not paragraphs
     * - so the floor is 100: far above the ~20 characters a title-only page
     * would leave, and far below anything a real body produces. The floor is
     * the property the guard exists for, not a corpus count.
     */
    const files = pageFiles();
    expect(files.length, 'no page - the guard would prove nothing').toBeGreaterThan(0);
    for (const f of files) {
      const html = read(`${f.slug}/index.html`);
      const body = html.split('<main')[1]?.split('</main>')[0] ?? '';
      const text = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      expect(text.length, `/${f.slug}/ looks empty`).toBeGreaterThan(100);
    }
  });

  /*
   * F5: THE MIGRATED BODY IMAGES OF THE PROSE PAGES, PROVEN TO RENDER. The
   * same joint the article guard checks, over a corpus with many more images:
   * the migration wrote each body `src` as `../../assets/content/<rest>`, and
   * a body `<img>` that fails to resolve 404s silently. So the built page is
   * read, every `<img>` is found, and each `src` is followed to a real file
   * inside `dist/`. A raw `assets/content/...` path is not root-relative and
   * would fail the second assertion; a rewritten `/_astro/...` hashed asset is
   * what this expects to see, and the measured srcs are printed so a later
   * reader can check the claim against a run.
   */
  it('a body image on a prose page resolves to a real file in dist/', () => {
    const withImages = pageFiles().filter((f) =>
      /!\[[^\]]*\]\([^)]+\)/.test(readFileSync(PAGES_CONTENT + f.file, 'utf8')),
    );
    expect(
      withImages.length,
      'no prose page carries a body image - the guard would prove nothing',
    ).toBeGreaterThan(0);

    const measured: string[] = [];
    let imagesChecked = 0;
    for (const f of withImages) {
      const html = read(`${f.slug}/index.html`);
      const srcs = [...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1] as string);
      expect(srcs.length, `${f.slug} has a markdown image but no <img> in its built page`)
        .toBeGreaterThan(0);
      for (const src of srcs) {
        imagesChecked += 1;
        measured.push(`/${f.slug}/ -> ${src}`);
        // Root-relative, or `DIST + path` is not the file the host serves.
        expect(src.startsWith('/'), `${src} on /${f.slug}/ is not root-relative`).toBe(true);
        const path = (src.split(/[?#]/)[0] as string).slice(1);
        expect(existsSync(DIST + path), `${src} on /${f.slug}/ does not resolve inside dist/`)
          .toBe(true);
        // And not the migration's own path, which would be an attribute that
        // 404s: the asset pipeline is what must have rewritten it.
        expect(path.includes('assets/content'), `${src} is the unmigrated path, not a built asset`)
          .toBe(false);
      }
    }
    // Without this, a corpus whose pages all lost their images would make the
    // loop above pass while checking nothing.
    expect(imagesChecked, 'no body image in any built prose page').toBeGreaterThan(0);
    process.stdout.write(
      `\nProse page body images: ${imagesChecked} over ${withImages.length} page(s):\n` +
        `${measured.map((m) => `  ${m}`).join('\n')}\n`,
    );
  });

  /*
   * THE LINKS THE MIGRATION REWROTE, CHECKED WHERE THEY LAND. `rewriteDocumentLinks`
   * turns a PDF link into `/documente/<slug>.pdf` and `rewriteLinkedImages`
   * turns an uploads-image anchor into a link at the migrated asset; both run in
   * `extractArticles`/`extractPages`, and neither is visible in the source
   * Markdown as an old-host URL any more. What could still ship is an old-host
   * file href the rewrite did not reach - a shape `linkImagesIn` did not
   * collect, a URL with a host spelling the pattern does not know - and nothing
   * else on the site reads a link's destination. So every built page is read
   * and every `href` at `https://www.bor-zh.ch/…` with a file extension is
   * collected; the assertion is that there are none.
   *
   * THE EXTENSION LIST IS THE FILES WE NOW HOST: the 87 PDFs and the migrated
   * images. `.doc` is deliberately outside it: `studii.md` links eight of them
   * and the migration never copies a `.doc` (the spec's ruling), so those links
   * stay on the old host and are Phase 4's to rule on - naming them here would
   * make this assertion say something it does not mean.
   */
  it('the migrated prose no longer links at the old host for a file we now host', () => {
    const hosted = builtPages().map((page) => readFileSync(DIST + page, 'utf8')).join('\n');
    const dead = [...hosted.matchAll(/href="https:\/\/www\.bor-zh\.ch\/[^"]+\.(?:pdf|jpg|jpeg|png)"/g)]
      .map((m) => m[0]);
    expect(dead, `links to files the old host no longer needs to serve:\n${dead.join('\n')}`)
      .toEqual([]);
  });
});

/*
 * THE TWO PHOTO ALBUMS, FROM ONE ROUTE. `[slug].astro` builds a page per entry
 * in the `galerii` collection; these assertions are the joint between the
 * content files and what was written to dist, and they are the only place the
 * alt/caption policy - a description is the visible caption, every alt is
 * empty, and an image without a description has no caption either - is checked
 * against a built page.
 */
describe('the gallery pages', () => {
  it('every album in the collection has a page of its own', () => {
    const albums = galleryFiles();
    expect(albums.length, 'no gallery content file - the guards below would prove nothing')
      .toBeGreaterThan(0);
    for (const f of albums) {
      expect(existsSync(`${DIST}galerie/${f.slug}/index.html`), `missing /galerie/${f.slug}/`)
        .toBe(true);
    }
  });

  /*
   * REACHABILITY, WHICH "A FILE EXISTS" DOES NOT CHECK. An album page no link
   * points at is a page nobody can navigate to, and it looks exactly like one
   * everybody can - the lesson the prose pages paid for. The subject is the
   * content files, so a new album is checked here the moment the parish saves
   * it.
   */
  it('links every album from the index, with its title, and renders each cover', () => {
    const albums = galleryFiles();
    expect(albums.length, 'no gallery content file - the guard would prove nothing')
      .toBeGreaterThan(0);
    const html = read('galerie/index.html');
    const covers = [...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1] as string);
    // Count equality, not "at least one": the index's only `<img>`s are the
    // covers (the site chrome carries none), so a lost cover fails here.
    expect(covers.length, `the index renders ${covers.length} covers, not ${albums.length}`)
      .toBe(albums.length);
    for (const src of covers) {
      expect(src.startsWith('/'), `${src} on /galerie/ is not root-relative`).toBe(true);
      const path = (src.split(/[?#]/)[0] as string).slice(1);
      expect(existsSync(DIST + path), `${src} on /galerie/ does not resolve inside dist/`).toBe(true);
    }
    for (const f of albums) {
      expect(html, `the index does not link /galerie/${f.slug}/`)
        .toContain(`href="/galerie/${f.slug}/"`);
      expect(html, `the index does not show the title of ${f.slug}`)
        .toContain(String(f.frontmatter.title ?? ''));
    }
  });

  it('renders every image of the album, each resolving to a real file in dist/', () => {
    const albums = galleryFiles();
    expect(albums.length, 'no gallery content file - the guard would prove nothing')
      .toBeGreaterThan(0);
    let imagesChecked = 0;
    for (const f of albums) {
      const html = read(`galerie/${f.slug}/index.html`);
      const images = (f.frontmatter.images ?? []) as { file?: string; description?: string }[];
      expect(images.length, `${f.file} lists no image - the count below would prove nothing`)
        .toBeGreaterThan(0);
      const srcs = [...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1] as string);
      expect(srcs.length, `${f.slug} renders ${srcs.length} images, not ${images.length}`)
        .toBe(images.length);
      for (const src of srcs) {
        imagesChecked += 1;
        expect(src.startsWith('/'), `${src} on /galerie/${f.slug}/ is not root-relative`).toBe(true);
        const path = (src.split(/[?#]/)[0] as string).slice(1);
        expect(existsSync(DIST + path), `${src} on /galerie/${f.slug}/ does not resolve inside dist/`)
          .toBe(true);
      }
    }
    expect(imagesChecked, 'no gallery image in any built album').toBeGreaterThan(0);
    process.stdout.write(
      `\nGallery images: ${imagesChecked} over ${albums.length} album page(s).\n`,
    );
  });

  it('writes each description as the caption and leaves every alt empty', () => {
    const albums = galleryFiles();
    expect(albums.length, 'no gallery content file - the guard would prove nothing')
      .toBeGreaterThan(0);
    let captioned = 0;
    let decorative = 0;
    for (const f of albums) {
      const html = read(`galerie/${f.slug}/index.html`);
      const images = (f.frontmatter.images ?? []) as { file?: string; description?: string }[];
      /*
       * EVERY ALT IS EMPTY, and that is the measured policy rather than an
       * oversight: the caption is the text alternative, and carrying the same
       * sentence in `alt` made axe's `image-redundant-alt` fire on all nine
       * captioned images of the legacy album in the default-width browser
       * pass. The assertion still has teeth - an `alt` that came back carrying
       * the description, or the album title, fails it - and `altTexts` has its
       * own positive control above, because a pattern for `alt="..."` would
       * report only the non-empty ones.
       *
       * THE CAPTIONS ARE THE EXACT SEQUENCE, in frontmatter order: the grid
       * maps the array and renders one caption per described entry, so a
       * dropped or reordered one changes this array. The paragraph is matched
       * with `[^>]*` because Astro adds its scoping attribute to the rendered
       * `<p>`.
       */
      expect(altTexts(html), `${f.slug} alt texts`).toEqual(images.map(() => ''));
      const captions = [...html.matchAll(/<p class="gg-caption"[^>]*>([\s\S]*?)<\/p>/g)]
        .map((m) => (m[1] as string).trim());
      expect(captions, `${f.slug} captions`)
        .toEqual(images.filter((i) => i.description).map((i) => i.description));
      captioned += images.filter((i) => i.description).length;
      decorative += images.filter((i) => !i.description).length;
    }
    // Printed, not asserted: both arms are exercised by today's corpus (the
    // legacy album captions all nine of its images, the Easter album none), but
    // a parish that captions everything would be doing the right thing, and a
    // build must not go red over it.
    process.stdout.write(
      `\nGallery captions: ${captioned} captioned, ${decorative} uncaptioned.\n`,
    );
  });
});

/*
 * THE EVENTS INDEX, AGAINST THE COLLECTION. The parish has no events today, so
 * the branch that fires now is the empty state - and it is written as a branch
 * rather than pinned to "there are none", because the first event the parish
 * saves is not a defect. The content files decide which branch should run, and
 * the subject comes from them rather than from the page.
 *
 * WHAT THIS DOES NOT COVER: the detail layout, which no real build can render
 * while the collection is empty. That is the picker's fixture build, and its
 * own check fails if the fixture stops producing those pages.
 */
describe('the events pages', () => {
  it('renders every event in the collection, or says there are none', () => {
    const events = eventFiles();
    const html = read('evenimente/index.html');
    if (events.length === 0) {
      expect(html, 'the index must say so when the collection is empty')
        .toContain('Nu sunt evenimente anunțate pentru perioada următoare.');
      return;
    }
    for (const f of events) {
      expect(html, `the index does not link /evenimente/${f.slug}/`)
        .toContain(`href="/evenimente/${f.slug}/"`);
      expect(html, `the index does not show the title of ${f.slug}`)
        .toContain(String(f.frontmatter.title ?? ''));
    }
  });
});

/*
 * THE `/src/` NAMESPACE IS NOT A URL. `media_folder` under `src/` is right -
 * uploads go through Astro's image pipeline - but a path like
 * `/src/assets/uploads/x.jpg` is root-absolute, so Astro does not rewrite it,
 * and there is no `dist/src/`, so it 404s. That was the CMS's `public_folder`
 * and the markdown widget wrote it into article bodies on a green build.
 * `cms.test.ts` keeps the generator honest; this catches any other source of
 * the shape - a content file, a template, or a person editing an entry by hand.
 */
function unservedSrcRefs(html: string): string[] {
  return [...html.matchAll(/(?:src|href)="(\/src\/[^"]*)"/g)].map((m) => m[1] as string);
}

describe('no built page references the unserved /src/ namespace', () => {
  it('the detector fires on the shape the CMS used to write', () => {
    expect(unservedSrcRefs('<img src="/src/assets/uploads/x.jpg">')).toEqual([
      '/src/assets/uploads/x.jpg',
    ]);
    expect(unservedSrcRefs('<a href="/src/assets/uploads/x.jpg">x</a>')).toEqual([
      '/src/assets/uploads/x.jpg',
    ]);
    // The positive control's other half: the resolved shape must not match.
    expect(unservedSrcRefs('<img src="/_astro/x.webp">')).toEqual([]);
  });

  it('no built page carries one', () => {
    const pages = builtPages();
    expect(pages.length, 'no built page - the guard would prove nothing').toBeGreaterThan(0);
    const hits = pages.flatMap((p) =>
      unservedSrcRefs(readFileSync(DIST + p, 'utf8')).map((ref) => `${p} -> ${ref}`),
    );
    expect(
      hits,
      `built pages reference /src/, which the host does not serve:\n${hits.join('\n')}`,
    ).toEqual([]);
  });
});

describe('the news feed', () => {
  /*
   * The host is pinned by hand rather than read from `Astro.site`, because
   * the claim being checked is that the DEPLOYED links are absolute and
   * correct. If the site ever moves, this line and `astro.config.mjs` move
   * together - which is the point.
   */
  const SITE = 'https://www.bor-zh.ch';

  it('is an RSS 2.0 document with a Romanian channel', () => {
    const xml = read('rss.xml');
    expect(xml).toContain('<rss version="2.0">');
    expect(xml).toContain('<language>ro</language>');
    expect(xml).toContain(`<link>${SITE}/</link>`);
    /*
     * No build clock. `lastBuildDate` from `Date.now()` would change the bytes
     * between two builds of unchanged content; `rss.test.ts` proves the
     * generator omits it, and this proves the built file agrees.
     */
    expect(xml).not.toContain('lastBuildDate');
  });

  it('carries exactly the published articles, newest first', () => {
    const xml = read('rss.xml');
    /*
     * The expected order comes from the same function the endpoint uses, fed
     * the content files. `id: f.slug` IS the public slug - `articleFiles()`
     * already stripped the date prefix - and it is enough for the ordering:
     * the real id is the date prefix plus the slug, and the tiebreak only
     * compares ids of articles that share a date, so equal prefixes cancel.
     * The URL is built from `e.id` directly, because calling `articleSlug` on
     * an id that has already been stripped would eat a second date-shaped
     * prefix from a WordPress slug that happened to begin with one.
     */
    const entries: ArticleEntry[] = articleFiles().map((f) => ({
      id: f.slug,
      data: {
        title: String(f.frontmatter.title ?? ''),
        date: String(f.frontmatter.date),
        published: f.frontmatter.published === true,
        category: 'Noutati',
        author: 'Parohia',
      },
    }));
    const expected = publishedArticles(entries).map((e) => `${SITE}/noutati/${e.id}/`);
    const actual = [
      ...xml.matchAll(/<link>(https:\/\/[^<]+\/noutati\/[^<]*)<\/link>/g),
    ].map((m) => m[1] as string);
    expect(actual.length, 'the feed is empty - the comparison would prove nothing')
      .toBeGreaterThan(0);
    expect(actual).toEqual(expected);
  });

  it('leaks no unpublished slug into the feed', () => {
    const xml = read('rss.xml');
    const unpublished = articleFiles().filter((f) => f.frontmatter.published === false);
    expect(unpublished.length, 'no unpublished article - the guard would prove nothing')
      .toBeGreaterThan(0);
    for (const f of unpublished) {
      // The trailing slash keeps `mosii-de-toamna` from matching the published
      // `mosii-de-toamna-3`.
      expect(xml, `${f.slug} must not be in the feed`).not.toContain(`/noutati/${f.slug}/`);
    }
  });
});

/*
 * The assertions below can pin themselves to the content of the collection
 * precisely because the feed carries every one of its days, whatever the
 * build date is.
 */
describe('the calendar feed carries the collection', () => {
  it('opens and closes as a VCALENDAR', () => {
    const ics = read('program.ics');
    const lines = unfold(ics);
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines[lines.length - 1]).toBe('END:VCALENDAR');
    // A threshold tied to the content, not a number picked by hand: every VEVENT has
    // at least six properties between BEGIN and END. A fixed threshold would have let
    // a truncated feed through if the parish publishes a single day, and would have
    // failed for nothing if it publishes few — meaning it would have been talking
    // about the parish's calendar, not about the file.
    expect(lines.length).toBeGreaterThan(events(ics).length * 6);
  });

  /*
   * Every DTSTART and DTEND in the feed says `TZID=Europe/Zurich`. Without the
   * block that defines that TZID, the reference resolves to nothing and every
   * client guesses the timezone on its own — meaning exactly the wrong time on
   * a parishioner's phone, without the file looking broken. The block is
   * written by `ics.ts` and does not depend on the content, so its absence
   * always means a regression.
   */
  it('defines the timezone every event names', () => {
    const lines = unfold(read('program.ics'));
    expect(lines).toContain('BEGIN:VTIMEZONE');
    expect(lines).toContain('TZID:Europe/Zurich');
    expect(lines).toContain('END:VTIMEZONE');
    expect(lines).toContain('BEGIN:DAYLIGHT');
    expect(lines).toContain('BEGIN:STANDARD');
  });

  // Set equality, not an example: a day lost on the way between
  // `getCollection` and the feed fails here, and a day added to the
  // collection requires no change to this test.
  it("carries exactly the collection's days, not one more, not one fewer", () => {
    const ics = read('program.ics');
    const fromFeed = [...ics.matchAll(/^DTSTART;TZID=Europe\/Zurich:(\d{4})(\d{2})(\d{2})T/gm)]
      .map((m) => `${m[1]}-${m[2]}-${m[3]}`);
    expect([...new Set(fromFeed)].sort()).toEqual(DAYS);
  });

  it("carries every service of the collection, not merely every day", () => {
    expect(events(read('program.ics')).length).toBe(collectionServices());
  });

  // The other end of the chain: `time` normalised by the schema, the name composed
  // by `serviceLabel` from `service` + `detail`, the feast written by a volunteer.
  it('carries the time, the composed name and the feast all the way into the feed', () => {
    const ics = read('program.ics');
    expect(ics).toContain('DTSTART;TZID=Europe/Zurich:20260914T073000');
    expect(ics).toContain('SUMMARY:Sfânta Liturghie și Parastas');
    expect(ics).toContain('Înălțarea Sfintei Cruci');
  });
});

describe('the feed respects the iCalendar format', () => {
  it('separates lines with CRLF, not with LF', () => {
    const ics = read('program.ics');
    expect(ics.endsWith(CRLF)).toBe(true);
    expect(/[^\r]\n/.test(ics), 'an LF with no CR before it').toBe(false);
    expect(/\r[^\n]/.test(ics), 'a CR with no LF after it').toBe(false);
  });

  /*
   * WHAT THIS TEST DOES NOT PROVE: that folding works. The longest line in
   * the built feed is 69 bytes (`PRODID:`), and the continuation lines are
   * ZERO — the parish's content does not come close to the limit. So what
   * this writes is "nothing is too long", not "long things get folded", and
   * if `fold` broke, this test would stay green.
   *
   * Folding is covered where it can actually be triggered, in `ics.test.ts`:
   * "continues folded lines with a space" (a 200-character `feast`, which
   * requires continuations), "does not split a multi-byte character across
   * two lines", and the three- and four-byte case (em dash, CJK, emoji). The
   * point of the line here is the other one: that a `feast` written by a
   * volunteer cannot make the REAL feed exceed the limit without it being
   * noticed.
   */
  it('never exceeds 75 bytes per line', () => {
    const ics = read('program.ics');
    const lines = ics.split(CRLF);
    // The same care as above: "we really did read the feed's own lines" must
    // stay true even for a week with a single service.
    expect(lines.length).toBeGreaterThan(events(ics).length * 6);
    for (const line of lines) {
      expect(new TextEncoder().encode(line).length, line).toBeLessThanOrEqual(75);
    }
  });

  /*
   * DTSTAMP is the only field this end composes on its own: `generateIcs`
   * receives it as a parameter and does not validate it, precisely so the
   * output is deterministic in tests. So its correctness is checked here or
   * nowhere.
   *
   * The property, not an example, and without a clock: the exact shape
   * YYYYMMDDTHHMMSSZ, plus a round trip through `Date` that rejects a 13th
   * month or a 99th hour that a plain digit match would accept. An assertion
   * about how close it is to "now" would be exactly the kind of test that
   * the passage of time breaks, not a code change.
   */
  it('stamps every event with a valid UTC DTSTAMP', () => {
    const blocks = events(read('program.ics'));
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      const line = block.find((l) => l.startsWith('DTSTAMP:'));
      expect(line, `VEVENT without DTSTAMP: ${block.join(' | ')}`).toBeDefined();
      const stamp = (line as string).slice('DTSTAMP:'.length);
      const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(stamp);
      expect(m, `DTSTAMP badly formatted: ${stamp}`).not.toBeNull();
      const [, year, month, day, times, minutes, seconds] = m as RegExpExecArray;
      const d = new Date(Date.UTC(+year, +month - 1, +day, +times, +minutes, +seconds));
      expect(`${d.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`, 'DTSTAMP is not a real date').toBe(stamp);
    }
  });

  it('gives every event the required fields and a UID of its own', () => {
    const blocks = events(read('program.ics'));
    expect(blocks.length).toBeGreaterThan(0);
    const uids: string[] = [];
    for (const block of blocks) {
      for (const key of ['UID:', 'DTSTAMP:', 'DTSTART;', 'DTEND;', 'SUMMARY:', 'LOCATION:']) {
        expect(block.some((l) => l.startsWith(key)), `missing ${key} from ${block.join(' | ')}`).toBe(true);
      }
      expect(block.find((l) => l.startsWith('DTSTART;'))).toMatch(
        /^DTSTART;TZID=Europe\/Zurich:\d{8}T\d{6}$/,
      );
      expect(block.find((l) => l.startsWith('DTEND;'))).toMatch(
        /^DTEND;TZID=Europe\/Zurich:\d{8}T\d{6}$/,
      );
      /*
       * And their ORDER, not just their shape. RFC 5545 §3.6.1 requires DTEND
       * to be after DTSTART, and a zero-length event renders unpredictably —
       * for a parish, as a service that looks like it is not happening. The
       * shape assertion above is just as satisfied by two equal stamps.
       *
       * String comparison: both are `YYYYMMDDTHHMMSS`, fixed width and in the
       * same TZID, so `>` really is the chronological order of the wall
       * clock. The arithmetic across midnight and across the time change
       * lives in `ics.test.ts`, where it can be constructed deliberately.
       */
      const start = (block.find((l) => l.startsWith('DTSTART;')) as string).split(':')[1] as string;
      const end = (block.find((l) => l.startsWith('DTEND;')) as string).split(':')[1] as string;
      expect(end > start, `DTEND ${end} is not after DTSTART ${start}`).toBe(true);
      uids.push(block.find((l) => l.startsWith('UID:')) as string);
    }
    // Identical UIDs make two services melt into a single event in every
    // subscriber's calendar, with no sign of it.
    expect(new Set(uids).size).toBe(uids.length);
  });
});

describe('the feed keeps the comma-below diacritics', () => {
  it('contains no Turkish cedilla', () => {
    expect(containsAnyOf(read('program.ics'), CEDILLAS)).toBe(false);
  });

  // Without this control, the assertion above would be just as true of a
  // feed that no longer contains a single Romanian word.
  it('does contain comma below', () => {
    expect(containsAnyOf(read('program.ics'), COMMA_BELOW)).toBe(true);
  });
});

describe('the built pages', () => {
  it('the homepage has the schedule section', () => {
    const html = read('index.html');
    // „Programul slujbelor”, not „Programul săptămânii”: the title in `index.astro`
    // deliberately does not count weeks, precisely because their number depends on
    // the date and on JavaScript. A title that counts would be false in at least
    // one of the two states.
    expect(html).toContain('Programul slujbelor');
    expect(html).toContain('Bine ați venit');
  });

  /*
   * THE HOMEPAGE NEWS SECTION, EXACTLY. The expected set comes from the content
   * files through `publishedArticles` — the same filter the page uses — and the
   * assertion is set equality on the article hrefs, not "contains three of
   * them". A homepage that rendered the four newest, or the newest three plus
   * an unpublished one, is a different page from the one `/noutati/` opens
   * with, and both would pass a contains-check.
   *
   * The positive controls are what keep the two loops from being loops over
   * nothing: the corpus is asserted to hold a published post (else the equality
   * is `[] === []`) and an unpublished one (else the "no unpublished slug" loop
   * never runs). The trailing slash in both patterns is load-bearing, the same
   * way it is in the feed guard: it keeps a published `mosii-de-toamna-3` from
   * matching the unpublished `mosii-de-toamna` as a substring.
   */
  it('the homepage carries exactly the three newest published articles, and no unpublished slug', () => {
    const html = read('index.html');
    const published = publishedArticles(
      articleFiles().map((f) => ({
        id: f.slug,
        data: {
          title: String(f.frontmatter.title ?? ''),
          date: String(f.frontmatter.date),
          published: f.frontmatter.published === true,
          category: 'Noutati' as const,
          author: 'Parohia',
        },
      })),
    );
    expect(published.length, 'no published article - the guard would prove nothing')
      .toBeGreaterThan(0);
    const newest = published.slice(0, 3).map((e) => e.id);
    const links = [...html.matchAll(/href="\/noutati\/([^"/]+)\/"/g)].map((m) => m[1] as string);
    expect(links, 'the homepage news list is not exactly the three newest published posts')
      .toEqual(newest);

    /*
     * THE SECTION HEADING AND ITS LINK TO THE INDEX, asserted against the
     * news section rather than against the page. A bare `toContain('Noutăți')`
     * would pass on a card's category label, and a bare
     * `toContain('/noutati/')` on the header navigation's own link - both
     * present whether or not the section kept its heading or its way out.
     */
    expect(html, 'the homepage news section has lost its heading')
      .toMatch(/<h2[^>]*>Noutăți<\/h2>/);
    expect(html, 'the homepage news section has lost its link to /noutati/')
      .toMatch(/<a href="\/noutati\/"[^>]*>Toate noutățile →<\/a>/);

    const unpublished = articleFiles()
      .filter((f) => f.frontmatter.published === false)
      .map((f) => f.slug);
    expect(unpublished.length, 'no unpublished article - the guard would prove nothing')
      .toBeGreaterThan(0);
    for (const slug of unpublished) {
      expect(html, `${slug} must not be on the homepage`).not.toContain(`/noutati/${slug}/`);
    }
  });

  it('declares the Romanian language and correct diacritics', () => {
    for (const p of ['index.html', 'program/index.html']) {
      const html = read(p);
      expect(html, p).toContain('<html lang="ro"');
      expect(html, p).toContain('Sfântul Nicolae');
      expect(containsAnyOf(html, CEDILLAS), p).toBe(false);
      expect(containsAnyOf(html, COMMA_BELOW), p).toBe(true);
    }
  });

  /*
   * THREE GENERATIONS OF THE SAME MISTAKE, for whoever writes a fourth.
   *
   * 1. "the href appears on the page" — `toContain('/program.ics')`. Green
   *    the entire time the link was dead, because the attribute existed and
   *    the file did not.
   * 2. "the href I find leads somewhere" — every match was followed all the
   *    way to the file. Better, but the pattern required `.ics` glued to
   *    the closing quote: `href="/program.ics/"` no longer matched, so it
   *    FELL OUT of the checked set. The matches dropped from 2 to 1 and
   *    nothing failed.
   * 3. This one. The pattern catches the wrong forms too (`icsReferences`),
   *    and the number of references on each page is fixed
   *    (`ICS_REFERENCES`), so a reference that stops matching FAILS instead
   *    of disappearing.
   *
   * Every time, the assertion was talking about the references found, not
   * about the references that should exist. The number is what closes the
   * set; following it to the file is what ties it to reality. Both are
   * needed: without the number, a wide pattern still silently loses
   * whatever it doesn't match; without the following-through, the number is
   * satisfied by a path that does not exist.
   */
  it('carries exactly the expected references to the feed, on every page', () => {
    const pages = builtPages();
    expect(pages.length, 'dist/ contains no page at all').toBeGreaterThan(0);
    const expected = expectedIcsReferences();
    expect(pages, 'a built page not declared in ICS_REFERENCES').toEqual(
      Object.keys(expected).sort(),
    );
    for (const page of pages) {
      expect(icsReferences(read(page)).length, page).toBe(expected[page]);
    }
  });

  it('every .ics reference in the output leads to a real file', () => {
    const pairs: [string, string][] = [];
    for (const page of builtPages()) {
      for (const href of icsReferences(read(page))) pairs.push([page, href]);
    }
    expect(pairs.length, 'no .ics reference anywhere on the site').toBeGreaterThan(0);
    for (const [page, href] of pairs) {
      // Absolute from the root, otherwise `dist` + href is not the path actually
      // served, and the assertion below would be asking something other than
      // what it appears to.
      expect(href.startsWith('/'), `${href} on ${page} is not absolute`).toBe(true);
      /*
       * The query string and the fragment are cut off, because they are not
       * part of the path the host serves: `/program.ics?v=2` delivers
       * exactly this file. The pattern above must be WIDE, so a broken
       * reference cannot slip through unchecked; here it must be EXACT, so a
       * correct reference does not fail for nothing. Width and strictness do
       * not belong in the same place. `/program.ics/` is not touched by this
       * cut and still fails — a directory path is not a file.
       */
      const path = href.slice(1).split(/[?#]/)[0] as string;
      expect(read(path), `${href} on ${page}`).toContain('BEGIN:VCALENDAR');
    }
  });

  /*
   * The two above count the references and follow them to the file. Neither
   * can tell an anchor apart from a `<link>`: a deleted button and a stray
   * `<link>` put in its place both keep the count at three and both
   * resolve. This one names the anchors by their TEXT, meaning by what
   * someone clicks.
   *
   * Its first form — "the schedule page has an .ics link" — was true even
   * with the button deleted entirely, because the `<link rel="alternate">`
   * from `Base.astro` sits in the `<head>` of every page. An assertion that
   * cannot fail is worse than none: it looks like it is guarding something.
   */
  /*
   * INDEXING AND THE CANONICAL ARE ONE DECISION WITH TWO CONSEQUENCES, and a
   * half-flipped build is what this guards against.
   *
   * In Phase 1 the site sits at `<project>.pages.dev`, while `www.bor-zh.ch`
   * still answers with the compromised WordPress install. So there is no
   * canonical worth emitting — the one `Astro.site` would have given
   * pointed search engines straight at that very install — and the
   * temporary host has no business being in an index. `INDEXABLE` in
   * `lib/site.ts` decides both, and this test checks both directions: with
   * the flag at `false` every page has a noindex meta tag and no canonical,
   * with it at `true` exactly the opposite. This way one cannot flip
   * without the other when the domain moves.
   */
  it('every visitor page matches INDEXABLE, in both directions', () => {
    /*
     * `admin/index.html` is deliberately outside this test, and stays that
     * way. It does not go through `Base.astro`, it carries its own
     * `noindex, nofollow` plus `X-Robots-Tag` from `_headers`, and it must
     * stay unindexed FOREVER — including after the domain moves, when the
     * flag flips. Without this exclusion, the test would demand, at the
     * move, a canonical on the CMS shell and no noindex on it, which is
     * exactly backwards.
     */
    const pages = builtPages().filter((p) => p !== 'admin/index.html');
    expect(pages.length, 'dist/ contains no visitor page at all').toBeGreaterThan(0);
    expect(builtPages(), 'admin/index.html really must exist, or the exclusion means nothing')
      .toContain('admin/index.html');
    const canonicals: string[] = [];
    for (const page of pages) {
      const html = read(page);
      const canonical = [...html.matchAll(/<link\b[^>]*rel="canonical"[^>]*href="([^"]*)"/g)].map((m) => m[1] as string);
      const noindex = /<meta\b[^>]*name="robots"[^>]*content="[^"]*noindex/.test(html);
      expect(canonical.length, `canonicals on ${page}`).toBe(INDEXABLE ? 1 : 0);
      expect(noindex, `meta robots noindex on ${page}`).toBe(!INDEXABLE);
      canonicals.push(...canonical);
    }
    /*
     * What is not checked here is which HOST the canonical names. After the
     * domain move `www.bor-zh.ch` will be this very site, so it would be the
     * right host; today it would be the compromised one. The difference is
     * not in the output, but in what DNS serves, and no test in this
     * repository can see that. What can be held is the coupling: as long as
     * we are not indexable, no canonical is emitted.
     */
    process.stdout.write(
      `\nINDEXABLE=${INDEXABLE} over ${pages.length} visitor page(s): ` +
        `${canonicals.length} canonical(s), ${INDEXABLE ? 0 : pages.length} noindex meta.\n`,
    );
  });

  it('keeps the subscribe anchors somebody actually clicks', () => {
    const labels = [
      ...read('program/index.html').matchAll(/<a\b[^>]*href="\/program\.ics"[^>]*>([\s\S]*?)<\/a>/g),
    ].map((m) => (m[1] as string).trim());
    expect(labels).toContain('† Adaugă programul în calendarul telefonului');
    expect(labels).toContain('Abonare la program (.ics)');
  });
});
