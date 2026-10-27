import { and, eq, notInArray } from 'drizzle-orm';
import * as z from 'zod';
import type { contactSchema, DemoSnapshot } from '@/models/Schema';
import { demoImageSchema, enrichmentSchema } from '@/models/Schema';
import type { InstagramProfile } from '@/services/Apify';
import { fetchInstagramProfile, isReadableWebsite } from '@/services/Apify';
import { isMioDottoreUrl } from '@/services/MioDottore';
import { downloadImage } from '@/services/RemoteImage';
import type { WebsiteBrand } from '@/services/WebsiteBrand';
import { fetchWebsiteBrand } from '@/services/WebsiteBrand';
import { personNameOrNull, textOrNull } from '@/utils/Helpers';
import { findInstagramHandle } from '@/utils/Instagram';
import { db } from './DB';
import { logger } from './Logger';

type Contact = typeof contactSchema.$inferSelect;

/** Photos copied for one demo at most, from every source together. */
export const MAX_COPIED_PHOTOS = 8;

/** Instagram posts a demo reads the captions and photos of. */
const INSTAGRAM_POSTS = 6;

/** What a reference page lends the AI at most, so several fit in one prompt. */
const MAX_REFERENCE_TEXT = 3000;

const MAX_CAPTION_LENGTH = 300;

/** The research Parallel ran on a campaign contact, as the enrichment keeps it. */
const enrichmentContentSchema = z.looseObject({
  full_name: z.string().nullish(),
  current_role: z.string().nullish(),
  current_company: z.string().nullish(),
  company_industry: z.string().nullish(),
  company_description: z.string().nullish(),
  personalization_hooks: z.string().nullish(),
  location: z.string().nullish(),
});

type EnrichmentContent = z.infer<typeof enrichmentContentSchema>;

/**
 * Renders the research on a person as labelled lines for the AI.
 * @param content The research, if any.
 * @returns One fact per line, or null when it says nothing.
 */
const researchLines = (content: EnrichmentContent | null) => {
  const lines = [
    ['Role', content?.current_role],
    ['Field', content?.company_industry],
    ['Works with', content?.current_company],
    ['About that organization', content?.company_description],
    ['How they present themselves', content?.personalization_hooks],
    ['Area', content?.location],
  ].filter(([, value]) => textOrNull(value));

  return textOrNull(lines.map(([label, value]) => `${label}: ${value}`).join('\n'));
};

/**
 * Reads the research on a campaign contact: who they are, and the pages it cited.
 * @param contact The campaign contact, if any.
 * @returns The person's name, the research as labelled lines, and the raw research to search links in.
 */
export const loadContactResearch = async (contact?: Contact) => {
  const enrichment = contact
    ? await db.query.enrichmentSchema.findFirst({
        where: eq(enrichmentSchema.contactId, contact.id),
      })
    : undefined;
  const parse = enrichmentContentSchema.safeParse(enrichment?.content);
  // Research that did not find the person describes someone else
  const content = parse.success && enrichment?.personFound !== false ? parse.data : null;
  const contactName = [contact?.firstName, contact?.lastName].filter(Boolean).join(' ');

  return {
    personName: personNameOrNull(content?.full_name) ?? textOrNull(contactName),
    research: researchLines(content),
    raw: content ? JSON.stringify([enrichment?.content, enrichment?.basis]) : null,
  };
};

/**
 * Reads the business's Instagram profile. A failure only leaves the demo without it.
 * @param handle The account, if one was found.
 * @returns The profile, or null when there is none or it could not be read.
 */
const readInstagram = async (handle: string | null) => {
  if (!handle) {
    return null;
  }

  return await fetchInstagramProfile(handle).catch((error: unknown) => {
    logger.warn(`Instagram profile ${handle} could not be read: ${String(error)}`);

    return null;
  });
};

/**
 * Reads the pages the Girhouse team linked that are not a profile read on its own.
 * @param links The guidance links.
 * @returns The pages that could be read.
 */
const readReferencePages = async (links: string[]) => {
  const pages = links.filter(
    (link) => !isMioDottoreUrl(link) && !findInstagramHandle([link]) && isReadableWebsite(link),
  );
  const brands = await Promise.all(pages.map(async (page) => await fetchWebsiteBrand(page)));

  return brands.filter((brand): brand is WebsiteBrand => brand !== null);
};

/**
 * Gathers what the outside sources say about a business: its Instagram profile, the page its
 * profile links to, and the pages the Girhouse team linked. A guidance link to an Instagram
 * account wins over one the research found. The profile's link is often a shop or a link list
 * rather than the business's site, so it is read as a reference, never for the brand.
 * @param options The sources to search.
 * @param options.links The guidance links.
 * @param options.citations Research and websites the business's Instagram may be linked in.
 * @returns The Instagram profile and the reference pages, each empty when none was found.
 */
