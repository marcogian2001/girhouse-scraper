'use client';

import { useTranslations } from 'next-intl';
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton';
import { useRouter } from '@/libs/I18nNavigation';

export const DeleteLeadSearchButton = (props: { leadSearchId: string }) => {
  const t = useTranslations('DeleteLeadSearchButton');
  const router = useRouter();

  return (
    <ConfirmDeleteButton
      label={t('button')}
      title={t('dialog_title')}
      description={t('dialog_description')}
      onConfirm={async () => {
        await fetch(`/api/lead-searches/${props.leadSearchId}`, { method: 'DELETE' });
        router.push('/dashboard/leads/');
        router.refresh();
      }}
    />
  );
};
