import { and, asc, eq, isNull } from 'drizzle-orm';
import { memberSchema, organizationSchema, sessionSchema } from '@/models/Schema';
import { db } from './DB';

/**
 * Gives a newly registered user an organization of their own to work in.
 * Mirrors the backfill in `migrations/0004_organizations.sql`.
 * @param user The user who just signed up.
 * @param user.id The user id.
 * @param user.name The display name, reused as the organization name.
 */
export const createPersonalOrganization = async (user: { id: string; name: string }) => {
  // Stamped here, like Better Auth does, so both paths sort on the same clock
  const createdAt = new Date();

  await db.transaction(async (tx) => {
    const [organization] = await tx
      .insert(organizationSchema)
      .values({ id: crypto.randomUUID(), name: user.name, slug: `personal-${user.id}`, createdAt })
      .returning({ id: organizationSchema.id });

    if (!organization) {
      throw new Error('Organization insert returned no row');
    }

    await tx.insert(memberSchema).values({
      id: crypto.randomUUID(),
      organizationId: organization.id,
      userId: user.id,
      role: 'owner',
      createdAt,
    });

    // Better Auth runs this after the sign-up transaction, so the first session
    // already exists and was created before there was an organization to pick
    await tx
      .update(sessionSchema)
      .set({ activeOrganizationId: organization.id })
      .where(and(eq(sessionSchema.userId, user.id), isNull(sessionSchema.activeOrganizationId)));
  });
};

/**
 * Lists the organizations a user belongs to, alphabetically.
 * @param userId The member.
 * @returns The id and name of each organization.
 */
export const getUserOrganizations = async (userId: string) =>
  await db
    .select({ id: organizationSchema.id, name: organizationSchema.name })
    .from(memberSchema)
    .innerJoin(organizationSchema, eq(organizationSchema.id, memberSchema.organizationId))
    .where(eq(memberSchema.userId, userId))
    .orderBy(asc(organizationSchema.name));

/**
 * Picks the organization a user works in: the requested one when they still
 * belong to it, otherwise the first one they joined.
 * @param userId The member.
 * @param requestedId The session's active organization, if any.
 * @returns The organization id, or null when the user belongs to none.
 */
export const resolveOrganizationId = async (userId: string, requestedId?: string | null) => {
  if (requestedId) {
    const membership = await db.query.memberSchema.findFirst({
      columns: { organizationId: true },
      where: and(eq(memberSchema.userId, userId), eq(memberSchema.organizationId, requestedId)),
    });

    if (membership) {
      return membership.organizationId;
    }
  }

  const first = await db.query.memberSchema.findFirst({
    columns: { organizationId: true },
    where: eq(memberSchema.userId, userId),
    orderBy: asc(memberSchema.createdAt),
  });

  return first?.organizationId ?? null;
};
