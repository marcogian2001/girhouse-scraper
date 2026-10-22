import * as z from 'zod';
import { decodeEntities, fetchHtml } from './WebsiteBrand';

const PROFILE_URL = 'https://www.miodottore.it/profilo';

const MAX_PHOTOS = 8;

const MAX_REVIEWS = 6;

const MAX_ABOUT_LENGTH = 4000;

const REVIEW_MAX_LENGTH = 320;

/** What a professional's MioDottore profile shows: their face, studios, reviews and services. */
export type MioDottoreProfile = {
  url: string;
  name: string;
  portraitUrl: string | null;
  photos: string[];
  rating: number | null;
  reviewsCount: number | null;
  reviews: { author: string | null; rating: number; when: string | null; text: string }[];
  about: string | null;
  services: { name: string; price: string | null }[];
  addresses: string[];
};

const ldProfileSchema = z.looseObject({
  '@type': z.string(),
  name: z.string(),
  aggregateRating: z
    .object({ ratingValue: z.coerce.number(), reviewCount: z.coerce.number() })
    .nullish(),
  review: z
    .array(
      z.object({
        author: z.object({ name: z.string().nullish() }).nullish(),
        datePublished: z.string().nullish(),
        reviewRating: z.object({ ratingValue: z.coerce.number() }),
        reviewBody: z.string().nullish(),
      }),
    )
    .nullish(),
});

/**
 * Tells whether a link points at MioDottore.
 * @param url The link.
 * @returns True for any page on miodottore.it.
 */
export const isMioDottoreUrl = (url: string) =>
  URL.canParse(url) && /(?:^|\.)miodottore\.it$/u.test(new URL(url).hostname);

/**
 * Turns an HTML fragment into readable text, keeping paragraphs and list items on their own lines.
 * @param fragment The HTML.
 * @returns The text.
 */
const toText = (fragment: string) =>
  decodeEntities(
    fragment
      .replaceAll(/<li\b[^>]*>/giu, '\n- ')
      .replaceAll(/<\/p>|<br\s*\/?>/giu, '\n')
      .replaceAll(/<[^>]+>/gu, ' ')
      .replaceAll('&bullet;', '•'),
  )
    .split('\n')
    // Inline tags leave a space before punctuation
    .map((line) =>
      line
        .replaceAll(/\s+/gu, ' ')
        .replaceAll(/ ([,.;:!?])/gu, '$1')
        .trim(),
    )
    .filter((line) => line && line !== '-')
    .join('\n');

/**
 * Finds the professional among the page's structured data.
 * @param html The page source.
 * @returns The profile's JSON-LD, or undefined when the page is not a single profile.
 */
const findLdProfile = (html: string) =>
  [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/giu)]
    .map((match) => {
      try {
        return ldProfileSchema.safeParse(JSON.parse(match[1] ?? '')).data;
      } catch {
        // A broken block is just one source less
        return null;
      }
    })
    .find((data) => data && data['@type'] !== 'BreadcrumbList' && data['@type'] !== 'Organization');

/**
 * Lists the large images of one kind the page links to, in page order.
 * @param html The page source.
 * @param kind The folder MioDottore keeps them in.
 * @returns The https URLs, without repeats.
 */
const findImages = (html: string, kind: 'avatar' | 'photos') => [
  ...new Set(
    [
      ...html.matchAll(
        new RegExp(
          `(?:https:)?//[\\w.-]+/doctor/${kind}/[\\w-]+/[\\w-]+_large\\.(?:jpe?g|png|webp)`,
          'giu',
        ),
      ),
    ].map((match) => (match[0].startsWith('//') ? `https:${match[0]}` : match[0])),
  ),
];

/**
 * Reads the services listed under the profile's addresses, each once with its first price.
 * @param html The page source.
 * @returns The services, in page order.
 */
const findServices = (html: string) => {
  const services = new Map<string, { name: string; price: string | null }>();

  for (const match of html.matchAll(
    /<li data-test-id="address-service-item">([\s\S]*?)<\/li>/giu,
  )) {
    const [name, price = null] = toText(match[1] ?? '')
      .replaceAll('(descrizione)', '')
      .replaceAll('\n', ' ')
      .split('•')
      .map((part) => part.replaceAll(/\s+/gu, ' ').trim())
      .filter(Boolean);

    if (name && !services.has(name.toLowerCase())) {
      services.set(name.toLowerCase(), { name, price });
    }
  }

  return [...services.values()];
};

