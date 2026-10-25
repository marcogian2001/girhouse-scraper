'use client';

import { useTranslations } from 'next-intl';
import { ItalyRegionMap } from '@/components/ItalyRegionMap';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { ItalianRegionName } from '@/utils/ItalianRegions';
import { ITALIAN_REGION_NAMES } from '@/utils/ItalianRegions';

/**
 * Picks the regions a search is split across, on the map of Italy or from the list.
 * @param props Component props.
 * @param props.id Prefix of the checkbox ids.
 * @param props.selected The regions picked, north to south.
 * @param props.onSelectedChange Called with the new regions, north to south.
 * @param props.maxResults The leads the search wants, split evenly across the regions.
 * @returns The map, the list and how the leads are split.
 */
export const RegionPicker = (props: {
  id: string;
  selected: ItalianRegionName[];
  onSelectedChange: (regions: ItalianRegionName[]) => void;
  maxResults: number;
}) => {
  const t = useTranslations('RegionPicker');
  const count = props.selected.length;
  const total = Number.isFinite(props.maxResults) ? props.maxResults : 0;
  const lowShare = count > 0 ? Math.floor(total / count) : 0;
  const highShare = count > 0 ? Math.ceil(total / count) : 0;

  const toggle = (region: ItalianRegionName) => {
    props.onSelectedChange(
      ITALIAN_REGION_NAMES.filter((name) =>
        name === region ? !props.selected.includes(name) : props.selected.includes(name),
      ),
    );
  };

  const summary = () => {
    if (count === 0) {
      return t('summary_none');
    }

    if (count === 1) {
      return t('summary_single', { region: props.selected[0] ?? '' });
    }

    return lowShare === highShare
      ? t('summary_even', { count, share: lowShare })
      : t('summary_range', { count, low: lowShare, high: highShare });
  };

  return (
    <div className="grid gap-6 rounded-lg border p-4 md:grid-cols-[minmax(0,16rem)_1fr]">
      <div className="mx-auto w-full max-w-64">
        <ItalyRegionMap label={t('map_label')} selected={props.selected} onToggle={toggle} />
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              props.onSelectedChange([...ITALIAN_REGION_NAMES]);
            }}
          >
            {t('button_all')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              props.onSelectedChange([]);
            }}
          >
            {t('button_none')}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
          {ITALIAN_REGION_NAMES.map((region, index) => (
            <Label key={region} htmlFor={`${props.id}-${index}`} className="font-normal">
              <Checkbox
                id={`${props.id}-${index}`}
                checked={props.selected.includes(region)}
                onCheckedChange={() => {
                  toggle(region);
                }}
              />
              {region}
            </Label>
          ))}
        </div>

        <p className="text-sm text-muted-foreground">{summary()}</p>
      </div>
    </div>
  );
};
