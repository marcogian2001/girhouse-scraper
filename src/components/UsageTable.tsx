import { useFormatter, useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@/components/ui/item';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { UsageTotals } from '@/libs/Usage';
import { COMPACT_FORMAT, microsToUsd, USD_FORMAT } from '@/utils/UsageFormat';

type UsageRow = { key: string; label: React.ReactNode; totals: UsageTotals };

/**
 * Lists spend broken down by one dimension, such as day or campaign.
 * A table from `md` up, a stack of rows on phones.
 * @param props Component props.
 * @param props.title Heading of the first column.
 * @param props.rows One entry per group, already sorted.
 * @param props.total The totals of every row together.
 * @returns The breakdown with a total row.
 */
export const UsageTable = (props: { title: string; rows: UsageRow[]; total: UsageTotals }) => {
  const t = useTranslations('UsageTable');
  const format = useFormatter();

  const usd = (micros: number) => format.number(microsToUsd(micros), USD_FORMAT);
  const tokens = (count: number) => format.number(count, COMPACT_FORMAT);

  const cells = (totals: UsageTotals) => (
    <>
      <TableCell className="text-right tabular-nums">{tokens(totals.anthropicTokens)}</TableCell>
      <TableCell className="text-right tabular-nums">{usd(totals.anthropicCostMicros)}</TableCell>
      <TableCell className="text-right tabular-nums">{totals.parallelRuns}</TableCell>
      <TableCell className="text-right tabular-nums">{usd(totals.parallelCostMicros)}</TableCell>
      <TableCell className="text-right tabular-nums">{usd(totals.leadsCostMicros)}</TableCell>
      <TableCell className="text-right font-medium tabular-nums">
        {usd(totals.totalCostMicros)}
      </TableCell>
    </>
  );

  return (
    <>
      <Card className="hidden p-0 md:block">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>{props.title}</TableHead>
              <TableHead className="text-right">{t('column_anthropic_tokens')}</TableHead>
              <TableHead className="text-right">{t('column_anthropic_cost')}</TableHead>
              <TableHead className="text-right">{t('column_parallel_runs')}</TableHead>
              <TableHead className="text-right">{t('column_parallel_cost')}</TableHead>
              <TableHead className="text-right">{t('column_leads_cost')}</TableHead>
              <TableHead className="text-right">{t('column_total')}</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {props.rows.map((row) => (
              <TableRow key={row.key}>
                <TableCell>{row.label}</TableCell>
                {cells(row.totals)}
              </TableRow>
            ))}
          </TableBody>

          <TableFooter>
            <TableRow>
              <TableCell>{t('row_total')}</TableCell>
              {cells(props.total)}
            </TableRow>
          </TableFooter>
        </Table>
      </Card>

      <Card className="p-0 md:hidden">
        <ItemGroup>
          {props.rows.map((row) => (
            <Item key={row.key}>
              <ItemContent>
                <ItemTitle>{row.label}</ItemTitle>
                <ItemDescription>
                  {t('row_meta', {
                    tokens: tokens(row.totals.anthropicTokens),
                    anthropicCost: usd(row.totals.anthropicCostMicros),
                    runs: row.totals.parallelRuns,
                    parallelCost: usd(row.totals.parallelCostMicros),
                    leadsCost: usd(row.totals.leadsCostMicros),
                  })}
                </ItemDescription>
              </ItemContent>

              <ItemActions className="font-medium tabular-nums">
                {usd(row.totals.totalCostMicros)}
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      </Card>
    </>
  );
};
