import { Coins, MapPin, Receipt, Sparkles, Wallet } from 'lucide-react';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { DatePicker } from '@/components/DatePicker';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { UsageTable } from '@/components/UsageTable';
import { getApiContext } from '@/libs/ApiAuth';
import { Link } from '@/libs/I18nNavigation';
import { EMPTY_USAGE_TOTALS, getCampaignUsage, getDailyUsage, getUsageTotals } from '@/libs/Usage';
import { currentMonthRange, parseDateRange, previousMonthRange } from '@/utils/DateRange';
import { microsToUsd, USD_FORMAT } from '@/utils/UsageFormat';

export default async function UsagePage(props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'UsagePage' });
  const format = await getFormatter({ locale });
  const context = await getApiContext();

  const range = parseDateRange(await props.searchParams);
  const thisMonth = currentMonthRange();
  const lastMonth = previousMonthRange();

  const [totals, daily, campaigns] = context
    ? await Promise.all([
        getUsageTotals({ organizationId: context.organizationId, range }),
        getDailyUsage({ organizationId: context.organizationId, range }),
        getCampaignUsage({ organizationId: context.organizationId, range }),
      ])
    : [EMPTY_USAGE_TOTALS, [], []];

  const usd = (micros: number) => format.number(microsToUsd(micros), USD_FORMAT);
  // Days are bare dates, parsed as UTC midnight, so they are read back in UTC
  const day = (value: string) =>
    format.dateTime(new Date(value), { dateStyle: 'medium', timeZone: 'UTC' });

  const usageLabel = (row: (typeof campaigns)[number]) => {
    if (row.campaignId && row.name) {
      return (
        <Link
          href={`/dashboard/campaigns/${row.campaignId}/`}
          className="font-medium after:absolute after:inset-0"
        >
          {row.name}
        </Link>
      );
    }

    if (row.leadSearchId && row.leadSearchName) {
      return (
        <Link
          href={`/dashboard/leads/${row.leadSearchId}/`}
          className="font-medium after:absolute after:inset-0"
        >
          {t('lead_search_label', { name: row.leadSearchName })}
        </Link>
      );
    }

    return <span className="text-muted-foreground">{t('deleted_campaign')}</span>;
  };

  const stats = [
    {
      label: t('stat_total'),
      value: usd(totals.totalCostMicros),
      icon: <Wallet className="size-4" />,
      description: t('stat_total_range', { from: day(range.from), to: day(range.to) }),
    },
    {
      label: t('stat_copywriting_cost'),
      value: usd(totals.copywritingCostMicros),
      icon: <Sparkles className="size-4" />,
    },
    {
      label: t('stat_parallel_cost'),
      value: usd(totals.parallelCostMicros),
      icon: <Coins className="size-4" />,
      description: t('stat_parallel_note'),
    },
    {
      label: t('stat_leads_cost'),
      value: usd(totals.leadsCostMicros),
      icon: <MapPin className="size-4" />,
      description: t('stat_leads_note'),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />

      {/* Keyed by the range: the inputs are uncontrolled, so a preset link
          would otherwise leave the previous dates in them */}
      <form key={`${range.from}:${range.to}`} className="flex flex-wrap items-end gap-3">
        <Field className="w-auto">
          <FieldLabel htmlFor="usage-from">{t('label_from')}</FieldLabel>
          <DatePicker id="usage-from" name="from" defaultValue={range.from} />
        </Field>

        <Field className="w-auto">
          <FieldLabel htmlFor="usage-to">{t('label_to')}</FieldLabel>
          <DatePicker id="usage-to" name="to" defaultValue={range.to} />
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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
        <EmptyState
          icon={<Receipt />}
          title={t('empty_title')}
          description={t('empty_description')}
        />
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">{t('campaigns_title')}</h2>

            <UsageTable
              title={t('column_campaign')}
              total={totals}
              rows={campaigns.map((campaign) => ({
                key: campaign.campaignId ?? campaign.leadSearchId ?? 'deleted',
                label: usageLabel(campaign),
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
