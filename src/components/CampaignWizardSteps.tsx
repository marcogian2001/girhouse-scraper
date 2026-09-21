'use client';

import { cn } from 'cn';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Progress } from '@/components/ui/progress';

export type WizardStep = {
  id: string;
  label: string;
};

export const CampaignWizardSteps = (props: {
  steps: WizardStep[];
  current: number;
  onSelect: (step: number) => void;
}) => {
  const t = useTranslations('NewCampaignWizard');
  const currentStep = props.steps[props.current - 1];

  return (
    <div>
      <ol className="hidden items-center gap-2 sm:flex">
        {props.steps.map((step, index) => {
          const position = index + 1;
          const isDone = position < props.current;
          const isCurrent = position === props.current;

          return (
            <li key={step.id} className="flex flex-1 items-center gap-2 last:flex-none">
              <button
                type="button"
                // Only completed steps are reachable; forward moves go through validation
                disabled={!isDone}
                aria-current={isCurrent ? 'step' : undefined}
                onClick={() => {
                  props.onSelect(position);
                }}
                className="flex items-center gap-2 rounded-md text-sm disabled:cursor-default"
              >
                <span
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-colors',
                    isDone && 'bg-primary text-primary-foreground',
                    isCurrent && 'bg-primary/10 text-primary ring-2 ring-primary/25',
                    !(isDone || isCurrent) && 'bg-muted text-muted-foreground',
                  )}
                >
                  {isDone ? <Check className="size-3.5" /> : position}
                </span>

                <span
                  className={cn(
                    'whitespace-nowrap',
                    isCurrent ? 'font-medium text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {step.label}
                </span>
              </button>

              {position < props.steps.length && <span className="h-px flex-1 bg-border" />}
            </li>
          );
        })}
      </ol>

      <div className="space-y-2 sm:hidden">
        <p className="text-sm font-medium">
          {t('step_counter', {
            current: props.current,
            total: props.steps.length,
            label: currentStep?.label ?? '',
          })}
        </p>

        <Progress
          value={(props.current / props.steps.length) * 100}
          className="*:data-[slot=progress-indicator]:bg-primary"
        />
      </div>
    </div>
  );
};
