'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState, useTransition } from 'react';
import { SearchInput } from '@/components/SearchInput';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { useRouter } from '@/libs/I18nNavigation';
import type { RepliesQuery } from '@/utils/RepliesQuery';
import { hasRepliesFilters, repliesHref, YES_NO } from '@/utils/RepliesQuery';
import type { ConversationState } from '@/utils/ReplyRouting';

/** The select value that clears a filter, since an empty value is not allowed. */
const ALL = 'all';

/** How long typing has to pause before the list is searched. */
const SEARCH_DELAY_MS = 300;

/**
 * Filters the replies list as the user types or picks, keeping the filters in the URL.
 * @param props The component props.
 * @param props.query The filters the page was rendered with.
 * @param props.states The conversation states to filter by.
 * @returns The filter bar.
 */
export const RepliesFilters = (props: {
  query: RepliesQuery;
  states: readonly ConversationState[];
}) => {
  const t = useTranslations('RepliesFilters');
  const tState = useTranslations('ConversationState');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState(props.query);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(null);

  // Every change starts again from the first page
  const navigate = (next: RepliesQuery) => {
    if (searchTimer.current) {
      clearTimeout(searchTimer.current);
    }

    startTransition(() => {
      router.replace(repliesHref(next));
    });
  };

  const apply = (next: RepliesQuery) => {
    setQuery(next);
    navigate(next);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SearchInput
        value={query.search}
        onChange={(event) => {
          const next = { ...query, search: event.target.value };

          setQuery(next);

          if (searchTimer.current) {
            clearTimeout(searchTimer.current);
          }

          searchTimer.current = setTimeout(() => {
            navigate(next);
          }, SEARCH_DELAY_MS);
        }}
        placeholder={t('search_placeholder')}
      />

      <Select
        value={query.state ?? ALL}
        onValueChange={(value) => {
          apply({ ...query, state: props.states.find((state) => state === value) });
        }}
      >
        <SelectTrigger aria-label={t('filter_state_label')} className="w-full sm:w-48">
          <SelectValue />
        </SelectTrigger>

        <SelectContent>
          <SelectItem value={ALL}>{t('filter_state_all')}</SelectItem>
          {props.states.map((state) => (
            <SelectItem key={state} value={state}>
              {tState(`status_${state}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={query.answered ?? ALL}
        onValueChange={(value) => {
          apply({ ...query, answered: YES_NO.find((option) => option === value) });
        }}
      >
        <SelectTrigger aria-label={t('filter_answered_label')} className="w-full sm:w-48">
          <SelectValue />
        </SelectTrigger>

        <SelectContent>
          <SelectItem value={ALL}>{t('filter_answered_all')}</SelectItem>
          <SelectItem value="yes">{t('filter_answered_yes')}</SelectItem>
          <SelectItem value="no">{t('filter_answered_no')}</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={query.bot ?? ALL}
        onValueChange={(value) => {
          apply({ ...query, bot: YES_NO.find((option) => option === value) });
        }}
      >
        <SelectTrigger aria-label={t('filter_bot_label')} className="w-full sm:w-48">
          <SelectValue />
        </SelectTrigger>

        <SelectContent>
          <SelectItem value={ALL}>{t('filter_bot_all')}</SelectItem>
          <SelectItem value="yes">{t('filter_bot_yes')}</SelectItem>
          <SelectItem value="no">{t('filter_bot_no')}</SelectItem>
        </SelectContent>
      </Select>

      {hasRepliesFilters(query) && (
        <Button
          variant="ghost"
          onClick={() => {
            apply({ search: '' });
          }}
        >
          <X />
          {t('button_clear')}
        </Button>
      )}

      {isPending && <Spinner className="text-muted-foreground" />}
    </div>
  );
};
