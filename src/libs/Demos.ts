import { and, count, eq, gte, isNull, like } from 'drizzle-orm';
import * as z from 'zod';
import type { DemoSnapshot } from '@/models/Schema';
import {
  contactSchema,
  conversationSchema,
  demoEventSchema,
  demoSchema,
  leadSchema,
} from '@/models/Schema';
import { isReadableWebsite } from '@/services/Apify';
import { toDemoContent, writeDemoTexts } from '@/services/DemoWriter';
import type { MioDottoreProfile } from '@/services/MioDottore';
import { fetchMioDottoreProfile, guessMioDottoreUrl, isMioDottoreUrl } from '@/services/MioDottore';
import { fetchWebsiteBrand } from '@/services/WebsiteBrand';
import { DEFAULT_BRAND_COLOR, isUsableBrandColor } from '@/utils/Colors';
import { extractLinks } from '@/utils/DemoGuidance';
import { createDemoSlug, pickFreeDemoSlug } from '@/utils/DemoSlug';
import { DEMO_STEPS, summarizeDemo } from '@/utils/DemoStats';
import { getBaseUrl, textOrNull } from '@/utils/Helpers';
import { normalizeOpeningHours } from '@/utils/OpeningHours';
import { toE164 } from '@/utils/Phone';
import { getAutomationSettings } from './AutomationSettings';
import type { Conversation } from './Conversations';
import { logEvent, setConversationState } from './Conversations';
import { db } from './DB';
import {
  copyDemoImages,
  deleteUnusedImages,
  instagramSources,
  loadContactResearch,
  MAX_COPIED_PHOTOS,
  readOutsideSources,
  renderReferences,
  socialFacts,
} from './DemoReferences';
import { Env } from './Env';
import { recordCopywritingUsage } from './Usage';

type DemoEventType = (typeof demoEventSchema.$inferSelect)['type'];

/** Beyond this many events an hour a demo is being hammered, not watched. */
const EVENTS_PER_HOUR = 500;

/** Demos stored at the same moment for namesake businesses can race for one slug. */
const SLUG_ATTEMPTS = 5;

/** Snapshots built with an older shape are rebuilt, keeping their slug. */
const DEMO_SNAPSHOT_VERSION = 3;

/** The Apify fields demos use, which the lead keeps in its raw place. */
const leadRawSchema = z.looseObject({
  categories: z.array(z.string()).nullish(),
  openingHours: z.array(z.object({ day: z.string(), hours: z.string() })).nullish(),
});

const leadResearchSchema = z.looseObject({
  business_description: z.string().nullish(),
  first_name: z.string().nullish(),
  last_name: z.string().nullish(),
});

/** Review quotes the AI reads to learn what patients praise. */
const REVIEW_QUOTES = 5;

/**
 * Builds the public link of a demo, on the demo domain when there is one.
 * @param slug The demo slug.
 * @returns The absolute URL of the Italian demo page.
 */
export const demoUrl = (slug: string) =>
  Env.DEMO_URL ? `${Env.DEMO_URL}/${slug}` : `${getBaseUrl()}/it/demo/${slug}`;

/**
 * Reads the lead and campaign contact behind a conversation.
 * @param conversation The conversation.
 * @returns Both, when the conversation has them.
 */
const loadBusiness = async (conversation: Conversation) => {
  const lead = conversation.leadId
    ? await db.query.leadSchema.findFirst({ where: eq(leadSchema.id, conversation.leadId) })
    : undefined;

  const contact = conversation.contactId
    ? await db.query.contactSchema.findFirst({
        where: eq(contactSchema.id, conversation.contactId),
      })
    : undefined;

  return { lead, contact };
};

type Lead = typeof leadSchema.$inferSelect;

type Contact = typeof contactSchema.$inferSelect;

type WebsiteBrand = NonNullable<Awaited<ReturnType<typeof fetchWebsiteBrand>>>;

/**
 * Reads how to name and reach the business, from the lead search first, then the campaign contact.
 * A professional with no business name goes by their own name; the email is the last resort.
 * @param options The sources.
 * @param options.conversation The conversation the demo is for.
 * @param options.lead The lead behind it, if any.
 * @param options.contact The campaign contact behind it, if any.
 * @param options.person The professional's name, from the research or the contact.
 * @param options.socialName The name on the business's Instagram profile, if any.
 * @returns The name, phone and website; unknown ones are null.
 */
