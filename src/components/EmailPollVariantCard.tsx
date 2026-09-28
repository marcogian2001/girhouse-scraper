'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { EmailPollScoreScale } from '@/components/EmailPollScoreScale';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import type { BallotVariant } from '@/utils/EmailPoll';
import { microsToUsd, USD_FORMAT } from '@/utils/UsageFormat';

export const EmailPollVariantCard = (props: {
  variant: BallotVariant;
  variantCount: number;
  score: number | null;
  onVote: (score: number) => void;
}) => {
  const t = useTranslations('EmailPollVariantCard');
  const format = useFormatter();

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>
            {t('title', { letter: props.variant.letter, count: props.variantCount })}
          </CardTitle>

          {props.variant.model && <Badge variant="secondary">{props.variant.model}</Badge>}

          {props.variant.costMicros !== undefined && (
            <Badge variant="outline">
              {/* A single sequence costs fractions of a cent */}
              {format.number(microsToUsd(props.variant.costMicros), {
                ...USD_FORMAT,
                maximumFractionDigits: 4,
              })}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="divide-y">
        {props.variant.emails.map((email) => (
          <div key={email.stepIndex} className="space-y-3 py-5 first:pt-0 last:pb-0">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {t('step_label', { step: email.stepIndex })}
            </p>
            <p className="rounded-md bg-muted/50 px-3 py-2">
              <span className="text-muted-foreground">{t('subject_label')}</span>{' '}
              <span className="font-medium">{email.subject}</span>
            </p>
            <p className="text-sm whitespace-pre-wrap">{email.body}</p>
          </div>
        ))}
      </CardContent>

      <CardFooter>
        <EmailPollScoreScale score={props.score} onChange={props.onVote} />
      </CardFooter>
    </Card>
  );
};