export const readOutsideSources = async (options: {
  links: string[];
  citations: (string | null | undefined)[];
}) => {
  const handle = findInstagramHandle(options.links) ?? findInstagramHandle(options.citations);
  const [instagram, references] = await Promise.all([
    readInstagram(handle),
    readReferencePages(options.links),
  ]);
  const socialLink = instagram?.externalUrl;
  const socialPages =
    socialLink && !options.links.includes(socialLink) ? await readReferencePages([socialLink]) : [];

  return { instagram, references: [...references, ...socialPages] };
};

/**
 * Renders the reference pages for the AI, each cut to fit.
 * @param references The pages.
 * @returns One block per page.
 */
export const renderReferences = (references: WebsiteBrand[]) =>
  references.map((page) =>
    [page.title, page.description, page.text.slice(0, MAX_REFERENCE_TEXT)]
      .filter(Boolean)
      .join('\n'),
  );

/**
 * Reads what an Instagram profile tells the AI: its bio and the captions of its latest posts.
 * @param instagram The profile, if any.
 * @returns The bio and the captions, cut to a few lines each.
 */
export const instagramSources = (instagram: InstagramProfile | null) => ({
  socialBio: textOrNull(instagram?.biography),
  socialPosts: (instagram?.latestPosts ?? [])
    .slice(0, INSTAGRAM_POSTS)
    .flatMap((post) => (post.caption ? [post.caption.slice(0, MAX_CAPTION_LENGTH)] : [])),
});

/**
 * Describes an Instagram profile for the snapshot.
 * @param instagram The profile, if any.
 * @returns The snapshot's social part, or null.
 */
export const socialFacts = (instagram: InstagramProfile | null): DemoSnapshot['social'] =>
  instagram
    ? {
        network: 'instagram',
        handle: instagram.username,
        url: `https://www.instagram.com/${instagram.username}/`,
        followersCount: instagram.followersCount ?? null,
      }
    : null;

/**
 * Downloads an image and keeps a copy for the conversation's demo.
 * @param conversationId The conversation the demo is for.
 * @param url The image link.
 * @returns The public link of the copy, or null when the image could not be kept.
 */
const copyImage = async (conversationId: string, url: string) => {
  const image = await downloadImage(url).catch(() => null);

  if (!image) {
    return null;
  }

  const [stored] = await db
    .insert(demoImageSchema)
    .values({ conversationId, ...image })
    .returning({ id: demoImageSchema.id });

  return stored ? `/api/demo-images/${stored.id}` : null;
};

/**
 * Keeps copies of the photos a demo shows from sources whose links expire or change:
 * the reference pages first, then the website, then the latest Instagram posts.
 * @param options The images.
 * @param options.conversationId The conversation the demo is for.
 * @param options.portrait The professional's portrait, when no directory profile has one.
 * @param options.references The reference pages.
 * @param options.website The business's website, if it could be read.
 * @param options.instagram The Instagram profile, if any.
 * @returns The snapshot's image part.
 */
export const copyDemoImages = async (options: {
  conversationId: string;
  portrait: string | null;
  references: WebsiteBrand[];
  website: WebsiteBrand | null;
  instagram: InstagramProfile | null;
}): Promise<NonNullable<DemoSnapshot['images']>> => {
  const sources = [
    ...options.references.flatMap((page) => page.images),
    ...(options.website?.images ?? []),
    ...(options.instagram?.latestPosts ?? [])
      .slice(0, INSTAGRAM_POSTS)
      .flatMap((post) => (post.displayUrl ? [post.displayUrl] : [])),
  ];
  const photos = [...new Set(sources)].slice(0, MAX_COPIED_PHOTOS);

  const [portraitUrl, ...copies] = await Promise.all([
    options.portrait ? copyImage(options.conversationId, options.portrait) : null,
    ...photos.map(async (photo) => await copyImage(options.conversationId, photo)),
  ]);

  return {
    portraitUrl: portraitUrl ?? null,
    photos: copies.filter((copy): copy is string => copy !== null),
  };
};

/**
 * Deletes the copies an earlier build of the conversation's demo kept and the current one no longer shows.
 * @param conversationId The conversation.
 * @param images The images the demo shows now.
 */
export const deleteUnusedImages = async (
  conversationId: string,
  images: DemoSnapshot['images'],
) => {
  const kept = [images?.portraitUrl, ...(images?.photos ?? [])].flatMap(
    (url) => url?.split('/').at(-1) ?? [],
  );

  await db
    .delete(demoImageSchema)
    .where(
      and(
        eq(demoImageSchema.conversationId, conversationId),
        ...(kept.length > 0 ? [notInArray(demoImageSchema.id, kept)] : []),
      ),
    );
};
