import { and, asc, eq, inArray } from 'drizzle-orm';
import { getApiContext, notFound, unauthorized } from '@/libs/ApiAuth';
import { db } from '@/libs/DB';
import { campaignSchema, contactSchema, emailDraftSchema, enrichmentSchema } from '@/models/Schema';
import { buildCampaignCsv } from '@/utils/CampaignExport';

export const GET = async (_request: Request, props: { params: Promise<{ id: string }> }) => {
  const context = await getApiContext();

  if (!context) {
    return unauthorized();
  }

  const { id } = await props.params;

  const campaign = await db.query.campaignSchema.findFirst({
    where: and(
      eq(campaignSchema.id, id),
      eq(campaignSchema.organizationId, context.organizationId),
    ),
  });

  if (!campaign) {
    return notFound();
  }

  const contacts = await db
    .select()
    .from(contactSchema)
    .where(eq(contactSchema.campaignId, campaign.id))
    .orderBy(asc(contactSchema.rowIndex));

  const contactIds = contacts.map((contact) => contact.id);

  const [enrichments, drafts] =
    contactIds.length > 0
      ? await Promise.all([
          db.select().from(enrichmentSchema).where(inArray(enrichmentSchema.contactId, contactIds)),
          db.select().from(emailDraftSchema).where(inArray(emailDraftSchema.contactId, contactIds)),
        ])
      : [[], []];

  const csv = buildCampaignCsv({ emailCount: campaign.emailCount, contacts, enrichments, drafts });

  // The ASCII name covers old clients, `filename*` keeps accents where supported
  const fileName = `${campaign.name}.csv`;
  const asciiName = fileName.replaceAll(/[^\w .-]/gu, '_');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
};
