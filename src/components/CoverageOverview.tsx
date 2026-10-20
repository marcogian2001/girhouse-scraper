'use client';

import { Gauge, MapPin, Store } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { CoverageGroupCard } from '@/components/CoverageGroupCard';
import { StatCard } from '@/components/StatCard';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { CoverageArea } from '@/libs/Coverage';
import type { CoverageGrouping } from '@/utils/Coverage';
import { estimateMonths, groupCoverage, sumCompletion } from '@/utils/Coverage';

const GROUPINGS: CoverageGrouping[] = ['term', 'region'];

// Select items need a non-empty value, so these stand for "every option" and "unknown region"
const ALL = '*';
const OTHER_REGION = '-';

/**
 * Shows the coverage of a plan grouped by profession or by region, filtered by both.
 * @param props Component props.
 * @param props.coverage The terms of the plan with the areas searched for each.
 * @param props.dailyPlaces Places scraped each day to find the emails asked for.
 * @returns The stats, the filters and a card per group.
 */
export const CoverageOverview = (props: {
  coverage: { term: string; isActive: boolean; areas: CoverageArea[] }[];
  dailyPlaces: number;
}) => {
  const t = useTranslations('CoverageOverview');
  const format = useFormatter();
  const [by, setBy] = useState<CoverageGrouping>('term');
  const [region, setRegion] = useState(ALL);
  const [term, setTerm] = useState(ALL);

  const rows = props.coverage.flatMap((item) =>
    item.areas.map((area) => ({ ...area, term: item.term })),
  );
  const regions = [
    ...new Set(rows.flatMap((row) => (row.region === null ? [] : [row.region]))),
  ].toSorted((a, b) => a.localeCompare(b));
  const hasOtherRegion = rows.some((row) => row.region === null);
  const visible = rows.filter(
    (row) =>
      (region === ALL || (row.region ?? OTHER_REGION) === region) &&
      (term === ALL || row.term === term),
  );
  const groups = groupCoverage({ rows: visible, by });

  // Professions never searched still get a card, unless a region narrows the view
  if (by === 'term' && region === ALL) {
    for (const item of props.coverage) {
      if (
        (term === ALL || item.term === term) &&
        !groups.some((group) => group.key === item.term)
      ) {
        groups.push({ key: item.term, groups: [] });
      }
    }

    groups.sort((a, b) => (a.key ?? '').localeCompare(b.key ?? ''));
  }

  const unusedPlaces = visible.reduce((sum, row) => sum + row.unusedPlaces, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{t('label_group')}</span>
          <Tabs
            value={by}
            onValueChange={(value) => {
              const next = GROUPINGS.find((option) => option === value);

              if (next) {
                setBy(next);
              }
            }}
          >
            <TabsList>
              {GROUPINGS.map((option) => (
                <TabsTrigger key={option} value={option}>
                  {t(`group_${option}`)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <div className="flex gap-3 sm:ml-auto">
          <Select value={region} onValueChange={setRegion}>
            <SelectTrigger className="flex-1 sm:w-48" aria-label={t('filter_region')}>
              <SelectValue />
            </SelectTrigger>

            <SelectContent>
              <SelectItem value={ALL}>{t('filter_all_regions')}</SelectItem>
              {regions.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
              {hasOtherRegion && <SelectItem value={OTHER_REGION}>{t('region_other')}</SelectItem>}
            </SelectContent>
          </Select>

          <Select value={term} onValueChange={setTerm}>
            <SelectTrigger className="flex-1 sm:w-48" aria-label={t('filter_term')}>
              <SelectValue />
            </SelectTrigger>

            <SelectContent>
              <SelectItem value={ALL}>{t('filter_all_terms')}</SelectItem>
              {props.coverage.map((item) => (
                <SelectItem key={item.term} value={item.term} className="capitalize">
                  {item.term}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label={t('stat_areas')}
          value={new Set(visible.map((row) => row.placeId)).size}
          icon={<MapPin className="size-4" />}
          description={t('stat_areas_hint', {
            terms: new Set(visible.map((row) => row.term)).size,
          })}
        />
        <StatCard
          label={t('stat_completion')}
          value={format.number(sumCompletion(visible), { style: 'percent' })}
          icon={<Gauge className="size-4" />}
          description={t('stat_completion_hint')}
        />
        <StatCard
          label={t('stat_unused')}
          value={format.number(unusedPlaces)}
          icon={<Store className="size-4" />}
          description={t('stat_unused_hint', {
            months: estimateMonths({ unusedPlaces, dailyPlaces: props.dailyPlaces }),
          })}
        />
      </div>

      {groups.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t('empty')}
        </p>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {groups.map((group) => (
            <CoverageGroupCard
              key={group.key ?? OTHER_REGION}
              by={by}
              title={group.key}
              isPaused={
                by === 'term' &&
                props.coverage.some((item) => item.term === group.key && !item.isActive)
              }
              groups={group.groups}
            />
          ))}
        </div>
      )}
    </div>
  );
};
