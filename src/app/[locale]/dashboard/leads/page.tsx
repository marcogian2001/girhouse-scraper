import { count, desc, eq, sql } from 'drizzle-orm';
import { ChevronRight, MapPin, Plus, Search } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
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

export default async function LeadSearchesPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'LeadSearchesPage' });
  const context = await getApiContext();

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
        })
        .from(leadSearchSchema)
        .leftJoin(leadSchema, eq(leadSchema.leadSearchId, leadSearchSchema.id))
        .where(eq(leadSearchSchema.organizationId, context.organizationId))
        .groupBy(leadSearchSchema.id)
        .orderBy(desc(leadSearchSchema.createdAt))
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>

        <Button asChild className="h-10 px-4">
          <Link href="/dashboard/leads/new/">
            <Plus />
            {t('button_new')}
          </Link>
        </Button>
      </div>

      {searches.length === 0 ? (
        <Empty className="rounded-xl border border-dashed">
          <EmptyHeader>
            <EmptyMedia>
              <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Search className="size-5" />
              </span>
            </EmptyMedia>

            <EmptyTitle>{t('empty_title')}</EmptyTitle>
            <EmptyDescription>{t('empty_description')}</EmptyDescription>
          </EmptyHeader>

          <EmptyContent>
            <Button asChild className="h-10 px-5">
              <Link href="/dashboard/leads/new/">{t('button_first')}</Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          <Card className="hidden p-0 md:block">
            <Table>
              <TableHeader className="bg-muted/50">
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
                  <TableRow key={search.id} className="hover:bg-accent/40">
                    <TableCell>
                      <Link
                        href={`/dashboard/leads/${search.id}/`}
                        className="font-medium hover:text-primary"
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
                      {search.createdAt.toLocaleDateString(locale)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* A six-column table has nowhere to go on a phone, so it becomes rows */}
          <Card className="p-0 md:hidden">
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
          </Card>
        </>
      )}
    </div>
  );
}