/**
 * Reads the studio addresses, each once in its fullest form.
 * The header repeats them without the postal code and outside any heading,
 * so each one ends where its wrapping element closes.
 * @param html The page source.
 * @returns The addresses as one line each, in page order.
 */
const findAddresses = (html: string) => {
  const addresses = new Map<string, string>();

  for (const match of html.matchAll(
    /<span data-test-id="address-info-street">([^<]*)<\/span>([\s\S]*?)<\/(?:span|h4)>/giu,
  )) {
    const street = toText(match[1] ?? '');
    const address = toText(`${match[1]} ${match[2]}`).replaceAll('\n', ' ');

    if (street && address.length > (addresses.get(street)?.length ?? 0)) {
      addresses.set(street, address);
    }
  }

  return [...addresses.values()];
};

/**
 * Shortens a review to what a card has room for.
 * @param text The review.
 * @returns The review, cut at a word when too long.
 */
const shortenReview = (text: string) =>
  text.length > REVIEW_MAX_LENGTH
    ? `${text.slice(0, text.lastIndexOf(' ', REVIEW_MAX_LENGTH))}…`
    : text;

/**
 * Reads a MioDottore profile page.
 * @param html The page source.
 * @param url The page URL.
 * @returns The profile, or null when the page is not a single professional's profile.
 */
export const parseMioDottoreProfile = (html: string, url: string): MioDottoreProfile | null => {
  const ld = findLdProfile(html);

  if (!ld) {
    return null;
  }

  const about = html.match(/data-test-id="about-description"[^>]*>([\s\S]*?)<\/div>/iu)?.[1];

  return {
    url,
    name: ld.name,
    portraitUrl: findImages(html, 'avatar').at(0) ?? null,
    photos: findImages(html, 'photos').slice(0, MAX_PHOTOS),
    rating: ld.aggregateRating?.ratingValue ?? null,
    reviewsCount: ld.aggregateRating?.reviewCount ?? null,
    reviews: (ld.review ?? [])
      .filter((review) => review.reviewRating.ratingValue >= 4 && review.reviewBody)
      .toSorted((a, b) => (b.reviewBody?.length ?? 0) - (a.reviewBody?.length ?? 0))
      .slice(0, MAX_REVIEWS)
      .map((review) => ({
        author: review.author?.name ?? null,
        rating: review.reviewRating.ratingValue,
        when: review.datePublished?.slice(0, 10) ?? null,
        text: shortenReview(
          decodeEntities(review.reviewBody ?? '')
            .replaceAll(/\s+/gu, ' ')
            .trim(),
        ),
      })),
    about: about ? toText(about).slice(0, MAX_ABOUT_LENGTH) || null : null,
    services: findServices(html),
    addresses: findAddresses(html),
  };
};

/**
 * Builds the profile link MioDottore gives a professional, from their name.
 * @param options The name.
 * @param options.firstName The first name.
 * @param options.lastName The last name.
 * @returns The guessed profile URL.
 */
export const guessMioDottoreUrl = (options: { firstName: string; lastName: string }) => {
  const slug = `${options.firstName} ${options.lastName}`
    .normalize('NFD')
    .replaceAll(/\p{M}/gu, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, '-')
    .replaceAll(/^-|-$/gu, '');

  return `${PROFILE_URL}/${slug}`;
};

/**
 * Downloads and reads a MioDottore profile.
 * @param url The profile link, or any MioDottore link that redirects to it.
 * @returns The profile, or null when the page could not be read or is not a profile.
 */
export const fetchMioDottoreProfile = async (url: string) => {
  const page = await fetchHtml(url);

  if (!page || !isMioDottoreUrl(page.url)) {
    return null;
  }

  // Google's links carry tracking parameters the profile does not need
  const { origin, pathname } = new URL(page.url);

  return parseMioDottoreProfile(page.html, `${origin}${pathname}`);
};
