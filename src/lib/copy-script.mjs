/*
 * The whole client side of the IBAN copy button, as a string.
 *
 * WHY A STRING RATHER THAN A `<script>` IN `AccountBlock.astro`. Astro bundles
 * a plain `<script>` and emits it as a module, which the CSP would then have to
 * name by hash; `is:inline` passes this text through untouched, and
 * `EXPECTED_INLINE` in `scripts/csp-hash.mjs` names the one copy on each route
 * by its `data-copy` marker. Keeping the text here means the route files hold
 * the emission and this file holds the code, so the two can be tested apart.
 *
 * PROGRESSIVE ENHANCEMENT IS THE CONTRACT, AND REVEALING IS THE ENHANCEMENT.
 * The button ships `hidden` and this script unhides it. Without JavaScript the
 * IBAN text is visible and selectable and the button does not exist - which is
 * the designed state, not a degraded one. Never the reverse: a script that
 * hid anything would make the no-JS page worse than the one with it.
 *
 * ONE LISTENER, NOT ONE PER BUTTON, and `closest` is why. `/doneaza` renders
 * three accounts, so a handler that looked up `[data-copy]` page-wide would
 * copy the first account's IBAN whichever button was pressed - a wrong answer
 * with no visible symptom until somebody paid the wrong account. `closest`
 * walks up from the element that was actually clicked, so each button copies
 * its own value.
 *
 * No imports, no module syntax: `is:inline` ships this as a classic script.
 * `copy-script.test.ts` holds the byte ceiling and that property.
 */
export const COPY_SCRIPT = `
for (const button of document.querySelectorAll('[data-copy]')) button.hidden = false;
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-copy]');
  if (!button) return;
  navigator.clipboard.writeText(button.dataset.copy).then(() => {
    const label = button.textContent;
    button.textContent = 'Copiat';
    setTimeout(() => { button.textContent = label; }, 2000);
  });
});
`;
