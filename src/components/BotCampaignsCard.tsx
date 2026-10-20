'use client';

import { Bot, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';

type BotCampaign = { id: string; name: string; botManaged: boolean };

/**
 * The campaigns launched on Instantly, each with whether the reply bot handles its leads.
 * Every change is saved at once.
 * @param props Component props.
 * @param props.campaigns The launched campaigns.
 * @returns The card.
 */
export const BotCampaignsCard = (props: { campaigns: BotCampaign[] }) => {
  const t = useTranslations('BotCampaignsCard');
  const [managed, setManaged] = useState(
    () => new Map(props.campaigns.map((campaign) => [campaign.id, campaign.botManaged])),
  );
  const [savingId, setSavingId] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);

  const save = async (campaignId: string, botManaged: boolean) => {
    setSavingId(campaignId);
    setHasError(false);

    const response = await fetch(`/api/campaigns/${campaignId}/bot`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botManaged }),
    });

    setSavingId(null);

    if (response.ok) {
      setManaged((current) => new Map(current).set(campaignId, botManaged));
    } else {
      setHasError(true);
    }
  };

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {props.campaigns.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('empty')}</p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {props.campaigns.map((campaign) => {
              const isManaged = managed.get(campaign.id) ?? false;

              return (
                <li key={campaign.id}>
                  <Label className="flex items-center gap-3 p-3 font-normal hover:bg-accent/40">
                    <Checkbox
                      checked={isManaged}
                      disabled={savingId === campaign.id}
                      onCheckedChange={async (checked) => {
                        await save(campaign.id, checked === true);
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {campaign.name}
                    </span>
                    {savingId === campaign.id && <Spinner />}
                    <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                      {isManaged ? <Bot className="size-3.5" /> : <Users className="size-3.5" />}
                      {isManaged ? t('managed') : t('reps')}
                    </span>
                  </Label>
                </li>
              );
            })}
          </ul>
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
