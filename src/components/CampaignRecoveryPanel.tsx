'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { buildRecoveryReview } from '@/libs/CampaignRecovery';
import { useRouter } from '@/libs/I18nNavigation';
import { microsToUsd, USD_FORMAT } from '@/utils/UsageFormat';

export const CampaignRecoveryPanel = (props: {
  campaignId: string;
  budgetMicros: number;
  reason: string | null;
  review: ReturnType<typeof buildRecoveryReview>;
}) => {
  const t = useTranslations('CampaignRecoveryPanel');
  const format = useFormatter();
  const router = useRouter();
  const [budget, setBudget] = useState(String(microsToUsd(props.budgetMicros)));
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const usd = (micros: number) => format.number(microsToUsd(micros), USD_FORMAT);
  const resumeDisabled =
    !props.review.ledgerConsistent ||
    props.review.running ||
    props.review.uncertain > 0 ||
    props.review.manual > 0 ||
    props.review.resumable === 0;
  const submit = async (action: 'increase' | 'resume') => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/campaigns/${props.campaignId}/recovery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          budgetUsd: Number(budget),
          revision: props.review.revision,
          reviewed,
          action,
        }),
      });
      if (!response.ok) {
        setError(t('error_update'));
        return;
      }
      setReviewed(false);
      router.refresh();
    } catch {
      setError(t('error_update'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {props.reason && <p className="text-sm">{props.reason}</p>}
        <p className="text-sm text-muted-foreground">
          {t('totals', {
            recorded: usd(props.review.recordedMicros),
            reserved: usd(props.review.reservedMicros),
            uncertain: props.review.uncertain,
          })}
        </p>
        <p className="text-sm text-muted-foreground">{t('scope_hint')}</p>
        <details className="space-y-2">
          <summary className="cursor-pointer text-sm">{t('details')}</summary>
          {props.review.operations.map((op) => (
            <p className="text-xs break-all" key={op.id}>
              {op.id} · {t(op.state === 'recorded' ? 'state_recorded' : 'state_reserved')} ·{' '}
              {usd(op.amount)}
            </p>
          ))}
          {props.review.candidates.map((job) => (
            <p className="text-xs break-all" key={job.id}>
              {job.id} · {t(`job_${job.disposition}`)} · {job.error}
            </p>
          ))}
        </details>
        {(!props.review.ledgerConsistent ||
          props.review.uncertain > 0 ||
          props.review.manual > 0) && (
          <p className="text-sm text-destructive">{t('review_required')}</p>
        )}
        {props.review.running && <p className="text-sm">{t('running')}</p>}
        <div className="space-y-2">
          <label htmlFor={`recovery-budget-${props.campaignId}`} className="text-sm font-medium">
            {t('budget_label')}
          </label>
          <Input
            id={`recovery-budget-${props.campaignId}`}
            type="number"
            min={microsToUsd(props.budgetMicros)}
            max={2000}
            step="0.01"
            value={budget}
            onChange={(event) => {
              setBudget(event.target.value);
              setReviewed(false);
            }}
          />
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={reviewed}
            onChange={(event) => {
              setReviewed(event.target.checked);
            }}
          />
          {t('review_label')}
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={
              busy ||
              !reviewed ||
              !props.review.ledgerConsistent ||
              props.review.running ||
              Number(budget) <= microsToUsd(props.budgetMicros)
            }
            onClick={() => {
              void submit('increase');
            }}
          >
            {t('increase')}
          </Button>
          <Button
            disabled={busy || !reviewed || resumeDisabled}
            onClick={() => {
              void submit('resume');
            }}
          >
            {t('resume', { count: props.review.resumable })}
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
};
