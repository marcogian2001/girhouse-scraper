import { useFormatter, useTranslations } from 'next-intl';
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
import { sumCompletion } from '@/utils/Coverage';

/**
 * Groups areas by region, regions in alphabetical order and unknown ones last.
 * @param areas The areas of one term.
 * @returns The regions with their areas, most complete first.
 */
const groupByRegion = (areas: CoverageArea[]) => {
  const groups = Map.groupBy(areas, (area) => area.region);

  return (
    [...groups.entries()]
      // Areas whose region is unknown sort last
      .toSorted(([a], [b]) => (a ?? '\uFFFF').localeCompare(b ?? '\uFFFF'))
      .map(([region, items]) => ({
        region,
        areas: items.toSorted((a, b) => b.completion - a.completion),
      }))
  );
};

/**
 * Shows the areas searched for one profession, by region, with their completion.
 * @param props Component props.
 * @param props.term The profession.
 * @param props.isActive Whether the plan still searches it.
 * @param props.areas The areas searched for it.
 * @returns A card per profession.
 */
export const CoverageTermCard = (props: {
  term: string;
  isActive: boolean;
  areas: CoverageArea[];
}) => {
  const t = useTranslations('CoverageTermCard');
  const format = useFormatter();
  const groups = groupByRegion(props.areas);
  const percent = (value: number) => format.number(value, { style: 'percent' });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 capitalize">
          {props.term}
          {!props.isActive && <Badge variant="secondary">{t('badge_paused')}</Badge>}
        </CardTitle>

        <CardDescription>
          {props.areas.length === 0
            ? t('empty')
            : t('areas_summary', { areas: props.areas.length, regions: groups.length })}
        </CardDescription>

        {props.areas.length > 0 && (
          <CardAction className="text-2xl font-semibold tabular-nums">
            {percent(sumCompletion(props.areas))}
          </CardAction>
        )}
      </CardHeader>

      {props.areas.length > 0 && (
        <CardContent className="space-y-5">
          {groups.map((group) => (
            <section key={group.region ?? ''} className="space-y-3">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {group.region ?? t('region_other')}
              </h3>

              <ul className="space-y-3">
                {group.areas.map((area) => (
                  <li key={area.placeId} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium">
                          {area.name ?? t('area_unnamed')}
                        </span>
                        <Badge variant="outline">
                          {area.kind === 'province' ? t('kind_province') : t('kind_place')}
                        </Badge>
                      </span>
                      <span className="font-medium tabular-nums">{percent(area.completion)}</span>
                    </div>

                    <Progress value={area.completion * 100} className="h-1.5" />

                    <p className="text-xs text-muted-foreground">
                      {t('places_progress', {
                        used: area.usedPlaces,
                        estimated: area.estimatedPlaces,
                      })}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </CardContent>
      )}
    </Card>
  );
};
