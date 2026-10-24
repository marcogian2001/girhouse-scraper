import { and, asc, count, eq, notInArray, sql } from 'drizzle-orm';
import { Send } from 'lucide-react';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { DeleteLeadSearchButton } from '@/components/DeleteLeadSearchButton';
import { LeadSearchProgress } from '@/components/LeadSearchProgress';
import { LeadTable } from '@/components/LeadTable';
import { ListPagination } from '@/components/ListPagination';
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
import type { LeadWebsiteView } from '@/utils/LeadWebsiteView';
import { parseLeadWebsiteView } from '@/utils/LeadWebsiteView';
import { LIST_PAGE_SIZE, parsePage } from '@/utils/Pagination';
import { microsToUsd, USD_FORMAT } from '@/utils/UsageFormat';

/**
 * Builds the link to a page of the leads of a search.
 * @param options The call options.
 * @param options.leadSearchId The lead search.
 * @param options.websiteView Which leads the table shows.
 * @param options.page The 1-based page.
 * @returns The relative URL.
 */
const pageHref = (options: {
  leadSearchId: string;
  websiteView: LeadWebsiteView;
  page: number;
}) => {
  const params = new URLSearchParams();

  if (options.websiteView !== 'all') {
    params.set('website', options.websiteView);
  }

  if (options.page > 1) {
    params.set('page', String(options.page));
  }

  const query = params.toString();

  return `/dashboard/leads/${options.leadSearchId}/${query ? `?${query}` : ''}`;
};

/**
 * Selects the leads a search shows, leaving out those it keeps in reserve.
 * @param leadSearchId The lead search.
 * @returns The where condition.
 */
const searchLeadsOf = (leadSearchId: string) =>
  and(
    eq(leadSchema.leadSearchId, leadSearchId),
    notInArray(leadSchema.status, [...RESERVE_LEAD_STATUSES]),
  );

/**
 * Counts the leads of a search across every page.
 * @param leadSearchId The lead search.
 * @returns The totals behind the filter, the campaign and the retry buttons.
 */
const countSearchLeads = async (leadSearchId: string) => {
  const [counts] = await db
    .select({
      total: count(),
      withWebsite: sql<number>`count(*) filter (where ${leadSchema.hasWebsite})`.mapWith(Number),
      ready: sql<number>`count(*) filter (where ${leadSchema.status} = 'ready')`.mapWith(Number),
      // Leads settled before the website and info@ routes existed have no attempts on record
      retryable:
        sql<number>`count(*) filter (where ${leadSchema.status} = 'no_email' and ${leadSchema.emailAttempts} is null)`.mapWith(
          Number,
        ),
    })
    .from(leadSchema)
    .where(searchLeadsOf(leadSearchId));

  return counts ?? { total: 0, withWebsite: 0, ready: 0, retryable: 0 };
};

export default async function LeadSearchPage(props: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, id } = await props.params;
  setRequestLocale(locale);

  const searchParams = await props.searchParams;
  const page = parsePage(searchParams.page);
  const websiteView = parseLeadWebsiteView(searchParams.website);

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

  const [format, usage, counts, leads] = await Promise.all([
    getFormatter({ locale }),
    getUsageTotals({ organizationId: search.organizationId, leadSearchId: search.id }),
    countSearchLeads(search.id),
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
      })
      .from(leadSchema)
      .where(
        and(
          searchLeadsOf(search.id),
          websiteView === 'all' ? undefined : eq(leadSchema.hasWebsite, websiteView === 'with'),
        ),
      )
      .orderBy(asc(leadSchema.createdAt), asc(leadSchema.company), asc(leadSchema.id))
      .limit(LIST_PAGE_SIZE)
      .offset((page - 1) * LIST_PAGE_SIZE),
  ]);

  const { total, ready: readyCount, retryable: retryableCount } = counts;
  const matching = {
    all: total,
    with: counts.withWebsite,
    without: total - counts.withWebsite,
  }[websiteView];
  const pageCount = Math.ceil(matching / LIST_PAGE_SIZE);
  // Only searches that scan their area know when it has run out of new businesses
  const isShort =
    search.locationPlaceId !== null && search.status === 'done' && readyCount < search.maxResults;

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">{search.name}</h1>
          <StatusBadge kind="leadSearch" status={search.status} />

          <div className="ml-auto flex flex-wrap items-center gap-2">
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
        </div>

        <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span>
            {t('meta_line', {
              terms: search.searchTerms.join(', '),
              location: search.location,
              filter: formT(`website_${search.websiteFilter}`),
              date: search.createdAt.toLocaleDateString(locale, { timeZone: AppConfig.timeZone }),
            })}
          </span>
          <span aria-hidden>·</span>
          <span>
            {t('spend_line', {
              total: format.number(microsToUsd(usage.totalCostMicros), USD_FORMAT),
            })}
            {search.reserveClaimed > 0 &&
              ` · ${t('reserve_line', { count: search.reserveClaimed })}`}
          </span>
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

      {total > 0 && (
        <LeadTable leads={leads} websiteView={websiteView} matching={matching} total={total} />
      )}

      {pageCount > 1 && (
        <ListPagination
          summary={t('pagination_summary', { page, pageCount, count: matching })}
          previousHref={
            page > 1
              ? pageHref({ leadSearchId: search.id, websiteView, page: page - 1 })
              : undefined
          }
          nextHref={
            page < pageCount
              ? pageHref({ leadSearchId: search.id, websiteView, page: page + 1 })
              : undefined
          }
        />
      )}
    </div>
  );
}
