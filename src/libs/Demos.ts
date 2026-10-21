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
import type { DemoSources } from '@/services/DemoWriter';
import { toDemoContent, writeDemoTexts } from '@/services/DemoWriter';
import { fetchWebsiteBrand } from '@/services/WebsiteBrand';
import { DEFAULT_BRAND_COLOR, isUsableBrandColor } from '@/utils/Colors';
import { createDemoSlug, pickFreeDemoSlug } from '@/utils/DemoSlug';
import { DEMO_STEPS, summarizeDemo } from '@/utils/DemoStats';
import { getBaseUrl } from '@/utils/Helpers';
import { normalizeOpeningHours } from '@/utils/OpeningHours';
import { toE164 } from '@/utils/Phone';
import { getAutomationSettings } from './AutomationSettings';
import type { Conversation } from './Conversations';
import { logEvent, setConversationState } from './Conversations';
import { db } from './DB';
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

const leadResearchSchema = z.looseObject({ business_description: z.string().nullish() });

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
 * @param options The sources.
 * @param options.conversation The conversation the demo is for.
 * @param options.lead The lead behind it, if any.
 * @param options.contact The campaign contact behind it, if any.
 * @returns The name, phone and website; unknown ones are null.
 */
const contactFacts = (options: { conversation: Conversation; lead?: Lead; contact?: Contact }) => ({
  company:
    options.lead?.company ??
    options.contact?.company ??
    options.conversation.company ??
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
 * Picks the logo and colour a demo is tinted with.
 * @param brand What the business website says, if it could be read.
 * @returns The logo, if any, and a usable colour.
 */
const brandFacts = (brand: WebsiteBrand | null) => ({
  logoUrl: brand?.logoUrl ?? null,
  primaryColor:
    brand?.themeColor && isUsableBrandColor(brand.themeColor)
      ? brand.themeColor
      : DEFAULT_BRAND_COLOR,
});

/**
 * Builds the snapshot a demo page shows: the lead's own data, its website's brand,
 * and texts the AI writes from those facts only.
 * @param conversation The conversation the demo is for.
 * @returns The snapshot.
 * @throws {Error} When the AI answer does not parse, so the caller can retry.
 */
const buildSnapshot = async (conversation: Conversation): Promise<DemoSnapshot> => {
  const { lead, contact } = await loadBusiness(conversation);
  const settings = await getAutomationSettings(conversation.organizationId);
  const facts = { ...contactFacts({ conversation, lead, contact }), ...placeFacts(lead) };
  const extras = leadExtras(lead);
  const brand = facts.website ? await fetchWebsiteBrand(facts.website) : null;

  const sources: DemoSources = {
    company: facts.company,
    city: facts.city,
    category: facts.category,
    categories: extras.categories,
    description: extras.description,
    websiteTitle: brand?.title ?? null,
    websiteDescription: brand?.description ?? null,
    websiteText: brand?.text ?? null,
  };

  const { texts, call } = await writeDemoTexts({ model: settings.classificationModel, sources });

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

  return {
    version: DEMO_SNAPSHOT_VERSION,
    ...facts,
    categories: extras.categories,
    openingHours: extras.openingHours,
    ...brandFacts(brand),
    ...toDemoContent(texts),
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

  const data = await buildSnapshot(conversation);

  if (existing) {
    const [rebuilt] = await db
      .update(demoSchema)
      .set({ data })
      .where(eq(demoSchema.id, existing.id))
      .returning();

    return rebuilt ?? existing;
  }

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
      })
      .onConflictDoNothing()
      .returning();

    if (created) {
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
