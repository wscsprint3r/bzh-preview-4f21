/*
 * The only audit that ever sees the week picker's bar.
 *
 * ===========================================================================
 * WHY A SEPARATE BUILD, AND WHY IT CANNOT BE FOLDED INTO THE OTHER PASSES.
 *
 * `SelectorSaptamana` reveals its bar only when the page renders TWO OR MORE
 * weeks - `sectiuni.length > 1` - because with one week both arrows would be
 * disabled and the bar would restate the heading beneath it. The parish's
 * published schedule is one week for most of the year, so on almost every real
 * build the bar stays `hidden`, and axe skips hidden elements. Its label
 * contrast, its arrows' accessible names and its focus ring are checked by
 * nothing at all.
 *
 * So this builds the site a second time, into a scratch directory, with
 * `src/lib/fixturi.ts`'s multi-week days as the content, audits that, and
 * deletes it. The fixtures are built through `ziSchema`, so they can only
 * contain days the CMS could actually produce; and because the build is
 * temporary, NO INVENTED LITURGICAL CONTENT EVER REACHES `src/content/slujbe/`,
 * which stays the parish's real published schedule. Nothing here writes to the
 * repository.
 * ===========================================================================
 *
 * THE FIXTURE DATES ARE SHIFTED BY WHOLE WEEKS, and that is what keeps this
 * pass alive. Both pages render only weeks that are not yet over, so the fixed
 * dates in `fixturi.ts` stop producing two future weeks at the end of 2026 -
 * after which the bar would stay hidden and this pass would audit nothing while
 * still reporting a pass. The offset is the whole number of weeks between
 * `AZI_FIXTURA`'s Monday and today's Monday, so every weekday, the deliberate
 * gap week and the ordering survive it exactly; today that offset is usually
 * zero and the fixture is used verbatim. The offset is printed, and the checks
 * below fail if the bar is not actually there.
 *
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
import { cpSync, mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Key } from 'selenium-webdriver';
import { build } from 'esbuild';
import { stringify } from 'yaml';
import { auditeaza, CONDITII } from './a11y.mjs';

const RADACINA = process.cwd();
const MS_PE_ZI = 86_400_000;

/*
 * `fixturi.ts` and `week.ts` are TypeScript with extensionless imports, which
 * Node cannot load. esbuild bundles them into one ES module in the scratch
 * directory and that is imported - the same compiler Astro and Vitest already
 * use on these files, so what runs here is what the site and the tests run.
 */
