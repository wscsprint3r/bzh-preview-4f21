/**
 * Pages entries whose URL is built by a dedicated route, not by `[...page].astro`.
 *
 * `/contact` and `/doneaza` are prose pages like the other nine, and they are
 * reserved because each grows generated blocks (accounts, the QR-bill, the
 * form) that the generic prose route has no business knowing about.
 *
 * ONE LIST, IMPORTED BY BOTH SIDES. `[...page].astro`'s `getStaticPaths` skips
 * exactly these, and each dedicated route owns exactly its own, so a page
 * cannot be built twice - which is a route collision - or skipped, which is a
 * page in the CMS with no page on the site. `routes.test.ts` pins both
 * directions against `src/pages/` and the content files.
 */
export const RESERVED_PATHS: ReadonlySet<string> = new Set(['contact', 'doneaza']);
