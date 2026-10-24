'use client';

import { useTranslations } from 'next-intl';
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton';
import { useRouter } from '@/libs/I18nNavigation';

export const DeleteConversationButton = (props: { conversationId: string }) => {
  const t = useTranslations('DeleteConversationButton');
  const router = useRouter();

  return (
    <ConfirmDeleteButton
      label={t('button')}
      title={t('dialog_title')}
      description={t('dialog_description')}
      onConfirm={async () => {
        await fetch(`/api/replies/${props.conversationId}`, { method: 'DELETE' });
        router.push('/dashboard/replies/');
        router.refresh();
      }}
    />
  );
};
