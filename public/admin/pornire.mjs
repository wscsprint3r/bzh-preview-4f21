/*
 * Starts the CMS. This file is the reason `/admin/` is not a blank white page.
 *
 * SVELTIA DOES NOT START ITSELF HERE, and it fails to in complete silence. The
 * last line of the bundle reads, in effect,
 *
 *     !window.CMS_MANUAL_INIT && (document.currentScript || scriptulClasic) && init()
 *
 * and `document.currentScript` is null BY SPECIFICATION inside a module script,
 * while `scriptulClasic` is a lookup for a `<script src="…/sveltia-cms.js">`
 * that this page does not have. So `<script type="module" src="sveltia-cms.mjs">`
 * on its own downloads two megabytes, raises nothing, logs nothing, and leaves
 * the page exactly as it found it. Verified in a real headless Chrome; no
 * amount of reading the HTML would have shown it.
 *
 * WHY THE MODULE AND NOT THE CLASSIC BUILD. The documented install is
 * `<script src="sveltia-cms.js">`, which does auto-start, and it was tried and
 * works. This is the other supported route - the package's `exports` field
 * publishes the module, and the docs point package-manager installs at manual
 * initialization - and it is preferred for one reason: a future version that
 * changes how it auto-starts would leave `/admin/` white in exactly the same
 * silence, while a missing `init` export fails here, by name, on the console.
 *
 * Tracked in git. Everything else vendored into this folder is not - see
 * `scripts/copy-cms.mjs`.
 */
/*
 * IMPORTED DYNAMICALLY so that ONE handler covers both ways this can fail.
 *
 * A static `import` of a bundle that is not there fails before any code in this
 * file runs: the console gets a 404 and the page gets nothing. And the bundle IS
 * missing more often than it looks - it is git-ignored and copied by `prebuild`
 * and `predev`, so a fresh clone, or a dev server started with `astro dev`
 * rather than `npm run dev`, has an `/admin/` with no CMS inside it. With the
 * import inside the promise chain, that case and a failing `init()` land in the
 * same `catch` and produce the same sentence.
 */
import('./sveltia-cms.mjs')
  .then(({ init }) => init())
  .catch((eroare) => {
    /*
     * A volunteer looking at a white page has nothing to report, and no way to
     * tell "broken" from "slow". This gives them a sentence in Romanian and the
     * reason underneath it, which is what turns a phone call into a bug report.
     */
    console.error(eroare);
    const mesaj = document.createElement('p');
    mesaj.lang = 'ro';
    mesaj.textContent =
      'Administrarea nu a pornit. Reîncărcați pagina; dacă nici așa nu merge, ' +
      'trimiteți parohiei textul de mai jos.';
    const detaliu = document.createElement('pre');
    detaliu.textContent = String(eroare);
    document.body.append(mesaj, detaliu);
  });
