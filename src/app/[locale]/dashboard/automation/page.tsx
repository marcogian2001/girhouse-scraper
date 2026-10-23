import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AutomationSettingsForm } from '@/components/AutomationSettingsForm';
import { BotCampaignsCard } from '@/components/BotCampaignsCard';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getApiContext } from '@/libs/ApiAuth';
import { getAutomationSettings } from '@/libs/AutomationSettings';
import { db } from '@/libs/DB';
import { Env } from '@/libs/Env';
import { campaignSchema } from '@/models/Schema';
import { getBaseUrl } from '@/utils/Helpers';

export default async function AutomationPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'AutomationPage' });
  const context = await getApiContext();
  const [settings, campaigns] = context
    ? await Promise.all([
        getAutomationSettings(context.organizationId),
        // Only campaigns already on Instantly can receive replies
        db
          .select({
            id: campaignSchema.id,
            name: campaignSchema.name,
            botManaged: campaignSchema.botManaged,
            createdAt: campaignSchema.createdAt,
          })
          .from(campaignSchema)
          .where(
            and(
              eq(campaignSchema.organizationId, context.organizationId),
              isNotNull(campaignSchema.instantlyCampaignId),
              isNull(campaignSchema.archivedAt),
            ),
          )
          .orderBy(desc(campaignSchema.createdAt)),
      ])
    : [null, []];

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />

      <Card>
        <CardHeader>
          <CardTitle>{t('webhook_title')}</CardTitle>
          <CardDescription>
            {Env.INSTANTLY_WEBHOOK_SECRET ? t('webhook_ready') : t('webhook_missing_secret')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <code className="block rounded bg-muted px-2 py-1.5 text-xs break-all">
            {`${getBaseUrl()}/api/webhooks/instantly?secret=INSTANTLY_WEBHOOK_SECRET`}
          </code>
        </CardContent>
      </Card>

      <BotCampaignsCard campaigns={campaigns} />

      {settings && (
        <AutomationSettingsForm
          settings={{
            enabled: settings.enabled,
            mode: settings.mode,
            confidenceThreshold: settings.confidenceThreshold,
            replyDelayMinMinutes: settings.replyDelayMinMinutes,
            replyDelayMaxMinutes: settings.replyDelayMaxMinutes,
            businessHourStart: settings.businessHourStart,
            businessHourEnd: settings.businessHourEnd,
            monthlyPrice: settings.monthlyPrice,
            newMonthlyPrice: settings.newMonthlyPrice,
            priceIncreaseDays: settings.priceIncreaseDays,
            onboardingSlotsPerMonth: settings.onboardingSlotsPerMonth,
            demoNotOpenedBusinessDays: settings.demoNotOpenedBusinessDays,
            maxFollowUps: settings.maxFollowUps,
            whatsappAfterBusinessDays: settings.whatsappAfterBusinessDays,
            nurturingIntervalDays: settings.nurturingIntervalDays,
            nurturingMaxCount: settings.nurturingMaxCount,
            classificationModel: settings.classificationModel,
            writingModel: settings.writingModel,
            whatsappBusinessNumber: settings.whatsappBusinessNumber,
          }}
        />
      )}
    </div>
  );
}
