import { and, asc, eq } from 'drizzle-orm';
import { ArrowLeft, Send } from 'lucide-react';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { DeleteLeadSearchButton } from '@/components/DeleteLeadSearchButton';
import { LeadSearchProgress } from '@/components/LeadSearchProgress';
import { LeadTable } from '@/components/LeadTable';
import { StatusBadge } from '@/components/StatusBadge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getApiContext } from '@/libs/ApiAuth';
import { db } from '@/libs/DB';
import { Link } from '@/libs/I18nNavigation';
import { getUsageTotals } from '@/libs/Usage';
import { leadSchema, leadSearchSchema } from '@/models/Schema';
import { microsToUsd, USD_FORMAT } from '@/utils/UsageFormat';

export default async function LeadSearchPage(props: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await props.params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'LeadSearchPage' });
  const formT = await getTranslations({ locale, namespace: 'LeadSearchForm' });
  const context = await getApiContext();

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

  const format = await getFormatter({ locale });
  const usage = await getUsageTotals({
    organizationId: search.organizationId,
    leadSearchId: search.id,
  });

  const leads = await db
    .select()
    .from(leadSchema)
    .where(eq(leadSchema.leadSearchId, search.id))
    .orderBy(asc(leadSchema.createdAt), asc(leadSchema.company));

  const readyCount = leads.filter((lead) => lead.status === 'ready').length;

  return (
    <div className="space-y-6">
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
            date: search.createdAt.toLocaleDateString(locale),
          })}
        </p>

        <p className="text-sm text-muted-foreground">
          {t('spend_line', {
            total: format.number(microsToUsd(usage.totalCostMicros), USD_FORMAT),
          })}
        </p>
      </div>

      <Card size="sm">
        <CardContent>
          <LeadSearchProgress leadSearchId={search.id} initialStatus={search.status} />
        </CardContent>
      </Card>

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

        <DeleteLeadSearchButton leadSearchId={search.id} />
      </div>

      {leads.length > 0 && <LeadTable leads={leads} />}
    </div>
  );
}
