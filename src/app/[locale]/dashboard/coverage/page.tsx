import { eq } from 'drizzle-orm';
import { Map as MapIcon } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CoveragePlanForm } from '@/components/CoveragePlanForm';
import { CoverageSummary } from '@/components/CoverageSummary';
import { CoverageTermsEditor } from '@/components/CoverageTermsEditor';
import { CreateCoveragePlanButton } from '@/components/CreateCoveragePlanButton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { getApiContext } from '@/libs/ApiAuth';
import { loadPairStatuses } from '@/libs/Coverage';
import { db } from '@/libs/DB';
import { coveragePlanSchema, coverageTermSchema } from '@/models/Schema';
import { PLACE_COST_MICROS } from '@/services/Apify';
import { VERIFICATION_COST_MICROS } from '@/services/MillionVerifier';
import { PROCESSOR_RUN_COST_MICROS } from '@/services/Parallel';
import { EMAIL_COST_MICROS } from '@/services/Prospeo';

export default async function CoveragePage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'CoveragePage' });
  const context = await getApiContext();

  const plan = context
    ? await db.query.coveragePlanSchema.findFirst({
        where: eq(coveragePlanSchema.organizationId, context.organizationId),
      })
    : undefined;

  const header = (
    <div className="space-y-1">
      <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
    </div>
  );

  if (!plan) {
    return (
      <div className="space-y-6">
        {header}

        <Empty className="rounded-xl border border-dashed">
          <EmptyHeader>
            <EmptyMedia>
              <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <MapIcon className="size-5" />
              </span>
            </EmptyMedia>

            <EmptyTitle>{t('empty_title')}</EmptyTitle>
            <EmptyDescription>{t('empty_description')}</EmptyDescription>
          </EmptyHeader>

          <EmptyContent>
            <CreateCoveragePlanButton />
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  const [pairs, terms] = await Promise.all([
    loadPairStatuses(plan),
    db
      .select({
        id: coverageTermSchema.id,
        term: coverageTermSchema.term,
        tier: coverageTermSchema.tier,
        isActive: coverageTermSchema.isActive,
      })
      .from(coverageTermSchema)
      .where(eq(coverageTermSchema.planId, plan.id)),
  ]);

  return (
    <div className="space-y-6">
      {header}

      <CoverageSummary pairs={pairs} dailyLeads={plan.dailyLeads} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('title_settings')}</CardTitle>
          </CardHeader>

          <CardContent>
            {/* Prices live in server-only service modules, so they are handed down */}
            <CoveragePlanForm
              plan={{
                dailyLeads: plan.dailyLeads,
                leadsPerSearch: plan.leadsPerSearch,
                websiteFilter: plan.websiteFilter,
                processor: plan.processor,
                isActive: plan.isActive,
              }}
              pricing={{
                placeMicros: PLACE_COST_MICROS,
                emailMicros: EMAIL_COST_MICROS,
                verificationMicros: VERIFICATION_COST_MICROS,
                runMicros: PROCESSOR_RUN_COST_MICROS,
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('title_terms')}</CardTitle>
          </CardHeader>

          <CardContent>
            <CoverageTermsEditor terms={terms} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
