import { useFormatter, useTranslations } from 'next-intl';
import { StatusBadge } from '@/components/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { buildReplyStats } from '@/utils/ReplyStats';
import { FUNNEL_STEPS, rateOf } from '@/utils/ReplyStats';

type ReplyStats = ReturnType<typeof buildReplyStats>;

/**
 * Formats a rate as a whole percentage, or a dash when there is nothing to divide by.
 * @returns The formatter.
 */
const usePercent = () => {
  const format = useFormatter();

  return (part: number, whole: number) => {
    const rate = rateOf(part, whole);

    return rate === null
      ? '–'
      : format.number(rate, { style: 'percent', maximumFractionDigits: 0 });
  };
};

/**
 * The funnel from the reply to the booked call, each bar sized on the replies and each
 * step showing how many of the previous one made it.
 * @param props Component props.
 * @param props.funnel The count at each step.
 * @returns The funnel card.
 */
export const ReplyFunnel = (props: { funnel: ReplyStats['funnel'] }) => {
  const t = useTranslations('MetricsPage');
  const percent = usePercent();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('funnel_title')}</CardTitle>
      </CardHeader>

      <CardContent>
        <ol className="space-y-3">
          {FUNNEL_STEPS.map((step, index) => {
            const value = props.funnel[step];
            const previous = index > 0 ? props.funnel[FUNNEL_STEPS[index - 1] ?? step] : value;
            const width = rateOf(value, props.funnel.replied) ?? 0;

            return (
              <li key={step} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium">{t(`funnel_${step}`)}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {index > 0
                      ? t('funnel_value_rate', { value, rate: percent(value, previous) })
                      : value}
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(width * 100, value > 0 ? 2 : 0)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
};

/**
 * How the leads went on, by the category of their first reply.
 * @param props Component props.
 * @param props.rows One row per category.
 * @returns The table card.
 */
export const CategoryStatsTable = (props: { rows: ReplyStats['byCategory'] }) => {
  const t = useTranslations('MetricsPage');
  const percent = usePercent();

  return (
    <Card className="p-0">
      <CardHeader className="pt-6">
        <CardTitle>{t('category_title')}</CardTitle>
      </CardHeader>

      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead>{t('column_category')}</TableHead>
            <TableHead className="text-right">{t('column_leads')}</TableHead>
            <TableHead className="text-right">{t('column_demo_sent')}</TableHead>
            <TableHead className="text-right">{t('column_booked')}</TableHead>
            <TableHead className="text-right">{t('column_rate')}</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {props.rows.map((row) => (
            <TableRow key={row.category}>
              <TableCell>
                <StatusBadge kind="replyCategory" status={row.category} />
              </TableCell>
              <TableCell className="text-right tabular-nums">{row.total}</TableCell>
              <TableCell className="text-right tabular-nums">{row.demoSent}</TableCell>
              <TableCell className="text-right tabular-nums">{row.booked}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {percent(row.booked, row.total)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
};

/**
 * How the leads who raised each objection went on.
 * @param props Component props.
 * @param props.rows One row per objection.
 * @param props.titles The objections' titles, by id.
 * @returns The table card, or nothing when no objection was raised.
 */
export const ObjectionStatsTable = (props: {
  rows: ReplyStats['byObjection'];
  titles: Map<string, string>;
}) => {
  const t = useTranslations('MetricsPage');
  const percent = usePercent();

  if (props.rows.length === 0) {
    return null;
  }

  return (
    <Card className="p-0">
      <CardHeader className="pt-6">
        <CardTitle>{t('objection_title')}</CardTitle>
      </CardHeader>

      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead>{t('column_objection')}</TableHead>
            <TableHead className="text-right">{t('column_leads')}</TableHead>
            <TableHead className="text-right">{t('column_booked')}</TableHead>
            <TableHead className="text-right">{t('column_rate')}</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {props.rows.map((row) => (
            <TableRow key={row.objectionId}>
              <TableCell className="font-medium">
                {props.titles.get(row.objectionId) ?? t('objection_deleted')}
              </TableCell>
              <TableCell className="text-right tabular-nums">{row.total}</TableCell>
              <TableCell className="text-right tabular-nums">{row.booked}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {percent(row.booked, row.total)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
};
