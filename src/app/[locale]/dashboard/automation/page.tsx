import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AutomationSettingsForm } from '@/components/AutomationSettingsForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getApiContext } from '@/libs/ApiAuth';
import { getAutomationSettings } from '@/libs/AutomationSettings';
import { Env } from '@/libs/Env';
import { getBaseUrl } from '@/utils/Helpers';

export default async function AutomationPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'AutomationPage' });
  const context = await getApiContext();
  const settings = context ? await getAutomationSettings(context.organizationId) : null;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

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
