import { asc, eq } from 'drizzle-orm';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import * as z from 'zod';
import { NewCampaignWizard } from '@/components/NewCampaignWizard';
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

  const storedAssets = context
    ? await db
        .select({
          id: knowledgeAssetSchema.id,
          name: knowledgeAssetSchema.name,
          kind: knowledgeAssetSchema.kind,
          anthropicFileId: knowledgeAssetSchema.anthropicFileId,
          openaiFileId: knowledgeAssetSchema.openaiFileId,
        })
        .from(knowledgeAssetSchema)
        .where(eq(knowledgeAssetSchema.organizationId, context.organizationId))
        .orderBy(asc(knowledgeAssetSchema.name))
    : [];

  // File ids stay on the server; the form only needs to know which PDFs GPT cannot read
  const knowledgeAssets = storedAssets.map((asset) => ({
    id: asset.id,
    name: asset.name,
    kind: asset.kind,
    missingOnOpenAI: Boolean(asset.anthropicFileId && !asset.openaiFileId),
  }));

  const averageCall = context ? await getAverageCopywritingCall(context.organizationId) : null;

  const initialCsv =
    context && leadSearchId && z.uuid().safeParse(leadSearchId).success
      ? await loadLeadSearchCsv({ leadSearchId, organizationId: context.organizationId })
      : null;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </div>

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
