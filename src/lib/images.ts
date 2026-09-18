import type { ImageMetadata } from 'astro';

const MODULES = import.meta.glob<ImageMetadata>('/src/assets/**/*.{jpeg,jpg,png,webp,avif}', {
  eager: true,
  import: 'default',
});

/** The repository path a migration-written frontmatter value names, or null. */
export function imageKey(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.startsWith('/')) return null;
  const at = trimmed.indexOf('assets/');
  if (at === -1 || /^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null;
  const key = `src/${trimmed.slice(at)}`;
  return key.includes('/../') ? null : key;
}

/** The served URL a CMS upload names, or null. `/src/…` is not one. */
export function publicUpload(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith('/uploads/')) return null;
  const rest = trimmed.slice('/uploads/'.length);
  if (rest === '' || rest.includes('..') || rest.includes('//')) return null;
  return trimmed;
}

export function resolveImage(value: string): ImageMetadata | null {
  const key = imageKey(value);
  if (key === null) return null;
  return MODULES[`/${key}`] ?? null;
}