const contactFacts = (options: {
  conversation: Conversation;
  lead?: Lead;
  contact?: Contact;
  person: string | null;
  socialName: string | null;
}) => ({
  company:
    options.lead?.company ??
    options.contact?.company ??
    options.conversation.company ??
    options.person ??
    options.socialName ??
    options.conversation.leadEmail,
  phone: options.lead?.phone ?? options.contact?.phone ?? null,
  website: options.lead?.website ?? options.contact?.website ?? null,
});

/**
 * Reads where the business is and how Google rates it.
 * @param lead The lead behind the conversation, if any.
 * @returns The facts; unknown ones are null.
 */
const placeFacts = (lead?: Lead) => ({
  city: lead?.city ?? null,
  address: lead?.address ?? null,
  category: lead?.category ?? null,
  placeId: lead?.placeId ?? null,
  rating: lead?.rating ?? null,
  reviewsCount: lead?.reviewsCount ?? null,
});

/**
 * Reads what the lead search kept beyond its columns: Apify's categories and hours, and the research.
 * @param lead The lead, if any.
 * @returns The categories, opening hours and description, empty when unknown.
 */
const leadExtras = (lead?: Lead) => {
  const raw = leadRawSchema.safeParse(lead?.raw);
  const research = leadResearchSchema.safeParse(lead?.research);
  const researched = research.success ? (research.data.business_description ?? null) : null;

  return {
    categories: raw.success ? (raw.data.categories ?? []) : [],
    openingHours: normalizeOpeningHours(raw.success ? (raw.data.openingHours ?? []) : []),
    description: lead?.description ?? researched,
  };
};

/**
 * Finds the professional's MioDottore profile: the lead's own link, a link the research
 * cited, or the profile named after the person the research found, when it is in the lead's city.
 * @param lead The lead, if any.
 * @param website The lead's website, if any.
 * @returns The profile, or null when none was found.
 */
