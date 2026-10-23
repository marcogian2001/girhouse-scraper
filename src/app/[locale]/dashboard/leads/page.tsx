import { and, count, desc, eq, notInArray, sql } from 'drizzle-orm';
import { ChevronRight, MapPin, Plus, Search } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { EmptyState } from '@/components/EmptyState';
import { ListPagination } from '@/components/ListPagination';
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
import { db } from '@/libs/DB';
import { Link } from '@/libs/I18nNavigation';
import { leadSchema, leadSearchSchema } from '@/models/Schema';
import { AppConfig } from '@/utils/AppConfig';
import { RESERVE_LEAD_STATUSES } from '@/utils/Leads';
import { LIST_PAGE_SIZE, parsePage } from '@/utils/Pagination';

/**
 * Builds the link to a page of the lead search list.
 * @param page The 1-based page.
 * @returns The relative URL.
 */
const pageHref = (page: number) => `/dashboard/leads/${page > 1 ? `?page=${page}` : ''}`;

export default async function LeadSearchesPage(props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const searchParams = await props.searchParams;
  const page = parsePage(searchParams.page);

  const [t, context] = await Promise.all([
    getTranslations({ locale, namespace: 'LeadSearchesPage' }),
    getApiContext(),
  ]);

  const searches = context
    ? await db
        .select({
          id: leadSearchSchema.id,
          name: leadSearchSchema.name,
          location: leadSearchSchema.location,
          status: leadSearchSchema.status,
          createdAt: leadSearchSchema.createdAt,
          // Grouping by the primary key lets the other columns ride along
          leads: count(leadSchema.id),
          ready:
            sql<number>`count(${leadSchema.id}) filter (where ${leadSchema.status} = 'ready')`.mapWith(
              Number,
            ),
          // Counted after grouping and before the limit, so it is every search
          matching: sql<number>`count(*) over ()`.mapWith(Number),
        })
        .from(leadSearchSchema)
        .leftJoin(
          leadSchema,
          and(
            eq(leadSchema.leadSearchId, leadSearchSchema.id),
            notInArray(leadSchema.status, [...RESERVE_LEAD_STATUSES]),
          ),
        )
        .where(eq(leadSearchSchema.organizationId, context.organizationId))
        .groupBy(leadSearchSchema.id)
        .orderBy(desc(leadSearchSchema.createdAt), desc(leadSearchSchema.id))
        .limit(LIST_PAGE_SIZE)
        .offset((page - 1) * LIST_PAGE_SIZE)
    : [];
  const matching = searches[0]?.matching ?? 0;
  const pageCount = Math.ceil(matching / LIST_PAGE_SIZE);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={
          <Button asChild>
            <Link href="/dashboard/leads/new/">
              <Plus />
              {t('button_new')}
            </Link>
          </Button>
        }
      />

      {searches.length === 0 ? (
        <EmptyState
          icon={<Search />}
          title={t('empty_title')}
          description={t('empty_description')}
          action={
            <Button asChild>
              <Link href="/dashboard/leads/new/">{t('button_first')}</Link>
            </Button>
          }
        />
      ) : (
        <>
          <TableFrame className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('column_name')}</TableHead>
                  <TableHead>{t('column_location')}</TableHead>
                  <TableHead>{t('column_status')}</TableHead>
                  <TableHead className="text-right">{t('column_leads')}</TableHead>
                  <TableHead className="text-right">{t('column_ready')}</TableHead>
                  <TableHead>{t('column_created')}</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {searches.map((search) => (
                  <TableRow key={search.id} className="relative">
                    <TableCell>
                      <Link
                        href={`/dashboard/leads/${search.id}/`}
                        className="font-medium after:absolute after:inset-0"
                      >
                        {search.name}
                      </Link>
                    </TableCell>

                    <TableCell className="text-muted-foreground">{search.location}</TableCell>

                    <TableCell>
                      <StatusBadge kind="leadSearch" status={search.status} />
                    </TableCell>

                    <TableCell className="text-right tabular-nums">{search.leads}</TableCell>

                    <TableCell className="text-right tabular-nums">{search.ready}</TableCell>

                    <TableCell className="text-muted-foreground">
                      {search.createdAt.toLocaleDateString(locale, {
                        timeZone: AppConfig.timeZone,
                      })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableFrame>

          {/* A six-column table has nowhere to go on a phone, so it becomes rows */}
          <TableFrame className="md:hidden">
            <ItemGroup>
              {searches.map((search) => (
                <Item key={search.id} asChild>
                  <Link href={`/dashboard/leads/${search.id}/`}>
                    <ItemMedia>
                      <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <MapPin className="size-4" />
                      </span>
                    </ItemMedia>

                    <ItemContent>
                      <ItemTitle>{search.name}</ItemTitle>
                      <ItemDescription>
                        {t('row_meta', {
                          ready: search.ready,
                          location: search.location,
                        })}
                      </ItemDescription>
                    </ItemContent>

                    <ItemActions>
                      <StatusBadge kind="leadSearch" status={search.status} />
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
