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