const findMioDottoreProfile = async (lead?: Lead, website?: string | null) => {
  if (website && isMioDottoreUrl(website)) {
    return await fetchMioDottoreProfile(website);
  }

  const cited = JSON.stringify(lead?.research ?? {}).match(
    /https:\/\/www\.miodottore\.it\/[^"\s]+/u,
  )?.[0];

  if (cited) {
    return await fetchMioDottoreProfile(cited);
  }

  const research = leadResearchSchema.safeParse(lead?.research);
  const firstName = research.data?.first_name;
  const lastName = research.data?.last_name;
  const city = lead?.city?.toLowerCase();

  if (!firstName || !lastName || !city) {
    return null;
  }

  // Namesakes elsewhere are common, so a guessed profile counts only in the lead's city
  const profile = await fetchMioDottoreProfile(guessMioDottoreUrl({ firstName, lastName }));
  const isSamePerson =
    profile?.name.toLowerCase().includes(lastName.toLowerCase()) &&
    profile.addresses.some((address) => address.toLowerCase().includes(city));

  return isSamePerson ? profile : null;
};

/**
 * Keeps what the demo page shows of a MioDottore profile.
 * @param profile The profile, if one was found.
 * @returns The snapshot's directory part, or null.
 */
const directoryFacts = (profile: MioDottoreProfile | null) =>
  profile
    ? {
        name: 'MioDottore',
        url: profile.url,
        portraitUrl: profile.portraitUrl,
        photos: profile.photos,
        rating: profile.rating,
        reviewsCount: profile.reviewsCount,
        reviews: profile.reviews,
        addresses: profile.addresses,
      }
    : null;

/**
 * Picks the colours a demo is tinted with: the website's own when it has any, else the ones
 * the AI picked for the business, else the giraffe's navy.
 * @param options The colours known.
 * @param options.brand What the business website says, if it could be read.
 * @param options.picked The usable colours the AI picked.
 * @param options.picked.primary The AI's brand colour, if usable.
 * @param options.picked.accent The AI's detail colour, if usable.
 * @returns The primary and accent colours.
 */
const pickColors = (options: {
  brand: WebsiteBrand | null;
  picked: { primary: string | null; accent: string | null };
}) => {
  const themeColor =
    options.brand?.themeColor && isUsableBrandColor(options.brand.themeColor)
      ? options.brand.themeColor
      : null;
  const siteColors = [
    ...new Set([...(themeColor ? [themeColor] : []), ...(options.brand?.colors ?? [])]),
  ];
  const primary = siteColors.at(0) ?? options.picked.primary ?? DEFAULT_BRAND_COLOR;
  const accent = [options.picked.accent, siteColors.at(1)].find(
    (color) => color && color !== primary,
  );

  return { primary, accent: accent ?? primary };
};

/**
 * Reads the business's own website.
 * @param website The website the lead or contact lists, if any.
 * @returns The website and what it says, or nulls when there is none to read.
 */
const readOwnWebsite = async (website: string | null) => {
  // A directory profile is not the business's own site: its logo and colour are MioDottore's
  const own = website && !isMioDottoreUrl(website) && isReadableWebsite(website) ? website : null;

  return { website: own, brand: own ? await fetchWebsiteBrand(own) : null };
};

/**
 * Reads every source a demo is built from: the lead, the campaign contact and the research on
 * them, their MioDottore profile, Instagram and website, and the pages the Girhouse team linked.
 * @param conversation The conversation the demo is for.
 * @param guidance What the Girhouse team told the demo to use, if anything.
 * @returns What each source said; sources that could not be read are empty.
 */
const gatherSources = async (conversation: Conversation, guidance: string | null) => {
  const { lead, contact } = await loadBusiness(conversation);
  const research = await loadContactResearch(contact);
  const links = extractLinks(guidance);
  const listedWebsite = lead?.website ?? contact?.website ?? null;

  const [outside, profile, own] = await Promise.all([
    readOutsideSources({
      links,
      citations: [research.raw, JSON.stringify(lead?.research ?? {}), listedWebsite],
    }),
    // A MioDottore page the team linked wins over the one the lead lists
    findMioDottoreProfile(lead, links.find((link) => isMioDottoreUrl(link)) ?? listedWebsite),
    readOwnWebsite(listedWebsite),
  ]);

  return { lead, contact, research, profile, own, ...outside };
};

type GatheredSources = Awaited<ReturnType<typeof gatherSources>>;

/**
 * Lists what a MioDottore profile tells the AI.
 * @param profile The profile, if one was found.
 * @returns The profile's part of the writer sources.
 */
const profileSources = (profile: MioDottoreProfile | null) => ({
  profileAbout: profile?.about ?? null,
  profileServices: profile?.services ?? [],
  profileLocations: profile?.addresses ?? [],
  reviewQuotes: (profile?.reviews ?? []).slice(0, REVIEW_QUOTES).map((review) => review.text),
});

/**
 * Lists what the business's website tells the AI.
 * @param brand What the website says, if it could be read.
 * @returns The website's part of the writer sources.
 */
const websiteSources = (brand: WebsiteBrand | null) => ({
  websiteTitle: brand?.title ?? null,
  websiteDescription: brand?.description ?? null,
  websiteText: brand?.text ?? null,
  websiteColors: brand?.colors ?? [],
  websiteFonts: brand?.fonts ?? [],
});

/**
 * Counts roughly how many photos the page will show, before they are copied, so the AI
 * can pick a layout that suits them.
 * @param sources What was read about the business.
 * @returns The photo count, and whether a portrait of the professional is known.
 */
const photoSources = (sources: GatheredSources) => {
  const { lead, profile, own, instagram, references } = sources;
  const posts = (instagram?.latestPosts ?? []).filter((post) => post.displayUrl);

  return {
    photoCount:
      Math.min(
        references.flatMap((page) => page.images).length +
          (own.brand?.images.length ?? 0) +
          posts.length,
        MAX_COPIED_PHOTOS,
      ) +
      (profile?.photos.length ?? 0) +
      // The page shows up to two Google photos of a place
      (lead?.placeId ? 2 : 0),
    hasPortrait: Boolean(
      profile?.portraitUrl ?? instagram?.profilePicUrlHD ?? instagram?.profilePicUrl,
    ),
  };
};

/**
 * Builds the snapshot a demo page shows from every source it can read, with texts the AI
 * writes from those facts only.
 * @param conversation The conversation the demo is for.
 * @param guidance What the Girhouse team told the demo to use, if anything.
 * @returns The snapshot.
 * @throws {Error} When the AI answer does not parse, so the caller can retry.
 */
const buildSnapshot = async (
  conversation: Conversation,
  guidance: string | null,
): Promise<DemoSnapshot> => {
  const sources: GatheredSources = await gatherSources(conversation, guidance);
  const { lead, contact, research, profile, own, instagram, references } = sources;
  const settings = await getAutomationSettings(conversation.organizationId);
  const facts = {
    ...contactFacts({
      conversation,
      lead,
      contact,
      person: research.personName,
      socialName: textOrNull(instagram?.fullName),
    }),
    ...placeFacts(lead),
  };
  const category = facts.category ?? textOrNull(instagram?.businessCategoryName);
  const extras = leadExtras(lead);

  const [{ texts, call }, images] = await Promise.all([
    writeDemoTexts({
      model: settings.classificationModel,
      sources: {
        company: facts.company,
        person: research.personName,
        city: facts.city,
        category,
        categories: extras.categories,
        description: extras.description,
        research: research.research,
        teamNotes: textOrNull(guidance),
        referencePages: renderReferences(references),
        ...websiteSources(own.brand),
        ...photoSources(sources),
        ...profileSources(profile),
        ...instagramSources(instagram),
      },
    }),
    copyDemoImages({
      conversationId: conversation.id,
      // A MioDottore portrait is the professional's own; Instagram's is the fallback
      portrait: profile?.portraitUrl
        ? null
        : (instagram?.profilePicUrlHD ?? instagram?.profilePicUrl ?? null),
      references,
      website: own.brand,
      instagram,
    }),
  ]);

  // Recorded before the answer is checked: an unparsable answer is still billed
  await recordCopywritingUsage({
    userId: conversation.userId,
    organizationId: conversation.organizationId,
    campaignId: conversation.campaignId,
    sequence: call,
  });

  if (!texts) {
    throw new Error(`${call.model} returned no parsable demo texts for ${conversation.id}`);
  }

  const { landing, chat, design, colors: picked } = toDemoContent(texts);
  const colors = pickColors({ brand: own.brand, picked });

  return {
    version: DEMO_SNAPSHOT_VERSION,
    ...facts,
    category,
    website: own.website,
    categories: extras.categories,
    openingHours: extras.openingHours,
    logoUrl: own.brand?.logoUrl ?? null,
    primaryColor: colors.primary,
    design: { ...design, accentColor: colors.accent },
    directory: directoryFacts(profile),
    social: socialFacts(instagram),
    images,
    landing,
    chat,
  };
};

/**
 * Finds the slug of a new demo, numbered when another business has the same name.
 * @param company The business name.
 * @returns A slug no demo has yet.
 */
const findFreeSlug = async (company: string) => {
  const base = createDemoSlug(company);
  const rows = await db
    .select({ slug: demoSchema.slug })
    .from(demoSchema)
    .where(like(demoSchema.slug, `${base}%`));

  return pickFreeDemoSlug(base, new Set(rows.map((row) => row.slug)));
};

/**
 * Stores a conversation's first demo under a free slug.
 * @param options The demo.
 * @param options.conversation The conversation it is for.
 * @param options.data The snapshot.
 * @param options.guidance What the Girhouse team told it to use, if anything.
 * @returns The stored demo, or the one a build running at the same time stored first.
 * @throws {Error} When no free slug could be taken.
 */
const insertDemo = async (options: {
  conversation: Conversation;
  data: DemoSnapshot;
  guidance: string | null;
}) => {
  const { conversation, data } = options;

  for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt += 1) {
    // oxlint-disable-next-line no-await-in-loop
    const slug = await findFreeSlug(data.company);
    // oxlint-disable-next-line no-await-in-loop
    const [created] = await db
      .insert(demoSchema)
      .values({
        organizationId: conversation.organizationId,
        conversationId: conversation.id,
        leadId: conversation.leadId,
        slug,
        data,
        guidance: options.guidance,
      })
      .onConflictDoNothing()
      .returning();

    if (created) {
      // oxlint-disable-next-line no-await-in-loop
      await deleteUnusedImages(conversation.id, data.images);
      // oxlint-disable-next-line no-await-in-loop
      await logEvent({
        conversationId: conversation.id,
        type: 'demo_created',
        payload: { demoId: created.id, slug: created.slug },
      });

      return created;
    }

    // A build running at the same time for the same conversation may have stored it first;
    // otherwise another demo took the slug in the meantime, and the next attempt numbers past it
    // oxlint-disable-next-line no-await-in-loop
    const stored = await db.query.demoSchema.findFirst({
      where: eq(demoSchema.conversationId, conversation.id),
    });

    if (stored) {
      return stored;
    }
  }

  throw new Error(`Demo for conversation ${conversation.id} could not be stored`);
};

