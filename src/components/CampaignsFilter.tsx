'use client';

import { cn } from 'cn';
import { ChevronDown, Megaphone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { SearchInput } from '@/components/SearchInput';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type CampaignOption = { id: string; name: string };

/**
 * Picks any number of campaigns from a searchable list, for a filter bar.
 * @param props Component props.
 * @param props.campaigns The campaigns to pick from, in display order.
 * @param props.selected The ids of the picked campaigns.
 * @param props.onSelectedChange Called with the new ids, in display order.
 * @param props.className Classes for the trigger, such as its width and active tint.
 * @returns The trigger and its popover.
 */
export const CampaignsFilter = (props: {
  campaigns: CampaignOption[];
  selected: string[];
  onSelectedChange: (campaignIds: string[]) => void;
  className?: string;
}) => {
  const t = useTranslations('RepliesFilters');
  const [search, setSearch] = useState('');

  const needle = search.trim().toLowerCase();
  const visible = props.campaigns.filter((campaign) =>
    campaign.name.toLowerCase().includes(needle),
  );
  const firstSelected = props.campaigns.find((campaign) => props.selected.includes(campaign.id));

  const toggle = (campaignId: string) => {
    props.onSelectedChange(
      props.campaigns
        .map((campaign) => campaign.id)
        .filter((id) =>
          id === campaignId ? !props.selected.includes(id) : props.selected.includes(id),
        ),
    );
  };

  const label = () => {
    if (props.selected.length === 0) {
      return t('filter_campaign_all');
    }

    return props.selected.length === 1 && firstSelected
      ? firstSelected.name
      : t('filter_campaign_many', { count: props.selected.length });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          aria-label={t('filter_campaign_label')}
          className={cn('justify-between font-normal', props.className)}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <Megaphone className="text-muted-foreground" />
            <span className="truncate">{label()}</span>
          </span>
          <ChevronDown className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-80">
        <SearchInput
          value={search}
          onChange={setSearch}
          onClear={() => {
            setSearch('');
          }}
          placeholder={t('filter_campaign_search')}
        />

        <div className="max-h-72 space-y-2.5 overflow-y-auto px-1 py-1">
          {visible.length === 0 ? (
            <p className="text-muted-foreground">{t('filter_campaign_empty')}</p>
          ) : (
            visible.map((campaign) => (
              <Label
                key={campaign.id}
                htmlFor={`campaign-filter-${campaign.id}`}
                className="font-normal"
              >
                <Checkbox
                  id={`campaign-filter-${campaign.id}`}
                  checked={props.selected.includes(campaign.id)}
                  onCheckedChange={() => {
                    toggle(campaign.id);
                  }}
                />
                <span className="truncate" title={campaign.name}>
                  {campaign.name}
                </span>
              </Label>
            ))
          )}
        </div>

        {props.selected.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              props.onSelectedChange([]);
            }}
          >
            {t('filter_campaign_clear')}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
};
