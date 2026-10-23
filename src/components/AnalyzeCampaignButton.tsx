'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useRouter } from '@/libs/I18nNavigation';

export const AnalyzeCampaignButton = (props: { campaignId: string; isRedo?: boolean }) => {
  const t = useTranslations('CampaignTests');
  const router = useRouter();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hasError, setHasError] = useState(false);

  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isAnalyzing}
        onClick={async () => {
          setIsAnalyzing(true);
          setHasError(false);

          const response = await fetch(`/api/campaigns/${props.campaignId}/analysis`, {
            method: 'POST',
          });

          setIsAnalyzing(false);
          setHasError(!response.ok);

          if (response.ok) {
            router.refresh();
          }
        }}
      >
        {isAnalyzing && <Spinner />}
        {isAnalyzing && t('analyzing')}
        {!isAnalyzing && (props.isRedo ? t('button_reanalyze') : t('button_analyze'))}
      </Button>

      {hasError && <p className="text-xs text-destructive">{t('error_analyze')}</p>}
    </div>
  );
};
