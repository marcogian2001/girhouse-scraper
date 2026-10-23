import { count, desc, eq } from 'drizzle-orm';
import { ChevronRight, Download, Megaphone, Plus } from 'lucide-react';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { NoCampaigns } from '@/components/NoCampaigns';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getApiContext } from '@/libs/ApiAuth';
import { db } from '@/libs/DB';
import { Link } from '@/libs/I18nNavigation';
import { campaignCostMicros } from '@/libs/Usage';
import { campaignSchema, contactSchema } from '@/models/Schema';
import { AppConfig } from '@/utils/AppConfig';
import { microsToUsd, USD_FORMAT } from '@/utils/UsageFormat';

export default async function CampaignsPage(props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const searchParams = await props.searchParams;
  const isArchivedView = searchParams.view === 'archived';

  const t = await getTranslations({ locale, namespace: 'CampaignsPage' });
  const format = await getFormatter({ locale });
  const context = await getApiContext();

  const allCampaigns = context
    ? await db
        .select({
          id: campaignSchema.id,
          name: campaignSchema.name,
          status: campaignSchema.status,
          emailCount: campaignSchema.emailCount,
          createdAt: campaignSchema.createdAt,
          archivedAt: campaignSchema.archivedAt,
          // Grouping by the primary key lets the other columns ride along
          contacts: count(contactSchema.id),
          costMicros: campaignCostMicros,
        })
        .from(campaignSchema)
        .leftJoin(contactSchema, eq(contactSchema.campaignId, campaignSchema.id))
        .where(eq(campaignSchema.organizationId, context.organizationId))
        .groupBy(campaignSchema.id)
        .orderBy(desc(campaignSchema.createdAt))
    : [];
  const archivedCount = allCampaigns.filter((campaign) => campaign.archivedAt).length;
  const campaigns = allCampaigns.filter(
    (campaign) => Boolean(campaign.archivedAt) === isArchivedView,
  );
  const usd = (micros: number) => format.number(microsToUsd(micros), USD_FORMAT);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>

        <div className="flex items-center gap-2">
          {campaigns.length > 0 && (
            <Button asChild variant="outline" className="h-10 px-4">
              <a href={`/api/campaigns/export${isArchivedView ? '?view=archived' : ''}`} download>
                <Download />
                {isArchivedView ? t('button_export_archived') : t('button_export_active')}
              </a>
            </Button>
          )}

          <Button asChild className="h-10 px-4">
            <Link href="/dashboard/campaigns/new/">
              <Plus />
              {t('button_new')}
            </Link>
          </Button>
        </div>
      </div>

      {allCampaigns.length > 0 && (
        <Tabs value={isArchivedView ? 'archived' : 'active'}>
          <TabsList>
            <TabsTrigger value="active" asChild>
              <Link href="/dashboard/campaigns/">
                {t('tab_active', { count: allCampaigns.length - archivedCount })}
              </Link>
            </TabsTrigger>

            <TabsTrigger value="archived" asChild>
              <Link href="/dashboard/campaigns/?view=archived">
                {t('tab_archived', { count: archivedCount })}
              </Link>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {allCampaigns.length === 0 && <NoCampaigns />}

      {allCampaigns.length > 0 && campaigns.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {isArchivedView ? t('empty_archived') : t('empty_active')}
        </p>
      )}

      {campaigns.length > 0 && (
        <>
          <Card className="hidden p-0 md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('column_name')}</TableHead>
                  <TableHead>{t('column_status')}</TableHead>
                  <TableHead className="text-right">{t('column_contacts')}</TableHead>
                  <TableHead className="text-right">{t('column_emails')}</TableHead>
                  <TableHead className="text-right">{t('column_cost')}</TableHead>
                  <TableHead>{t('column_created')}</TableHead>
                  <TableHead>
                    <span className="sr-only">{t('column_actions')}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {campaigns.map((campaign) => (
                  <TableRow key={campaign.id} className="hover:bg-accent/40">
                    <TableCell>
                      <Link
                        href={`/dashboard/campaigns/${campaign.id}/`}
                        className="font-medium hover:text-primary"
                      >
                        {campaign.name}
                      </Link>
                    </TableCell>

                    <TableCell>
                      <StatusBadge kind="campaign" status={campaign.status} />
                    </TableCell>

                    <TableCell className="text-right tabular-nums">{campaign.contacts}</TableCell>

                    <TableCell className="text-right tabular-nums">{campaign.emailCount}</TableCell>

                    <TableCell className="text-right tabular-nums">
                      {usd(campaign.costMicros)}
                    </TableCell>

                    <TableCell className="text-muted-foreground">
                      {campaign.createdAt.toLocaleDateString(locale, {
                        timeZone: AppConfig.timeZone,
                      })}
                    </TableCell>

                    <TableCell className="text-right">
                      {campaign.contacts > 0 && (
                        <Button asChild variant="ghost" size="icon">
                          <a
                            href={`/api/campaigns/${campaign.id}/export`}
                            download
                            aria-label={t('label_export', { name: campaign.name })}
                          >
                            <Download />
                          </a>
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* A seven-column table has nowhere to go on a phone, so it becomes rows */}
          <Card className="p-0 md:hidden">
            <ItemGroup>
              {campaigns.map((campaign) => (
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
                        {t('row_meta', {
                          contacts: campaign.contacts,
                          cost: usd(campaign.costMicros),
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
          </Card>
        </>
      )}
    </div>
  );
}
