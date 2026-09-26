import { count, desc, eq } from 'drizzle-orm';
import { BookOpen, ChevronRight, Mail, Megaphone, Plus, Rocket, Users } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { NoCampaigns } from '@/components/NoCampaigns';
import { StatCard } from '@/components/StatCard';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
import { auth } from '@/libs/Auth';
import { db } from '@/libs/DB';
import { Link } from '@/libs/I18nNavigation';
import { resolveOrganizationId } from '@/libs/Organization';
import {
  campaignSchema,
  contactSchema,
  emailDraftSchema,
  knowledgeAssetSchema,
} from '@/models/Schema';

const RECENT_CAMPAIGN_LIMIT = 5;

export default async function DashboardHomePage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'DashboardHomePage' });
  const session = await auth.api.getSession({ headers: await headers() });
  const organizationId = session
    ? await resolveOrganizationId(session.user.id, session.session.activeOrganizationId)
    : null;

  const [campaignStats, contactStats, draftStats, knowledgeStats, recent] = organizationId
    ? await Promise.all([
        // `count(column)` skips NULLs, so `live` is exactly what reached Instantly
        db
          .select({ total: count(), live: count(campaignSchema.instantlyCampaignId) })
          .from(campaignSchema)
          .where(eq(campaignSchema.organizationId, organizationId)),

        db
          .select({ total: count() })
          .from(contactSchema)
          .innerJoin(campaignSchema, eq(contactSchema.campaignId, campaignSchema.id))
          .where(eq(campaignSchema.organizationId, organizationId)),

        db
          .select({ total: count() })
          .from(emailDraftSchema)
          .innerJoin(contactSchema, eq(emailDraftSchema.contactId, contactSchema.id))
          .innerJoin(campaignSchema, eq(contactSchema.campaignId, campaignSchema.id))
          .where(eq(campaignSchema.organizationId, organizationId)),

        db
          .select({ total: count() })
          .from(knowledgeAssetSchema)
          .where(eq(knowledgeAssetSchema.organizationId, organizationId)),

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
          .where(eq(campaignSchema.organizationId, organizationId))
          .groupBy(campaignSchema.id)
          .orderBy(desc(campaignSchema.createdAt))
          .limit(RECENT_CAMPAIGN_LIMIT),
      ])
    : [[], [], [], [], []];

  const totalCampaigns = campaignStats[0]?.total ?? 0;
  const firstName = session?.user.name?.split(' ')[0] ?? '';

  const stats = [
    { label: t('stat_campaigns'), value: totalCampaigns, icon: <Megaphone className="size-4" /> },
    {
      label: t('stat_contacts'),
      value: contactStats[0]?.total ?? 0,
      icon: <Users className="size-4" />,
    },
    {
      label: t('stat_emails'),
      value: draftStats[0]?.total ?? 0,
      icon: <Mail className="size-4" />,
    },
    {
      label: t('stat_live'),
      value: campaignStats[0]?.live ?? 0,
      icon: <Rocket className="size-4" />,
    },
  ];

  return (
    <div className="space-y-6">
      {/* One spacing token drives the card's vertical padding and the content's
          horizontal padding, so the hero stays square on all four sides */}
      <Card className="relative overflow-hidden [--card-spacing:--spacing(6)]">
        {/* Tinted wash so the hero reads as the primary surface on the page */}
        <div className="absolute inset-0 bg-[radial-gradient(45%_120%_at_85%_0%,var(--accent),transparent_70%)]" />

        <CardContent className="relative flex flex-col gap-5">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">
              {firstName ? t('title', { name: firstName }) : t('title_generic')}
            </h1>
            <p className="max-w-xl text-muted-foreground">{t('subtitle')}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button asChild className="h-11 px-5">
              <Link href="/dashboard/campaigns/new/">
                <Plus />
                {t('button_new')}
              </Link>
            </Button>

            <Button asChild variant="ghost" className="h-11">
              <Link href="/dashboard/knowledge/">{t('link_knowledge')}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <StatCard key={stat.label} label={stat.label} value={stat.value} icon={stat.icon} />
        ))}
      </div>

      {totalCampaigns === 0 ? (
        <NoCampaigns />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          {/* `py-0` lets the rows run edge to edge, so the header carries its own */}
          <Card className="py-0">
            <CardHeader className="border-b py-(--card-spacing)">
              <CardTitle>{t('recent_title')}</CardTitle>

              <CardAction>
                <Button asChild variant="link" size="sm">
                  <Link href="/dashboard/campaigns/">{t('recent_all')}</Link>
                </Button>
              </CardAction>
            </CardHeader>

            <ItemGroup>
              {recent.map((campaign) => (
                <Item key={campaign.id} asChild>
                  <Link href={`/dashboard/campaigns/${campaign.id}/`}>
                    <ItemMedia>
                      <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <Megaphone className="size-4" />
                      </span>
                    </ItemMedia>

                    <ItemContent>
                      <ItemTitle>{campaign.name}</ItemTitle>
                      <ItemDescription>
                        {t('recent_meta', {
                          contacts: campaign.contacts,
                          date: campaign.createdAt.toLocaleDateString(locale),
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
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('knowledge_title')}</CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{t('knowledge_description')}</p>

              <p className="text-2xl font-semibold tabular-nums">{knowledgeStats[0]?.total ?? 0}</p>

              <Button asChild variant="outline" className="w-full">
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
