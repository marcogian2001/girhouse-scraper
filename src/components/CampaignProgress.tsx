'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { StatusBadge } from '@/components/StatusBadge';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { useRouter } from '@/libs/I18nNavigation';
import type { campaignSchema } from '@/models/Schema';

const POLL_INTERVAL_MS = 3000;

type CampaignStatus = (typeof campaignSchema.$inferSelect)['status'];

type StatusPayload = {
  status: CampaignStatus;
  contacts: Record<string, number>;
  outstandingJobs: number;
};

/** Contacts in these states have nothing left for the worker to do. */
const SETTLED = new Set(['ready', 'approved', 'failed']);

/** Campaign states where the worker is still running, so the spinner shows. */
const WORKING = new Set(['enriching', 'writing', 'pushing']);

export const CampaignProgress = (props: {
  campaignId: string;
  totalContacts: number;
  initialStatus: CampaignStatus;
}) => {
  const t = useTranslations('CampaignProgress');
  const router = useRouter();
  const [payload, setPayload] = useState<StatusPayload | null>(null);
  // Refresh the server component only when the numbers actually move
  const lastSignature = useRef('');

  useEffect(() => {
    let cancelled = false;

    // Never rejects, so the timers below can schedule it directly
    const poll = async () => {
      try {
        const statusResponse = await fetch(`/api/campaigns/${props.campaignId}/status`);

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
  }, [props.campaignId, router]);

  const contacts = payload?.contacts ?? {};

  const settled = Object.entries(contacts)
    .filter(([status]) => SETTLED.has(status))
    .reduce((total, [, count]) => total + count, 0);

  const status = payload?.status ?? props.initialStatus;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <StatusBadge kind="campaign" status={status} />

        {WORKING.has(status) && <Spinner className="size-3.5 text-muted-foreground" />}

        <span className="ml-auto text-sm text-muted-foreground tabular-nums">
          {t('progress_count', { done: settled, total: props.totalContacts })}
        </span>
      </div>

      <Progress
        value={props.totalContacts > 0 ? (settled / props.totalContacts) * 100 : 0}
        className="*:data-[slot=progress-indicator]:bg-primary"
      />
    </div>
  );
};
