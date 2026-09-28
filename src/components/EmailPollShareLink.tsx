'use client';

import { Check, Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Subscribes to the page origin, which never changes while the page is open.
 * @returns A no-op unsubscribe.
 */
const subscribe = () => () => null;

export const EmailPollShareLink = (props: { path: string }) => {
  const t = useTranslations('EmailPollShareLink');
  // Empty during server rendering, where the browser origin is unknown
  const origin = useSyncExternalStore(
    subscribe,
    () => window.location.origin,
    () => '',
  );
  const [isCopied, setIsCopied] = useState(false);
  const url = `${origin}${props.path}`;

  return (
    <div className="flex gap-2">
      <Input
        readOnly
        aria-label={t('label_link')}
        value={url}
        onFocus={(event) => {
          event.currentTarget.select();
        }}
      />
      <Button
        type="button"
        variant="outline"
        className="h-9"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setIsCopied(true);
        }}
      >
        {isCopied ? <Check /> : <Copy />}
        {isCopied ? t('button_copied') : t('button_copy')}
      </Button>
    </div>
  );
};
