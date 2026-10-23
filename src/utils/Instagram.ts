/** Instagram paths that are pages of the site, not accounts. */
const RESERVED_PATHS = new Set([
  'p',
  'reel',
  'reels',
  'tv',
  'explore',
  'stories',
  'accounts',
  'about',
  'developer',
  'legal',
  'direct',
]);

const PROFILE_LINK = /instagram\.com\/([\w.]{1,30})/giu;

/**
 * Finds the Instagram account a business links to, the one cited most when there are several.
 * @param texts Where to look: research output, citations, websites.
 * @returns The lower-cased handle, or null when no account is linked.
 */
export const findInstagramHandle = (texts: (string | null | undefined)[]) => {
  const counts = new Map<string, number>();

  for (const text of texts) {
    for (const match of text?.matchAll(PROFILE_LINK) ?? []) {
      const handle = match[1]?.toLowerCase().replace(/\.+$/u, '');

      if (handle && !RESERVED_PATHS.has(handle)) {
        counts.set(handle, (counts.get(handle) ?? 0) + 1);
      }
    }
  }

  const [best] = [...counts.entries()].toSorted((a, b) => b[1] - a[1]);

  return best?.[0] ?? null;
};
