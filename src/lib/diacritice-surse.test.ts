import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CEDILE, areVirgulaDedesubt, cedileIn, uPlus } from './cedile';

/*
 * WHAT THIS PROVES: no file this repository tracks contains a Turkish cedilla
 * where Romanian wants a comma below - in an input, not only in the output.
 *
 * `CLAUDE.md` states this as non-negotiable and explains what it buys: the four
 * forbidden characters "are named by number and never printed as glyphs anywhere
 * in this repository, including here: a file that spelled them out could not be
 * swept for them, and nothing in it could be copied without carrying one."
 *
 * THE RULE WAS FALSE WHEN IT WAS WRITTEN, and stayed false for the whole of
 * Phase 1. Two tracked files printed all four as glyphs - `date-ro.test.ts`,
 * whose guard was a character class of them, and the plan document, in the very
 * paragraph forbidding them. Twenty-one occurrences. So a full codepoint scan of
 * the sources returned hits a reader had to learn to ignore, which is the
 * habit the rule exists to prevent, and the repo-wide sweep it was written to
 * enable could not be run at all. This file is that sweep.
 *
 * WHY THE SOURCES AND NOT ONLY `dist/`. `diacritice.itest.ts` reads the built
 * output, which is the right subject for "what does a parishioner see": it is
 * where a `praznic:` a volunteer typed becomes text on a page. It cannot see an
 * input that never reaches a page - and a corrupted EXPECTATION in a test is
 * exactly that. A guard whose expected value carried a cedilla would agree,
 * silently and forever, with a source that carried one too. Neither sweep
 * subsumes the other.
 *
 * WHY ONLY THIS QUESTION HERE. `diacritice.itest.ts` also asks the stronger one -
 * is every non-ASCII character one this project expects - against a list of
 * twenty-two. That works over `dist/`, whose whole vocabulary is Romanian copy
 * plus a handful of typographic marks. It does not transfer: the tracked sources
 * carry over thirty distinct non-ASCII characters between English prose, Romanian
 * comments, box-drawing in documents and deliberate astral test fixtures, and an
 * allowlist that large is a list nobody reads. Stated as a gap rather than
 * pretended away: a stray look-alike from another alphabet in a SOURCE file is
 * not caught here. One was introduced and caught by measurement while this very
 * file was being written - a Cyrillic U+0435 in an identifier - which is the
 * evidence for the gap rather than an argument against the sweep.
 *
 * THE SUBJECT COMES FROM git, not from a list written here, and that is the one
 * place this guard follows the artifact instead of holding it to a fixed
 * expectation. That is deliberate and it is the same exception `a11y.mjs` makes
 * for breakpoints: the property being checked IS that the sweep covers whatever
 * the repository now contains, so a list of paths would be the thing that
 * decayed. What is held fixed is the set of forbidden characters, which lives in
 * `./cedile` as numbers.
 */

const RADACINA = fileURLToPath(new URL('../../', import.meta.url));

/**
 * Every file the repository tracks, as paths relative to the root.
 *
 * `git ls-files`, so what is swept is what is committed. Untracked and ignored
 * files are outside on purpose and both halves matter: `public/admin/` holds the
 * vendored Sveltia bundle, whose own i18n tables legitimately contain Turkish,
 * and `.superpowers/` is scratch - the SDD ledger and raw review diffs, which
 * quote the corrupted characters as evidence and must be able to. Neither ships,
 * and neither is ours.
 */
function fisiereUrmarite(): string[] {
  return execFileSync('git', ['ls-files', '-z'], { cwd: RADACINA, encoding: 'utf8' })
    .split('\0')
    .filter((cale) => cale !== '');
}

/*
 * The tracked files that are BYTES rather than text, named one by one.
 *
 * Listed by exact path rather than by extension, so a `.svg` that is text stays
 * swept and a new binary has to be looked at by a person. The case below fails on
 * any tracked file that is neither on this list nor decodable as UTF-8 text, so
 * the list cannot fall behind the repository the way `FARA_EXTENSIE` once fell
 * behind the build.
 */
const BINARE = ['public/favicon.ico'];

/** Whether a file's bytes are text: valid UTF-8 and no NUL. */
function eText(cale: string): boolean {
  const octeti = readFileSync(RADACINA + cale);
  if (octeti.includes(0)) return false;
  const text = octeti.toString('utf8');
  return Buffer.byteLength(text, 'utf8') === octeti.length;
}

