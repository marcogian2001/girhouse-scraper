import { ArrowLeft } from 'lucide-react';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import * as z from 'zod';
import { ConversationDemoCard } from '@/components/ConversationDemoCard';
import { ConversationProgress } from '@/components/ConversationProgress';
import { ConversationThread } from '@/components/ConversationThread';
import { ConversationTimeline } from '@/components/ConversationTimeline';
import { RunNextActionButton } from '@/components/RunNextActionButton';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getApiContext } from '@/libs/ApiAuth';
import { EVENT_TYPES, getConversationDetail } from '@/libs/Conversations';
import { getConversationDemo } from '@/libs/Demos';
import { canRunNextActionNow, canSkipToWhatsapp } from '@/libs/FollowUps';
import { Link } from '@/libs/I18nNavigation';
import { conversationStateEnum, replyCategoryEnum } from '@/models/Schema';

export default async function ReplyDetailPage(props: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await props.params;
  setRequestLocale(locale);

  const [t, stateT, categoryT, format, context] = await Promise.all([
    getTranslations({ locale, namespace: 'ReplyDetailPage' }),
    getTranslations({ locale, namespace: 'ConversationState' }),
    getTranslations({ locale, namespace: 'ReplyCategory' }),
    getFormatter({ locale }),
    getApiContext(),
  ]);

  const detail =
    context && z.uuid().safeParse(id).success
      ? await getConversationDetail({ organizationId: context.organizationId, conversationId: id })
      : null;

  if (!detail) {
    notFound();
  }

  const { conversation, events } = detail;
  const [demo, canRunNow, canSkip] = await Promise.all([
    getConversationDemo(conversation.id),
    canRunNextActionNow(conversation),
    canSkipToWhatsapp(conversation),
  ]);

  const stateLabel = (value: unknown) => {
    const state = conversationStateEnum.enumValues.find((option) => option === value);

    return state ? stateT(`status_${state}`) : '?';
  };

  const categoryLabel = (value: unknown) => {
    const category = replyCategoryEnum.enumValues.find((option) => option === value);

    return category ? categoryT(`category_${category}`) : '?';
  };

  const eventLabel = (type: string) => {
    const known = EVENT_TYPES.find((option) => option === type);

    return known ? t(`event_${known}`) : type;
  };

  const eventDetail = (type: string, payload: Record<string, unknown>) => {
    if (type === 'state_changed') {
      return `${stateLabel(payload.from)} → ${stateLabel(payload.to)}`;
    }

    if (type === 'classification_overridden') {
      return `${categoryLabel(payload.from)} → ${categoryLabel(payload.to)}`;
    }

    if (type === 'classified') {
      return categoryLabel(payload.category);
    }

    return typeof payload.error === 'string' ? payload.error : null;
  };

  const facts = [
    [t('fact_email'), conversation.leadEmail],
    [t('fact_mailbox'), conversation.eaccount],
    [t('fact_phone'), conversation.phoneE164],
    [
      t('fact_first_email'),
      conversation.firstEmailSentAt &&
        format.dateTime(conversation.firstEmailSentAt, { dateStyle: 'medium' }),
    ],
    [
      t('fact_back_on'),
      conversation.outOfOfficeUntil &&
        format.dateTime(conversation.outOfOfficeUntil, { dateStyle: 'medium' }),
    ],
    [t('fact_negative_replies'), String(conversation.negativeReplyCount)],
    [
      t('fact_next_follow_up'),
      conversation.nextActionAt &&
        format.dateTime(conversation.nextActionAt, { dateStyle: 'medium', timeStyle: 'short' }),
    ],
    [
      t('fact_follow_ups_sent'),
      conversation.followUpCount > 0 ? String(conversation.followUpCount) : null,
    ],
    [
      t('fact_nurturing_sent'),
      conversation.nurturingCount > 0 ? String(conversation.nurturingCount) : null,
    ],
  ].filter(([, value]) => value);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link
          href="/dashboard/replies/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          {t('back_link')}
        </Link>

        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {conversation.company ?? conversation.leadEmail}
          </h1>
          {conversation.isTest && <Badge variant="outline">{t('badge_test')}</Badge>}
          <ConversationProgress
            conversationId={conversation.id}
            initialState={conversation.state}
            initialPendingJobs={detail.pendingJobs}
          />
        </div>
      </div>

      <Card>
        <CardContent className="space-y-4">
          <dl className="grid gap-4 sm:grid-cols-3">
            {facts.map(([label, value]) => (
              <div key={label} className="space-y-1">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="text-sm break-all">{value}</dd>
              </div>
            ))}
          </dl>
          {(canRunNow || canSkip) && (
            <div className="flex flex-wrap gap-2">
              {canRunNow && <RunNextActionButton conversationId={conversation.id} />}
              {canSkip && <RunNextActionButton conversationId={conversation.id} to="whatsapp" />}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t('replies_title')}</CardTitle>
          </CardHeader>

          <CardContent>
            <ConversationThread detail={detail} />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <ConversationDemoCard conversationId={conversation.id} demo={demo} />

          <Card>
            <CardHeader>
              <CardTitle>{t('log_title')}</CardTitle>
            </CardHeader>

            <CardContent>
              <ConversationTimeline
                entries={events.map(({ event, actorName }) => ({
                  id: event.id,
                  type: event.type,
                  label: eventLabel(event.type),
                  detail: eventDetail(event.type, event.payload),
                  actor: actorName ? t('by_person', { name: actorName }) : null,
                  createdAt: event.createdAt,
                }))}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
