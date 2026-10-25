import { and, eq, inArray, max, sql } from 'drizzle-orm';
import { instantlyCampaignStatSchema, instantlyLeadSchema, jobSchema } from '@/models/Schema';
import { isGhlConfigured, isPipelineConfigured } from '@/services/GoHighLevel';
import { getCampaignAnalytics, listRepliedLeads } from '@/services/Instantly';
import { db } from './DB';
import { syncGhlOutcomes } from './GhlSync';
import { completeJob, enqueue } from './JobQueue';
import { logger } from './Logger';

type Job = typeof jobSchema.$inferSelect;

/** How old the copy of Instantly may get before a page view refreshes it. */
const STALE_AFTER_MS = 15 * 60 * 1000;

/** Rows per insert, well inside Postgres' parameter limit. */
const INSERT_CHUNK = 500;

/**
 * Copies Instantly's totals of every campaign and every lead that replied, so the
 * campaign tests read old campaigns too, replies the platform never received included.
 * Then, when GHL is configured, copies the calls booked in its cold email pipeline.
 * @returns How many campaigns and replied leads were copied, and how many GHL leads booked.
 * @throws {Error} When the API key is missing, or Instantly or GHL rejects a request.
 */
export const syncInstantlyStats = async () => {
  const [totals, leads] = await Promise.all([getCampaignAnalytics(), listRepliedLeads()]);
  const now = new Date();

  const stats = [...totals.entries()].map(([instantlyCampaignId, total]) => ({
    instantlyCampaignId,
    ...total,
    updatedAt: now,
  }));

  for (let start = 0; start < stats.length; start += INSERT_CHUNK) {
    // oxlint-disable-next-line no-await-in-loop
    await db
      .insert(instantlyCampaignStatSchema)
      .values(stats.slice(start, start + INSERT_CHUNK))
      .onConflictDoUpdate({
        target: instantlyCampaignStatSchema.instantlyCampaignId,
        set: {
          contacted: sql`excluded.contacted`,
          replied: sql`excluded.replied`,
          bounced: sql`excluded.bounced`,
          completed: sql`excluded.completed`,
          updatedAt: now,
        },
      });
  }

  // A lead in a campaign twice keeps one row: Instantly lists the same reply once per copy
  const uniqueLeads = [
    ...new Map(leads.map((lead) => [`${lead.campaignId}:${lead.email}`, lead])).values(),
  ];

  for (let start = 0; start < uniqueLeads.length; start += INSERT_CHUNK) {
    // oxlint-disable-next-line no-await-in-loop
    await db
      .insert(instantlyLeadSchema)
      .values(
        uniqueLeads.slice(start, start + INSERT_CHUNK).map((lead) => ({
          instantlyCampaignId: lead.campaignId,
          email: lead.email,
          repliedStep: lead.repliedStep,
          interestStatus: lead.interestStatus,
        })),
      )
      .onConflictDoUpdate({
        target: [instantlyLeadSchema.instantlyCampaignId, instantlyLeadSchema.email],
        set: {
          repliedStep: sql`excluded.replied_step`,
          interestStatus: sql`excluded.interest_status`,
          updatedAt: now,
        },
      });
  }

  logger.info('Synced {campaigns} Instantly campaigns and {leads} replied leads', {
    campaigns: stats.length,
    leads: uniqueLeads.length,
  });

  // After the Instantly copy is saved, so a GHL failure does not lose it
  const ghl = isGhlConfigured() && isPipelineConfigured() ? await syncGhlOutcomes() : null;

  return { campaigns: stats.length, leads: uniqueLeads.length, ghlBooked: ghl?.booked ?? null };
};

/**
 * Reads when Instantly was last copied.
 * @returns The time of the last sync, or null when it never ran.
 */
export const getInstantlySyncedAt = async () => {
  const [row] = await db
    .select({ syncedAt: max(instantlyCampaignStatSchema.updatedAt) })
    .from(instantlyCampaignStatSchema)
    .$withCache();

  return row?.syncedAt ?? null;
};

/**
 * Queues a sync when the copy of Instantly is older than `STALE_AFTER_MS`, unless one
 * is already waiting. The page shows the current copy and the next view gets the new one.
 * @param syncedAt When Instantly was last copied.
 */
export const refreshInstantlyStatsIfStale = async (syncedAt: Date | null) => {
  if (syncedAt && Date.now() - syncedAt.getTime() < STALE_AFTER_MS) {
    return;
  }

  const [pending] = await db
    .select({ id: jobSchema.id })
    .from(jobSchema)
    .where(
      and(eq(jobSchema.type, 'instantly_sync'), inArray(jobSchema.status, ['queued', 'running'])),
    )
    .limit(1);

  if (!pending) {
    await enqueue([{ type: 'instantly_sync' }]);
  }
};

/**
 * Runs a queued sync.
 * @param job The sync job.
 */
const runInstantlySyncJob = async (job: Job) => {
  await syncInstantlyStats();
  await completeJob(job.id);
};

export const instantlySyncJobHandlers = {
  instantly_sync: runInstantlySyncJob,
};

/**
 * Logs a sync that ran out of attempts: the campaign tests keep the last copy.
 * @param message The last error.
 */
export const markInstantlySyncAbandoned = (message: string) => {
  logger.warn('The Instantly sync was abandoned: {error}', { error: message });
};