const URMARITE = fisiereUrmarite();
const DE_MATURAT = URMARITE.filter((cale) => !BINARE.includes(cale));

describe('măturarea chiar are ce mătura', () => {
  // A guard that reads files must prove it read something. Without these, a
  // `git ls-files` that returned nothing would make every case below pass
  // vacuously - the shape this project has paid for more than once.
  it('git chiar întoarce fișiere urmărite', () => {
    expect(URMARITE.length).toBeGreaterThan(50);
  });

  it('cuprinde sursele, testele, documentele și fișierele CMS-ului', () => {
    // Numite pe cale: „mătură tot” ar fi adevărat și despre o listă din care a
    // căzut tocmai felul de fișier în care ajunge o sedilă.
    for (const cale of [
      'src/lib/date-ro.ts',
      'src/lib/date-ro.test.ts',
      'src/pages/index.astro',
      'src/content/slujbe/2026-09-14.yml',
      'public/admin/config.yml',
      'public/_headers',
      'docs/superpowers/plans/2026-09-15-phase-1-schedule-and-cms.md',
      'AGENTS.md',
    ]) {
      expect(DE_MATURAT, cale).toContain(cale);
    }
  });

  it('nu lasă afară niciun fișier urmărit pe care nimeni nu l-a numit binar', () => {
    const nedecodabile = DE_MATURAT.filter((cale) => !eText(cale));
    expect(
      nedecodabile,
      `fișiere urmărite care nu se citesc ca text: ${nedecodabile.join(', ')}. ` +
        'Dacă sunt binare, pune-le în BINARE; dacă nu, află de ce nu se decodează.',
    ).toEqual([]);
  });

  it('fiecare cale din BINARE chiar este un fișier urmărit', () => {
    // Cealaltă direcție: o excepție pentru un fișier care nu mai există rămâne în
    // cod arătând ca o regulă, gata să scuze altceva cu același nume.
    for (const cale of BINARE) expect(URMARITE, cale).toContain(cale);
  });

  it('sursele chiar conțin virgulă dedesubt', () => {
    // Altfel „nicio sedilă” ar fi adevărat despre un corpus întâmplător ASCII —
    // aceeași formă ca un `dist/` lipsă.
    const tot = DE_MATURAT.map((cale) => readFileSync(RADACINA + cale, 'utf8')).join('');
    expect(areVirgulaDedesubt(tot)).toBe(true);
  });
});

describe('detectorul se declanșează pe fiecare dintre cele patru', () => {
  // Control pozitiv, construit din numere ca și setul căutat: o gardă care nu
  // poate să se declanșeze nu verifică nimic.
  it.each(CEDILE)('prinde %i', (cp) => {
    const rau = `Înăl${String.fromCodePoint(cp)}area`;
    expect(cedileIn(rau)).toHaveLength(1);
    expect(cedileIn(rau)[0]).toContain(uPlus(cp));
  });
});

describe('nicio sedilă turcească în fișierele urmărite', () => {
  it('niciunul dintre ele', () => {
    const gasite = DE_MATURAT.flatMap((cale) =>
      cedileIn(readFileSync(RADACINA + cale, 'utf8')).map((unde) => `${cale}: ${unde}`),
    );
    // Tipărit, nu doar verificat, fiindcă numărul este ce verifică un cititor de
    // mai târziu dacă un comentariu îl contrazice. `console.log` nu se vede pe
    // rularea verde; `process.stdout.write` trece prin reporter în ambele cazuri.
    process.stdout.write(
      `\nMăturate pentru sedile: ${DE_MATURAT.length} fișier(e) urmărite ` +
        `(din ${URMARITE.length}; ${BINARE.length} binar(e) numit(e)) — ${gasite.length} apariție(i).\n`,
    );
    expect(
      gasite,
      `cele patru caractere interzise, scrise ca glife în fișiere urmărite:\n${gasite.join('\n')}\n` +
        'Scrie-le pe cod — String.fromCodePoint(0x…) în cod, U+015F în proză. ' +
        'Un fișier care le scrie nu mai poate fi măturat pentru ele.',
    ).toEqual([]);
  });
});

