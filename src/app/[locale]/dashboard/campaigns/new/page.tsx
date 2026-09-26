import { and, asc, eq } from 'drizzle-orm';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import * as z from 'zod';
import { NewCampaignWizard } from '@/components/NewCampaignWizard';
import { getApiContext } from '@/libs/ApiAuth';
import { db } from '@/libs/DB';
import { knowledgeAssetSchema, leadSchema, leadSearchSchema } from '@/models/Schema';
import { toLeadCsv } from '@/utils/Leads';

/**
 * Loads the ready leads of a search as the contact list of a new campaign.
 * @param options The call options.
 * @param options.leadSearchId The lead search to start from.
 * @param options.organizationId The organization the search must belong to.
 * @returns The leads laid out as a parsed CSV, or null when there are none.
 */
const loadLeadCsv = async (options: { leadSearchId: string; organizationId: string }) => {
  const search = await db.query.leadSearchSchema.findFirst({
    where: and(
      eq(leadSearchSchema.id, options.leadSearchId),
      eq(leadSearchSchema.organizationId, options.organizationId),
    ),
  });

  if (!search) {
    return null;
  }

  const leads = await db
    .select()
    .from(leadSchema)
    .where(and(eq(leadSchema.leadSearchId, search.id), eq(leadSchema.status, 'ready')))
    .orderBy(asc(leadSchema.company));

  return leads.length > 0 ? toLeadCsv({ name: search.name, leads }) : null;
};

export default async function NewCampaignPage(props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ leadSearchId?: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const { leadSearchId } = await props.searchParams;

  const t = await getTranslations({ locale, namespace: 'NewCampaignPage' });
  const context = await getApiContext();

  const knowledgeAssets = context
    ? await db
        .select({ id: knowledgeAssetSchema.id, name: knowledgeAssetSchema.name })
        .from(knowledgeAssetSchema)
        .where(eq(knowledgeAssetSchema.organizationId, context.organizationId))
        .orderBy(asc(knowledgeAssetSchema.name))
    : [];

  const initialCsv =
    context && leadSearchId && z.uuid().safeParse(leadSearchId).success
      ? await loadLeadCsv({ leadSearchId, organizationId: context.organizationId })
      : null;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </div>

      <NewCampaignWizard knowledgeAssets={knowledgeAssets} initialCsv={initialCsv} />
    </div>
  );
}
