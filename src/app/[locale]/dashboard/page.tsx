import { and, count, desc, eq, isNull } from 'drizzle-orm';
import { BookOpen, ChevronRight, Mail, Plus, Rocket, Send, Users } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { NoCampaigns } from '@/components/NoCampaigns';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { StatusBadge } from '@/components/StatusBadge';
import { TableFrame } from '@/components/TableFrame';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@/components/ui/item';
import { getApiContext, getSession } from '@/libs/ApiAuth';
import { db } from '@/libs/DB';
import { Link } from '@/libs/I18nNavigation';
import {
  campaignSchema,
  contactSchema,
  emailDraftSchema,
  knowledgeAssetSchema,
} from '@/models/Schema';
import { AppConfig } from '@/utils/AppConfig';

const RECENT_CAMPAIGN_LIMIT = 5;

export default async function DashboardHomePage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'DashboardHomePage' });
  // Both are cached for the request, so the layout already paid for them
  const [session, context] = await Promise.all([getSession(), getApiContext()]);
  const organizationId = context?.organizationId ?? null;

  const [campaignStats, contactStats, draftStats, knowledgeStats, recent] = organizationId
    ? await Promise.all([
        // `count(column)` skips NULLs, so `live` is exactly what reached Instantly
        db
          .select({ total: count(), live: count(campaignSchema.instantlyCampaignId) })
          .from(campaignSchema)
          .where(eq(campaignSchema.organizationId, organizationId))
          .$withCache(),

        db
          .select({ total: count() })
          .from(contactSchema)
          .innerJoin(campaignSchema, eq(contactSchema.campaignId, campaignSchema.id))
          .where(eq(campaignSchema.organizationId, organizationId))
          .$withCache(),

        db
          .select({ total: count() })
          .from(emailDraftSchema)
          .innerJoin(contactSchema, eq(emailDraftSchema.contactId, contactSchema.id))
          .innerJoin(campaignSchema, eq(contactSchema.campaignId, campaignSchema.id))
          .where(eq(campaignSchema.organizationId, organizationId))
          .$withCache(),

        db
          .select({ total: count() })
          .from(knowledgeAssetSchema)
          .where(eq(knowledgeAssetSchema.organizationId, organizationId))
          .$withCache(),

        // Grouping by the primary key lets the other columns ride along
        db
          .select({
            id: campaignSchema.id,
            name: campaignSchema.name,
            status: campaignSchema.status,
            createdAt: campaignSchema.createdAt,
            contacts: count(contactSchema.id),
          })
          .from(campaignSchema)
          .leftJoin(contactSchema, eq(contactSchema.campaignId, campaignSchema.id))
          .where(
            and(
              eq(campaignSchema.organizationId, organizationId),
              isNull(campaignSchema.archivedAt),
            ),
          )
          .groupBy(campaignSchema.id)
          .orderBy(desc(campaignSchema.createdAt))
          .limit(RECENT_CAMPAIGN_LIMIT)
          .$withCache(),
      ])
    : [[], [], [], [], []];

  const totalCampaigns = campaignStats[0]?.total ?? 0;
  const firstName = session?.user.name?.split(' ')[0] ?? '';

  const stats = [
    { label: t('stat_campaigns'), value: totalCampaigns, icon: <Send /> },
    {
      label: t('stat_contacts'),
      value: contactStats[0]?.total ?? 0,
      icon: <Users />,
    },
    {
      label: t('stat_emails'),
      value: draftStats[0]?.total ?? 0,
      icon: <Mail />,
    },
    {
      label: t('stat_live'),
      value: campaignStats[0]?.live ?? 0,
      icon: <Rocket />,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={firstName ? t('title', { name: firstName }) : t('title_generic')}
        description={t('subtitle')}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/dashboard/knowledge/">{t('link_knowledge')}</Link>
            </Button>

            <Button asChild>
              <Link href="/dashboard/campaigns/new/">
                <Plus />
                {t('button_new')}
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <StatCard key={stat.label} label={stat.label} value={stat.value} icon={stat.icon} />
        ))}
      </div>

      {totalCampaigns === 0 ? (
        <NoCampaigns />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <TableFrame>
            <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
              <h2 className="text-sm font-medium">{t('recent_title')}</h2>

              <Button asChild variant="link" size="sm" className="h-auto p-0">
                <Link href="/dashboard/campaigns/">{t('recent_all')}</Link>
              </Button>
            </div>

            <ItemGroup>
              {recent.map((campaign) => (
                <Item key={campaign.id} asChild className="rounded-none px-4 hover:bg-muted/50">
                  <Link href={`/dashboard/campaigns/${campaign.id}/`}>
                    <ItemContent>
                      <ItemTitle>{campaign.name}</ItemTitle>
                      <ItemDescription>
                        {t('recent_meta', {
                          contacts: campaign.contacts,
                          date: campaign.createdAt.toLocaleDateString(locale, {
                            timeZone: AppConfig.timeZone,
                          }),
                        })}
                      </ItemDescription>
                    </ItemContent>

                    <ItemActions>
                      <StatusBadge kind="campaign" status={campaign.status} />
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </ItemActions>
                  </Link>
                </Item>
              ))}
            </ItemGroup>
          </TableFrame>

          <Card size="sm" className="self-start">
            <CardHeader>
              <CardTitle>{t('knowledge_title')}</CardTitle>
              <CardDescription>{t('knowledge_description')}</CardDescription>
            </CardHeader>

            <CardContent className="flex items-end justify-between gap-4">
              <p className="text-2xl font-semibold tracking-tight tabular-nums">
                {knowledgeStats[0]?.total ?? 0}
              </p>

              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/knowledge/">
                  <BookOpen />
                  {t('knowledge_button')}
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
