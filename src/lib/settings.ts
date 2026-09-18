/**
 * The parish's own details, from the one file that holds them.
 *
 * `settings` is a COLLECTION with exactly one entry, because that is the shape
 * Astro's content layer can load and the CMS can edit. But it is a singleton in
 * intent, and the difference matters at the two places this function is called
 * — the footer on every page and the calendar feed's `LOCATION` — because both
 * would render perfectly without it: a footer with no address looks like a
 * design choice, and an `.ics` without one drops the property that tells a
 * subscriber where to drive.
 *
 * So a missing or doubled entry stops the build, here, where the file can be
 * named. The two messages are different on purpose: "there is none" and "there
 * are two" want different actions from whoever reads them, and only the first
 * has a file to point at.
 *
 * THE DIAGNOSTICS ARE ENGLISH. They are read by whoever runs the build, which
 * is the rule this repository applies to every build-time message; Romanian
 * stays for page copy and for the schema messages a volunteer sees in the CMS.
 *
 * SYNCHRONOUS, with no Astro import, so it is unit-tested without a build —
 * `getCollection` at each call site is the only asynchronous part.
 */
import type { Settings } from './content-schema';

/** The shape this needs from a settings entry: its data, and an id to name in errors. */
export interface SettingsEntry {
  id: string;
  data: Settings;
}

/**
 * The one settings entry's data, or a build-stopping error.
 *
 * Generic over the entry so `getCollection('settings')` keeps its exact type —
 * the same reason `publishedArticles` is generic over `ArticleEntry`.
 */
export function pickSettings<T extends SettingsEntry>(entries: T[]): T['data'] {
  if (entries.length === 0) {
    throw new Error(
      'The settings collection is empty, so the footer and the calendar feed would ' +
        'render without an address. Create src/content/settings/settings.yml with the ' +
        'parish name, address, phone and email.',
    );
  }
  if (entries.length > 1) {
    throw new Error(
      `The settings collection holds ${entries.length} entries; exactly one is expected. ` +
        'Remove the extra files under src/content/settings/ so it is known which one is true.',
    );
  }
  return (entries[0] as T).data;
}