/**
 * Returns the demo of a conversation, building it on first use.
 * @param conversation The conversation the demo is for.
 * @returns The demo row.
 * @throws {Error} When the demo cannot be built or stored.
 */
export const ensureDemo = async (conversation: Conversation) => {
  const existing = await db.query.demoSchema.findFirst({
    where: eq(demoSchema.conversationId, conversation.id),
  });

  if (existing?.data.version === DEMO_SNAPSHOT_VERSION) {
    return existing;
  }

  const data = await buildSnapshot(conversation, existing?.guidance ?? null);

  if (!existing) {
    return await insertDemo({ conversation, data, guidance: null });
  }

  const [rebuilt] = await db
    .update(demoSchema)
    .set({ data })
    .where(eq(demoSchema.id, existing.id))
    .returning();

  await deleteUnusedImages(conversation.id, data.images);

  return rebuilt ?? existing;
};

/**
 * Picks the link of a rebuilt demo: the same one, unless it was made from the lead's email
 * because no name was known and nobody has opened it yet.
 * @param options The demo.
 * @param options.conversation The conversation it is for.
 * @param options.demo The demo before the rebuild.
 * @param options.company The business name the rebuild found.
 * @returns The slug to keep or the new one.
 */
const rebuiltSlug = async (options: {
  conversation: Conversation;
  demo: typeof demoSchema.$inferSelect;
  company: string;
}) => {
  const isEmailSlug = options.demo.slug.startsWith(createDemoSlug(options.conversation.leadEmail));
  const hasName = options.company !== options.conversation.leadEmail;

  return isEmailSlug && hasName && !options.demo.firstOpenedAt
    ? await findFreeSlug(options.company)
    : options.demo.slug;
};

