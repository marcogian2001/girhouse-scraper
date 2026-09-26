import { and, asc, eq, inArray } from 'drizzle-orm';
import { ArrowLeft } from 'lucide-react';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import * as z from 'zod';
import { CampaignNameEditor } from '@/components/CampaignNameEditor';
import { CampaignProgress } from '@/components/CampaignProgress';
import type { ContactReview } from '@/components/ContactReviewList';
import { ContactReviewList } from '@/components/ContactReviewList';
import { InstantlyPushForm } from '@/components/InstantlyPushForm';
import { StatusBadge } from '@/components/StatusBadge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getApiContext } from '@/libs/ApiAuth';
import { db } from '@/libs/DB';
import { Link } from '@/libs/I18nNavigation';
import { getUsageTotals } from '@/libs/Usage';
import { campaignSchema, contactSchema, emailDraftSchema, enrichmentSchema } from '@/models/Schema';
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

  const t = await getTranslations({ locale, namespace: 'CampaignDetailPage' });
  const context = await getApiContext();

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

  const format = await getFormatter({ locale });
  const usage = await getUsageTotals({
    organizationId: campaign.organizationId,
    campaignId: campaign.id,
  });
  const usd = (micros: number) => format.number(microsToUsd(micros), USD_FORMAT);

  const contacts = await db
    .select()
    .from(contactSchema)
    .where(eq(contactSchema.campaignId, campaign.id))
    .orderBy(asc(contactSchema.rowIndex));

  const contactIds = contacts.map((contact) => contact.id);

  const enrichments =
    contactIds.length > 0
      ? await db
          .select()
          .from(enrichmentSchema)
          .where(inArray(enrichmentSchema.contactId, contactIds))
      : [];

  const drafts =
    contactIds.length > 0
      ? await db
          .select()
          .from(emailDraftSchema)
          .where(inArray(emailDraftSchema.contactId, contactIds))
          .orderBy(asc(emailDraftSchema.stepIndex))
      : [];

  const reviews: ContactReview[] = contacts.map((contact) => {
    const enrichment = enrichments.find((row) => row.contactId === contact.id);
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
      drafts: drafts
        .filter((draft) => draft.contactId === contact.id)
        .map((draft) => ({
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
      <div className="space-y-3">
        <Link
          href="/dashboard/campaigns/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          {t('back_link')}
        </Link>

        <div className="flex flex-wrap items-center gap-3">
          <CampaignNameEditor campaignId={campaign.id} name={campaign.name} />
          <StatusBadge kind="campaign" status={campaign.status} />
        </div>

        <p className="text-sm text-muted-foreground">
          {t('meta_line', {
            contacts: contacts.length,
            emails: campaign.emailCount,
            date: campaign.createdAt.toLocaleDateString(locale),
          })}
        </p>

        <p className="text-sm text-muted-foreground">
          {t('spend_line', {
            total: usd(usage.totalCostMicros),
            tokens: format.number(usage.anthropicTokens, COMPACT_FORMAT),
            anthropicCost: usd(usage.anthropicCostMicros),
            runs: usage.parallelRuns,
            parallelCost: usd(usage.parallelCostMicros),
          })}
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

      <Tabs defaultValue="review">
        <TabsList>
          <TabsTrigger value="review">
            {t('tab_review')}
            <Badge variant="secondary">{contacts.length}</Badge>
          </TabsTrigger>

          <TabsTrigger value="send" disabled={isPushed}>
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
