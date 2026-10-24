'use client';

import { cn } from 'cn';
import { Bot, CircleCheck, CircleDot, Clock, Reply, UserRound, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState, useTransition } from 'react';
import { SearchInput } from '@/components/SearchInput';
import { StatusDot } from '@/components/StatusBadge';
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
import { REPLY_STATUSES } from '@/utils/ReplyStatus';

/** The select value that clears a filter, since an empty value is not allowed. */
const ALL = 'all';

/** Tints a filter that is narrowing the list, so active filters stand out at a glance. */
const ACTIVE_FILTER_CLASS = 'border-primary/40 bg-primary/5 dark:bg-primary/10';

/** How long typing has to pause before the list is searched. */
const SEARCH_DELAY_MS = 300;

/**
 * Filters the replies list as the user types or picks, keeping the filters in the URL.
 * @param props The component props.
 * @param props.query The filters the page was rendered with.
 * @returns The filter bar.
 */
export const RepliesFilters = (props: { query: RepliesQuery }) => {
  const t = useTranslations('RepliesFilters');
  const tStatus = useTranslations('ReplyStatus');
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
        onChange={(search) => {
          const next = { ...query, search };

          setQuery(next);

          if (searchTimer.current) {
            clearTimeout(searchTimer.current);
          }

          searchTimer.current = setTimeout(() => {
            navigate(next);
          }, SEARCH_DELAY_MS);
        }}
        onClear={() => {
          apply({ ...query, search: '' });
        }}
        placeholder={t('search_placeholder')}
      />

      <Select
        value={query.state ?? ALL}
        onValueChange={(value) => {
          apply({ ...query, state: REPLY_STATUSES.find((status) => status === value) });
        }}
      >
        <SelectTrigger
          aria-label={t('filter_state_label')}
          className={cn('w-full sm:w-52', query.state && ACTIVE_FILTER_CLASS)}
        >
          <SelectValue />
        </SelectTrigger>

        <SelectContent>
          <SelectItem value={ALL}>
            <CircleDot className="text-muted-foreground" />
            {t('filter_state_all')}
          </SelectItem>
          {REPLY_STATUSES.map((status) => (
            <SelectItem key={status} value={status}>
              <span className="flex size-4 items-center justify-center">
                <StatusDot kind="replyStatus" status={status} />
              </span>
              {tStatus(`status_${status}`)}
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
        <SelectTrigger
          aria-label={t('filter_answered_label')}
          className={cn('w-full sm:w-56', query.answered && ACTIVE_FILTER_CLASS)}
        >
          <SelectValue />
        </SelectTrigger>

        <SelectContent>
          <SelectItem value={ALL}>
            <Reply className="text-muted-foreground" />
            {t('filter_answered_all')}
          </SelectItem>
          <SelectItem value="yes">
            <CircleCheck className="text-success" />
            {t('filter_answered_yes')}
          </SelectItem>
          <SelectItem value="no">
            <Clock className="text-warning" />
            {t('filter_answered_no')}
          </SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={query.bot ?? ALL}
        onValueChange={(value) => {
          apply({ ...query, bot: YES_NO.find((option) => option === value) });
        }}
      >
        <SelectTrigger
          aria-label={t('filter_bot_label')}
          className={cn('w-full sm:w-48', query.bot && ACTIVE_FILTER_CLASS)}
        >
          <SelectValue />
        </SelectTrigger>

        <SelectContent>
          <SelectItem value={ALL}>
            <Bot className="text-muted-foreground" />
            {t('filter_bot_all')}
          </SelectItem>
          <SelectItem value="yes">
            <Bot className="text-primary" />
            {t('filter_bot_yes')}
          </SelectItem>
          <SelectItem value="no">
            <UserRound className="text-muted-foreground" />
            {t('filter_bot_no')}
          </SelectItem>
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
