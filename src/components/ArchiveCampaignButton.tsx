'use client';

import { Archive, ArchiveRestore } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useRouter } from '@/libs/I18nNavigation';

export const ArchiveCampaignButton = (props: { campaignId: string; isArchived: boolean }) => {
  const t = useTranslations('ArchiveCampaignButton');
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      disabled={isSaving}
      onClick={async () => {
        setIsSaving(true);
        await fetch(`/api/campaigns/${props.campaignId}/archive`, {
          method: props.isArchived ? 'DELETE' : 'POST',
        });
        router.refresh();
        setIsSaving(false);
      }}
    >
      {isSaving && <Spinner />}
      {!isSaving && (props.isArchived ? <ArchiveRestore /> : <Archive />)}
      {props.isArchived ? t('button_restore') : t('button_archive')}
    </Button>
  );
};
