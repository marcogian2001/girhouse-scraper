import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import {
  conversationSchema,
  demoSchema,
  leadSchema,
  leadSearchSchema,
  memberSchema,
} from '@/models/Schema';
import { FUNNEL_PLACE_PREFIX } from '@/utils/FunnelPlace';
import { toE164 } from '@/utils/Phone';
import type { FunnelDemoRequest } from '@/validations/FunnelDemoValidation';
import { logEvent } from './Conversations';
import { db } from './DB';
import { demoUrl } from './DemoLinks';
import { ensureDemo } from './Demos';
import { Env } from './Env';
import { logger } from './Logger';

/** The lead search that holds every funnel lead, so they never mix with the cold email searches. */
const FUNNEL_SEARCH_NAME = 'Funnel girhouse.com';

/**
 * Finds the organization funnel demos belong to: the configured one, else the one that made
 * the latest demo.
 * @returns The organization id, or null when there is none yet.
 */
const findFunnelOrganization = async () => {
  if (Env.FUNNEL_ORGANIZATION_ID) {
    return Env.FUNNEL_ORGANIZATION_ID;
  }

  const [latest] = await db
    .select({ organizationId: demoSchema.organizationId })
    .from(demoSchema)
    .orderBy(desc(demoSchema.createdAt))
    .limit(1);

  return latest?.organizationId ?? null;
};

/**
 * Finds who funnel demos are billed to: the organization's first owner, else its first member.
 * @param organizationId The organization.
 * @returns The user id, or null when the organization has no member.
 */
const findFunnelUser = async (organizationId: string) => {
  const members = await db
    .select({ userId: memberSchema.userId, role: memberSchema.role })
    .from(memberSchema)
    .where(eq(memberSchema.organizationId, organizationId))
    .orderBy(asc(memberSchema.createdAt));

  return (members.find((member) => member.role === 'owner') ?? members[0])?.userId ?? null;
};

/**
 * Returns the organization's funnel lead search, creating it on first use.
 * @param options The owner.
 * @param options.organizationId The organization.
 * @param options.userId The user it is created for.
 * @returns The lead search id.
 */
const ensureFunnelSearch = async (options: { organizationId: string; userId: string }) => {
  const existing = await db.query.leadSearchSchema.findFirst({
    where: and(
      eq(leadSearchSchema.organizationId, options.organizationId),
      eq(leadSearchSchema.name, FUNNEL_SEARCH_NAME),
    ),
  });

  if (existing) {
    return existing.id;
  }

  const [created] = await db
    .insert(leadSearchSchema)
    .values({
      organizationId: options.organizationId,
      userId: options.userId,
      name: FUNNEL_SEARCH_NAME,
      searchTerms: [],
      location: 'girhouse.com',
      maxResults: 0,
      status: 'done',
    })
    .returning({ id: leadSearchSchema.id });

  if (!created) {
    throw new Error('The funnel lead search could not be created');
  }

  return created.id;
};

/**
 * Reads the Google Maps facts of the place the lead picked, empty when they picked none.
 * @param place The place, if any.
 * @returns The facts, as lead columns.
 */
const placeColumns = (place: FunnelDemoRequest['place']) => ({
  address: place?.address ?? null,
  category: place?.category ?? null,
  rating: place?.rating ?? null,
  reviewsCount: place?.reviews ?? null,
});

/**
 * Reads what the funnel request says about the business, as lead columns.
 * @param request The funnel request.
 * @returns The place id, a stand-in one when the business is not on Google Maps, and the facts.
 */
const funnelLeadFacts = (request: FunnelDemoRequest) => {
  const website = request.place?.website ?? null;
  const [first, ...rest] = request.name.split(/\s+/u);

  return {
    ...placeColumns(request.place),
    placeId: request.place?.id ?? `${FUNNEL_PLACE_PREFIX}${request.ghlContactId}`,
    company: request.company,
    website,
    domain: website ? new URL(website).hostname.replace(/^www\./u, '') : null,
    hasWebsite: Boolean(website),
    phone: request.place?.phone ?? request.phone ?? null,
    city: request.city ?? null,
    firstName: first ?? null,
    lastName: rest.join(' ') || null,
    email: request.email,
  };
};

