'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { summarizeLeadSearch } from '@/utils/LeadSearchSummary';

const seconds = (ms: number) => Math.round(ms / 1000);

export const LeadSearchSummary = (props: {
  summary: ReturnType<typeof summarizeLeadSearch>;
  validEmails: number;
  reusedPlaces: number;
}) => {
  const t = useTranslations('LeadSearchSummary');
  const items = [
    { label: t('collected'), value: props.summary.collected },
    { label: t('matching'), value: props.summary.matching },
    { label: t('email_found'), value: props.summary.emailFound },
    { label: t('valid'), value: props.validEmails },
  ];
  const phaseName = (type: string) => {
    if (type === 'lead_search') {
      return t('phase_maps');
    }
    if (type === 'lead_research') {
      return t('phase_research');
    }
    return t('phase_email');
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {items.map((item) => (
            <div key={item.label}>
              <dt className="text-muted-foreground">{item.label}</dt>
              <dd className="text-2xl font-semibold tabular-nums">{item.value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-muted-foreground">{t('funnel_hint')}</p>
        <p>
          {t('outcomes', {
            pending: props.summary.pending,
            noEmail: props.summary.noEmail,
            review: props.summary.review,
            blocked: props.summary.blocked,
            failedJobs: props.summary.failedJobs,
          })}
        </p>
        <p className="text-muted-foreground">
          {t('reserve', { count: props.summary.reserve, reused: props.reusedPlaces })}
        </p>
        <details className="space-y-2">
          <summary className="cursor-pointer font-medium">{t('measurement_title')}</summary>
          {props.summary.stages
            .filter((stage) => stage.jobs > 0)
            .map((stage) => (
              <p key={stage.type}>
                {t('phase', {
                  phase: phaseName(stage.type),
                  measured: stage.measured,
                  jobs: stage.jobs,
                  seconds: stage.measured ? String(seconds(stage.activeMs)) : t('unavailable'),
                  interval: stage.measured ? String(seconds(stage.spanMs)) : t('unavailable'),
                  runs: stage.runs,
                  errors: stage.errors,
                  reuses: stage.reuses,
                })}
                {stage.partial && ` · ${t('partial')}`}
              </p>
            ))}
          {props.summary.providers.map((provider) => (
            <p key={provider.provider}>
              {t('provider', {
                name: provider.provider,
                starts: provider.starts,
                polls: provider.polls,
                reads: provider.reads,
                failed: provider.failed,
                seconds: seconds(provider.elapsedMs),
              })}
            </p>
          ))}
          <p className="text-muted-foreground">{t('measurement_hint')}</p>
        </details>
      </CardContent>
    </Card>
  );
};
