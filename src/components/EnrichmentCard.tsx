'use client';

import { ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import type { confidenceLevelEnum } from '@/models/Schema';
import type { EnrichmentBasis, EnrichmentContent } from '@/validations/EnrichmentValidation';

type ConfidenceLevel = (typeof confidenceLevelEnum.enumValues)[number];

export type EnrichmentView = {
  content: EnrichmentContent | null;
  basis: EnrichmentBasis[];
  identityConfidence: ConfidenceLevel | null;
  identityReasoning: string | null;
  error: string | null;
};

// Same tinted-pill idiom as StatusBadge, so confidence reads on the same scale
const CONFIDENCE_CLASS = {
  high: 'bg-success/10 text-success',
  medium: 'bg-warning/10 text-warning',
  low: 'bg-destructive/10 text-destructive',
} as const;

export const EnrichmentCard = (props: { enrichment: EnrichmentView | null }) => {
  const t = useTranslations('EnrichmentCard');

  if (!props.enrichment) {
    return <p className="text-sm text-muted-foreground">{t('not_researched')}</p>;
  }

  if (props.enrichment.error) {
    return <p className="text-sm text-destructive">{props.enrichment.error}</p>;
  }

  const { content, identityConfidence, identityReasoning } = props.enrichment;

  const findings = content
    ? (
        [
          ['field_role', content.current_role],
          ['field_company', content.current_company],
          ['field_what_they_do', content.company_description],
          ['field_industry', content.company_industry],
          ['field_location', content.location],
          ['field_recent_activity', content.recent_activity],
          ['field_hooks', content.personalization_hooks],
        ] as const
      ).filter(([, value]) => Boolean(value))
    : [];

  // Every distinct source Parallel cited, so the reviewer can check the claims
  const sources = [
    ...new Map(
      props.enrichment.basis
        .flatMap((entry: EnrichmentBasis) => entry.citations ?? [])
        .map((citation) => [citation.url, citation]),
    ).values(),
  ];

  return (
    <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant={identityConfidence ? 'ghost' : 'outline'}
          className={identityConfidence ? CONFIDENCE_CLASS[identityConfidence] : undefined}
        >
          {identityConfidence ? t(`confidence_${identityConfidence}`) : t('confidence_unknown')}
        </Badge>

        {content?.person_found === false && (
          <span className="text-sm text-muted-foreground">{t('person_not_found')}</span>
        )}
      </div>

      {identityReasoning && <p className="text-sm">{identityReasoning}</p>}

      {findings.length > 0 && (
        <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
          {findings.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{t(label)}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {sources.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{t('sources')}</p>

          <ul className="flex flex-wrap gap-1.5 text-sm">
            {sources.map((citation) => (
              <li key={citation.url}>
                <a
                  href={citation.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex max-w-64 items-center gap-1 rounded-md border bg-card px-2 py-1 text-xs hover:border-primary/50 hover:text-primary"
                >
                  <ExternalLink className="size-3 shrink-0" />
                  <span className="truncate">{citation.title ?? citation.url}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
