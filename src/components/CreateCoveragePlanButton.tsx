'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useRouter } from '@/libs/I18nNavigation';

export const CreateCoveragePlanButton = () => {
  const t = useTranslations('CreateCoveragePlanButton');
  const router = useRouter();
  const [isBusy, setIsBusy] = useState(false);
  const [hasError, setHasError] = useState(false);

  return (
    <div className="space-y-3">
      <Button
        disabled={isBusy}
        onClick={async () => {
          setIsBusy(true);
          setHasError(false);

          const response = await fetch('/api/coverage', { method: 'POST' });

          setIsBusy(false);

          if (!response.ok) {
            setHasError(true);

            return;
          }

          router.refresh();
        }}
      >
        {isBusy && <Spinner />}
        {t('button_create')}
      </Button>

      {hasError && (
        <Alert variant="destructive">
          <AlertDescription>{t('error_create')}</AlertDescription>
        </Alert>
      )}
    </div>
  );
};
