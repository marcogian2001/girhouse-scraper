import { eq } from 'drizzle-orm';
import { Map as MapIcon } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CoverageOverview } from '@/components/CoverageOverview';
import { CoveragePlanForm } from '@/components/CoveragePlanForm';
import { CoverageTermsEditor } from '@/components/CoverageTermsEditor';
import { CreateCoveragePlanButton } from '@/components/CreateCoveragePlanButton';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getApiContext } from '@/libs/ApiAuth';
import { loadCoverageAreas } from '@/libs/Coverage';
import { db } from '@/libs/DB';
import { loadOrganizationEmailYield } from '@/libs/LeadJobs';
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
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        {plan && (
          <Badge variant={plan.isActive ? 'default' : 'secondary'}>
            {plan.isActive ? t('status_active') : t('status_paused')}
          </Badge>
        )}
      </div>
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

  const [coverage, terms, emailYield] = await Promise.all([
    loadCoverageAreas(plan),
    db
      .select({
        id: coverageTermSchema.id,
        term: coverageTermSchema.term,
        tier: coverageTermSchema.tier,
        isActive: coverageTermSchema.isActive,
      })
      .from(coverageTermSchema)
      .where(eq(coverageTermSchema.planId, plan.id)),
    loadOrganizationEmailYield(plan.organizationId),
  ]);

  return (
    <div className="space-y-6">
      {header}

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">{t('tab_overview')}</TabsTrigger>
          <TabsTrigger value="settings">{t('tab_settings')}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          {/* Each email asked for takes more than one place, at the organization's usual yield */}
          <CoverageOverview coverage={coverage} dailyPlaces={plan.dailyLeads / emailYield} />
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
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
                emailYield={emailYield}
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
