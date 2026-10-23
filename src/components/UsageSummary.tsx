import { useFormatter, useTranslations } from 'next-intl';
import { SidebarMenu, SidebarMenuItem } from '@/components/ui/sidebar';
import { UsageSummaryLink } from '@/components/UsageSummaryLink';
import type { UsageTotals } from '@/libs/Usage';
import type { DateRange } from '@/utils/DateRange';
import { COMPACT_FORMAT, microsToUsd, USD_FORMAT } from '@/utils/UsageFormat';

/**
 * Shows this month's API spend above the account menu, linking to the full report.
 * Rendered on the server only: compact number formatting differs between the
 * ICU data in Node and in browsers, which would break hydration.
 * @param props Component props.
 * @param props.period The calendar month the totals cover.
 * @param props.totals The spend for that month.
 * @returns A sidebar entry, reduced to an icon with a tooltip when collapsed.
 */
export const UsageSummary = (props: { period: DateRange; totals: UsageTotals }) => {
  const t = useTranslations('UsageSummary');
  const format = useFormatter();

  // `from` is a bare date, parsed as UTC midnight, so the month is read in UTC
  const month = format.dateTime(new Date(props.period.from), { month: 'long', timeZone: 'UTC' });
  const total = format.number(microsToUsd(props.totals.totalCostMicros), USD_FORMAT);

  const lines = [
    {
      label: t('claude_line', {
        tokens: format.number(props.totals.copywritingTokens, COMPACT_FORMAT),
      }),
      value: format.number(microsToUsd(props.totals.copywritingCostMicros), USD_FORMAT),
    },
    {
      label: t('parallel_line', { runs: props.totals.parallelRuns }),
      value: t('parallel_cost', {
        cost: format.number(microsToUsd(props.totals.parallelCostMicros), USD_FORMAT),
      }),
    },
    ...(props.totals.leadsCostMicros > 0
      ? [
          {
            label: t('apify_line'),
            value: format.number(microsToUsd(props.totals.leadsCostMicros), USD_FORMAT),
          },
        ]
      : []),
  ];

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <UsageSummaryLink tooltip={t('tooltip', { month, total })}>
          <div className="grid min-w-0 flex-1 gap-2 group-data-[collapsible=icon]:hidden">
            <span className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-xs text-muted-foreground">
                {t('title', { month })}
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums">{total}</span>
            </span>

            <dl className="grid gap-1 border-t pt-2 text-xs">
              {lines.map((line) => (
                <div key={line.label} className="flex justify-between gap-2">
                  <dt className="min-w-0 truncate text-muted-foreground">{line.label}</dt>
                  <dd className="shrink-0 font-medium tabular-nums">{line.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </UsageSummaryLink>
      </SidebarMenuItem>
    </SidebarMenu>
  );
};
