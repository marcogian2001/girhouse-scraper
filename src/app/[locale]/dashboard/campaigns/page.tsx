import { ChevronRight, Download, Megaphone, Plus } from 'lucide-react';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { LinkTabs } from '@/components/LinkTabs';
import { ListPagination } from '@/components/ListPagination';
import { ListSearch } from '@/components/ListSearch';
import { NoCampaigns } from '@/components/NoCampaigns';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { TableFrame } from '@/components/TableFrame';
import { Button } from '@/components/ui/button';
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
import { listCampaigns } from '@/libs/Campaigns';
import { Link } from '@/libs/I18nNavigation';
import { AppConfig } from '@/utils/AppConfig';
import { LIST_PAGE_SIZE, parsePage } from '@/utils/Pagination';
import { microsToUsd, USD_FORMAT } from '@/utils/UsageFormat';

/**
 * Builds the link to a page of the campaign list, keeping its tab and search.
 * @param options The list state.
 * @param options.archived Whether the archived tab is open.
 * @param options.search The search, if any.
 * @param options.page The 1-based page.
 * @returns The relative URL.
 */
const campaignsHref = (options: { archived: boolean; search: string; page: number }) => {
  const params = new URLSearchParams();

  if (options.archived) {
    params.set('view', 'archived');
  }

  if (options.search) {
    params.set('q', options.search);
  }

  if (options.page > 1) {
    params.set('page', String(options.page));
  }

  const query = params.toString();

  return `/dashboard/campaigns/${query ? `?${query}` : ''}`;
};

export default async function CampaignsPage(props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const searchParams = await props.searchParams;
  const isArchivedView = searchParams.view === 'archived';
  const search = typeof searchParams.q === 'string' ? searchParams.q.trim() : '';

  const page = parsePage(searchParams.page);

  const [t, format, context] = await Promise.all([
    getTranslations({ locale, namespace: 'CampaignsPage' }),
    getFormatter({ locale }),
    getApiContext(),
  ]);

  const listing = context
    ? await listCampaigns({
        organizationId: context.organizationId,
        archived: isArchivedView,
        search,
        page,
      })
    : { campaigns: [], matching: 0, total: 0, archived: 0 };
  const { campaigns, matching } = listing;
  const totalCount = listing.total;
  const archivedCount = listing.archived;
  const pageCount = Math.ceil(matching / LIST_PAGE_SIZE);
  const pageHref = (target: number) =>
    campaignsHref({ archived: isArchivedView, search, page: target });
  const emptyMessage = isArchivedView ? t('empty_archived') : t('empty_active');
  const usd = (micros: number) => format.number(microsToUsd(micros), USD_FORMAT);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={
          <Button asChild>
            <Link href="/dashboard/campaigns/new/">
              <Plus />
              {t('button_new')}
            </Link>
          </Button>
        }
      />

      {totalCount > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <LinkTabs
            value={isArchivedView ? 'archived' : 'active'}
            tabs={[
              {
                value: 'active',
                href: '/dashboard/campaigns/',
                label: t('tab_active', { count: totalCount - archivedCount }),
              },
              {
                value: 'archived',
                href: '/dashboard/campaigns/?view=archived',
                label: t('tab_archived', { count: archivedCount }),
              },
            ]}
          />

          <ListSearch defaultValue={search} placeholder={t('search_placeholder')} />

          {campaigns.length > 0 && (
            <Button asChild variant="outline" className="sm:ml-auto">
              <a href={`/api/campaigns/export${isArchivedView ? '?view=archived' : ''}`} download>
                <Download />
                {isArchivedView ? t('button_export_archived') : t('button_export_active')}
              </a>
            </Button>
          )}
        </div>
      )}

      {totalCount === 0 && <NoCampaigns />}

      {totalCount > 0 && campaigns.length === 0 && (
        <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          {search ? t('empty_search', { search }) : emptyMessage}
        </p>
      )}

      {campaigns.length > 0 && (
        <>
          <TableFrame className="hidden md:block">
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
                  <TableRow key={campaign.id} className="relative">
                    <TableCell>
                      <Link
                        href={`/dashboard/campaigns/${campaign.id}/`}
                        // Stretched over the row, so the whole row opens the campaign
                        className="font-medium after:absolute after:inset-0"
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
                        <Button asChild variant="ghost" size="icon" className="relative z-10">
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
          </TableFrame>

          {/* A seven-column table has nowhere to go on a phone, so it becomes rows */}
          <TableFrame className="md:hidden">
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
          </TableFrame>
        </>
      )}

      {pageCount > 1 && (
        <ListPagination
          summary={t('pagination_summary', { page, pageCount, count: matching })}
          previousHref={page > 1 ? pageHref(page - 1) : undefined}
          nextHref={page < pageCount ? pageHref(page + 1) : undefined}
        />
      )}
    </div>
  );
}
