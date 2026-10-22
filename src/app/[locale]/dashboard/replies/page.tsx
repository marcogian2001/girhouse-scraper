import { ChevronLeft, ChevronRight, FlaskConical, Inbox } from 'lucide-react';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { RepliesFilters } from '@/components/RepliesFilters';
import { StatusBadge } from '@/components/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getApiContext } from '@/libs/ApiAuth';
import { CONVERSATIONS_PAGE_SIZE, listConversations } from '@/libs/Conversations';
import { Link } from '@/libs/I18nNavigation';
import { conversationStateEnum } from '@/models/Schema';
import { hasRepliesFilters, parseRepliesQuery, repliesHref } from '@/utils/RepliesQuery';

export default async function RepliesPage(props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const searchParams = await props.searchParams;
  const query = parseRepliesQuery(searchParams, conversationStateEnum.enumValues);
  const isFiltered = hasRepliesFilters(query);
  const page =
    typeof searchParams.page === 'string'
      ? Math.max(1, Math.trunc(Number(searchParams.page)) || 1)
      : 1;

  const t = await getTranslations({ locale, namespace: 'RepliesPage' });
  const format = await getFormatter({ locale });
  const context = await getApiContext();

  const { conversations, total: matching } = context
    ? await listConversations({
        organizationId: context.organizationId,
        states: query.state ? [query.state] : undefined,
        search: query.search || undefined,
        answered: query.answered ? query.answered === 'yes' : undefined,
        botManaged: query.bot ? query.bot === 'yes' : undefined,
        page,
      })
    : { conversations: [], total: 0 };
  const pageCount = Math.ceil(matching / CONVERSATIONS_PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>

        <Button asChild variant="outline" className="h-10 px-4">
          <Link href="/dashboard/replies/new/">
            <FlaskConical />
            {t('button_simulate')}
          </Link>
        </Button>
      </div>

      <RepliesFilters query={query} states={conversationStateEnum.enumValues} />

      {conversations.length === 0 ? (
        <Empty className="rounded-xl border border-dashed">
          <EmptyHeader>
            <EmptyMedia>
              <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Inbox className="size-5" />
              </span>
            </EmptyMedia>

            {isFiltered ? (
              <>
                <EmptyTitle>{t('empty_filtered_title')}</EmptyTitle>
                <EmptyDescription>{t('empty_filtered_description')}</EmptyDescription>
              </>
            ) : (
              <>
                <EmptyTitle>{t('empty_title')}</EmptyTitle>
                <EmptyDescription>{t('empty_description')}</EmptyDescription>
              </>
            )}
          </EmptyHeader>
        </Empty>
      ) : (
        <Card className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>{t('column_lead')}</TableHead>
                <TableHead>{t('column_state')}</TableHead>
                <TableHead>{t('column_answered')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('column_category')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('column_last_reply')}</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {conversations.map((conversation) => (
                <TableRow key={conversation.id} className="hover:bg-accent/40">
                  <TableCell>
                    <Link
                      href={`/dashboard/replies/${conversation.id}/`}
                      className="font-medium hover:text-primary"
                    >
                      {conversation.company ?? conversation.leadEmail}
                    </Link>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {conversation.leadName && <span>{conversation.leadName}</span>}
                      {conversation.leadEmail}
                      {conversation.isTest && <Badge variant="outline">{t('badge_test')}</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge kind="conversation" status={conversation.state} />
                  </TableCell>
                  <TableCell>
                    {conversation.lastOutboundAt ? (
                      <div className="space-y-1">
                        <Badge variant="secondary">{t('answered_yes')}</Badge>
                        <div className="text-xs text-muted-foreground">
                          {format.dateTime(conversation.lastOutboundAt, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </div>
                      </div>
                    ) : (
                      <Badge variant="outline">{t('answered_no')}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {conversation.category && (
                      <StatusBadge kind="replyCategory" status={conversation.category} />
                    )}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {conversation.lastInboundAt &&
                      format.dateTime(conversation.lastInboundAt, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {t('pagination_summary', { page, pageCount, count: matching })}
          </p>

          <div className="flex items-center gap-2">
            {page > 1 ? (
              <Button asChild variant="outline" className="h-10 px-4">
                <Link href={repliesHref(query, page - 1)}>
                  <ChevronLeft />
                  {t('button_previous')}
                </Link>
              </Button>
            ) : (
              <Button variant="outline" className="h-10 px-4" disabled>
                <ChevronLeft />
                {t('button_previous')}
              </Button>
            )}

            {page < pageCount ? (
              <Button asChild variant="outline" className="h-10 px-4">
                <Link href={repliesHref(query, page + 1)}>
                  {t('button_next')}
                  <ChevronRight />
                </Link>
              </Button>
            ) : (
              <Button variant="outline" className="h-10 px-4" disabled>
                {t('button_next')}
                <ChevronRight />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
