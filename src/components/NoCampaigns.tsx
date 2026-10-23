import { Plus, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Link } from '@/libs/I18nNavigation';

/**
 * Guided empty state shown wherever a campaign list has nothing in it.
 * @returns An empty block with the first action to take.
 */
export const NoCampaigns = () => {
  const t = useTranslations('NoCampaigns');

  return (
    <EmptyState
      icon={<Send />}
      title={t('title')}
      description={t('description')}
      action={
        <Button asChild>
          <Link href="/dashboard/campaigns/new/">
            <Plus />
            {t('button')}
          </Link>
        </Button>
      }
    />
  );
};
