import { desc, eq } from 'drizzle-orm';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { KnowledgeManager } from '@/components/KnowledgeManager';
import { getApiUserId } from '@/libs/ApiAuth';
import { db } from '@/libs/DB';
import { knowledgeAssetSchema } from '@/models/Schema';

export default async function KnowledgePage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'KnowledgePage' });
  const userId = await getApiUserId();

  const assets = userId
    ? await db
        .select({
          id: knowledgeAssetSchema.id,
          name: knowledgeAssetSchema.name,
          kind: knowledgeAssetSchema.kind,
        })
        .from(knowledgeAssetSchema)
        .where(eq(knowledgeAssetSchema.userId, userId))
        .orderBy(desc(knowledgeAssetSchema.createdAt))
    : [];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      <KnowledgeManager assets={assets} />
    </div>
  );
}
