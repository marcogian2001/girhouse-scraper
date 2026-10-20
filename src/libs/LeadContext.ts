import { eq } from 'drizzle-orm';
import { contactSchema, leadSchema } from '@/models/Schema';
import type { LeadContext } from '@/services/ReplyPrompt';
import type { Conversation } from './Conversations';
import { db } from './DB';

/**
 * Joins a first and last name.
 * @param firstName The first name, if known.
 * @param lastName The last name, if known.
 * @returns The full name, or null when neither is known.
 */
const fullName = (firstName?: string | null, lastName?: string | null) =>
  [firstName, lastName].filter(Boolean).join(' ') || null;

/**
 * Gathers what the platform knows about the business behind a conversation:
 * everything from the lead search when there was one, else the campaign contact.
 * @param conversation The conversation.
 * @returns The lead context, empty where nothing is known.
 */
export const loadLeadContext = async (conversation: Conversation): Promise<LeadContext> => {
  const lead = conversation.leadId
    ? await db.query.leadSchema.findFirst({ where: eq(leadSchema.id, conversation.leadId) })
    : undefined;

  if (lead) {
    return {
      company: lead.company,
      contactName: fullName(lead.firstName, lead.lastName),
      city: lead.city,
      category: lead.category,
      description: lead.description,
      website: lead.website,
      rating: lead.rating,
      reviewsCount: lead.reviewsCount,
    };
  }

  const contact = conversation.contactId
    ? await db.query.contactSchema.findFirst({
        where: eq(contactSchema.id, conversation.contactId),
      })
    : undefined;

  return {
    company: contact?.company ?? conversation.company,
    contactName: fullName(contact?.firstName, contact?.lastName),
    city: null,
    category: null,
    description: null,
    website: contact?.website ?? null,
    rating: null,
    reviewsCount: null,
  };
};
