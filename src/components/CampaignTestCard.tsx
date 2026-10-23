import { useFormatter, useTranslations } from 'next-intl';
import { CampaignTestForm } from '@/components/CampaignTestForm';
import type { CampaignTest } from '@/components/CampaignTestsTable';
import { ExampleEmailButton } from '@/components/ExampleEmailButton';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { STEP_BASE } from '@/utils/CampaignTests';
import { microsToUsd, USD_FORMAT } from '@/utils/UsageFormat';

/**
 * A campaign's test record on its own page: each step with its share of the leads
 * contacted and of its base step, the replies by email, the costs and the editable
 * targeting and notes.
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
  const usd = (micros: number | null) =>
    micros === null ? '–' : format.number(microsToUsd(micros), USD_FORMAT);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('card_title')}</CardTitle>
        <CardAction>
          <ExampleEmailButton campaignName={test.name} email={test.exampleEmail} />
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-6">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
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

        <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">{t('column_replies_by_email')}</dt>
            <dd className="tabular-nums">
              {test.repliesByEmail.length === 0
                ? '–'
                : test.repliesByEmail
                    .map(
                      (item) =>
                        `${t('email_number', { number: item.email })}: ${item.count} (${percent(item.share)})`,
                    )
                    .join(' · ')}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t('column_cost')}</dt>
            <dd className="tabular-nums">
              {usd(test.costMicros)}{' '}
              <span className="text-xs text-muted-foreground">
                {t('cost_leads', { cost: usd(test.leadsCostMicros) })}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t('column_cost_per_call')}</dt>
            <dd className="tabular-nums">{usd(test.costPerCallMicros)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t('column_cost_per_won')}</dt>
            <dd className="tabular-nums">{usd(test.costPerWonMicros)}</dd>
          </div>
        </dl>

        <Separator />

        <CampaignTestForm
          campaignId={test.id}
          target={test.manualTarget}
          zone={test.manualZone}
          hypothesis={test.hypothesis}
          autoTarget={test.auto.target}
          autoZone={test.auto.zone}
        />
      </CardContent>
    </Card>
  );
};
