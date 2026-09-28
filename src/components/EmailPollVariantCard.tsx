'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { EmailPollScoreScale } from '@/components/EmailPollScoreScale';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import type { BallotVariant } from '@/utils/EmailPoll';
import { microsToUsd, USD_FORMAT } from '@/utils/UsageFormat';

export const EmailPollVariantCard = (props: {
  variant: BallotVariant;
  score: number | null;
  onVote: (score: number) => void;
}) => {
  const t = useTranslations('EmailPollVariantCard');
  const format = useFormatter();

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{t('title', { letter: props.variant.letter })}</CardTitle>

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

      <CardContent className="space-y-5">
        {props.variant.emails.map((email) => (
          <div key={email.stepIndex} className="space-y-1.5">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {t('step_label', { step: email.stepIndex })}
            </p>
            <p className="font-medium">{email.subject}</p>
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
