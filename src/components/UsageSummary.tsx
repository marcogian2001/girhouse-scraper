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

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <UsageSummaryLink tooltip={t('tooltip', { month, total })}>
          <div className="grid flex-1 gap-0.5 text-xs group-data-[collapsible=icon]:hidden">
            <span className="flex justify-between gap-2 font-medium">
              <span className="truncate">{t('title', { month })}</span>
              <span className="tabular-nums">{total}</span>
            </span>

            <span className="flex justify-between gap-2 text-muted-foreground">
              <span className="truncate">
                {t('anthropic_line', {
                  tokens: format.number(props.totals.anthropicTokens, COMPACT_FORMAT),
                })}
              </span>
              <span className="tabular-nums">
                {format.number(microsToUsd(props.totals.anthropicCostMicros), USD_FORMAT)}
              </span>
            </span>

            <span className="flex justify-between gap-2 text-muted-foreground">
              <span className="truncate">
                {t('parallel_line', { runs: props.totals.parallelRuns })}
              </span>
              <span className="tabular-nums">
                {t('parallel_cost', {
                  cost: format.number(microsToUsd(props.totals.parallelCostMicros), USD_FORMAT),
                })}
              </span>
            </span>

            {props.totals.leadsCostMicros > 0 && (
              <span className="flex justify-between gap-2 text-muted-foreground">
                <span className="truncate">{t('leads_line')}</span>
                <span className="tabular-nums">
                  {format.number(microsToUsd(props.totals.leadsCostMicros), USD_FORMAT)}
                </span>
              </span>
            )}
          </div>
        </UsageSummaryLink>
      </SidebarMenuItem>
    </SidebarMenu>
  );
};
