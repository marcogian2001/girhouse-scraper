'use client';

import { FastForward, MessageCircle } from 'lucide-react';
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
 * @param props.to "whatsapp" to skip the remaining follow-ups and prepare the WhatsApp hand-off.
 * @returns The button.
 */
export const RunNextActionButton = (props: { conversationId: string; to?: 'whatsapp' }) => {
  const t = useTranslations('ReplyDetailPage');
  const router = useRouter();
  const [isQueuing, setIsQueuing] = useState(false);
  const [hasError, setHasError] = useState(false);
  const isWhatsapp = props.to === 'whatsapp';

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
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: props.to }),
          });

          setIsQueuing(false);
          setHasError(!response.ok);

          if (response.ok) {
            router.refresh();
          }
        }}
      >
        {isQueuing && <Spinner />}
        {!isQueuing && (isWhatsapp ? <MessageCircle /> : <FastForward />)}
        {isWhatsapp ? t('skip_to_whatsapp') : t('run_next_action')}
      </Button>

      {hasError && (
        <Alert variant="destructive">
          <AlertDescription>{t('error_next_action')}</AlertDescription>
        </Alert>
      )}
    </div>
  );
};
