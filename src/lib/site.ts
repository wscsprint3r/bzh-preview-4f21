/**
 * Whether this build is the one search engines should index.
 *
 * ===========================================================================
 * IT IS `false` BECAUSE OF WHERE PHASE 1 LIVES, NOT BECAUSE OF WHAT IT IS.
 *
 * Until the DNS cutover, this site is served from `https://<project>.pages.dev/`
 * while `https://www.bor-zh.ch/` still answers with the WordPress install that
 * was compromised twice in eighteen months. Two things followed from that, and
 * both were wrong:
 *
 *   - the Pages deployment was crawlable. Cloudflare marks PREVIEW deployments
 *     noindex; the production one is not, so the parish's real schedule was
 *     indexable at a temporary hostname that will stop existing.
 *   - every page declared `rel=canonical` at `https://www.bor-zh.ch/…`, built
 *     from `Astro.site`. That is the correct final URL and, today, an
 *     instruction to search engines that the authoritative copy of this page is
 *     on the compromised install. Nothing in this project may point anyone at
 *     that host, least of all a crawler.
 *
 * ONE FLAG FOR BOTH, because they are one decision and two consequences, and
 * because a build that is half-flipped is the failure worth preventing:
 *
 *   `false` -> every page carries `<meta name="robots" content="noindex">` and
 *              NO canonical. There is no correct canonical to emit: the host
 *              this build is served from is not the host it names, and the host
 *              it names serves someone else's site.
 *   `true`  -> the canonical comes back and the meta goes away.
 *
 * `build-output.itest.ts` asserts every built page agrees with this flag, in
 * both directions, so neither consequence can be flipped without the other.
 *
 * NO `robots.txt` WITH `Disallow: /`, AND THAT IS THE TRAP TO NAME. Disallowing
 * the path stops a crawler FETCHING the page, which means it never reads the
 * `noindex` it was sent to obey - so a URL already known, or linked from
 * anywhere, can stay indexed with no content. To keep something out of an index
 * you must let it be crawled and tell it not to be indexed. That is what this
 * does.
 *
 * FLIPPING IT IS A CUTOVER STEP, and it is in `docs/handover.md` under the DNS
 * move. Leaving it `false` after the domain points here is the failure this note
 * exists for: the site would be live, correct, and invisible to every search
 * engine, with nothing failing anywhere. Spec §15 owns the cutover; this is one
 * line of it.
 * ===========================================================================
 */
export const INDEXABIL = false;
