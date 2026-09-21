'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import type { CampaignSettings } from '@/validations/CampaignValidation';

export const CampaignReview = (props: {
  fileName: string;
  contactCount: number;
  settings: CampaignSettings;
  knowledgeAssets: { id: string; name: string }[];
}) => {
  const t = useTranslations('NewCampaignWizard');
  const settingsT = useTranslations('CampaignSettingsForm');

  const selectedAssets = props.knowledgeAssets.filter((asset) =>
    props.settings.knowledgeAssetIds.includes(asset.id),
  );

  const rows = [
    { label: t('review_name'), value: props.settings.name },
    {
      label: t('review_contacts'),
      value: t('review_contacts_value', { count: props.contactCount, file: props.fileName }),
    },
    { label: t('review_emails'), value: String(props.settings.emailCount) },
    { label: t('review_processor'), value: settingsT(`processor_${props.settings.processor}`) },
  ];

  return (
    <div className="space-y-6">
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[max-content_1fr]">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="text-sm text-muted-foreground">{row.label}</dt>
            <dd className="text-sm font-medium">{row.value}</dd>
          </div>
        ))}

        <dt className="text-sm text-muted-foreground">{t('review_schedule')}</dt>
        <dd className="flex flex-wrap items-center gap-1.5 text-sm">
          {Array.from({ length: props.settings.emailCount }, (_unused, index) => index).map(
            (index) => (
              <span key={index} className="flex items-center gap-1.5">
                <span className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-xs font-medium text-primary">
                  {index + 1}
                </span>

                {/* The gap after the last email is never used, so it is not shown */}
                {index < props.settings.emailCount - 1 && (
                  <span className="text-xs text-muted-foreground">
                    {t('review_delay', { days: props.settings.delaysDays[index] ?? 0 })}
                  </span>
                )}
              </span>
            ),
          )}
        </dd>

        {selectedAssets.length > 0 && (
          <>
            <dt className="text-sm text-muted-foreground">{t('review_knowledge')}</dt>
            <dd className="flex flex-wrap gap-1.5">
              {selectedAssets.map((asset) => (
                <Badge key={asset.id} variant="outline">
                  {asset.name}
                </Badge>
              ))}
            </dd>
          </>
        )}
      </dl>

      {props.settings.extraPrompt && (
        <div className="space-y-1.5">
          <p className="text-sm text-muted-foreground">{t('review_brief')}</p>
          <p className="line-clamp-4 rounded-xl bg-muted/50 p-3 text-sm whitespace-pre-wrap">
            {props.settings.extraPrompt}
          </p>
        </div>
      )}
    </div>
  );
};
