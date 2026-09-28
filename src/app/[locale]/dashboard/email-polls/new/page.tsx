import { countDistinct, desc, eq } from 'drizzle-orm';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { NewEmailPollForm } from '@/components/NewEmailPollForm';
import { getApiContext } from '@/libs/ApiAuth';
import { db } from '@/libs/DB';
import { campaignSchema, contactSchema, emailDraftSchema } from '@/models/Schema';
import { modelLabel } from '@/utils/EmailPoll';

export default async function NewEmailPollPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'NewEmailPollPage' });
  const context = await getApiContext();

  const campaigns = context
    ? await db
        .select({
          id: campaignSchema.id,
          name: campaignSchema.name,
          model: campaignSchema.copywritingModel,
          // Contacts with at least one draft, the only ones a poll can show
          written: countDistinct(emailDraftSchema.contactId),
        })
        .from(campaignSchema)
        .leftJoin(contactSchema, eq(contactSchema.campaignId, campaignSchema.id))
        .leftJoin(emailDraftSchema, eq(emailDraftSchema.contactId, contactSchema.id))
        .where(eq(campaignSchema.organizationId, context.organizationId))
        .groupBy(campaignSchema.id)
        .orderBy(desc(campaignSchema.createdAt))
    : [];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </div>

      <NewEmailPollForm
        campaigns={campaigns.map((campaign) => ({
          ...campaign,
          model: modelLabel(campaign.model),
        }))}
      />
    </div>
  );
}
