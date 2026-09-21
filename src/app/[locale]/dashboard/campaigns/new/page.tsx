import { asc, eq } from 'drizzle-orm';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { NewCampaignWizard } from '@/components/NewCampaignWizard';
import { getApiUserId } from '@/libs/ApiAuth';
import { db } from '@/libs/DB';
import { knowledgeAssetSchema } from '@/models/Schema';

export default async function NewCampaignPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'NewCampaignPage' });
  const userId = await getApiUserId();

  const knowledgeAssets = userId
    ? await db
        .select({ id: knowledgeAssetSchema.id, name: knowledgeAssetSchema.name })
        .from(knowledgeAssetSchema)
        .where(eq(knowledgeAssetSchema.userId, userId))
        .orderBy(asc(knowledgeAssetSchema.name))
    : [];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </div>

      <NewCampaignWizard knowledgeAssets={knowledgeAssets} />
    </div>
  );
}
