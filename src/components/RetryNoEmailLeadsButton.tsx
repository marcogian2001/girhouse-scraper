'use client';

import { MailSearch } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useRouter } from '@/libs/I18nNavigation';

/**
 * Looks again for the email of a search's leads that ended without one, on their website and at info@.
 * @param props Component props.
 * @param props.leadSearchId The lead search.
 * @param props.count How many leads can be retried.
 * @returns The button.
 */
export const RetryNoEmailLeadsButton = (props: { leadSearchId: string; count: number }) => {
  const t = useTranslations('LeadSearchPage');
  const router = useRouter();
  const [isQueuing, setIsQueuing] = useState(false);
  const [hasError, setHasError] = useState(false);

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        disabled={isQueuing}
        onClick={async () => {
          setIsQueuing(true);
          setHasError(false);

          const response = await fetch(`/api/lead-searches/${props.leadSearchId}/retry-emails`, {
            method: 'POST',
          });

          setIsQueuing(false);
          setHasError(!response.ok);

          if (response.ok) {
            router.refresh();
          }
        }}
      >
        {isQueuing ? <Spinner /> : <MailSearch />}
        {t('button_retry_emails', { count: props.count })}
      </Button>

      {hasError && (
        <Alert variant="destructive">
          <AlertDescription>{t('error_retry_emails')}</AlertDescription>
        </Alert>
      )}
    </div>
  );
};
