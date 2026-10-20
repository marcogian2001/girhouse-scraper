import { BarChart3, CalendarCheck, Inbox, MessageCircle, MonitorPlay } from 'lucide-react';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import {
  CategoryStatsTable,
  ObjectionStatsTable,
  ReplyFunnel,
} from '@/components/ReplyStatsTables';
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
import { getApiContext } from '@/libs/ApiAuth';
import { Link } from '@/libs/I18nNavigation';
import { getReplyStats } from '@/libs/ReplyStats';
import { currentMonthRange, parseDateRange, previousMonthRange } from '@/utils/DateRange';
import { buildReplyStats, rateOf } from '@/utils/ReplyStats';

export default async function MetricsPage(props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'MetricsPage' });
  const format = await getFormatter({ locale });
  const context = await getApiContext();

  const range = parseDateRange(await props.searchParams);
  const thisMonth = currentMonthRange();
  const lastMonth = previousMonthRange();

  const { stats, objectionTitles } = context
    ? await getReplyStats({ organizationId: context.organizationId, range })
    : { stats: buildReplyStats([]), objectionTitles: new Map<string, string>() };

  const { funnel } = stats;
  const bookedRate = rateOf(funnel.booked, funnel.replied);
  // Days are bare dates, parsed as UTC midnight, so they are read back in UTC
  const day = (value: string) =>
    format.dateTime(new Date(value), { dateStyle: 'medium', timeZone: 'UTC' });

  const cards = [
    { label: t('stat_replies'), value: funnel.replied, icon: <Inbox className="size-4" /> },
    {
      label: t('stat_demo_sent'),
      value: funnel.demo_sent,
      icon: <MonitorPlay className="size-4" />,
    },
    {
      label: t('stat_booked'),
      value: funnel.booked,
      icon: <CalendarCheck className="size-4" />,
      description:
        bookedRate === null
          ? undefined
          : t('stat_booked_rate', {
              rate: format.number(bookedRate, { style: 'percent', maximumFractionDigits: 0 }),
            }),
    },
    {
      label: t('stat_whatsapp'),
      value: stats.whatsapp,
      icon: <MessageCircle className="size-4" />,
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
              <FieldLabel htmlFor="metrics-from">{t('label_from')}</FieldLabel>
              <Input id="metrics-from" type="date" name="from" defaultValue={range.from} />
            </Field>

            <Field className="w-auto">
              <FieldLabel htmlFor="metrics-to">{t('label_to')}</FieldLabel>
              <Input id="metrics-to" type="date" name="to" defaultValue={range.to} />
            </Field>

            <Button type="submit">{t('button_filter')}</Button>

            <div className="flex gap-2 sm:ml-auto">
              <Button asChild variant="outline">
                <Link href={`/dashboard/metrics/?from=${thisMonth.from}&to=${thisMonth.to}`}>
                  {t('preset_this_month')}
                </Link>
              </Button>

              <Button asChild variant="outline">
                <Link href={`/dashboard/metrics/?from=${lastMonth.from}&to=${lastMonth.to}`}>
                  {t('preset_last_month')}
                </Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        {t('range_line', { from: day(range.from), to: day(range.to) })}
      </p>

      {funnel.replied === 0 ? (
        <Empty className="rounded-xl border border-dashed">
          <EmptyHeader>
            <EmptyMedia>
              <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <BarChart3 className="size-5" />
              </span>
            </EmptyMedia>

            <EmptyTitle>{t('empty_title')}</EmptyTitle>
            <EmptyDescription>{t('empty_description')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((card) => (
              <StatCard
                key={card.label}
                label={card.label}
                value={card.value}
                icon={card.icon}
                description={card.description}
              />
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ReplyFunnel funnel={funnel} />
            </div>

            <Card>
              <CardContent className="space-y-3">
                <p className="font-medium">{t('sources_title')}</p>
                <dl className="space-y-2 text-sm">
                  {(['demo', 'email', 'ghl'] as const).map((source) => (
                    <div key={source} className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">{t(`source_${source}`)}</dt>
                      <dd className="font-medium tabular-nums">{stats.bookingSources[source]}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          </div>

          <CategoryStatsTable rows={stats.byCategory} />
          <ObjectionStatsTable rows={stats.byObjection} titles={objectionTitles} />
        </>
      )}
    </div>
  );
}
