'use client';

import { RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useRouter } from '@/libs/I18nNavigation';

export const InstantlySyncButton = () => {
  const t = useTranslations('CampaignTestsPage');
  const router = useRouter();
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasError, setHasError] = useState(false);

  return (
    <div className="flex items-center gap-2">
      {hasError && <span className="text-xs text-destructive">{t('error_sync')}</span>}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isSyncing}
        onClick={async () => {
          setIsSyncing(true);
          setHasError(false);

          const response = await fetch('/api/campaigns/instantly-sync', { method: 'POST' });

          setIsSyncing(false);
          setHasError(!response.ok);

          if (response.ok) {
            router.refresh();
          }
        }}
      >
        {isSyncing ? <Spinner /> : <RefreshCw />}
        {t('button_sync')}
      </Button>
    </div>
  );
};
