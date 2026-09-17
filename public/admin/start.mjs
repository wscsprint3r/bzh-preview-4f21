/*
 * Starts the CMS. This file is the reason `/admin/` is not a blank white page.
 *
 * SVELTIA DOES NOT START ITSELF HERE, and it fails to in complete silence. The
 * last line of the bundle reads, in effect,
 *
 *     !window.CMS_MANUAL_INIT && (document.currentScript || classicScript) && init()
 *
 * and `document.currentScript` is null BY SPECIFICATION inside a module script,
 * while `classicScript` is a lookup for a `<script src="…/sveltia-cms.js">`
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
/**
 * WHO A VOLUNTEER SHOULD TELL. Replace with a name and an address as soon as
 * there is one - "lui Ion Popescu (ion@exemplu.ch)" reads correctly in the
 * sentence below, which is written in the dative for exactly that reason.
 *
 * It says a ROLE rather than a name today because inventing a name would be
 * worse than describing one: a volunteer who writes to an address nobody reads
 * has done everything right and still got nowhere.
 */
const CONTACT = 'persoanei care se ocupă de site';

/*
 * IMPORTED DYNAMICALLY so that ONE handler covers both ways this can fail.
 *
 * A static `import` of a bundle that is not there fails before any code in this
 * file runs: the console gets a 404 and the page gets nothing on it. The bundle
 * is git-ignored and written by an Astro integration, so it is there whenever
 * this repository built the page - but that is not the only way to arrive here.
 * It can be stopped by a Content-Security-Policy, cut short by a half-finished
 * deploy, or answered with a host's 404 page. With the import inside the promise
 * chain, every one of those and a failing `init()` land in the same `catch` and
 * produce the same sentence.
 */
import('./sveltia-cms.mjs')
  .then(({ init }) => init())
  .catch((error) => {
    /*
     * A volunteer looking at a white page has nothing to report, no way to tell
     * "broken" from "slow", and no idea whether they have just broken the
     * parish's website. So this says four things, in that order: what happened,
     * that the site itself is untouched, what to try, and WHO TO TELL if that
     * fails. The technical reason goes underneath, where it turns a phone call
     * into a bug report without being the first thing they read.
     */
    console.error(error);
    const message = document.createElement('p');
    message.lang = 'ro';
    message.textContent =
      'Administrarea nu a pornit. Programul de pe site nu este afectat și nu ' +
      's-a pierdut nimic. Încercați să reîncărcați pagina. Dacă tot nu merge, ' +
      `trimiteți textul de mai jos ${CONTACT}.`;
    const detail = document.createElement('pre');
    detail.textContent = String(error);
    document.body.append(message, detail);
  });