/**
 * Builds a conversation's demo again from fresh sources, keeping its link.
 * @param conversation The conversation the demo is for.
 * @param guidance What the Girhouse team tells the demo to use, links included; the stored
 * guidance is kept when omitted.
 * @returns The rebuilt demo row, or a new one when none existed.
 * @throws {Error} When the demo cannot be built or stored.
 */
export const rebuildDemo = async (conversation: Conversation, guidance?: string | null) => {
  const existing = await db.query.demoSchema.findFirst({
    where: eq(demoSchema.conversationId, conversation.id),
  });
  const kept = guidance === undefined ? (existing?.guidance ?? null) : guidance;
  const data = await buildSnapshot(conversation, kept);

  if (!existing) {
    return await insertDemo({ conversation, data, guidance: kept });
  }

  const [rebuilt] = await db
    .update(demoSchema)
    .set({
      data,
      guidance: kept,
      slug: await rebuiltSlug({ conversation, demo: existing, company: data.company }),
      generatedAt: new Date(),
    })
    .where(eq(demoSchema.id, existing.id))
    .returning();

  await deleteUnusedImages(conversation.id, data.images);

  return rebuilt ?? existing;
};

/**
 * Reads a demo by its public slug, with what the page needs around it.
 * @param slug The demo slug.
 * @returns The demo, its conversation and the organization's settings, or null when unknown.
 */
export const getDemoPage = async (slug: string) => {
  const [row] = await db
    .select({ demo: demoSchema, conversation: conversationSchema })
    .from(demoSchema)
    .innerJoin(conversationSchema, eq(conversationSchema.id, demoSchema.conversationId))
    .where(eq(demoSchema.slug, slug));

  if (!row) {
    return null;
  }

  // A demo built before the current shape is rebuilt on its first visit
  const demo =
    row.demo.data.version === DEMO_SNAPSHOT_VERSION ? row.demo : await ensureDemo(row.conversation);

  return {
    demo,
    conversation: row.conversation,
    settings: await getAutomationSettings(row.demo.organizationId),
  };
};

