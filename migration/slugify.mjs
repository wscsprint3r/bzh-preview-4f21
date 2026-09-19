/**
 * The one slug function for migrated documents, and the reason it is explicit.
 *
 * `slugify` is NOT a general-purpose slugger and must not become one: it maps
 * the six Romanian letters by codepoint BEFORE NFD, because the comma-below
 * forms (U+0218/U+0219, U+021A/U+021B) do not decompose - NFD leaves them as
 * single codepoints, `\p{M}` strips nothing, and the filename would silently
 * lose a letter rather than fail. The a-breve, a-circumflex and i-circumflex
 * forms do decompose, and are mapped here anyway so the set is one rule a
 * reader can check rather than a mixture of explicit and implicit handling.
 *
 * The output is what `documentSchema` accepts for `file`:
 * `^\/documente\/[a-z0-9-]+\.pdf$`, so a slug that carries anything else is a
 * failed migration rather than a document whose URL nobody can type.
 */

/** The six Romanian letters, by codepoint, and their ASCII replacements. */
const ROMANIAN_TO_ASCII = new Map([
  [0x0219, 's'],
  [0x021b, 't'],
  [0x0103, 'a'],
  [0x00e2, 'a'],
  [0x00ee, 'i'],
  [0x0218, 'S'],
  [0x021a, 'T'],
  [0x0102, 'A'],
  [0x00c2, 'A'],
  [0x00ce, 'I'],
]);

/**
 * A deterministic ASCII slug: lower-case letters, digits and single hyphens.
 *
 * Order matters. The explicit map runs first (it is the only thing that can
 * turn the comma-below letters into ASCII), then NFD and the mark strip handle
 * everything else that decomposes, then lower-casing, then every run of
 * non-alphanumerics becomes one hyphen and the edges are trimmed.
 */
export function slugify(value) {
  let mapped = '';
  for (const character of value) {
    mapped += ROMANIAN_TO_ASCII.get(character.codePointAt(0)) ?? character;
  }
  return mapped
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * The destination name of one source file, without its directory or extension.
 *
 * `treePrefix` is passed only when a collision needs resolving: two source files
 * whose slugs collide both gain the tree they came from, so a single file keeps
 * the bare slug it would have had alone. The prefix is a whole slug segment
 * (`files-pastorala-2020`, never `files--pastorala-2020`), and the collision
 * check itself lives in `resolveSlugs` in `./documents.mjs`, which is where the
 * whole corpus is visible at once.
 */
export function documentSlug(relativePath, treePrefix) {
  const base = relativePath.split('/').pop().replace(/\.pdf$/i, '');
  const slug = slugify(base);
  return treePrefix ? `${treePrefix}-${slug}` : slug;
}