async function bundle(sursa, iesire) {
  await build({
    entryPoints: [join(RADACINA, sursa)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    // Nothing left external, so the module is self-contained and can live
    // outside the repository. `astro/zod` comes along; that is only a copy of
    // Zod inside a throwaway generator, never a second copy inside the site.
    outfile: iesire,
    logLevel: 'silent',
  });
  return import(pathToFileURL(iesire).href);
}

/** A fixture day as the YAML a volunteer's file would hold. No `data:` key: the filename is the date. */
function caYaml(zi) {
  const { data, ...restul } = zi;
  return stringify(restul, { lineWidth: 0 });
}

async function main() {
  /*
   * `realpathSync`, because on macOS `os.tmpdir()` is `/var/...`, a symlink to
   * `/private/var/...`. Vite resolves the project root through the symlink and
   * the module ids through it too, then fails to match them - measured, as
   * "No cached compile metadata found for .../index.astro" with a doubled path
   * in the message. Handing it the real path makes both spellings the same one.
   */
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'selector-')));
  try {
    const fixturi = await bundle('src/lib/fixturi.ts', join(scratch, 'fixturi.mjs'));
    const saptamana = await bundle('src/lib/week.ts', join(scratch, 'week.mjs'));
    const azi = saptamana.aziLaZurich();
    const decalaj = Math.round(
      (Date.parse(`${saptamana.inceputSaptamana(azi)}T00:00:00Z`) -
        Date.parse(`${saptamana.inceputSaptamana(fixturi.AZI_FIXTURA)}T00:00:00Z`)) /
        MS_PE_ZI,
    );
    if (decalaj % 7 !== 0) throw new Error(`Decalajul ${decalaj} nu e un număr întreg de săptămâni.`);

    const proiect = join(scratch, 'proiect');
    mkdirSync(proiect);
    for (const nume of ['src', 'public', 'scripts', 'astro.config.mjs', 'tsconfig.json', 'package.json']) {
      cpSync(join(RADACINA, nume), join(proiect, nume), { recursive: true });
    }
    // Symlinked, not copied: the fixture build must run the same Astro, the
    // same Sveltia bundle and the same fonts as the real one.
    symlinkSync(join(RADACINA, 'node_modules'), join(proiect, 'node_modules'));

    const continut = join(proiect, 'src/content/slujbe');
    rmSync(continut, { recursive: true, force: true });
    mkdirSync(continut, { recursive: true });
    const zile = fixturi.ZILE_FIXTURA.map((z) => ({ ...z, data: saptamana.adaugaZile(z.data, decalaj) }));
    for (const zi of zile) writeFileSync(join(continut, `${zi.data}.yml`), caYaml(zi));

    console.log(`Construcție de probă în ${proiect}`);
    console.log(`  azi ${azi} · AZI_FIXTURA ${fixturi.AZI_FIXTURA} · decalaj ${decalaj} zile`);
    console.log(`  ${zile.length} zi(le): ${zile.map((z) => z.data).join(', ')}`);

    execFileSync(process.execPath, [join(RADACINA, 'node_modules/astro/bin/astro.mjs'), 'build', '--root', proiect], {
      stdio: 'inherit',
      cwd: proiect,
    });

    /*
     * RETURNED, NOT `process.exit`ed. `process.exit` inside a `try` terminates
     * the process without unwinding, so the `finally` below never runs and every
     * run leaves a few megabytes of copied `public/` behind in the temp
     * directory. Found by counting four of them.
     */
    return await auditeaza({
      dist: join(proiect, 'dist'),
      conditii: [CONDITII.birou, CONDITII.telefon],
      eticheta: 'axe peste selectorul de săptămână (construcție de probă)',
      cerinta: verificaBara,
    });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/*
 * The checks that only this build can make. Returns null when everything holds,
 * or the first problem as a sentence.
 */
async function verificaBara(driver, conditie, url) {
  if (!conditie.js) return null; // the bar is revealed by script; without it there is nothing to check
  await driver.get(url('index.html'));

  const stare = await driver.executeScript(`
    const sectiuni = [...document.querySelectorAll('section[data-saptamana]')];
    const bara = document.querySelector('.ss');
    if (!bara) return { eroare: 'bara .ss lipsește din pagină' };
    const eticheta = bara.querySelector('[data-ss-eticheta]');
    const prev = bara.querySelector('[data-ss-prev]');
    const next = bara.querySelector('[data-ss-next]');
    return {
      sectiuni: sectiuni.length,
      vizibile: sectiuni.filter((s) => !s.hidden).length,
      baraAscunsa: bara.hidden,
      baraAfisata: getComputedStyle(bara).display,
      eticheta: eticheta ? eticheta.textContent.trim() : null,
      interval: (sectiuni.find((s) => !s.hidden) || {}).dataset?.interval ?? null,
      numePrev: prev ? prev.getAttribute('aria-label') : null,
      numeNext: next ? next.getAttribute('aria-label') : null,
      prevDezactivat: prev ? prev.disabled : null,
      culoarePrev: prev ? getComputedStyle(prev).color : null,
      culoareNext: next ? getComputedStyle(next).color : null,
    };
  `);

  if (stare.eroare) return stare.eroare;
  if (stare.sectiuni < 2) {
    return `construcția de probă a randat ${stare.sectiuni} săptămână(i); sub două, bara nu se arată și pasul nu verifică nimic. Fixturile trebuie împrospătate.`;
  }
  if (stare.baraAscunsa || stare.baraAfisata === 'none') {
    return `bara selectorului a rămas ascunsă (hidden=${stare.baraAscunsa}, display=${stare.baraAfisata}) — axe nu o vede.`;
  }
  if (stare.vizibile !== 1) return `selectorul lasă ${stare.vizibile} săptămâni vizibile, nu una.`;
  if (!stare.eticheta) return 'eticheta selectorului este goală.';
  if (stare.eticheta !== stare.interval) {
    return `eticheta („${stare.eticheta}”) nu este intervalul săptămânii afișate („${stare.interval}”).`;
  }
  if (!stare.numePrev || !stare.numeNext) return 'o săgeată a selectorului nu are nume accesibil.';
  if (stare.prevDezactivat !== true) {
    return 'săgeata „înapoi” nu este dezactivată pe prima săptămână, deci nu se poate verifica starea dezactivată.';
  }
  // Not a contrast claim: a disabled control is exempt from WCAG 1.4.3 and axe
  // skips it. This only asserts the state is visible as well as semantic.
  if (stare.culoarePrev === stare.culoareNext) {
    return `săgeata dezactivată are exact culoarea celei active (${stare.culoarePrev}) — starea nu se vede.`;
  }

  /*
   * THE FOCUS RING, WITH A REAL KEY PRESS. `:focus-visible` does not match on
   * programmatic focus, so `el.focus()` would read the unfocused outline and
   * agree with a deleted ring. Tabbing is what a keyboard user does.
   */
  let inel = null;
  for (let i = 0; i < 40; i += 1) {
    await driver.actions().sendKeys(Key.TAB).perform();
    inel = await driver.executeScript(`
      const a = document.activeElement;
      if (!a || !a.matches('.ss [data-ss-next]')) return null;
      const s = getComputedStyle(a);
      return { stil: s.outlineStyle, latime: s.outlineWidth, culoare: s.outlineColor, decalaj: s.outlineOffset };
    `);
    if (inel) break;
  }
  if (inel === null) return 'săgeata „înainte” nu a putut fi atinsă cu tasta Tab în 40 de pași.';
  if (inel.stil === 'none' || parseFloat(inel.latime) === 0) {
    return `săgeata „înainte” nu are inel de focalizare la navigarea cu tastatura (outline: ${inel.stil} ${inel.latime}).`;
  }
  console.log(
    `  selector: ${stare.sectiuni} săptămâni, una vizibilă, eticheta „${stare.eticheta}”; ` +
      `inel de focalizare ${inel.culoare} ${inel.stil} ${inel.latime} la ${inel.decalaj}; ` +
      `săgeata dezactivată ${stare.culoarePrev} față de ${stare.culoareNext}`,
  );
  return null;
}

process.exit((await main()) ? 0 : 1);
