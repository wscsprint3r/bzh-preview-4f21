/*
 * The Romanian failure notice, as a GitHub workflow annotation.
 *
 * WHAT THIS CAN AND CANNOT DO, said plainly because the difference is the
 * whole design. Spec §16 asks for a failure hook that e-mails the editor in
 * Romanian; the only e-mail GitHub sends is its own, in English, and this
 * repository cannot change it. What it CAN do is put the Romanian text at the
 * top of the run page the e-mail links to — `::error::` annotations render
 * there — so README's instruction ("open the link and read what is at the top")
 * is true. The e-mail itself is a Phase 5 item once K2's Resend domain is
 * verified; `docs/handover.md` carries it as a gap.
 *
 * ESCAPING IS GITHUB'S, NOT OURS: `%` becomes `%25`, newline `%0A`, carriage
 * return `%0D`. An annotation is one line; an unescaped newline truncates it.
 */
export function escapeAnnotation(text) {
  return text.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

/** The one annotation a failed budget prints. `pages` are dist-relative paths. */
export function budgetAnnotation(pages, explanation) {
  const named = pages.length > 0 ? `Pagini: ${pages.join(', ')}.` : '';
  return `::error::${escapeAnnotation(
    ['Bugetul de performanță a fost depășit.', named, explanation].filter(Boolean).join('\n'),
  )}`;
}

/*
 * The annotation a refused upload prints, before the build stops.
 *
 * WHY THE UPLOADS STEP NEEDS ONE AT ALL. The sanitiser fails the build when a
 * file it cannot decode lands in `public/uploads/` — a volunteer's PDF dragged
 * into the CMS asset library, say. The throw is right (a silently dropped
 * upload 404s a page that looked fine at save time) but on its own it reaches
 * the editor as GitHub's English "run failed", which is the situation spec §16
 * exists for. This is the same `::error::` channel the budget uses, so the
 * run page the failure e-mail links to carries the Romanian sentence at its
 * top. The technical reason stays in the thrown error, for whoever reads the
 * log.
 */
export function uploadAnnotation(file) {
  return `::error::${escapeAnnotation(
    [
      `Fișierul încărcat nu poate fi publicat: ${file}.`,
      'Site-ul publică doar imagini (JPEG, PNG, WebP, AVIF).',
      'Ștergeți fișierul din /uploads/ sau înlocuiți-l cu o fotografie, apoi rulați din nou publicarea.',
    ].join('\n'),
  )}`;
}