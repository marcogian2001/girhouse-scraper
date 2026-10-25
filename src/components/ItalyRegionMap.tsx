'use client';

// Map shapes cannot be native inputs, so each region takes the checkbox role
// oxlint-disable jsx-a11y/prefer-tag-over-role

import { cn } from 'cn';
import type { ItalianRegionName } from '@/utils/ItalianRegions';
import { ITALIAN_REGION_NAMES } from '@/utils/ItalianRegions';
import { ITALY_MAP_VIEW_BOX, ITALY_REGION_SHAPES } from '@/utils/ItalyRegionShapes';

/**
 * Draws Italy split by region, where clicking a region picks or drops it.
 * @param props Component props.
 * @param props.label What the map is for, read by screen readers.
 * @param props.selected The regions picked.
 * @param props.onToggle Called with the region clicked.
 * @returns The map.
 */
export const ItalyRegionMap = (props: {
  label: string;
  selected: ItalianRegionName[];
  onToggle: (region: ItalianRegionName) => void;
}) => (
  <svg viewBox={ITALY_MAP_VIEW_BOX} role="group" aria-label={props.label} className="h-auto w-full">
    {ITALIAN_REGION_NAMES.map((region) => {
      const isSelected = props.selected.includes(region);

      return (
        <path
          key={region}
          d={ITALY_REGION_SHAPES[region]}
          fillRule="evenodd"
          role="checkbox"
          aria-checked={isSelected}
          aria-label={region}
          tabIndex={0}
          className={cn(
            'cursor-pointer stroke-background stroke-1 transition-colors outline-none focus-visible:stroke-ring focus-visible:stroke-2',
            isSelected ? 'fill-primary hover:fill-primary/80' : 'fill-muted hover:fill-primary/30',
          )}
          onClick={() => {
            props.onToggle(region);
          }}
          onKeyDown={(event) => {
            if (event.key === ' ' || event.key === 'Enter') {
              event.preventDefault();
              props.onToggle(region);
            }
          }}
        >
          <title>{region}</title>
        </path>
      );
    })}
  </svg>
);
