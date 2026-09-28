'use client';

import { useTranslations } from 'next-intl';
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton';
import { useRouter } from '@/libs/I18nNavigation';

export const DeleteEmailPollButton = (props: { pollId: string }) => {
  const t = useTranslations('DeleteEmailPollButton');
  const router = useRouter();

  return (
    <ConfirmDeleteButton
      label={t('button')}
      title={t('dialog_title')}
      description={t('dialog_description')}
      onConfirm={async () => {
        await fetch(`/api/email-polls/${props.pollId}`, { method: 'DELETE' });
        router.push('/dashboard/email-polls/');
        router.refresh();
      }}
    />
  );
};
