import { and, asc, eq, inArray } from 'drizzle-orm';
import * as z from 'zod';
import {
  conversationEventSchema,
  conversationSchema,
  demoSchema,
  inboundMessageSchema,
  objectionSchema,
  outboundEmailSchema,
  replyClassificationSchema,
  whatsappHandoffSchema,
} from '@/models/Schema';
import type { DateRange } from '@/utils/DateRange';
import { withinLocalDays } from '@/utils/DateRangeSql';
import type { BookingSource, ConversationFacts } from '@/utils/ReplyStats';
import { buildReplyStats } from '@/utils/ReplyStats';
import { db } from './DB';

const bookedPayloadSchema = z.object({ source: z.enum(['demo', 'email']).optional() });

/**
 * Reads where each conversation's call was booked: the platform logs the demo or the
 * email, GHL reports bookings made by a setter or on WhatsApp.
 * @param conversationIds The conversations.
 * @returns The first booking source of each booked conversation.
 */
const loadBookingSources = async (conversationIds: string[]) => {
  const events = await db
    .select({
      conversationId: conversationEventSchema.conversationId,
      type: conversationEventSchema.type,
      payload: conversationEventSchema.payload,
    })
    .from(conversationEventSchema)
    .where(
      and(
        inArray(conversationEventSchema.conversationId, conversationIds),
        inArray(conversationEventSchema.type, ['call_booked', 'ghl_appointment_booked']),
      ),
    )
    .orderBy(asc(conversationEventSchema.createdAt))
    .$withCache();

  const sources = new Map<string, BookingSource>();

  for (const event of events) {
    if (!sources.has(event.conversationId)) {
      const parse = bookedPayloadSchema.safeParse(event.payload);
      const source = parse.success ? (parse.data.source ?? 'demo') : 'demo';

      sources.set(event.conversationId, event.type === 'ghl_appointment_booked' ? 'ghl' : source);
    }
  }

  return sources;
};

/**
 * Reads the classifications of each conversation, oldest reply first.
 * @param conversationIds The conversations.
 * @returns The first category and every objection of each conversation.
 */
const loadClassifications = async (conversationIds: string[]) => {
  const rows = await db
    .select({
      conversationId: inboundMessageSchema.conversationId,
      category: replyClassificationSchema.category,
      objectionId: replyClassificationSchema.objectionId,
    })
    .from(replyClassificationSchema)
    .innerJoin(
      inboundMessageSchema,
      eq(inboundMessageSchema.id, replyClassificationSchema.inboundMessageId),
    )
    .where(inArray(inboundMessageSchema.conversationId, conversationIds))
    .orderBy(asc(inboundMessageSchema.receivedAt))
    .$withCache();

  const byConversation = new Map<
    string,
    { firstCategory: ConversationFacts['firstCategory']; objectionIds: string[] }
  >();

  for (const row of rows) {
    const entry = byConversation.get(row.conversationId) ?? {
      firstCategory: row.category,
      objectionIds: [],
    };

    if (row.objectionId) {
      entry.objectionIds.push(row.objectionId);
    }

    byConversation.set(row.conversationId, entry);
  }

  return byConversation;
};

/**
 * Reads, for each conversation, whether its demo went out and how far the lead went.
 * @param conversationIds The conversations.
 * @returns The demo facts of each conversation that has a demo.
 */
const loadDemoFacts = async (conversationIds: string[]) => {
  const demos = await db
    .select({
      conversationId: demoSchema.conversationId,
      slug: demoSchema.slug,
      firstOpenedAt: demoSchema.firstOpenedAt,
      completedAt: demoSchema.completedAt,
    })
    .from(demoSchema)
    .where(inArray(demoSchema.conversationId, conversationIds))
    .$withCache();

  const sent = await db
    .select({ conversationId: outboundEmailSchema.conversationId, body: outboundEmailSchema.body })
    .from(outboundEmailSchema)
    .where(
      and(
        inArray(outboundEmailSchema.conversationId, conversationIds),
        eq(outboundEmailSchema.status, 'sent'),
      ),
    )
    .$withCache();

  // A demo built for a draft nobody sent was never in front of the lead
  return new Map(
    demos.map((demo) => [
      demo.conversationId,
      {
        demoSent: sent.some(
          (email) => email.conversationId === demo.conversationId && email.body.includes(demo.slug),
        ),
        demoOpened: demo.firstOpenedAt !== null,
        demoCompleted: demo.completedAt !== null,
      },
    ]),
  );
};

/**
 * Builds the reply automation metrics for the conversations started in a range.
 * Test conversations are left out.
 * @param options The report.
 * @param options.organizationId The organization.
 * @param options.range The days the conversations started on, inclusive.
 * @returns The metrics, with the objections' titles.
 */
export const getReplyStats = async (options: { organizationId: string; range: DateRange }) => {
  const conversations = await db
    .select({ id: conversationSchema.id })
    .from(conversationSchema)
    .where(
      and(
        eq(conversationSchema.organizationId, options.organizationId),
        eq(conversationSchema.isTest, false),
        withinLocalDays(conversationSchema.createdAt, options.range),
      ),
    )
    .$withCache();

  const ids = conversations.map((conversation) => conversation.id);

  if (ids.length === 0) {
    return { stats: buildReplyStats([]), objectionTitles: new Map<string, string>() };
  }

  const [classifications, demos, bookings, handoffs, objections] = await Promise.all([
    loadClassifications(ids),
    loadDemoFacts(ids),
    loadBookingSources(ids),
    db
      .select({ conversationId: whatsappHandoffSchema.conversationId })
      .from(whatsappHandoffSchema)
      .where(
        and(
          inArray(whatsappHandoffSchema.conversationId, ids),
          eq(whatsappHandoffSchema.status, 'sent'),
        ),
      )
      .$withCache(),
    db
      .select({ id: objectionSchema.id, title: objectionSchema.title })
      .from(objectionSchema)
      .where(eq(objectionSchema.organizationId, options.organizationId))
      .$withCache(),
  ]);

  const handedOver = new Set(handoffs.map((handoff) => handoff.conversationId));

  const facts: ConversationFacts[] = ids.map((id) => ({
    firstCategory: classifications.get(id)?.firstCategory ?? null,
    objectionIds: classifications.get(id)?.objectionIds ?? [],
    demoSent: demos.get(id)?.demoSent ?? false,
    demoOpened: demos.get(id)?.demoOpened ?? false,
    demoCompleted: demos.get(id)?.demoCompleted ?? false,
    bookingSource: bookings.get(id) ?? null,
    whatsapp: handedOver.has(id),
  }));

  return {
    stats: buildReplyStats(facts),
    objectionTitles: new Map(objections.map((objection) => [objection.id, objection.title])),
  };
};
