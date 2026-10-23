import { useFormatter, useTranslations } from 'next-intl';
import { AnalyzeCampaignButton } from '@/components/AnalyzeCampaignButton';
import { CampaignTestForm } from '@/components/CampaignTestForm';
import type { CampaignTest } from '@/components/CampaignTestsTable';
import { PromptStructure } from '@/components/CampaignTestsTable';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { STEP_BASE } from '@/utils/CampaignTests';

/**
 * A campaign's test record on its own page: each step with its share of the leads
 * contacted and of its base step, the structure of the emails and the editable targeting.
 * @param props Component props.
 * @param props.test The campaign test.
 * @returns The card.
 */
export const CampaignTestCard = (props: { test: CampaignTest }) => {
  const t = useTranslations('CampaignTests');
  const format = useFormatter();
  const { test } = props;
  const percent = (rate: number | null) =>
    rate === null ? '–' : format.number(rate, { style: 'percent', maximumFractionDigits: 1 });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('card_title')}</CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <div>
            <dt className="text-xs text-muted-foreground">{t('column_contacted')}</dt>
            <dd className="text-2xl font-semibold tabular-nums">{test.contacted}</dd>
            {test.isContactedEstimate && (
              <dd className="text-xs text-muted-foreground">{t('contacted_estimate')}</dd>
            )}
          </div>

          {test.steps.map((step) => (
            <div key={step.step}>
              <dt className="text-xs text-muted-foreground">{t(`step_${step.step}`)}</dt>
              <dd className="text-2xl font-semibold tabular-nums">{step.count}</dd>
              <dd className="text-xs text-muted-foreground">
                {t('rate_line', {
                  ofContacted: percent(step.ofContacted),
                  ofBase: percent(step.ofBase),
                  base: t(`base_of_${STEP_BASE[step.step]}`),
                })}
              </dd>
            </div>
          ))}
        </dl>

        <Separator />

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <p className="font-medium">{t('column_structure')}</p>
            <PromptStructure test={test} />
            {test.promptAnalysis && <AnalyzeCampaignButton campaignId={test.id} isRedo />}
          </div>

          <CampaignTestForm
            campaignId={test.id}
            target={test.manualTarget}
            zone={test.manualZone}
            hypothesis={test.hypothesis}
            autoTarget={test.auto.target}
            autoZone={test.auto.zone}
          />
        </div>
      </CardContent>
    </Card>
  );
};
