import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Link } from '@/libs/I18nNavigation';

/**
 * Previous and next links under a paged list, beside a line saying where the reader is.
 * @param props Component props.
 * @param props.summary Which page this is and how many rows match.
 * @param props.previousHref The previous page, or nothing on the first one.
 * @param props.nextHref The next page, or nothing on the last one.
 * @returns The pagination bar.
 */
export const ListPagination = (props: {
  summary: string;
  previousHref?: string;
  nextHref?: string;
}) => {
  const t = useTranslations('ListPagination');

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">{props.summary}</p>

      <div className="flex items-center gap-2">
        {props.previousHref ? (
          <Button asChild variant="outline">
            <Link href={props.previousHref}>
              <ChevronLeft />
              {t('button_previous')}
            </Link>
          </Button>
        ) : (
          <Button variant="outline" disabled>
            <ChevronLeft />
            {t('button_previous')}
          </Button>
        )}

        {props.nextHref ? (
          <Button asChild variant="outline">
            <Link href={props.nextHref}>
              {t('button_next')}
              <ChevronRight />
            </Link>
          </Button>
        ) : (
          <Button variant="outline" disabled>
            {t('button_next')}
            <ChevronRight />
          </Button>
        )}
      </div>
    </div>
  );
};
