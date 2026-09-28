'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { EmailPollVariantCard } from '@/components/EmailPollVariantCard';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { BallotGroup } from '@/utils/EmailPoll';

export const EmailPollBallot = (props: { pollId: string; groups: BallotGroup[] }) => {
  const t = useTranslations('EmailPollBallot');
  const [scores, setScores] = useState(
    () =>
      new Map(
        props.groups.flatMap((group) =>
          group.variants.map((variant) => [variant.id, variant.score]),
        ),
      ),
  );
  const [pageIndex, setPageIndex] = useState(0);
  const [hasError, setHasError] = useState(false);

  // One page per sequence, recipient by recipient
  const pages = props.groups.flatMap((group, groupIndex) =>
    group.variants.map((variant) => ({ group, groupIndex, variant })),
  );
  const current = pages[pageIndex];

  const total = scores.size;
  const voted = [...scores.values()].filter((score) => score !== null).length;

  const goTo = (index: number) => {
    setPageIndex(index);
    window.scrollTo({ top: 0 });
  };

  const handleVote = async (itemId: string, score: number) => {
    const previous = scores.get(itemId) ?? null;

    // Shown at once, and rolled back if the server turns it down
    setHasError(false);
    setScores((currentScores) => new Map(currentScores).set(itemId, score));

    const response = await fetch(`/api/email-polls/${props.pollId}/votes`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, score }),
    });

    if (!response.ok) {
      setScores((currentScores) => new Map(currentScores).set(itemId, previous));
      setHasError(true);
    }
  };

  if (!current) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-10 -mx-4 space-y-2 bg-background/90 px-4 py-3 backdrop-blur-sm md:mx-0 md:px-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
          <p className="font-medium">
            {voted === total ? t('progress_done') : t('progress', { voted, total })}
          </p>
          <p className="text-muted-foreground">
            {t('leads_count', { count: props.groups.length })}
          </p>
        </div>
        <Progress value={total > 0 ? (voted / total) * 100 : 0} />
      </div>

      {hasError && (
        <Alert variant="destructive">
          <AlertDescription>{t('error_vote')}</AlertDescription>
        </Alert>
      )}

      <Card size="sm">
        <CardHeader>
          <CardTitle>
            {t('lead_title', {
              number: current.groupIndex + 1,
              count: props.groups.length,
              label: current.group.label,
            })}
          </CardTitle>
        </CardHeader>

        {current.group.description && (
          <CardContent>
            <p className="text-sm whitespace-pre-line text-muted-foreground">
              {current.group.description}
            </p>
          </CardContent>
        )}
      </Card>

      <EmailPollVariantCard
        // Remounted per page, so nothing from the previous sequence lingers
        key={current.variant.id}
        variant={current.variant}
        variantCount={current.group.variants.length}
        score={scores.get(current.variant.id) ?? null}
        onVote={async (score) => {
          await handleVote(current.variant.id, score);
        }}
      />

      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-9"
          disabled={pageIndex === 0}
          onClick={() => {
            goTo(pageIndex - 1);
          }}
        >
          <ChevronLeft />
          {t('button_previous')}
        </Button>

        <span className="text-sm text-muted-foreground tabular-nums">
          {t('page', { page: pageIndex + 1, pages: pages.length })}
        </span>

        <Button
          type="button"
          className="h-9"
          disabled={pageIndex === pages.length - 1}
          onClick={() => {
            goTo(pageIndex + 1);
          }}
        >
          {t('button_next')}
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
};
