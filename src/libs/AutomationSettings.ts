import { eq } from 'drizzle-orm';
import { automationSettingsSchema } from '@/models/Schema';
import type { AutomationSettingsInput } from '@/validations/AutomationValidation';
import { db } from './DB';

/**
 * Reads an organization's automation settings, creating the defaults on first use.
 * @param organizationId The organization to read.
 * @returns The settings row.
 */
export const getAutomationSettings = async (organizationId: string) => {
  await db.insert(automationSettingsSchema).values({ organizationId }).onConflictDoNothing();

  const settings = await db.query.automationSettingsSchema.findFirst({
    where: eq(automationSettingsSchema.organizationId, organizationId),
  });

  if (!settings) {
    throw new Error(`Automation settings for ${organizationId} could not be created`);
  }

  return settings;
};

/**
 * Saves an organization's automation settings.
 * @param options The call options.
 * @param options.organizationId The organization to update.
 * @param options.settings The validated settings.
 * @returns The saved settings.
 */
export const updateAutomationSettings = async (options: {
  organizationId: string;
  settings: AutomationSettingsInput;
}) => {
  const [saved] = await db
    .insert(automationSettingsSchema)
    .values({ organizationId: options.organizationId, ...options.settings })
    .onConflictDoUpdate({
      target: automationSettingsSchema.organizationId,
      set: options.settings,
    })
    .returning();

  return saved;
};
