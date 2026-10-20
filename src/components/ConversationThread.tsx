import { cn } from 'cn';
import { Mail, MessageCircle } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { ClassificationEditor } from '@/components/ClassificationEditor';
import { OutboundEmailEditor } from '@/components/OutboundEmailEditor';
import { StatusBadge } from '@/components/StatusBadge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { WhatsappHandoffPanel } from '@/components/WhatsappHandoffPanel';
import type { getConversationDetail } from '@/libs/Conversations';
import { Link } from '@/libs/I18nNavigation';
import type { ThreadItem as ThreadItemOf } from '@/utils/MailThread';
import { buildThread, needsAction } from '@/utils/MailThread';

type Detail = NonNullable<Awaited<ReturnType<typeof getConversationDetail>>>;

type InboundEntry = Detail['messages'][number];

type ThreadItem = ThreadItemOf<
  InboundEntry,
  Detail['outbound'][number],
  NonNullable<Detail['whatsappHandoff']>
>;

/**
 * A reply of the lead, with how the AI read it.
 * @param props Component props.
 * @param props.entry The reply and its classification.
 * @param props.isLatest Whether it is the latest reply, the only one whose category may change.
 * @returns The reply.
 */
const InboundBody = (props: { entry: InboundEntry; isLatest: boolean }) => {
  const t = useTranslations('ReplyDetailPage');
  const { message, classification, objection } = props.entry;

  return (
    <div className="space-y-3">
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

          {props.isLatest && (
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
    </div>
  );
};

/**
 * The header of a message: who wrote it, what it is and when, with a preview while closed.
 * @param props Component props.
 * @param props.item The message.
 * @param props.detail The conversation.
 * @returns The header.
 */
const ItemHeader = (props: { item: ThreadItem; detail: Detail }) => {
  const t = useTranslations('ReplyDetailPage');
  const format = useFormatter();
  const { item } = props;

  const describe = () => {
    if (item.kind === 'inbound') {
      return {
        sender: props.detail.conversation.leadEmail,
        title: t('thread_inbound'),
        preview: item.entry.message.bodyText,
      };
    }

    if (item.kind === 'outbound') {
      return {
        sender: props.detail.conversation.eaccount ?? t('thread_us'),
        title: item.followUpNumber
          ? t('thread_follow_up', { number: item.followUpNumber })
          : t(`outbound_title_${item.email.kind}`),
        preview: item.email.body,
      };
    }

    return {
      sender: t('thread_whatsapp_sender'),
      title: t('thread_whatsapp'),
      preview: item.handoff.firstMessage,
    };
  };
  const header = describe();

  return (
    <div className="flex min-w-0 flex-1 items-start gap-3 pr-2">
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-medium uppercase',
          item.kind === 'inbound' && 'bg-info/10 text-info',
          item.kind === 'outbound' && 'bg-muted text-muted-foreground',
          item.kind === 'whatsapp' && 'bg-success/10 text-success',
        )}
      >
        {item.kind === 'inbound' && header.sender.charAt(0)}
        {item.kind === 'outbound' && <Mail className="size-4" />}
        {item.kind === 'whatsapp' && <MessageCircle className="size-4" />}
      </span>

      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium">{header.title}</span>
          {item.kind === 'whatsapp' && (
            <Badge variant="ghost" className="bg-success/10 text-success">
              {t('badge_whatsapp')}
            </Badge>
          )}
          {item.kind === 'outbound' && <StatusBadge kind="outbound" status={item.email.status} />}
          {item.kind === 'inbound' && item.entry.message.isAutoReply && (
            <Badge variant="outline">{t('badge_auto_reply')}</Badge>
          )}
          <span className="ml-auto shrink-0 text-xs font-normal text-muted-foreground tabular-nums">
            {format.dateTime(item.at, { dateStyle: 'medium', timeStyle: 'short' })}
          </span>
        </div>
        <p className="truncate text-xs font-normal text-muted-foreground">{header.sender}</p>
        <p className="truncate text-sm font-normal text-muted-foreground group-aria-expanded/accordion-trigger:hidden">
          {header.preview}
        </p>
      </div>
    </div>
  );
};

/**
 * The conversation as a mail thread: every message can be opened and closed on its own,
 * with the latest one and those waiting for a person open.
 * @param props Component props.
 * @param props.detail The conversation.
 * @returns The thread.
 */
export const ConversationThread = (props: { detail: Detail }) => {
  const thread = buildThread(props.detail);
  const latestInboundId = props.detail.messages.at(-1)?.message.id;
  const open = thread
    .filter((item, index) => index === thread.length - 1 || needsAction(item))
    .map((item) => item.id);

  return (
    <Accordion type="multiple" defaultValue={open}>
      {thread.map((item) => (
        <AccordionItem key={item.id} value={item.id}>
          <AccordionTrigger className="py-4 hover:no-underline">
            <ItemHeader item={item} detail={props.detail} />
          </AccordionTrigger>

          <AccordionContent className="pb-5 pl-11">
            {item.kind === 'inbound' && (
              <InboundBody entry={item.entry} isLatest={item.id === latestInboundId} />
            )}
            {item.kind === 'outbound' && <OutboundEmailEditor email={item.email} />}
            {item.kind === 'whatsapp' && (
              <WhatsappHandoffPanel
                conversationId={props.detail.conversation.id}
                handoff={item.handoff}
                messages={props.detail.whatsappMessages}
              />
            )}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
};
