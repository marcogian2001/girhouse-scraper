'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { EmailPollVariantCard } from '@/components/EmailPollVariantCard';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
  const [hasError, setHasError] = useState(false);

  const total = scores.size;
  const voted = [...scores.values()].filter((score) => score !== null).length;

  const handleVote = async (itemId: string, score: number) => {
    const previous = scores.get(itemId) ?? null;

    // Shown at once, and rolled back if the server turns it down
    setHasError(false);
    setScores((current) => new Map(current).set(itemId, score));

    const response = await fetch(`/api/email-polls/${props.pollId}/votes`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, score }),
    });

    if (!response.ok) {
      setScores((current) => new Map(current).set(itemId, previous));
      setHasError(true);
    }
  };

  return (
    <div className="space-y-8">
      <div className="sticky top-0 z-10 -mx-4 space-y-2 bg-background/90 px-4 py-3 backdrop-blur-sm md:mx-0 md:px-0">
        <p className="text-sm font-medium">
          {voted === total ? t('progress_done') : t('progress', { voted, total })}
        </p>
        <Progress value={total > 0 ? (voted / total) * 100 : 0} />
      </div>

      {hasError && (
        <Alert variant="destructive">
          <AlertDescription>{t('error_vote')}</AlertDescription>
        </Alert>
      )}

      {props.groups.map((group, index) => (
        <section key={group.id} className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight">
              {t('group_title', { number: index + 1, label: group.label })}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t('group_description', { count: group.variants.length })}
            </p>
          </div>

          {group.variants.map((variant) => (
            <EmailPollVariantCard
              key={variant.id}
              variant={variant}
              score={scores.get(variant.id) ?? null}
              onVote={async (score) => {
                await handleVote(variant.id, score);
              }}
            />
          ))}
        </section>
      ))}
    </div>
  );
};
