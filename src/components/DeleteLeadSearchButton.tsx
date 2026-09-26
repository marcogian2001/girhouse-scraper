'use client';

import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useRouter } from '@/libs/I18nNavigation';

export const DeleteLeadSearchButton = (props: { leadSearchId: string }) => {
  const t = useTranslations('DeleteLeadSearchButton');
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      disabled={isDeleting}
      onClick={async () => {
        // Leads found by the search go with it, so it asks first
        // oxlint-disable-next-line no-alert
        if (!window.confirm(t('confirm'))) {
          return;
        }

        setIsDeleting(true);
        await fetch(`/api/lead-searches/${props.leadSearchId}`, { method: 'DELETE' });
        router.push('/dashboard/leads/');
        router.refresh();
      }}
    >
      {isDeleting ? <Spinner /> : <Trash2 />}
      {t('button')}
    </Button>
  );
};
