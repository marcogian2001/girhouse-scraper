import { extractDomain } from '@/services/Apify';
import { decodeEntities, fetchHtml, readAttribute, resolveUrl } from '@/services/WebsiteBrand';
import { readPublicEmail } from '@/utils/Leads';

/** Pages read besides the homepage, so a lookup stays within a couple of fetch timeouts. */
const MAX_EXTRA_PAGES = 4;

/** Pages tried when the homepage links to none of the usual ones. */
const FALLBACK_PATHS = ['/contatti', '/privacy-policy'];

/**
 * Links worth following, most useful first. Italian privacy policies name the
 * data controller's email, so they are read after the contact pages.
 */
const CONTACT_LINK_PATTERNS = [
  // Not "contatto", which on an optician's site means contact lenses
  /contatti|contattaci|contattami|contact/iu,
  /chi[-\s]?siamo|about|dove[-\s]?siamo/iu,
  /privacy|cookie|note[-\s]?legali|impressum/iu,
];

const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/giu;

/** Domains of placeholders and tracking scripts, never a real contact. */
const IGNORED_EMAIL_DOMAINS = [
  'example.com',
  'example.it',
  'domain.com',
  'dominio.it',
  'tuodominio.it',
  'email.com',
  'email.it',
  'sentry.io',
  'wixpress.com',
  'mysite.com',
];

/** Local parts of the sample addresses contact forms and themes show. */
const PLACEHOLDER_LOCAL_PART =
  /^(?:(?:la)?tua-?e?mail|your-?e?mail|e?mail|nome\.?cognome|mario\.?rossi)$/u;

/** Free mailbox providers, which small businesses often use instead of their own domain. */
const WEBMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'libero.it',
  'virgilio.it',
  'alice.it',
  'tim.it',
  'tin.it',
  'tiscali.it',
  'yahoo.it',
  'yahoo.com',
  'ymail.com',
  'hotmail.it',
  'hotmail.com',
  'outlook.it',
  'outlook.com',
  'live.it',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'fastwebnet.it',
  'inwind.it',
  'katamail.com',
]);

/**
 * Decodes an address hidden by Cloudflare's email obfuscation.
 * @param hex The encoded address: a one-byte key followed by the XORed characters.
 * @returns The address.
 */
const decodeCloudflareEmail = (hex: string) => {
  const key = Number.parseInt(hex.slice(0, 2), 16);
  const codes = hex
    .slice(2)
    .match(/.{2}/gu)
    // oxlint-disable-next-line no-bitwise -- Cloudflare XORs every character with the key
    ?.map((pair) => Number.parseInt(pair, 16) ^ key);

  return codes ? String.fromCodePoint(...codes) : '';
};

/**
 * Tells whether a match is a real address rather than an image name or a placeholder.
 * @param email The lowercase match.
 * @returns Whether the address could belong to the business.
 */
const isPlausibleEmail = (email: string) => {
  const [localPart = '', domain = ''] = email.split('@');

  return (
    !PLACEHOLDER_LOCAL_PART.test(localPart) &&
    !/\.(?:png|jpe?g|gif|svg|webp|avif)$/u.test(email) &&
    !IGNORED_EMAIL_DOMAINS.some(
      (ignored) => domain === ignored || domain.endsWith(`.${ignored}`),
    ) &&
    readPublicEmail(email) !== null
  );
};

/**
 * Finds the email addresses a page publishes: in mailto links, in its text and
 * structured data, behind Cloudflare's obfuscation or written as "info [at] ...".
 * @param html The page source.
 * @returns The plausible addresses, lowercased, in the order they appear.
 */
