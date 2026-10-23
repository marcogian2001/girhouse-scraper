'use client';

import { useSearchParams } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { SearchInput } from '@/components/SearchInput';
import { Spinner } from '@/components/ui/spinner';
import { usePathname, useRouter } from '@/libs/I18nNavigation';

/** How long typing has to pause before the list is searched. */
const SEARCH_DELAY_MS = 300;

/**
 * Searches a server-rendered list by writing the text to `?q=`, keeping the other parameters.
 * @param props Component props.
 * @param props.defaultValue The search the page was rendered with.
 * @param props.placeholder The field hint, also its accessible name.
 * @returns A debounced search field.
 */
export const ListSearch = (props: { defaultValue: string; placeholder: string }) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(props.defaultValue);
  const timer = useRef<ReturnType<typeof setTimeout>>(null);

  const search = (next: string) => {
    const params = new URLSearchParams(searchParams);

    if (next.trim()) {
      params.set('q', next.trim());
    } else {
      params.delete('q');
    }

    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname);
    });
  };

  return (
    <div className="flex w-full items-center gap-2 sm:w-auto">
      <SearchInput
        value={value}
        placeholder={props.placeholder}
        onChange={(next) => {
          setValue(next);

          if (timer.current) {
            clearTimeout(timer.current);
          }

          timer.current = setTimeout(() => {
            search(next);
          }, SEARCH_DELAY_MS);
        }}
        onClear={() => {
          if (timer.current) {
            clearTimeout(timer.current);
          }

          setValue('');
          search('');
        }}
      />

      {isPending && <Spinner className="text-muted-foreground" />}
    </div>
  );
};
