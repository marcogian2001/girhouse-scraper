import { desc, eq } from 'drizzle-orm';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { KnowledgeManager } from '@/components/KnowledgeManager';
import { PageHeader } from '@/components/PageHeader';
import { getApiContext } from '@/libs/ApiAuth';
import { db } from '@/libs/DB';
import { knowledgeAssetSchema } from '@/models/Schema';

export default async function KnowledgePage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'KnowledgePage' });
  const context = await getApiContext();

  const assets = context
    ? await db
        .select({
          id: knowledgeAssetSchema.id,
          name: knowledgeAssetSchema.name,
          kind: knowledgeAssetSchema.kind,
          content: knowledgeAssetSchema.content,
        })
        .from(knowledgeAssetSchema)
        .where(eq(knowledgeAssetSchema.organizationId, context.organizationId))
        .orderBy(desc(knowledgeAssetSchema.createdAt))
    : [];

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader title={t('title')} description={t('description')} />

      <KnowledgeManager assets={assets} />
    </div>
  );
}
