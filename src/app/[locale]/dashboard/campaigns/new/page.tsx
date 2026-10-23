import { asc, eq } from 'drizzle-orm';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import * as z from 'zod';
import { NewCampaignWizard } from '@/components/NewCampaignWizard';
import { PageHeader } from '@/components/PageHeader';
import { getApiContext } from '@/libs/ApiAuth';
import { loadLeadSearchCsv } from '@/libs/Campaigns';
import { db } from '@/libs/DB';
import { getAverageCopywritingCall } from '@/libs/Usage';
import { knowledgeAssetSchema } from '@/models/Schema';
import { TYPICAL_COPYWRITING_CALL } from '@/utils/CopywritingModels';

export default async function NewCampaignPage(props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ leadSearchId?: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const { leadSearchId } = await props.searchParams;

  const t = await getTranslations({ locale, namespace: 'NewCampaignPage' });
  const context = await getApiContext();

  const [storedAssets, averageCall, initialCsv] = context
    ? await Promise.all([
        db
          .select({
            id: knowledgeAssetSchema.id,
            name: knowledgeAssetSchema.name,
            kind: knowledgeAssetSchema.kind,
            anthropicFileId: knowledgeAssetSchema.anthropicFileId,
            openaiFileId: knowledgeAssetSchema.openaiFileId,
          })
          .from(knowledgeAssetSchema)
          .where(eq(knowledgeAssetSchema.organizationId, context.organizationId))
          .orderBy(asc(knowledgeAssetSchema.name)),
        getAverageCopywritingCall(context.organizationId),
        leadSearchId && z.uuid().safeParse(leadSearchId).success
          ? loadLeadSearchCsv({ leadSearchId, organizationId: context.organizationId })
          : null,
      ])
    : [[], null, null];

  // File ids stay on the server; the form only needs to know which PDFs GPT cannot read
  const knowledgeAssets = storedAssets.map((asset) => ({
    id: asset.id,
    name: asset.name,
    kind: asset.kind,
    missingOnOpenAI: Boolean(asset.anthropicFileId && !asset.openaiFileId),
  }));

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader title={t('title')} description={t('description')} />

      <NewCampaignWizard
        knowledgeAssets={knowledgeAssets}
        initialCsv={initialCsv}
        costBasis={{
          tokens: averageCall ?? TYPICAL_COPYWRITING_CALL,
          fromHistory: averageCall !== null,
        }}
      />
    </div>
  );
}