/**
 * Stores the business as a lead, or reuses the lead the organization already has for the place.
 * A business not found on Google Maps gets a stand-in place, so its demo is built from what the
 * lead wrote. New funnel leads are filtered out, so no cold email search ever claims them.
 * @param options The lead.
 * @param options.request The funnel request.
 * @param options.organizationId The organization.
 * @param options.leadSearchId The funnel lead search.
 * @returns The lead id.
 */
const ensureFunnelLead = async (options: {
  request: FunnelDemoRequest;
  organizationId: string;
  leadSearchId: string;
}) => {
  const facts = funnelLeadFacts(options.request);
  const { placeId } = facts;

  await db
    .insert(leadSchema)
    .values({
      ...facts,
      leadSearchId: options.leadSearchId,
      organizationId: options.organizationId,
      status: 'filtered_out',
    })
    .onConflictDoNothing();

  const lead = await db.query.leadSchema.findFirst({
    where: and(
      eq(leadSchema.organizationId, options.organizationId),
      eq(leadSchema.placeId, placeId),
    ),
  });

  if (!lead) {
    throw new Error(`The lead for place ${placeId} could not be stored`);
  }

  return lead.id;
};

/**
 * Returns the funnel conversation of a GHL contact, creating it on first use. It has no
 * campaign and no mailbox, so no email is ever written or sent for it.
 * @param options The conversation.
 * @param options.request The funnel request.
 * @param options.organizationId The organization.
 * @param options.userId Who the AI calls are billed to.
 * @param options.leadId The lead.
 * @returns The conversation.
 */
const ensureFunnelConversation = async (options: {
  request: FunnelDemoRequest;
  organizationId: string;
  userId: string;
  leadId: string;
}) => {
  const { request } = options;
  const existing = await db.query.conversationSchema.findFirst({
    where: and(
      eq(conversationSchema.organizationId, options.organizationId),
      eq(conversationSchema.ghlContactId, request.ghlContactId),
      isNull(conversationSchema.campaignId),
    ),
  });

  if (existing) {
    return existing;
  }

  const [created] = await db
    .insert(conversationSchema)
    .values({
      organizationId: options.organizationId,
      userId: options.userId,
      leadId: options.leadId,
      leadEmail: request.email,
      company: request.company,
      state: 'demo_sent',
      phoneE164: toE164(request.phone),
      ghlContactId: request.ghlContactId,
    })
    .returning();

  if (!created) {
    throw new Error(`The conversation of GHL contact ${request.ghlContactId} could not be stored`);
  }

  await logEvent({
    conversationId: created.id,
    type: 'funnel_demo_requested',
    payload: { funnel: request.funnel, placeId: request.place?.id ?? null },
  });

  return created;
};

/**
 * Builds the demo a funnel lead asked for, or returns the one already built. The video is made
 * in the background afterwards; `getFunnelDemoStatus` tells when it is ready to send.
 * @param request The funnel request.
 * @returns The demo's slug and public link.
 * @throws {Error} When there is no organization to build it for, or it cannot be stored.
 */
export const createFunnelDemo = async (request: FunnelDemoRequest) => {
  const organizationId = await findFunnelOrganization();
  const userId = organizationId ? await findFunnelUser(organizationId) : null;

  if (!organizationId || !userId) {
    throw new Error('No organization to build funnel demos for');
  }

  const leadSearchId = await ensureFunnelSearch({ organizationId, userId });
  const leadId = await ensureFunnelLead({ request, organizationId, leadSearchId });
  const conversation = await ensureFunnelConversation({
    request,
    organizationId,
    userId,
    leadId,
  });
  const demo = await ensureDemo(conversation);

  logger.info('Built the {funnel} demo {slug} for GHL contact {contact}', {
    funnel: request.funnel,
    slug: demo.slug,
    contact: request.ghlContactId,
  });

  return { slug: demo.slug, url: demoUrl(demo.slug) };
};

/**
 * Tells whether a demo's video is ready to send: voiced, or given up on so the page types the
 * lines instead.
 * @param slug The demo's slug.
 * @returns The link and whether it is ready, or null when there is no such demo.
 */
export const getFunnelDemoStatus = async (slug: string) => {
  const demo = await db.query.demoSchema.findFirst({ where: eq(demoSchema.slug, slug) });

  if (!demo) {
    return null;
  }

  const voice = demo.vsl?.voice ?? 'pending';

  return { slug: demo.slug, url: demoUrl(demo.slug), voice, ready: voice !== 'pending' };
};
