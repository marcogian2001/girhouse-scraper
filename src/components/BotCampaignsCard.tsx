'use client';

import { Bot, Search, Users } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

type BotCampaign = { id: string; name: string; botManaged: boolean; createdAt: Date };

type Filter = 'all' | 'bot' | 'reps';

const FILTERS: Filter[] = ['all', 'bot', 'reps'];

/**
 * The campaigns launched on Instantly, each handled by the reply bot or by the sales reps.
 * Built for many campaigns: search, a filter by who handles them, and changes to many at
 * once. Every change is saved at once.
 * @param props Component props.
 * @param props.campaigns The launched campaigns, newest first.
 * @returns The card.
 */
export const BotCampaignsCard = (props: { campaigns: BotCampaign[] }) => {
  const t = useTranslations('BotCampaignsCard');
  const format = useFormatter();
  const [managed, setManaged] = useState(
    () => new Map(props.campaigns.map((campaign) => [campaign.id, campaign.botManaged])),
  );
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [hasError, setHasError] = useState(false);

  const isBot = (campaignId: string) => managed.get(campaignId) ?? false;
  const botCount = props.campaigns.filter((campaign) => isBot(campaign.id)).length;
  const counts: Record<Filter, number> = {
    all: props.campaigns.length,
    bot: botCount,
    reps: props.campaigns.length - botCount,
  };

  const needle = query.trim().toLowerCase();
  const visible = props.campaigns.filter(
    (campaign) =>
      campaign.name.toLowerCase().includes(needle) &&
      (filter === 'all' || isBot(campaign.id) === (filter === 'bot')),
  );
  const visibleSelected = visible.filter((campaign) => selected.has(campaign.id));
  const allVisibleSelected = visible.length > 0 && visibleSelected.length === visible.length;

  const save = async (campaignIds: string[], botManaged: boolean) => {
    setSavingIds(new Set(campaignIds));
    setHasError(false);

    const response = await fetch('/api/campaigns/bot', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignIds, botManaged }),
    });

    setSavingIds(new Set());

    if (!response.ok) {
      setHasError(true);

      return;
    }

    setManaged((current) => {
      const next = new Map(current);

      for (const id of campaignIds) {
        next.set(id, botManaged);
      }

      return next;
    });
    setSelected(new Set());
  };

  const toggleSelected = (campaignId: string, checked: boolean) => {
    const next = new Set(selected);

    if (checked) {
      next.add(campaignId);
    } else {
      next.delete(campaignId);
    }

    setSelected(next);
  };

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>{t('title')}</CardTitle>
            <CardDescription>{t('description')}</CardDescription>
          </div>
          {props.campaigns.length > 0 && (
            <Badge variant="secondary" className="shrink-0">
              {t('summary', { bot: botCount, total: props.campaigns.length })}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {props.campaigns.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('empty')}</p>
        ) : (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  placeholder={t('placeholder_search')}
                  className="pl-8"
                  onChange={(event) => {
                    setQuery(event.target.value);
                  }}
                />
              </div>

              <Tabs
                value={filter}
                onValueChange={(value) => {
                  const next = FILTERS.find((option) => option === value);

                  if (next) {
                    setFilter(next);
                  }
                }}
              >
                <TabsList>
                  {FILTERS.map((option) => (
                    <TabsTrigger key={option} value={option}>
                      {t(`filter_${option}`, { count: counts[option] })}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>

            {visibleSelected.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                <span className="mr-auto text-sm">
                  {t('selected', { count: visibleSelected.length })}
                </span>
                <Button
                  type="button"
                  size="sm"
                  disabled={savingIds.size > 0}
                  onClick={async () => {
                    await save(
                      visibleSelected.map((campaign) => campaign.id),
                      true,
                    );
                  }}
                >
                  <Bot />
                  {t('button_to_bot')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={savingIds.size > 0}
                  onClick={async () => {
                    await save(
                      visibleSelected.map((campaign) => campaign.id),
                      false,
                    );
                  }}
                >
                  <Users />
                  {t('button_to_reps')}
                </Button>
              </div>
            )}

            <div className="max-h-112 overflow-y-auto rounded-xl border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-muted">
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        aria-label={t('select_all')}
                        checked={allVisibleSelected}
                        disabled={visible.length === 0}
                        onCheckedChange={(checked) => {
                          setSelected(
                            checked === true
                              ? new Set([...selected, ...visible.map((campaign) => campaign.id)])
                              : new Set(),
                          );
                        }}
                      />
                    </TableHead>
                    <TableHead>{t('column_campaign')}</TableHead>
                    <TableHead className="hidden sm:table-cell">{t('column_launched')}</TableHead>
                    <TableHead className="w-40">{t('column_handled_by')}</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {visible.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                        {t('no_results')}
                      </TableCell>
                    </TableRow>
                  ) : (
                    visible.map((campaign) => (
                      <TableRow
                        key={campaign.id}
                        data-state={selected.has(campaign.id) ? 'selected' : undefined}
                      >
                        <TableCell>
                          <Checkbox
                            aria-label={campaign.name}
                            checked={selected.has(campaign.id)}
                            onCheckedChange={(checked) => {
                              toggleSelected(campaign.id, checked === true);
                            }}
                          />
                        </TableCell>
                        <TableCell className="max-w-0 truncate font-medium">
                          {campaign.name}
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground tabular-nums sm:table-cell">
                          {format.dateTime(campaign.createdAt, { dateStyle: 'medium' })}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Select
                              value={isBot(campaign.id) ? 'bot' : 'reps'}
                              disabled={savingIds.has(campaign.id)}
                              onValueChange={async (value) => {
                                await save([campaign.id], value === 'bot');
                              }}
                            >
                              <SelectTrigger size="sm" className="w-32">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="bot">
                                  <Bot />
                                  {t('handled_bot')}
                                </SelectItem>
                                <SelectItem value="reps">
                                  <Users />
                                  {t('handled_reps')}
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            {savingIds.has(campaign.id) && <Spinner />}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        {hasError && (
          <Alert variant="destructive">
            <AlertDescription>{t('error_save')}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};
