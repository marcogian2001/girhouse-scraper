import { Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Link } from '@/libs/I18nNavigation';

/**
 * Guided empty state shown wherever a campaign list has nothing in it.
 * @returns An empty block with the first action to take.
 */
export const NoCampaigns = () => {
  const t = useTranslations('NoCampaigns');

  return (
    <Empty className="rounded-xl border border-dashed">
      <EmptyHeader>
        <EmptyMedia>
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Upload className="size-5" />
          </span>
        </EmptyMedia>

        <EmptyTitle>{t('title')}</EmptyTitle>
        <EmptyDescription>{t('description')}</EmptyDescription>
      </EmptyHeader>

      <EmptyContent>
        <Button asChild className="h-10 px-5">
          <Link href="/dashboard/campaigns/new/">{t('button')}</Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
};
