'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useRouter } from '@/libs/I18nNavigation';
import type { whatsappHandoffSchema, whatsappMessageSchema } from '@/models/Schema';

type Handoff = typeof whatsappHandoffSchema.$inferSelect;

type WhatsappMessage = typeof whatsappMessageSchema.$inferSelect;

type Failure = 'blocked' | 'disabled' | 'failed' | 'generic';

const ISSUES = ['link', 'too_long', 'too_short'] as const;

/**
 * The context GHL's Conversation AI reads, as the AI wrote it.
 * @param props Component props.
 * @param props.handoff The hand-off.
 * @returns The facts.
 */
const HandoffContext = (props: { handoff: Handoff }) => {
  const t = useTranslations('WhatsappHandoffCard');
  const facts = [
    [t('fact_summary'), props.handoff.emailSummary],
    [t('fact_objections'), props.handoff.objections],
    [t('fact_demo'), props.handoff.demoBehavior],
  ];

  return (
    <dl className="space-y-3">
      {facts.map(([label, value]) => (
        <div key={label} className="space-y-1">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="text-sm whitespace-pre-wrap">{value}</dd>
        </div>
      ))}
    </dl>
  );
};

/**
 * The WhatsApp messages GHL exchanged with the lead, as a chat.
 * @param props Component props.
 * @param props.messages The messages, oldest first.
 * @returns The thread.
 */
const MessageThread = (props: { messages: WhatsappMessage[] }) => {
  const format = useFormatter();

  return (
    <ol className="space-y-2">
      {props.messages.map((message) => (
        <li
          key={message.id}
          className={`max-w-[85%] space-y-1 rounded-2xl px-3 py-2 text-sm ${message.direction === 'outbound' ? 'ml-auto bg-green-50 text-green-950 dark:bg-green-950/40 dark:text-green-50' : 'bg-muted'}`}
        >
          <p className="whitespace-pre-wrap">{message.body}</p>
          <p className="text-right text-[11px] text-muted-foreground">
            {format.dateTime(message.receivedAt, { dateStyle: 'short', timeStyle: 'short' })}
          </p>
        </li>
      ))}
    </ol>
  );
};

/**
 * The hand-off of a silent lead to WhatsApp on GHL: the draft to approve, then the
 * messages GHL reports. The platform never writes on WhatsApp itself.
 * @param props Component props.
 * @param props.conversationId The conversation.
 * @param props.handoff The hand-off, if one was prepared.
 * @param props.messages The WhatsApp messages, oldest first.
 * @returns The card, or nothing when the lead never reached WhatsApp.
 */
export const WhatsappHandoffCard = (props: {
  conversationId: string;
  handoff: Handoff | null;
  messages: WhatsappMessage[];
}) => {
  const t = useTranslations('WhatsappHandoffCard');
  const format = useFormatter();
  const router = useRouter();
  const [message, setMessage] = useState(props.handoff?.firstMessage ?? '');
  const [failure, setFailure] = useState<Failure | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  if (!props.handoff) {
    return null;
  }

  const { handoff } = props;
  const isDraft = handoff.status === 'draft';
  const issues = ISSUES.filter((issue) => handoff.issues.includes(issue));

  const send = async (method: 'POST' | 'DELETE') => {
    setIsBusy(true);
    setFailure(null);

    const response = await fetch(`/api/replies/${props.conversationId}/whatsapp`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'POST' ? JSON.stringify({ message }) : undefined,
    });

    setIsBusy(false);

    if (response.ok) {
      router.refresh();

      return;
    }

    const outcome: { status?: string } = await response.json().catch(() => ({}));
    const { status } = outcome;

    setFailure(
      status === 'blocked' || status === 'disabled' || status === 'failed' ? status : 'generic',
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>
          {handoff.sentAt
            ? t(`status_${handoff.status}`, {
                date: format.dateTime(handoff.sentAt, { dateStyle: 'medium', timeStyle: 'short' }),
              })
            : t(`status_${handoff.status}`, { date: '' })}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <HandoffContext handoff={handoff} />

        {issues.length > 0 && isDraft && (
          <div className="flex flex-wrap gap-1.5">
            {issues.map((issue) => (
              <Badge key={issue} variant="ghost" className="bg-warning/10 text-warning">
                {t(`issue_${issue}`)}
              </Badge>
            ))}
          </div>
        )}

        {isDraft ? (
          <Field>
            <FieldLabel htmlFor={`whatsapp-${handoff.id}`}>{t('label_message')}</FieldLabel>
            <Textarea
              id={`whatsapp-${handoff.id}`}
              rows={6}
              value={message}
              onChange={(event) => {
                setMessage(event.target.value);
              }}
            />
          </Field>
        ) : (
          <MessageThread messages={props.messages} />
        )}

        {isDraft && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={isBusy || !message.trim()}
              onClick={async () => {
                await send('POST');
              }}
            >
              {isBusy && <Spinner />}
              {t('button_send')}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isBusy}
              onClick={async () => {
                await send('DELETE');
              }}
            >
              {t('button_cancel')}
            </Button>
          </div>
        )}

        {failure && (
          <Alert variant="destructive">
            <AlertDescription>{t(`error_${failure}`)}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};
