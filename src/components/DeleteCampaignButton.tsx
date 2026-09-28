'use client';

import { useTranslations } from 'next-intl';
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton';
import { useRouter } from '@/libs/I18nNavigation';

export const DeleteCampaignButton = (props: { campaignId: string }) => {
  const t = useTranslations('DeleteCampaignButton');
  const router = useRouter();

  return (
    <ConfirmDeleteButton
      label={t('button')}
      title={t('dialog_title')}
      description={t('dialog_description')}
      onConfirm={async () => {
        await fetch(`/api/campaigns/${props.campaignId}`, { method: 'DELETE' });
        router.push('/dashboard/campaigns/');
        router.refresh();
      }}
    />
  );
};
