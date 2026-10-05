import { CircleCheck, Hourglass, Radar, Store } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { StatCard } from '@/components/StatCard';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { CoveragePairStatus } from '@/libs/Coverage';
import { estimateMonths } from '@/utils/Coverage';

type CoverageRow = {
  key: string;
  exhausted: number;
  inProgress: number;
  notStarted: number;
  knownPlaces: number;
  unusedPlaces: number;
};

/**
 * Adds up the pairs sharing a key.
 * @param pairs The pairs to group.
 * @param keyOf Reads the group of a pair.
 * @returns One row per group, in order of first appearance.
 */
const groupPairs = (pairs: CoveragePairStatus[], keyOf: (pair: CoveragePairStatus) => string) => {
  const rows = new Map<string, CoverageRow>();

  for (const pair of pairs) {
    const key = keyOf(pair);
    const row = rows.get(key) ?? {
      key,
      exhausted: 0,
      inProgress: 0,
      notStarted: 0,
      knownPlaces: 0,
      unusedPlaces: 0,
    };

    row.exhausted += pair.status === 'exhausted' ? 1 : 0;
    row.inProgress += pair.status === 'in_progress' ? 1 : 0;
    row.notStarted += pair.status === 'not_started' ? 1 : 0;
    row.knownPlaces += pair.knownPlaces;
    row.unusedPlaces += pair.unusedPlaces;
    rows.set(key, row);
  }

  return [...rows.values()];
};

/**
 * Shows the pairs of a plan added up by one dimension.
 * @param props Component props.
 * @param props.heading The header of the first column.
 * @param props.rows The rows to show.
 * @returns A table of coverage counts.
 */
const CoverageTable = (props: { heading: string; rows: CoverageRow[] }) => {
  const t = useTranslations('CoverageSummary');

  return (
    <Card className="overflow-x-auto p-0">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead>{props.heading}</TableHead>
            <TableHead className="text-right">{t('column_exhausted')}</TableHead>
            <TableHead className="text-right">{t('column_in_progress')}</TableHead>
            <TableHead className="text-right">{t('column_not_started')}</TableHead>
            <TableHead className="text-right">{t('column_known')}</TableHead>
            <TableHead className="text-right">{t('column_unused')}</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {props.rows.map((row) => (
            <TableRow key={row.key}>
              <TableCell className="font-medium">{row.key}</TableCell>
              <TableCell className="text-right tabular-nums">{row.exhausted}</TableCell>
              <TableCell className="text-right tabular-nums">{row.inProgress}</TableCell>
              <TableCell className="text-right tabular-nums">{row.notStarted}</TableCell>
              <TableCell className="text-right tabular-nums">{row.knownPlaces}</TableCell>
              <TableCell className="text-right tabular-nums">{row.unusedPlaces}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
};

export const CoverageSummary = (props: { pairs: CoveragePairStatus[]; dailyLeads: number }) => {
  const t = useTranslations('CoverageSummary');
  const format = useFormatter();

  const [total] = groupPairs(props.pairs, () => '');
  const censused = props.pairs.filter((pair) => pair.hasArea && pair.pendingCells === 0).length;
  const share = (part: number) =>
    format.number(props.pairs.length === 0 ? 0 : part / props.pairs.length, {
      style: 'percent',
    });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t('stat_exhausted')}
          value={share(total?.exhausted ?? 0)}
          icon={<CircleCheck className="size-4" />}
          description={t('stat_exhausted_hint', {
            exhausted: total?.exhausted ?? 0,
            total: props.pairs.length,
          })}
        />
        <StatCard
          label={t('stat_census')}
          value={share(censused)}
          icon={<Radar className="size-4" />}
          description={t('stat_census_hint')}
        />
        <StatCard
          label={t('stat_unused')}
          value={format.number(total?.unusedPlaces ?? 0)}
          icon={<Store className="size-4" />}
          description={t('stat_unused_hint', { known: total?.knownPlaces ?? 0 })}
        />
        <StatCard
          label={t('stat_months')}
          value={format.number(
            estimateMonths({
              unusedPlaces: total?.unusedPlaces ?? 0,
              dailyLeads: props.dailyLeads,
            }),
          )}
          icon={<Hourglass className="size-4" />}
          description={t('stat_months_hint')}
        />
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('title_terms')}</h2>
        <CoverageTable
          heading={t('column_term')}
          rows={groupPairs(props.pairs, (pair) => pair.term)}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('title_regions')}</h2>
        <CoverageTable
          heading={t('column_region')}
          rows={groupPairs(props.pairs, (pair) => pair.region)}
        />
      </section>
    </div>
  );
};
