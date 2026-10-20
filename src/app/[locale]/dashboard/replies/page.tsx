import { FlaskConical, Inbox } from 'lucide-react';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getApiContext } from '@/libs/ApiAuth';
import { countConversationsByState, listConversations, REVIEW_STATES } from '@/libs/Conversations';
import { Link } from '@/libs/I18nNavigation';
import type { ConversationState } from '@/utils/ReplyRouting';

export default async function RepliesPage(props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const searchParams = await props.searchParams;
  const isReviewView = searchParams.view === 'review';

  const t = await getTranslations({ locale, namespace: 'RepliesPage' });
  const format = await getFormatter({ locale });
  const context = await getApiContext();

  const counts = context
    ? await countConversationsByState(context.organizationId)
    : new Map<ConversationState, number>();
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  const reviewCount = REVIEW_STATES.reduce((sum, state) => sum + (counts.get(state) ?? 0), 0);

  const conversations = context
    ? await listConversations({
        organizationId: context.organizationId,
        states: isReviewView ? REVIEW_STATES : undefined,
      })
    : [];

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

      <Tabs value={isReviewView ? 'review' : 'all'}>
        <TabsList>
          <TabsTrigger value="all" asChild>
            <Link href="/dashboard/replies/">{t('tab_all', { count: total })}</Link>
          </TabsTrigger>

          <TabsTrigger value="review" asChild>
            <Link href="/dashboard/replies/?view=review">
              {t('tab_review', { count: reviewCount })}
            </Link>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {conversations.length === 0 ? (
        <Empty className="rounded-xl border border-dashed">
          <EmptyHeader>
            <EmptyMedia>
              <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Inbox className="size-5" />
              </span>
            </EmptyMedia>

            <EmptyTitle>{isReviewView ? t('empty_review_title') : t('empty_title')}</EmptyTitle>
            <EmptyDescription>
              {isReviewView ? t('empty_review_description') : t('empty_description')}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Card className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>{t('column_lead')}</TableHead>
                <TableHead>{t('column_state')}</TableHead>
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
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {conversation.leadEmail}
                      {conversation.isTest && <Badge variant="outline">{t('badge_test')}</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge kind="conversation" status={conversation.state} />
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
    </div>
  );
}
