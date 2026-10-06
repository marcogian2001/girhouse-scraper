import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getApiContext, notFound, unauthorized } from '@/libs/ApiAuth';
import { db } from '@/libs/DB';
import { campaignSchema } from '@/models/Schema';

/**
 * Archives or restores a campaign of the organization in the request context.
 * Archiving only hides the campaign: its jobs, contacts and spend are untouched.
 * @param options The call options.
 * @param options.params The route params holding the campaign id.
 * @param options.archivedAt The archive date, or null to restore the campaign.
 * @returns The updated campaign, or an error response.
 */
const setArchivedAt = async (options: {
  params: Promise<{ id: string }>;
  archivedAt: Date | null;
}) => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  const { id } = await options.params;

  const [updated] = await db
    .update(campaignSchema)
    .set({ archivedAt: options.archivedAt })
    .where(
      and(eq(campaignSchema.id, id), eq(campaignSchema.organizationId, context.organizationId)),
    )
    .returning();

  if (!updated) {
    return notFound();
  }

  return NextResponse.json({ campaign: updated });
};

export const POST = async (_request: Request, props: { params: Promise<{ id: string }> }) =>
  await setArchivedAt({ params: props.params, archivedAt: new Date() });

export const DELETE = async (_request: Request, props: { params: Promise<{ id: string }> }) =>
  await setArchivedAt({ params: props.params, archivedAt: null });
