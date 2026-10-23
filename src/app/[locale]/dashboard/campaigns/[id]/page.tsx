import { and, asc, eq, inArray } from 'drizzle-orm';
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
import { COMPACT_FORMAT, microsToUsd, USD_FORMAT } from '@/utils/UsageFormat';
import {
  EnrichmentBasisValidation,
  EnrichmentContentValidation,
} from '@/validations/EnrichmentValidation';

export default async function CampaignDetailPage(props: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await props.params;
  setRequestLocale(locale);

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

  // Enrichments and drafts are matched through the campaign, so nothing waits for the contacts
  const campaignContactIds = db
    .select({ id: contactSchema.id })
    .from(contactSchema)
    .where(eq(contactSchema.campaignId, campaign.id));

  const [format, usage, contacts, enrichments, drafts] = await Promise.all([
    getFormatter({ locale }),
    getUsageTotals({ organizationId: campaign.organizationId, campaignId: campaign.id }),
    db
      .select()
      .from(contactSchema)
      .where(eq(contactSchema.campaignId, campaign.id))
      .orderBy(asc(contactSchema.rowIndex)),
    db
      .select()
      .from(enrichmentSchema)
      .where(inArray(enrichmentSchema.contactId, campaignContactIds)),
    db
      .select()
      .from(emailDraftSchema)
      .where(inArray(emailDraftSchema.contactId, campaignContactIds))
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
      enrichment: enrichment
        ? {
            content: parsed.success ? parsed.data : null,
            basis: basis.success ? basis.data : [],
            identityConfidence: enrichment.identityConfidence,
            identityReasoning: enrichment.identityReasoning,
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

  const readyCount = contacts.filter((contact) => contact.status === 'ready').length;
  const approvedCount = contacts.filter((contact) => contact.status === 'approved').length;

  const isPushed = campaign.status === 'pushed';

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-3">
          <CampaignNameEditor campaignId={campaign.id} name={campaign.name} />
          <StatusBadge kind="campaign" status={campaign.status} />
          {campaign.archivedAt && <Badge variant="secondary">{t('badge_archived')}</Badge>}

          <div className="ml-auto flex items-center gap-2">
            {contacts.length > 0 && (
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
              contacts: contacts.length,
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
            totalContacts={contacts.length}
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
            <Badge variant="secondary">{contacts.length}</Badge>
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
