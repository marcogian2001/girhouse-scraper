import { and, asc, eq } from 'drizzle-orm';
import { objectionSchema } from '@/models/Schema';
import { toObjectionKey } from '@/utils/ReplyRouting';
import type { ObjectionInput } from '@/validations/AutomationValidation';
import { db } from './DB';

/**
 * Lists an organization's objection library, those awaiting review first.
 * @param organizationId The organization to list.
 * @returns The objections.
 */
export const listObjections = async (organizationId: string) =>
  await db
    .select()
    .from(objectionSchema)
    .where(eq(objectionSchema.organizationId, organizationId))
    .orderBy(asc(objectionSchema.status), asc(objectionSchema.title));

/**
 * Adds an objection under a key derived from its title, suffixed when the key is taken.
 * @param options The call options.
 * @param options.organizationId The organization the objection belongs to.
 * @param options.objection The objection fields.
 * @param options.sourceMessageId The reply it was first seen in, when the AI added it.
 * @returns The created objection.
 */
export const createObjection = async (options: {
  organizationId: string;
  objection: ObjectionInput;
  sourceMessageId?: string;
}) => {
  const base = toObjectionKey(options.objection.title);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const key = attempt === 0 ? base : `${base}_${attempt + 1}`;

    // oxlint-disable-next-line no-await-in-loop
    const [created] = await db
      .insert(objectionSchema)
      .values({
        organizationId: options.organizationId,
        key,
        sourceMessageId: options.sourceMessageId,
        ...options.objection,
      })
      .onConflictDoNothing()
      .returning();

    if (created) {
      return created;
    }
  }

  throw new Error(`No free key for objection "${options.objection.title}"`);
};

/**
 * Updates an objection of the organization. The key stays, so past classifications still match.
 * @param options The call options.
 * @param options.organizationId The organization the objection must belong to.
 * @param options.objectionId The objection to update.
 * @param options.objection The new fields.
 * @returns The updated objection, or undefined when it is not the organization's.
 */
export const updateObjection = async (options: {
  organizationId: string;
  objectionId: string;
  objection: ObjectionInput;
}) => {
  const [updated] = await db
    .update(objectionSchema)
    .set(options.objection)
    .where(
      and(
        eq(objectionSchema.id, options.objectionId),
        eq(objectionSchema.organizationId, options.organizationId),
      ),
    )
    .returning();

  return updated;
};

/**
 * Deletes an objection of the organization. Classifications keep their category.
 * @param options The call options.
 * @param options.organizationId The organization the objection must belong to.
 * @param options.objectionId The objection to delete.
 * @returns The deleted id, or undefined when it is not the organization's.
 */
export const deleteObjection = async (options: { organizationId: string; objectionId: string }) => {
  const [deleted] = await db
    .delete(objectionSchema)
    .where(
      and(
        eq(objectionSchema.id, options.objectionId),
        eq(objectionSchema.organizationId, options.organizationId),
      ),
    )
    .returning({ id: objectionSchema.id });

  return deleted?.id;
};
