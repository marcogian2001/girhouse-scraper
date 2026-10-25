import { and, asc, count, eq, inArray } from 'drizzle-orm';
import { Download } from 'lucide-react';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import * as z from 'zod';
import { ArchiveCampaignButton } from '@/components/ArchiveCampaignButton';
import { CampaignNameEditor } from '@/components/CampaignNameEditor';
import { CampaignProgress } from '@/components/CampaignProgress';
import { CampaignTestSection } from '@/components/CampaignTestSection';
import type { ContactReview } from '@/components/ContactReviewList';
import { ContactReviewList } from '@/components/ContactReviewList';
import { DeleteCampaignButton } from '@/components/DeleteCampaignButton';
import { InstantlyPushForm } from '@/components/InstantlyPushForm';
import { ListPagination } from '@/components/ListPagination';
import { StatusBadge } from '@/components/StatusBadge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getApiContext } from '@/libs/ApiAuth';
import { db } from '@/libs/DB';
import { getUsageTotals } from '@/libs/Usage';
import { campaignSchema, contactSchema, emailDraftSchema, enrichmentSchema } from '@/models/Schema';
import { AppConfig } from '@/utils/AppConfig';
import { parsePage } from '@/utils/Pagination';
import { COMPACT_FORMAT, microsToUsd, USD_FORMAT } from '@/utils/UsageFormat';
import {
  EnrichmentBasisValidation,
  EnrichmentContentValidation,
  WebsiteCheckValidation,
} from '@/validations/EnrichmentValidation';

/** Contacts reviewed per page; each one carries its research and every email draft. */
const CONTACTS_PAGE_SIZE = 50;

