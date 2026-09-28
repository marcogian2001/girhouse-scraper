'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

const SCORES = Array.from({ length: 10 }, (_, index) => index + 1);

export const EmailPollScoreScale = (props: {
  score: number | null;
  onChange: (score: number) => void;
}) => {
  const t = useTranslations('EmailPollScoreScale');

  return (
    <fieldset className="w-full space-y-1.5">
      <legend className="sr-only">{t('label')}</legend>

      <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10">
        {SCORES.map((score) => (
          <Button
            key={score}
            type="button"
            variant={props.score === score ? 'default' : 'outline'}
            aria-pressed={props.score === score}
            className="tabular-nums"
            onClick={() => {
              props.onChange(score);
            }}
          >
            {score}
          </Button>
        ))}
      </div>

      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{t('hint_low')}</span>
        <span>{t('hint_high')}</span>
      </div>
    </fieldset>
  );
};
