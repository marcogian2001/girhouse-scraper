'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { StatusBadge } from '@/components/StatusBadge';
import { Spinner } from '@/components/ui/spinner';
import { useRouter } from '@/libs/I18nNavigation';
import type { ConversationState } from '@/utils/ReplyRouting';

const POLL_INTERVAL_MS = 3000;

type StatusPayload = { state: ConversationState; updatedAt: string; pendingJobs: number };

export const ConversationProgress = (props: {
  conversationId: string;
  initialState: ConversationState;
  initialPendingJobs: number;
}) => {
  const t = useTranslations('ConversationProgress');
  const router = useRouter();
  const [payload, setPayload] = useState<StatusPayload | null>(null);
  // Refresh the server component only when something actually changes
  const lastSignature = useRef('');

  useEffect(() => {
    let cancelled = false;

    // Never rejects, so the timers below can schedule it directly
    const poll = async () => {
      try {
        const response = await fetch(`/api/replies/${props.conversationId}/status`);

        if (!response.ok || cancelled) {
          return;
        }

        const next: StatusPayload = await response.json();

        if (cancelled) {
          return;
        }

        setPayload(next);

        const signature = JSON.stringify(next);

        if (lastSignature.current && signature !== lastSignature.current) {
          router.refresh();
        }

        lastSignature.current = signature;

        // Drive the shared worker while someone is watching this page
        if (next.pendingJobs > 0) {
          await fetch('/api/jobs/process', { method: 'POST' });
        }
      } catch {
        // A failed poll is simply retried on the next interval
      }
    };

    const immediate = setTimeout(poll, 0);
    const timer = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearTimeout(immediate);
      clearInterval(timer);
    };
  }, [props.conversationId, router]);

  const state = payload?.state ?? props.initialState;
  const pendingJobs = payload?.pendingJobs ?? props.initialPendingJobs;

  return (
    <div className="flex items-center gap-2">
      <StatusBadge kind="conversation" status={state} />

      {pendingJobs > 0 && (
        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <Spinner className="size-3.5" />
          {t('processing')}
        </span>
      )}
    </div>
  );
};
