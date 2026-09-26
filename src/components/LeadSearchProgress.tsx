'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { StatusBadge } from '@/components/StatusBadge';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { useRouter } from '@/libs/I18nNavigation';
import type { leadSearchSchema } from '@/models/Schema';

const POLL_INTERVAL_MS = 3000;

type LeadSearchStatus = (typeof leadSearchSchema.$inferSelect)['status'];

type StatusPayload = {
  status: LeadSearchStatus;
  leads: Record<string, number>;
  outstandingJobs: number;
};

/** Leads in these states have nothing left for the worker to do. */
const SETTLED = new Set(['ready', 'filtered_out', 'no_email', 'failed']);

/** Search states where the worker is still running, so the spinner shows. */
const WORKING = new Set(['searching', 'qualifying']);

export const LeadSearchProgress = (props: {
  leadSearchId: string;
  initialStatus: LeadSearchStatus;
}) => {
  const t = useTranslations('LeadSearchProgress');
  const router = useRouter();
  const [payload, setPayload] = useState<StatusPayload | null>(null);
  // Refresh the server component only when the numbers actually move
  const lastSignature = useRef('');

  useEffect(() => {
    let cancelled = false;

    // Never rejects, so the timers below can schedule it directly
    const poll = async () => {
      try {
        const statusResponse = await fetch(`/api/lead-searches/${props.leadSearchId}/status`);

        if (!statusResponse.ok || cancelled) {
          return;
        }

        const next: StatusPayload = await statusResponse.json();

        if (cancelled) {
          return;
        }

        setPayload(next);

        const signature = JSON.stringify(next);

        if (signature !== lastSignature.current) {
          lastSignature.current = signature;
          router.refresh();
        }

        // Drive the shared worker while someone is watching this page
        if (next.outstandingJobs > 0) {
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
  }, [props.leadSearchId, router]);

  const leads = Object.entries(payload?.leads ?? {});
  const total = leads.reduce((sum, [, count]) => sum + count, 0);
  const settled = leads
    .filter(([status]) => SETTLED.has(status))
    .reduce((sum, [, count]) => sum + count, 0);

  const status = payload?.status ?? props.initialStatus;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <StatusBadge kind="leadSearch" status={status} />

        {WORKING.has(status) && <Spinner className="size-3.5 text-muted-foreground" />}

        <span className="ml-auto text-sm text-muted-foreground tabular-nums">
          {status === 'searching'
            ? t('searching')
            : t('progress_count', { done: settled, total, ready: payload?.leads.ready ?? 0 })}
        </span>
      </div>

      <Progress
        value={total > 0 ? (settled / total) * 100 : 0}
        className="*:data-[slot=progress-indicator]:bg-primary"
      />
    </div>
  );
};
