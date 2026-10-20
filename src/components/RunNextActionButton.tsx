'use client';

import { FastForward } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useRouter } from '@/libs/I18nNavigation';

/**
 * Runs a conversation's next follow-up now, so the sequence can be tried in minutes.
 * @param props Component props.
 * @param props.conversationId The conversation.
 * @returns The button.
 */
export const RunNextActionButton = (props: { conversationId: string }) => {
  const t = useTranslations('ReplyDetailPage');
  const router = useRouter();
  const [isQueuing, setIsQueuing] = useState(false);
  const [hasError, setHasError] = useState(false);

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isQueuing}
        onClick={async () => {
          setIsQueuing(true);
          setHasError(false);

          const response = await fetch(`/api/replies/${props.conversationId}/next-action`, {
            method: 'POST',
          });

          setIsQueuing(false);
          setHasError(!response.ok);

          if (response.ok) {
            router.refresh();
          }
        }}
      >
        {isQueuing ? <Spinner /> : <FastForward />}
        {t('run_next_action')}
      </Button>

      {hasError && (
        <Alert variant="destructive">
          <AlertDescription>{t('error_next_action')}</AlertDescription>
        </Alert>
      )}
    </div>
  );
};
