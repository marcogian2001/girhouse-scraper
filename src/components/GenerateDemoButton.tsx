'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useRouter } from '@/libs/I18nNavigation';

export const GenerateDemoButton = (props: { conversationId: string }) => {
  const t = useTranslations('ConversationDemoCard');
  const router = useRouter();
  const [isBuilding, setIsBuilding] = useState(false);
  const [hasError, setHasError] = useState(false);

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        disabled={isBuilding}
        onClick={async () => {
          setIsBuilding(true);
          setHasError(false);

          const response = await fetch(`/api/replies/${props.conversationId}/demo`, {
            method: 'POST',
          });

          setIsBuilding(false);
          setHasError(!response.ok);

          if (response.ok) {
            router.refresh();
          }
        }}
      >
        {isBuilding && <Spinner />}
        {isBuilding ? t('building') : t('button_generate')}
      </Button>

      {hasError && (
        <Alert variant="destructive">
          <AlertDescription>{t('error_generate')}</AlertDescription>
        </Alert>
      )}
    </div>
  );
};
