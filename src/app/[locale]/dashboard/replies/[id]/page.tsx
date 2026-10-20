import { ArrowLeft } from 'lucide-react';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import * as z from 'zod';
import { ClassificationEditor } from '@/components/ClassificationEditor';
import { ConversationDemoCard } from '@/components/ConversationDemoCard';
import { ConversationProgress } from '@/components/ConversationProgress';
import { OutboundEmailEditor } from '@/components/OutboundEmailEditor';
import { RunNextActionButton } from '@/components/RunNextActionButton';
import { StatusBadge } from '@/components/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { WhatsappHandoffCard } from '@/components/WhatsappHandoffCard';
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

  const t = await getTranslations({ locale, namespace: 'ReplyDetailPage' });
  const stateT = await getTranslations({ locale, namespace: 'ConversationState' });
  const categoryT = await getTranslations({ locale, namespace: 'ReplyCategory' });
  const format = await getFormatter({ locale });
  const context = await getApiContext();

  const detail =
    context && z.uuid().safeParse(id).success
      ? await getConversationDetail({ organizationId: context.organizationId, conversationId: id })
      : null;

  if (!detail) {
    notFound();
  }

  const { conversation, messages, outbound, events } = detail;
  const demo = await getConversationDemo(conversation.id);
  const canRunNow = await canRunNextActionNow(conversation);
  const canSkip = await canSkipToWhatsapp(conversation);
  const latestMessageId = messages.at(-1)?.message.id;

  const dateTime = (date: Date) =>
    format.dateTime(date, { dateStyle: 'medium', timeStyle: 'short' });

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

          <CardContent className="space-y-6">
            {messages.map(({ message, classification, objection }) => (
              <article
                key={message.id}
                className="space-y-3 border-b pb-6 last:border-b-0 last:pb-0"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{dateTime(message.receivedAt)}</span>
                  {message.subject && <span>· {message.subject}</span>}
                  {message.isAutoReply && <Badge variant="outline">{t('badge_auto_reply')}</Badge>}
                  {message.instantlyInterestLabel && (
                    <Badge variant="outline">
                      {t('instantly_label', { label: message.instantlyInterestLabel })}
                    </Badge>
                  )}
                </div>

                <p className="text-sm whitespace-pre-wrap">{message.bodyText}</p>

                {classification ? (
                  <div className="space-y-3 rounded-lg bg-muted/50 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge kind="replyCategory" status={classification.category} />
                      <span className="text-xs text-muted-foreground">
                        {t('classification_meta', {
                          confidence: Math.round(classification.confidence * 100),
                          source: t(`source_${classification.source}`),
                        })}
                      </span>
                    </div>

                    <p className="text-sm">{classification.reasoning}</p>

                    <ul className="space-y-1 text-xs text-muted-foreground">
                      {objection && (
                        <li>
                          {t('detail_objection')}{' '}
                          <Link href="/dashboard/objections/" className="underline">
                            {objection.title}
                          </Link>
                        </li>
                      )}
                      {classification.referral && (
                        <li>{t('detail_referral', { referral: classification.referral })}</li>
                      )}
                      {classification.chosenSlot && (
                        <li>{t('detail_slot', { slot: classification.chosenSlot })}</li>
                      )}
                      {classification.phoneE164 && (
                        <li>{t('detail_phone', { phone: classification.phoneE164 })}</li>
                      )}
                      {classification.returnDate && (
                        <li>{t('detail_return', { date: classification.returnDate })}</li>
                      )}
                    </ul>

                    {message.id === latestMessageId && (
                      <ClassificationEditor
                        classificationId={classification.id}
                        category={classification.category}
                      />
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {message.processedAt ? t('not_classified') : t('pending')}
                  </p>
                )}

                {outbound
                  .filter((email) => email.inboundMessageId === message.id)
                  .map((email) => (
                    <div key={email.id} className="space-y-2">
                      <h3 className="text-sm font-medium">{t('answer_title')}</h3>
                      <OutboundEmailEditor email={email} />
                    </div>
                  ))}
              </article>
            ))}

            {/* Follow-ups answer no reply in particular: they come after the thread */}
            {outbound
              .filter((email) => !email.inboundMessageId)
              .map((email) => (
                <article key={email.id} className="space-y-2 border-t pt-6">
                  <h3 className="text-sm font-medium">{t(`outbound_title_${email.kind}`)}</h3>
                  <OutboundEmailEditor email={email} />
                </article>
              ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <WhatsappHandoffCard
            conversationId={conversation.id}
            handoff={detail.whatsappHandoff}
            messages={detail.whatsappMessages}
          />

          <ConversationDemoCard conversationId={conversation.id} demo={demo} />

          <Card>
            <CardHeader>
              <CardTitle>{t('log_title')}</CardTitle>
            </CardHeader>

            <CardContent>
              <ol className="space-y-3">
                {events.map(({ event, actorName }) => {
                  const description = eventDetail(event.type, event.payload);

                  return (
                    <li key={event.id} className="space-y-0.5 text-sm">
                      <div className="font-medium">{eventLabel(event.type)}</div>
                      {description && (
                        <div className="break-words text-muted-foreground">{description}</div>
                      )}
                      <div className="text-xs text-muted-foreground">
                        {dateTime(event.createdAt)}
                        {actorName && ` · ${t('by_person', { name: actorName })}`}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
