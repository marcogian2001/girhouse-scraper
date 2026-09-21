'use client';

import { ChevronLeft, ChevronRight, Rocket } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { CardFooter } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';

export const CampaignWizardFooter = (props: {
  isFirstStep: boolean;
  isLastStep: boolean;
  canAdvance: boolean;
  isSubmitting: boolean;
  onBack: () => void;
  onNext: () => void;
  onSubmit: () => void;
}) => {
  const t = useTranslations('NewCampaignWizard');

  return (
    <CardFooter className="justify-between border-t py-4">
      <Button type="button" variant="ghost" disabled={props.isFirstStep} onClick={props.onBack}>
        <ChevronLeft />
        {t('button_back')}
      </Button>

      {props.isLastStep ? (
        <Button type="button" disabled={props.isSubmitting} onClick={props.onSubmit}>
          {props.isSubmitting ? <Spinner /> : <Rocket />}
          {props.isSubmitting ? t('button_creating') : t('button_create')}
        </Button>
      ) : (
        <Button type="button" disabled={!props.canAdvance} onClick={props.onNext}>
          {t('button_next')}
          <ChevronRight />
        </Button>
      )}
    </CardFooter>
  );
};