export default async function CampaignDetailPage(props: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, id } = await props.params;
  setRequestLocale(locale);

  const searchParams = await props.searchParams;
  const page = parsePage(searchParams.page);

  const [t, context] = await Promise.all([
    getTranslations({ locale, namespace: 'CampaignDetailPage' }),
    getApiContext(),
  ]);

  const campaign = context
    ? await db.query.campaignSchema.findFirst({
        where: and(
          eq(campaignSchema.id, id),
          eq(campaignSchema.organizationId, context.organizationId),
        ),
      })
    : undefined;

  if (!campaign) {
    notFound();
  }

  // Only this page's contacts carry their research and drafts. The page is a subquery,
  // so the enrichments and drafts do not wait for the contacts
  const pageContactIds = db
    .select({ id: contactSchema.id })
    .from(contactSchema)
    .where(eq(contactSchema.campaignId, campaign.id))
    .orderBy(asc(contactSchema.rowIndex))
    .limit(CONTACTS_PAGE_SIZE)
    .offset((page - 1) * CONTACTS_PAGE_SIZE);

  const [format, usage, statusCounts, contacts, enrichments, drafts] = await Promise.all([
    getFormatter({ locale }),
    getUsageTotals({ organizationId: campaign.organizationId, campaignId: campaign.id }),
    db
      .select({ status: contactSchema.status, total: count() })
      .from(contactSchema)
      .where(eq(contactSchema.campaignId, campaign.id))
      .groupBy(contactSchema.status),
    db
      .select()
      .from(contactSchema)
      .where(inArray(contactSchema.id, pageContactIds))
      .orderBy(asc(contactSchema.rowIndex)),
    db.select().from(enrichmentSchema).where(inArray(enrichmentSchema.contactId, pageContactIds)),
    db
      .select()
      .from(emailDraftSchema)
      .where(inArray(emailDraftSchema.contactId, pageContactIds))
      .orderBy(asc(emailDraftSchema.stepIndex)),
  ]);
  const usd = (micros: number) => format.number(microsToUsd(micros), USD_FORMAT);

  const enrichmentByContact = new Map(enrichments.map((row) => [row.contactId, row]));
  const draftsByContact = Map.groupBy(drafts, (draft) => draft.contactId);

  const reviews: ContactReview[] = contacts.map((contact) => {
    const enrichment = enrichmentByContact.get(contact.id);
    const parsed = EnrichmentContentValidation.safeParse(enrichment?.content);
    // Basis is stored as raw JSON, so it is re-validated before it reaches the UI
    const basis = z.array(EnrichmentBasisValidation).safeParse(enrichment?.basis);

    return {
      id: contact.id,
      email: contact.email,
      firstName: contact.firstName,
      lastName: contact.lastName,
      company: contact.company,
      status: contact.status,
      errorMessage: contact.errorMessage,
      pain: contact.pain,
      painReason: contact.painReason,
      enrichment: enrichment
        ? {
            content: parsed.success ? parsed.data : null,
            basis: basis.success ? basis.data : [],
            identityConfidence: enrichment.identityConfidence,
            identityReasoning: enrichment.identityReasoning,
            // Stored as raw JSON, so it is re-validated like the basis
            websiteCheck: WebsiteCheckValidation.safeParse(enrichment.websiteCheck).data ?? null,
            error: enrichment.error,
          }
        : null,
      drafts: (draftsByContact.get(contact.id) ?? []).map((draft) => ({
        id: draft.id,
        stepIndex: draft.stepIndex,
        subject: draft.subject,
        body: draft.body,
      })),
    };
  });

  const countOf = (status: (typeof statusCounts)[number]['status']) =>
    statusCounts.find((row) => row.status === status)?.total ?? 0;
  const totalContacts = statusCounts.reduce((sum, row) => sum + row.total, 0);
  const readyCount = countOf('ready');
  const approvedCount = countOf('approved');
  const pageCount = Math.ceil(totalContacts / CONTACTS_PAGE_SIZE);
  const pageHref = (target: number) =>
    `/dashboard/campaigns/${campaign.id}/${target > 1 ? `?page=${target}` : ''}`;

  const isPushed = campaign.status === 'pushed';

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-3">
          <CampaignNameEditor campaignId={campaign.id} name={campaign.name} />
          <StatusBadge kind="campaign" status={campaign.status} />
          {campaign.archivedAt && <Badge variant="secondary">{t('badge_archived')}</Badge>}

          <div className="ml-auto flex items-center gap-2">
            {totalContacts > 0 && (
              <Button asChild variant="outline">
                <a href={`/api/campaigns/${campaign.id}/export`} download>
                  <Download />
                  {t('button_export')}
                </a>
              </Button>
            )}
            <ArchiveCampaignButton
              campaignId={campaign.id}
              isArchived={Boolean(campaign.archivedAt)}
            />
            <DeleteCampaignButton campaignId={campaign.id} />
          </div>
        </div>

        <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span>
            {t('meta_line', {
              contacts: totalContacts,
              emails: campaign.emailCount,
              date: campaign.createdAt.toLocaleDateString(locale, {
                timeZone: AppConfig.timeZone,
              }),
            })}
          </span>
          <span aria-hidden>·</span>
          <span>
            {t('spend_line', {
              total: usd(usage.totalCostMicros),
              tokens: format.number(usage.copywritingTokens, COMPACT_FORMAT),
              copywritingCost: usd(usage.copywritingCostMicros),
              runs: usage.parallelRuns,
              parallelCost: usd(usage.parallelCostMicros),
            })}
          </span>
        </p>
      </div>

      <Card size="sm">
        <CardContent>
          <CampaignProgress
            campaignId={campaign.id}
            totalContacts={totalContacts}
            initialStatus={campaign.status}
          />
        </CardContent>
      </Card>

      {campaign.errorMessage && (
        <Alert variant="destructive">
          <AlertDescription>{campaign.errorMessage}</AlertDescription>
        </Alert>
      )}

      {isPushed && campaign.instantlyCampaignId && (
        <Alert>
          <AlertDescription>
            {t('pushed_notice', { campaignId: campaign.instantlyCampaignId })}
          </AlertDescription>
        </Alert>
      )}

      {campaign.instantlyCampaignId && (
        <Suspense fallback={<Skeleton className="h-48 w-full rounded-xl" />}>
          <CampaignTestSection organizationId={campaign.organizationId} campaignId={campaign.id} />
        </Suspense>
      )}

      <Tabs defaultValue="review">
        <TabsList variant="line" className="w-full justify-start border-b">
          <TabsTrigger value="review" className="flex-none">
            {t('tab_review')}
            <Badge variant="secondary">{totalContacts}</Badge>
          </TabsTrigger>

          <TabsTrigger value="send" disabled={isPushed} className="flex-none">
            {t('tab_send')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="review" className="pt-4">
          <ContactReviewList
            contacts={reviews}
            delaysDays={campaign.delaysDays}
            emailCount={campaign.emailCount}
          />

          {pageCount > 1 && (
            <div className="pt-4">
              <ListPagination
                summary={t('pagination_summary', { page, pageCount, count: totalContacts })}
                previousHref={page > 1 ? pageHref(page - 1) : undefined}
                nextHref={page < pageCount ? pageHref(page + 1) : undefined}
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="send" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('push_title')}</CardTitle>
            </CardHeader>

            <CardContent>
              <InstantlyPushForm
                campaignId={campaign.id}
                readyCount={readyCount}
                approvedCount={approvedCount}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