/**
 * Records what a visitor did on a demo, and moves the conversation on the first
 * open and when the last step is reached.
 * @param options The event.
 * @param options.slug The demo slug.
 * @param options.sessionId The visitor's random tab id.
 * @param options.type What happened.
 * @param options.step The step reached, for step events.
 * @returns False when no demo has this slug.
 */
export const recordDemoEvent = async (options: {
  slug: string;
  sessionId: string;
  type: Exclude<DemoEventType, 'phone_submitted'>;
  step?: number;
}) => {
  const page = await getDemoPage(options.slug);

  if (!page) {
    return false;
  }

  const { demo, conversation } = page;

  const [recent] = await db
    .select({ events: count() })
    .from(demoEventSchema)
    .where(
      and(
        eq(demoEventSchema.demoId, demo.id),
        gte(demoEventSchema.createdAt, new Date(Date.now() - 3_600_000)),
      ),
    );

  if ((recent?.events ?? 0) >= EVENTS_PER_HOUR) {
    return true;
  }

  await db.insert(demoEventSchema).values({
    demoId: demo.id,
    sessionId: options.sessionId,
    type: options.type,
    step: options.step,
  });

  // The guards on the null columns make each milestone count once, however many tabs report it
  const [opened] = await db
    .update(demoSchema)
    .set({ firstOpenedAt: new Date() })
    .where(and(eq(demoSchema.id, demo.id), isNull(demoSchema.firstOpenedAt)))
    .returning({ id: demoSchema.id });

  if (opened) {
    await logEvent({ conversationId: conversation.id, type: 'demo_opened' });

    if (conversation.state === 'demo_sent') {
      await setConversationState({ conversation, state: 'demo_viewed' });
    }
  }

  if ((options.step ?? 0) >= DEMO_STEPS) {
    const [completed] = await db
      .update(demoSchema)
      .set({ completedAt: new Date() })
      .where(and(eq(demoSchema.id, demo.id), isNull(demoSchema.completedAt)))
      .returning({ id: demoSchema.id });

    if (completed) {
      await logEvent({ conversationId: conversation.id, type: 'demo_completed' });
    }
  }

  if (options.type === 'whatsapp_click') {
    await logEvent({ conversationId: conversation.id, type: 'demo_whatsapp_click' });
  }

  return true;
};

/**
 * Stores the WhatsApp number a lead left on their demo.
 * @param options The submission.
 * @param options.slug The demo slug.
 * @param options.sessionId The visitor's random tab id.
 * @param options.phone The number as typed.
 * @returns The outcome: saved, an invalid number, or an unknown demo.
 */
export const saveDemoPhone = async (options: {
  slug: string;
  sessionId: string;
  phone: string;
}) => {
  const page = await getDemoPage(options.slug);

  if (!page) {
    return 'not_found' as const;
  }

  const phone = toE164(options.phone);

  if (!phone) {
    return 'invalid' as const;
  }

  await db
    .update(conversationSchema)
    .set({ phoneE164: phone })
    .where(eq(conversationSchema.id, page.conversation.id));

  await db.insert(demoEventSchema).values({
    demoId: page.demo.id,
    sessionId: options.sessionId,
    type: 'phone_submitted',
  });

  await logEvent({
    conversationId: page.conversation.id,
    type: 'demo_phone_left',
    payload: { phone },
  });

  return 'saved' as const;
};

/**
 * Reads a conversation's demo with a summary of how the lead went through it.
 * @param conversationId The conversation.
 * @returns The demo, its link and the summary, or null when no demo was built.
 */
export const getConversationDemo = async (conversationId: string) => {
  const demo = await db.query.demoSchema.findFirst({
    where: eq(demoSchema.conversationId, conversationId),
  });

  if (!demo) {
    return null;
  }

  const events = await db
    .select({ type: demoEventSchema.type, step: demoEventSchema.step })
    .from(demoEventSchema)
    .where(eq(demoEventSchema.demoId, demo.id));

  return { demo, url: demoUrl(demo.slug), summary: summarizeDemo(events) };
};
