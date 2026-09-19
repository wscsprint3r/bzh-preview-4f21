/*
 * The whole client side of the contact form, as a string.
 *
 * WHY A STRING RATHER THAN A `<script>` IN `ContactForm.astro`. Astro bundles a
 * plain `<script>` and emits it as a module, which the CSP would then have to
 * name by hash; `is:inline` passes this text through untouched, and
 * `EXPECTED_INLINE` in `scripts/csp-hash.mjs` names the one copy on `/contact/`
 * by its `data-contact-form` marker. Keeping the text here means the component
 * holds the emission and this file holds the code, so the two can be tested
 * apart - the same split as `copy-script.mjs`.
 *
 * THE FORM IS A PLAIN POST AND THIS SCRIPT IS THE ENHANCEMENT, NOT THE DESIGN.
 * Without it the browser navigates to `/api/contact`, which answers JSON, and
 * the `<noscript>` paragraph tells the visitor to call instead - Turnstile
 * cannot produce a token without JavaScript, so the Function would refuse the
 * submission anyway. With it the result is written in place and the page does
 * not move.
 *
 * TURNSTILE TOKENS ARE SINGLE USE, SO EVERY FAILURE RESETS THE WIDGET. After a
 * Resend 502, or any retry, the token the form already sent is consumed:
 * siteverify answers `timeout-or-duplicate` and every further attempt fails
 * with the security sentence until the page is reloaded. `turnstile.reset()`
 * is what turns one failed attempt into an attempt rather than a dead form.
 * The guard checks the global because the widget script is deferred and a
 * page could, in principle, have failed to load it.
 *
 * No imports, no module syntax: `is:inline` ships this as a classic script.
 */
export const CONTACT_SCRIPT = `
const form = document.querySelector('[data-contact-form]');
if (form) {
  const status = document.querySelector('[data-contact-status]');
  const button = form.querySelector('button[type="submit"]');
  const reset = () => { if (window.turnstile) window.turnstile.reset(); };
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    button.disabled = true;
    status.textContent = 'Se trimite…';
    fetch(form.action, { method: 'POST', body: new FormData(form) })
      .then((response) => response.json().then((body) => ({ response, body })))
      .then(({ response, body }) => {
        if (response.ok && body.ok) {
          form.hidden = true;
          status.textContent = 'Mesajul a fost trimis. Vă mulțumim!';
          return;
        }
        reset();
        button.disabled = false;
        status.textContent =
          body.error ||
          Object.values(body.errors || {})[0] ||
          'Mesajul nu a putut fi trimis. Vă rugăm să încercați din nou sau să ne sunați.';
      })
      .catch(() => {
        reset();
        button.disabled = false;
        status.textContent = 'Mesajul nu a putut fi trimis. Vă rugăm să încercați din nou sau să ne sunați.';
      });
  });
}
`;
