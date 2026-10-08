import { getFormatter, getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { getResultCostProviders } from '@/libs/ResultCosts';
import { microsToUsd, USD_FORMAT } from '@/utils/UsageFormat';

export const ResultCostSummary = async (props: {
  kind: 'email' | 'sequence';
  results: number;
  catchAll?: number;
  providers: Awaited<ReturnType<typeof getResultCostProviders>>;
}) => {
  const t = await getTranslations('ResultCostSummary');
  const format = await getFormatter();
  const total = props.providers.reduce((sum, item) => sum + item.costMicros, 0);
  const usd = (micros: number) => format.number(microsToUsd(micros), USD_FORMAT);
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p>
          {t(props.kind === 'email' ? 'email_results' : 'sequence_results', {
            count: props.results,
            cost: props.results > 0 ? usd(total / props.results) : t('unavailable'),
          })}
        </p>
        {props.catchAll !== undefined && <p>{t('catch_all', { count: props.catchAll })}</p>}
        {props.providers.map((item) => (
          <p key={`${item.provider}-${item.basis}`}>
            {item.provider} · {usd(item.costMicros)} · {t(`basis_${item.basis}`)}
          </p>
        ))}
        <p className="text-muted-foreground">
          {t(props.kind === 'email' ? 'email_scope' : 'sequence_scope')}
        </p>
        <p className="text-muted-foreground">{t('unknown_costs')}</p>
      </CardContent>
    </Card>
  );
};
