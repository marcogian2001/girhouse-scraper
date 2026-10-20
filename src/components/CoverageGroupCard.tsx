import { cn } from 'cn';
import { useFormatter, useTranslations } from 'next-intl';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { CoverageArea } from '@/libs/Coverage';
import type { CoverageGrouping } from '@/utils/Coverage';
import { sumCompletion } from '@/utils/Coverage';

/**
 * Shows one group of the coverage page, by profession or by region, with the inner groups
 * folded so their towns and provinces open on demand.
 * @param props Component props.
 * @param props.by What the group is: a profession or a region.
 * @param props.title The profession or region, null for areas of unknown region.
 * @param props.isPaused Whether the plan stopped searching the profession.
 * @param props.groups The inner groups: regions of a profession, or professions of a region.
 * @returns A card per group.
 */
export const CoverageGroupCard = (props: {
  by: CoverageGrouping;
  title: string | null;
  isPaused?: boolean;
  groups: { key: string | null; rows: CoverageArea[] }[];
}) => {
  const t = useTranslations('CoverageGroupCard');
  const format = useFormatter();
  const percent = (value: number) => format.number(value, { style: 'percent' });
  const rows = props.groups.flatMap((group) => group.rows);
  const isTerm = props.by === 'term';
  const counts = { areas: rows.length, groups: props.groups.length };
  const summary = isTerm ? t('summary_term', counts) : t('summary_region', counts);

  return (
    <Card>
      <CardHeader>
        <CardTitle className={cn('flex items-center gap-2', isTerm && 'capitalize')}>
          {props.title ?? t('region_other')}
          {props.isPaused && <Badge variant="secondary">{t('badge_paused')}</Badge>}
        </CardTitle>

        <CardDescription>{rows.length === 0 ? t('empty') : summary}</CardDescription>

        {rows.length > 0 && (
          <CardAction className="text-2xl font-semibold tabular-nums">
            {percent(sumCompletion(rows))}
          </CardAction>
        )}
      </CardHeader>

      {rows.length > 0 && (
        <CardContent>
          <Accordion type="multiple">
            {props.groups.map((group) => (
              <AccordionItem key={group.key ?? ''} value={group.key ?? ''}>
                <AccordionTrigger className="items-center gap-3 hover:no-underline">
                  <span className="flex flex-1 flex-col gap-1.5">
                    <span className="flex items-center justify-between gap-3">
                      <span className={cn('flex items-center gap-2', !isTerm && 'capitalize')}>
                        {group.key ?? t('region_other')}
                        <span className="text-xs font-normal text-muted-foreground normal-case">
                          {t('areas_count', { count: group.rows.length })}
                        </span>
                      </span>
                      <span className="tabular-nums">{percent(sumCompletion(group.rows))}</span>
                    </span>
                    <Progress value={sumCompletion(group.rows) * 100} className="h-1.5" />
                  </span>
                </AccordionTrigger>

                <AccordionContent>
                  <ul className="space-y-3 border-l pt-1 pl-3">
                    {group.rows.map((area) => (
                      <li key={area.placeId} className="space-y-1">
                        <div className="flex items-center justify-between gap-3">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate">{area.name ?? t('area_unnamed')}</span>
                            <Badge variant="outline">
                              {area.kind === 'province' ? t('kind_province') : t('kind_place')}
                            </Badge>
                          </span>
                          <span className="tabular-nums">{percent(area.completion)}</span>
                        </div>

                        <p className="text-xs text-muted-foreground">
                          {t('places_progress', {
                            used: area.usedPlaces,
                            estimated: area.estimatedPlaces,
                          })}
                        </p>
                      </li>
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      )}
    </Card>
  );
};
