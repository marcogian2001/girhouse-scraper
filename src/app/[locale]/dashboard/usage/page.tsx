import { Coins, Hash, Receipt, Search, Sparkles } from 'lucide-react';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { StatCard } from '@/components/StatCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { UsageTable } from '@/components/UsageTable';
import { getApiUserId } from '@/libs/ApiAuth';
import { Link } from '@/libs/I18nNavigation';
import { EMPTY_USAGE_TOTALS, getCampaignUsage, getDailyUsage, getUsageTotals } from '@/libs/Usage';
import { currentMonthRange, parseDateRange, previousMonthRange } from '@/utils/DateRange';
import { COMPACT_FORMAT, microsToUsd, USD_FORMAT } from '@/utils/UsageFormat';

export default async function UsagePage(props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'UsagePage' });
  const format = await getFormatter({ locale });
  const userId = await getApiUserId();

  const range = parseDateRange(await props.searchParams);
  const thisMonth = currentMonthRange();
  const lastMonth = previousMonthRange();

  const [totals, daily, campaigns] = userId
    ? await Promise.all([
        getUsageTotals({ userId, range }),
        getDailyUsage({ userId, range }),
        getCampaignUsage({ userId, range }),
      ])
    : [EMPTY_USAGE_TOTALS, [], []];

  const usd = (micros: number) => format.number(microsToUsd(micros), USD_FORMAT);
  const tokens = (count: number) => format.number(count, COMPACT_FORMAT);
  // Days are bare dates, parsed as UTC midnight, so they are read back in UTC
  const day = (value: string) =>
    format.dateTime(new Date(value), { dateStyle: 'medium', timeZone: 'UTC' });

  const stats = [
    {
      label: t('stat_anthropic_cost'),
      value: usd(totals.anthropicCostMicros),
      icon: <Sparkles className="size-4" />,
    },
    {
      label: t('stat_anthropic_tokens'),
      value: tokens(totals.anthropicTokens),
      icon: <Hash className="size-4" />,
      description: t('stat_tokens_breakdown', {
        input: tokens(totals.anthropicInputTokens),
        output: tokens(totals.anthropicOutputTokens),
        cacheWrite: tokens(totals.anthropicCacheWriteTokens),
        cacheRead: tokens(totals.anthropicCacheReadTokens),
      }),
    },
    {
      label: t('stat_parallel_cost'),
      value: usd(totals.parallelCostMicros),
      icon: <Coins className="size-4" />,
      description: t('stat_parallel_note'),
    },
    {
      label: t('stat_parallel_runs'),
      value: totals.parallelRuns,
      icon: <Search className="size-4" />,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <Card size="sm">
        <CardContent>
          {/* Keyed by the range: the inputs are uncontrolled, so a preset link
              would otherwise leave the previous dates in them */}
          <form key={`${range.from}:${range.to}`} className="flex flex-wrap items-end gap-3">
            <Field className="w-auto">
              <FieldLabel htmlFor="usage-from">{t('label_from')}</FieldLabel>
              <Input id="usage-from" type="date" name="from" defaultValue={range.from} />
            </Field>

            <Field className="w-auto">
              <FieldLabel htmlFor="usage-to">{t('label_to')}</FieldLabel>
              <Input id="usage-to" type="date" name="to" defaultValue={range.to} />
            </Field>

            <Button type="submit">{t('button_filter')}</Button>

            <div className="flex gap-2 sm:ml-auto">
              <Button asChild variant="outline">
                <Link href={`/dashboard/usage/?from=${thisMonth.from}&to=${thisMonth.to}`}>
                  {t('preset_this_month')}
                </Link>
              </Button>

              <Button asChild variant="outline">
                <Link href={`/dashboard/usage/?from=${lastMonth.from}&to=${lastMonth.to}`}>
                  {t('preset_last_month')}
                </Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        {t('total_line', {
          from: day(range.from),
          to: day(range.to),
          total: usd(totals.anthropicCostMicros + totals.parallelCostMicros),
        })}
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            icon={stat.icon}
            description={stat.description}
          />
        ))}
      </div>

      {daily.length === 0 ? (
        <Empty className="rounded-xl border border-dashed">
          <EmptyHeader>
            <EmptyMedia>
              <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Receipt className="size-5" />
              </span>
            </EmptyMedia>

            <EmptyTitle>{t('empty_title')}</EmptyTitle>
            <EmptyDescription>{t('empty_description')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">{t('campaigns_title')}</h2>

            <UsageTable
              title={t('column_campaign')}
              total={totals}
              rows={campaigns.map((campaign) => ({
                key: campaign.campaignId ?? 'deleted',
                label:
                  campaign.campaignId && campaign.name ? (
                    <Link
                      href={`/dashboard/campaigns/${campaign.campaignId}/`}
                      className="font-medium hover:text-primary"
                    >
                      {campaign.name}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">{t('deleted_campaign')}</span>
                  ),
                totals: campaign,
              }))}
            />
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">{t('daily_title')}</h2>

            <UsageTable
              title={t('column_day')}
              total={totals}
              rows={daily.map((row) => ({ key: row.day, label: day(row.day), totals: row }))}
            />
          </section>
        </>
      )}
    </div>
  );
}
