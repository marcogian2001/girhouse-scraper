import { eq, inArray, sql } from 'drizzle-orm';
import { campaignSchema, contactSchema, leadOutcomeSchema } from '@/models/Schema';
import type { PipelineOpportunity } from '@/services/GoHighLevel';
import {
  getPipelineStageNames,
  listCalendarAppointments,
  listPipelineOpportunities,
} from '@/services/GoHighLevel';
import { toGhlOutcomes } from '@/utils/GhlOutcomes';
import { db } from './DB';
import { logger } from './Logger';

/** Rows per insert, well inside Postgres' parameter limit. */
const INSERT_CHUNK = 500;

/** How far ahead the calendar is read, for calls booked but not held yet. */
const AHEAD_MS = 180 * 24 * 60 * 60 * 1000;

/**
 * Reads the calendar from the pipeline's first opportunity on, so every call of a cold
 * email lead is in range.
 * @param opportunities The pipeline's opportunities.
 * @returns The appointments.
 */
const listPipelineAppointments = async (opportunities: PipelineOpportunity[]) => {
  const first = Math.min(
    Date.now(),
    ...opportunities.map((opportunity) => new Date(opportunity.createdAt).getTime()),
  );

  return await listCalendarAppointments({
    from: new Date(first),
    to: new Date(Date.now() + AHEAD_MS),
  });
};

/**
 * Copies onto the leads' outcomes the calls booked, missed and sold in the cold email
 * pipeline on GHL, so the campaign tests count the leads booked before the GHL webhook
 * existed, or booked by a setter without one. Each lead goes to every organization that
 * emailed them. Times already recorded are kept: GHL only fills the missing ones.
 * @returns How many leads with a booked call were found and how many outcomes written.
 * @throws {Error} When GHL is not configured or rejects a request.
 */
export const syncGhlOutcomes = async () => {
  const [opportunities, stageNames] = await Promise.all([
    listPipelineOpportunities(),
    getPipelineStageNames(),
  ]);
  const outcomes = toGhlOutcomes({
    opportunities,
    stageNames,
    appointments: await listPipelineAppointments(opportunities),
  });
  const emails = [...outcomes.keys()];

  const recipients =
    emails.length === 0
      ? []
      : await db
          .selectDistinct({
            organizationId: campaignSchema.organizationId,
            email: sql<string>`lower(${contactSchema.email})`,
          })
          .from(contactSchema)
          .innerJoin(campaignSchema, eq(campaignSchema.id, contactSchema.campaignId))
          .where(inArray(sql`lower(${contactSchema.email})`, emails));

  const rows = recipients.flatMap((recipient) => {
    const outcome = outcomes.get(recipient.email);

    return outcome ? [{ ...outcome, organizationId: recipient.organizationId }] : [];
  });

  for (let start = 0; start < rows.length; start += INSERT_CHUNK) {
    // oxlint-disable-next-line no-await-in-loop
    await db
      .insert(leadOutcomeSchema)
      .values(rows.slice(start, start + INSERT_CHUNK))
      .onConflictDoUpdate({
        target: [leadOutcomeSchema.organizationId, leadOutcomeSchema.email],
        set: {
          callBookedAt: sql`coalesce(${leadOutcomeSchema.callBookedAt}, excluded.call_booked_at)`,
          noShowAt: sql`coalesce(${leadOutcomeSchema.noShowAt}, excluded.no_show_at)`,
          wonAt: sql`coalesce(${leadOutcomeSchema.wonAt}, excluded.won_at)`,
          wonValue: sql`coalesce(excluded.won_value, ${leadOutcomeSchema.wonValue})`,
        },
      });
  }

  logger.info('Synced {booked} GHL leads with a booked call into {outcomes} outcomes', {
    booked: outcomes.size,
    outcomes: rows.length,
  });

  return { booked: outcomes.size, outcomes: rows.length };
};
