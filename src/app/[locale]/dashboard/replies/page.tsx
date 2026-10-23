import { CircleCheck, Clock, Download, Inbox } from 'lucide-react';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { EmptyState } from '@/components/EmptyState';
import { ListPagination } from '@/components/ListPagination';
import { PageHeader } from '@/components/PageHeader';
import { RepliesFilters } from '@/components/RepliesFilters';
import { StatusBadge } from '@/components/StatusBadge';
import { TableFrame } from '@/components/TableFrame';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { parsePage } from '@/utils/Pagination';
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
  const page = parsePage(searchParams.page);

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
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={
          <Button asChild variant="outline">
            <Link href="/dashboard/replies/import/">
              <Download />
              {t('button_import')}
            </Link>
          </Button>
        }
      />

      <RepliesFilters query={query} states={conversationStateEnum.enumValues} />

      {conversations.length === 0 ? (
        <EmptyState
          icon={<Inbox />}
          title={isFiltered ? t('empty_filtered_title') : t('empty_title')}
          description={isFiltered ? t('empty_filtered_description') : t('empty_description')}
        />
      ) : (
        <TableFrame>
          <Table>
            <TableHeader>
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
                <TableRow key={conversation.id} className="relative">
                  {/* Capped and truncated, so one long company name cannot widen the whole table */}
                  <TableCell className="max-w-64 lg:max-w-80">
                    <Link
                      href={`/dashboard/replies/${conversation.id}/`}
                      title={conversation.company ?? conversation.leadEmail}
                      className="block truncate font-medium after:absolute after:inset-0"
                    >
                      {conversation.company ?? conversation.leadEmail}
                    </Link>
                    <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                      <span
                        className="truncate"
                        title={[conversation.leadName, conversation.leadEmail]
                          .filter(Boolean)
                          .join(' · ')}
                      >
                        {[conversation.leadName, conversation.leadEmail]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                      {conversation.isTest && (
                        <Badge variant="outline" className="shrink-0">
                          {t('badge_test')}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge kind="conversation" status={conversation.state} />
                  </TableCell>
                  <TableCell>
                    {conversation.lastOutboundAt ? (
                      <div className="space-y-0.5">
                        <span className="flex items-center gap-1.5 text-sm">
                          <CircleCheck className="size-4 text-success" />
                          {t('answered_yes')}
                        </span>
                        <div className="text-xs text-muted-foreground">
                          {format.dateTime(conversation.lastOutboundAt, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </div>
                      </div>
                    ) : (
                      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Clock className="size-4 text-warning" />
                        {t('answered_no')}
                      </span>
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
        </TableFrame>
      )}

      {pageCount > 1 && (
        <ListPagination
          summary={t('pagination_summary', { page, pageCount, count: matching })}
          previousHref={page > 1 ? repliesHref(query, page - 1) : undefined}
          nextHref={page < pageCount ? repliesHref(query, page + 1) : undefined}
        />
      )}
    </div>
  );
}
