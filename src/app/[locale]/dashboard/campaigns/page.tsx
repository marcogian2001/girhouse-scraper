import { count, desc, eq } from 'drizzle-orm';
import { ChevronRight, Megaphone, Plus } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
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
import { getApiContext } from '@/libs/ApiAuth';
import { db } from '@/libs/DB';
import { Link } from '@/libs/I18nNavigation';
import { campaignSchema, contactSchema } from '@/models/Schema';

export default async function CampaignsPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'CampaignsPage' });
  const context = await getApiContext();

  const campaigns = context
    ? await db
        .select({
          id: campaignSchema.id,
          name: campaignSchema.name,
          status: campaignSchema.status,
          emailCount: campaignSchema.emailCount,
          createdAt: campaignSchema.createdAt,
          // Grouping by the primary key lets the other columns ride along
          contacts: count(contactSchema.id),
        })
        .from(campaignSchema)
        .leftJoin(contactSchema, eq(contactSchema.campaignId, campaignSchema.id))
        .where(eq(campaignSchema.organizationId, context.organizationId))
        .groupBy(campaignSchema.id)
        .orderBy(desc(campaignSchema.createdAt))
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>

        <Button asChild className="h-10 px-4">
          <Link href="/dashboard/campaigns/new/">
            <Plus />
            {t('button_new')}
          </Link>
        </Button>
      </div>

      {campaigns.length === 0 ? (
        <NoCampaigns />
      ) : (
        <>
          <Card className="hidden p-0 md:block">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>{t('column_name')}</TableHead>
                  <TableHead>{t('column_status')}</TableHead>
                  <TableHead className="text-right">{t('column_contacts')}</TableHead>
                  <TableHead className="text-right">{t('column_emails')}</TableHead>
                  <TableHead>{t('column_created')}</TableHead>
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

                    <TableCell className="text-muted-foreground">
                      {campaign.createdAt.toLocaleDateString(locale)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* A five-column table has nowhere to go on a phone, so it becomes rows */}
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
        </>
      )}
    </div>
  );
}