/*
 * ===========================================================================
 * "THE FOUR NUMBERS LIVE IN ONE PLACE" - A SENTENCE UNTIL THIS BLOCK.
 *
 * `CLAUDE.md` states it as part of the rule it calls non-negotiable: the four
 * forbidden codepoints "are named by number" and "the four numbers and the
 * detector live in one place, `src/lib/cedile.ts`". It was false in three files
 * at once - `diacritice.itest.ts` carried two of them in a fixture, and
 * `CLAUDE.md` itself carried one in the example showing how to build a character
 * from a number. All three were legitimate uses. That is the point: nobody wrote
 * a second copy on purpose, which is why a sentence was never going to hold it.
 *
 * WHAT IT COSTS when it is false is small and specific, and it is the same thing
 * the glyph rule protects: somebody sweeping the repository for the hex spelling
 * of one of them, to see where the forbidden set is defined, finds three files,
 * has to judge each, and learns to wave hits through - which is the habit both
 * rules exist to prevent.
 *
 * SCOPE, SAID RATHER THAN IMPLIED. This looks for the HEXADECIMAL spellings,
 * which is how every codepoint in this repository is written, and it is built
 * from `CEDILE` so this file names none of them. A decimal spelling would not be
 * caught: measured, the four decimal values appear zero times in tracked files
 * today, and a scan for them would collide with ordinary byte counts in reports -
 * a check that cries wolf is a check somebody relaxes. `U+015F` IN PROSE IS NOT A
 * COPY and is deliberately not swept: naming the characters by number in words is
 * exactly what the rule asks for.
 * ===========================================================================
 */

/** Where the four numbers are allowed to be written. */
const CASA_NUMERELOR = 'src/lib/cedile.ts';

/**
 * Every hexadecimal spelling of the four codepoints in `text`, with its offset.
 *
 * Built from `CEDILE`, like everything else here, so this file can be swept by
 * its own rule. `0x` then any number of leading zeros then the hex digits, so
 * the spelling with a leading zero and the one without are both found.
 */
export function numereScriseIn(text: string): string[] {
  const gasite: string[] = [];
  for (const cp of CEDILE) {
    const tipar = new RegExp(`0x0*${cp.toString(16)}\\b`, 'gi');
    for (const m of text.matchAll(tipar)) gasite.push(`${uPlus(cp)} ca ${m[0]} la ${m.index}`);
  }
  return gasite.sort();
}

describe('cele patru numere sunt scrise într-un singur fișier', () => {
  it('detectorul chiar se declanșează, pe fiecare dintre cele patru', () => {
    // Control pozitiv, construit din numere ca și setul căutat.
    for (const cp of CEDILE) {
      const rau = `const X = [0x${cp.toString(16)}];`;
      expect(numereScriseIn(rau), uPlus(cp)).toHaveLength(1);
    }
    // Și cealaltă direcție: virgula dedesubt nu este unul dintre ele.
    expect(numereScriseIn('String.fromCodePoint(0x0219)')).toEqual([]);
    // `U+015F` în proză nu este o copie a numărului și nu se mătură.
    expect(numereScriseIn(`${uPlus(CEDILE[0])} in prose`)).toEqual([]);
  });

  it('casa numerelor chiar le conține — altfel regula ar fi despre nimic', () => {
    expect(DE_MATURAT, CASA_NUMERELOR).toContain(CASA_NUMERELOR);
    const acasa = numereScriseIn(readFileSync(RADACINA + CASA_NUMERELOR, 'utf8'));
    expect(acasa.length, `${CASA_NUMERELOR} nu mai scrie cele patru numere`).toBe(CEDILE.length);
  });

  it('niciun alt fișier urmărit nu le mai scrie', () => {
    const gasite = DE_MATURAT.filter((cale) => cale !== CASA_NUMERELOR).flatMap((cale) =>
      numereScriseIn(readFileSync(RADACINA + cale, 'utf8')).map((unde) => `${cale}: ${unde}`),
    );
    process.stdout.write(
      `\nCele patru numere, scrise în hexazecimal: ${CASA_NUMERELOR} le are pe toate ${CEDILE.length}; ` +
        `restul celor ${DE_MATURAT.length - 1} fișiere urmărite — ${gasite.length} apariție(i).\n`,
    );
    expect(
      gasite,
      `cele patru numere, scrise în afara lui ${CASA_NUMERELOR}:\n${gasite.join('\n')}\n` +
        'Importă-le din ./cedile. Un al doilea exemplar face ca o măturare după numărul lor să ' +
        'întoarcă mai multe fișiere, iar cititorul să se obișnuiască să treacă peste rezultate.',
    ).toEqual([]);
  });
});
