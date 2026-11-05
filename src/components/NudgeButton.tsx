'use client';

import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useRouter } from '@/libs/I18nNavigation';

/**
 * Asks the AI for a new, more proactive email to a lead who has not answered the latest
 * one yet; it lands in the thread as a draft to approve.
 * @param props Component props.
 * @param props.conversationId The conversation.
 * @returns The button.
 */
export const NudgeButton = (props: { conversationId: string }) => {
  const t = useTranslations('NudgeButton');
  const router = useRouter();
  const [isBusy, setIsBusy] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);

  return (
    <div className="space-y-3 pt-4">
      <Button
        type="button"
        variant="outline"
        disabled={isBusy}
        onClick={async () => {
          setIsBusy(true);
          setHasFailed(false);

          const response = await fetch(`/api/replies/${props.conversationId}/nudge`, {
            method: 'POST',
          });

          setIsBusy(false);

          if (!response.ok) {
            setHasFailed(true);

            return;
          }

          router.refresh();
        }}
      >
        {isBusy ? <Spinner /> : <Sparkles />}
        {isBusy ? t('button_writing') : t('button_nudge')}
      </Button>

      <p className="text-xs text-muted-foreground">{t('hint')}</p>

      {hasFailed && (
        <Alert variant="destructive">
          <AlertDescription>{t('error_nudge')}</AlertDescription>
        </Alert>
      )}
    </div>
  );
};
