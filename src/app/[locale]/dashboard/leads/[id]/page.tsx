import { and, asc, eq, notInArray, sql } from 'drizzle-orm';
import { ArrowLeft, Send } from 'lucide-react';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { DeleteLeadSearchButton } from '@/components/DeleteLeadSearchButton';
import { LeadSearchProgress } from '@/components/LeadSearchProgress';
import { LeadTable } from '@/components/LeadTable';
import { RetryNoEmailLeadsButton } from '@/components/RetryNoEmailLeadsButton';
import { StatusBadge } from '@/components/StatusBadge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getApiContext } from '@/libs/ApiAuth';
import { db } from '@/libs/DB';
import { Link } from '@/libs/I18nNavigation';
import { getUsageTotals } from '@/libs/Usage';
import { leadSchema, leadSearchSchema } from '@/models/Schema';
import { AppConfig } from '@/utils/AppConfig';
import { RESERVE_LEAD_STATUSES } from '@/utils/Leads';
import { microsToUsd, USD_FORMAT } from '@/utils/UsageFormat';

export default async function LeadSearchPage(props: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await props.params;
  setRequestLocale(locale);

  const [t, formT, context] = await Promise.all([
    getTranslations({ locale, namespace: 'LeadSearchPage' }),
    getTranslations({ locale, namespace: 'LeadSearchForm' }),
    getApiContext(),
  ]);

  const search = context
    ? await db.query.leadSearchSchema.findFirst({
        where: and(
          eq(leadSearchSchema.id, id),
          eq(leadSearchSchema.organizationId, context.organizationId),
        ),
      })
    : undefined;

  if (!search) {
    notFound();
  }

  const [format, usage, leads] = await Promise.all([
    getFormatter({ locale }),
    getUsageTotals({ organizationId: search.organizationId, leadSearchId: search.id }),
    // Only what the table shows: the raw scrape and research JSON stay on the server
    db
      .select({
        id: leadSchema.id,
        company: leadSchema.company,
        city: leadSchema.city,
        category: leadSchema.category,
        description: leadSchema.description,
        phone: leadSchema.phone,
        website: leadSchema.website,
        domain: leadSchema.domain,
        hasWebsite: leadSchema.hasWebsite,
        firstName: leadSchema.firstName,
        lastName: leadSchema.lastName,
        role: leadSchema.role,
        email: leadSchema.email,
        emailSource: leadSchema.emailSource,
        emailVerification: leadSchema.emailVerification,
        status: leadSchema.status,
        hasNoAttempts: sql<boolean>`${leadSchema.emailAttempts} is null`,
      })
      .from(leadSchema)
      .where(
        and(
          eq(leadSchema.leadSearchId, search.id),
          notInArray(leadSchema.status, [...RESERVE_LEAD_STATUSES]),
        ),
      )
      .orderBy(asc(leadSchema.createdAt), asc(leadSchema.company)),
  ]);

  const readyCount = leads.filter((lead) => lead.status === 'ready').length;
  // Leads settled before the website and info@ routes existed have no attempts on record
  const retryableCount = leads.filter(
    (lead) => lead.status === 'no_email' && lead.hasNoAttempts,
  ).length;
  // Only searches that scan their area know when it has run out of new businesses
  const isShort =
    search.locationPlaceId !== null && search.status === 'done' && readyCount < search.maxResults;

  return (
    <div className="max-w-6xl space-y-6">
      <div className="space-y-3">
        <Link
          href="/dashboard/leads/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          {t('back_link')}
        </Link>

        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{search.name}</h1>
          <StatusBadge kind="leadSearch" status={search.status} />
        </div>

        <p className="text-sm text-muted-foreground">
          {t('meta_line', {
            terms: search.searchTerms.join(', '),
            location: search.location,
            filter: formT(`website_${search.websiteFilter}`),
            date: search.createdAt.toLocaleDateString(locale, { timeZone: AppConfig.timeZone }),
          })}
        </p>

        <p className="text-sm text-muted-foreground">
          {t('spend_line', {
            total: format.number(microsToUsd(usage.totalCostMicros), USD_FORMAT),
          })}
          {search.reserveClaimed > 0 && ` · ${t('reserve_line', { count: search.reserveClaimed })}`}
        </p>
      </div>

      <Card size="sm">
        <CardContent>
          <LeadSearchProgress leadSearchId={search.id} initialStatus={search.status} />
        </CardContent>
      </Card>

      {isShort && (
        <Alert>
          <AlertDescription>
            {t('short_alert', { found: readyCount, max: search.maxResults })}
          </AlertDescription>
        </Alert>
      )}

      {search.errorMessage && (
        <Alert variant="destructive">
          <AlertDescription>{search.errorMessage}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        {readyCount > 0 && (
          <Button asChild>
            <Link href={`/dashboard/campaigns/new/?leadSearchId=${search.id}`}>
              <Send />
              {t('button_campaign', { count: readyCount })}
            </Link>
          </Button>
        )}

        {retryableCount > 0 && (
          <RetryNoEmailLeadsButton leadSearchId={search.id} count={retryableCount} />
        )}

        <DeleteLeadSearchButton leadSearchId={search.id} />
      </div>

      {leads.length > 0 && <LeadTable leads={leads} />}
    </div>
  );
}