export const extractEmails = (html: string) => {
  const cloudflare = [
    ...html.matchAll(/data-cfemail\s*=\s*["']([0-9a-f]+)["']/giu),
    ...html.matchAll(/email-protection#([0-9a-f]+)/giu),
  ].map((match) => decodeCloudflareEmail(match[1] ?? ''));

  // Mailto links are part of the source, so the text pass finds them too
  const text = decodeEntities(html)
    .replaceAll('%40', '@')
    // Escaped markup in inline JSON would glue "u003e" onto the address
    .replaceAll(/\\u003[ce]/giu, ' ')
    .replaceAll(/\s*[[(]\s*(?:at|chiocciola)\s*[\])]\s*/giu, '@')
    .replaceAll(/\s+chiocciola\s+/giu, '@')
    .replaceAll(/\s*[[(]\s*(?:dot|punto)\s*[\])]\s*/giu, '.');

  const found = [...cloudflare, ...(text.match(EMAIL_PATTERN) ?? [])].map((email) =>
    email.trim().toLowerCase(),
  );

  return [...new Set(found)].filter(isPlausibleEmail);
};

/**
 * Picks the pages of the same site most likely to list a contact address.
 * @param html The homepage source.
 * @param baseUrl The homepage URL.
 * @returns At most four absolute URLs, contact pages first.
 */
export const findContactLinks = (html: string, baseUrl: string) => {
  const host = extractDomain(baseUrl);
  const anchors = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/giu)].flatMap((match) => {
    const url = resolveUrl(readAttribute(` ${match[1] ?? ''}`, 'href'), baseUrl);
    const label = `${url ?? ''} ${(match[2] ?? '').replaceAll(/<[^>]+>/gu, ' ')}`;
    const rank = CONTACT_LINK_PATTERNS.findIndex((pattern) => pattern.test(label));

    if (!url || rank === -1 || extractDomain(url) !== host) {
      return [];
    }

    return [{ url: url.split('#')[0] ?? url, rank }];
  });

  const links = anchors
    .toSorted((a, b) => a.rank - b.rank)
    .map((anchor) => anchor.url)
    .filter((url) => url !== baseUrl);

  return [...new Set(links)].slice(0, MAX_EXTRA_PAGES);
};

/**
 * Orders the addresses found on a website by how surely they reach the business.
 * On its own site, an address at another custom domain is usually the web agency's, so it is dropped.
 * @param options The call options.
 * @param options.emails The addresses in the order they were found.
 * @param options.domain The business's own domain, or null for a page on a platform.
 * @returns The addresses to try, best first.
 */
export const rankEmails = (options: { emails: string[]; domain: string | null }) => {
  const score = (email: string) => {
    const domain = email.split('@')[1] ?? '';

    if (options.domain && (domain === options.domain || domain.endsWith(`.${options.domain}`))) {
      return 0;
    }

    if (WEBMAIL_DOMAINS.has(domain)) {
      return 1;
    }

    return options.domain ? null : 2;
  };

  return options.emails
    .flatMap((email) => {
      const rank = score(email);

      return rank === null ? [] : [{ email, rank }];
    })
    .toSorted((a, b) => a.rank - b.rank)
    .map((candidate) => candidate.email);
};

/**
 * Reads a business's website for the addresses it publishes: the homepage, then
 * its contact, about and privacy pages.
 * @param options The call options.
 * @param options.website The website as listed on Google Maps.
 * @param options.domain The business's own domain, or null for a page on a platform.
 * @returns The addresses to try, best first, empty when the site could not be read.
 */
export const findWebsiteEmails = async (options: { website: string; domain: string | null }) => {
  const url = /^https?:\/\//iu.test(options.website)
    ? options.website
    : `https://${options.website}`;
  // Small business sites often run on a broken certificate, but still answer over plain http
  const home =
    (await fetchHtml(url)) ??
    (/^https:/iu.test(url) ? await fetchHtml(url.replace(/^https:/iu, 'http:')) : null);

  if (!home) {
    return [];
  }

  const links = findContactLinks(home.html, home.url);
  const extraUrls =
    links.length > 0 ? links : FALLBACK_PATHS.flatMap((path) => resolveUrl(path, home.url) ?? []);
  const pages = await Promise.all(extraUrls.map(fetchHtml));

  const emails = [home, ...pages].flatMap((page) => (page ? extractEmails(page.html) : []));

  return rankEmails({ emails: [...new Set(emails)], domain: options.domain });
};
