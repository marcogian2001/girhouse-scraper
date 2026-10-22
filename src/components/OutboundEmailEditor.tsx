'use client';

import { Sparkles, X } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { DatePicker } from '@/components/DatePicker';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useRouter } from '@/libs/I18nNavigation';
import type { outboundEmailSchema } from '@/models/Schema';
import { REPLY_ISSUES } from '@/utils/ReplyGuard';
import { slotKey } from '@/utils/Slots';

type OutboundEmail = typeof outboundEmailSchema.$inferSelect;

type Failure = 'approve' | 'blocked' | 'disabled' | 'rewrite';

/** The time a send date starts with when none was proposed, in Italian time. */
const DEFAULT_SEND_TIME = '09:30';

const IssueBadges = (props: { issues: string[] }) => {
  const t = useTranslations('OutboundEmailEditor');
  const known = REPLY_ISSUES.filter((issue) => props.issues.includes(issue));

  if (known.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {known.map((issue) => (
        <Badge key={issue} variant="ghost" className="bg-warning/10 text-warning">
          {t(`issue_${issue}`)}
        </Badge>
      ))}
    </div>
  );
};

const EmailMeta = (props: { email: OutboundEmail }) => {
  const t = useTranslations('OutboundEmailEditor');
  const format = useFormatter();
  const when = (date: Date) => format.dateTime(date, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      {props.email.status === 'scheduled' && props.email.scheduledFor && (
        <span>{t('scheduled_for', { date: when(props.email.scheduledFor) })}</span>
      )}
      {props.email.sentAt && <span>{t('sent_at', { date: when(props.email.sentAt) })}</span>}
      {props.email.errorMessage && <span>{props.email.errorMessage}</span>}
    </div>
  );
};

export const OutboundEmailEditor = (props: { email: OutboundEmail }) => {
  const t = useTranslations('OutboundEmailEditor');
  const router = useRouter();
  // The send time in Italian time; on a draft it is the one the automation proposes
  const proposedAt = props.email.scheduledFor
    ? slotKey(props.email.scheduledFor.toISOString())
    : '';
  const [subject, setSubject] = useState(props.email.subject);
  const [body, setBody] = useState(props.email.body);
  const [sendDate, setSendDate] = useState(proposedAt.slice(0, 10));
  const [sendTime, setSendTime] = useState(proposedAt.slice(11, 16) || DEFAULT_SEND_TIME);
  const sendAt = sendDate ? `${sendDate}T${sendTime || DEFAULT_SEND_TIME}` : '';
  const [failure, setFailure] = useState<Failure | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const isScheduled = props.email.status === 'scheduled';
  const isEditable =
    isScheduled || props.email.status === 'draft' || props.email.status === 'failed';
  const canRewrite = props.email.status === 'draft' && props.email.kind === 'reply';

  const sendAtHint = () => {
    if (!sendAt) {
      return t('send_at_hint_empty');
    }

    return !isScheduled && sendAt === proposedAt ? t('send_at_hint_proposed') : null;
  };

  const approveLabel = () => {
    if (isScheduled) {
      return t('button_update_schedule');
    }

    return sendAt ? t('button_approve_schedule') : t('button_approve');
  };

  const rewrite = async () => {
    setIsBusy(true);
    setFailure(null);

    const response = await fetch(`/api/replies/outbound/${props.email.id}/rewrite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // The AI writes for the chosen day, as a recontact when it is a later one
      body: JSON.stringify({ scheduledFor: sendAt || null }),
    });

    setIsBusy(false);

    if (!response.ok) {
      setFailure('rewrite');

      return;
    }

    const rewritten: { email: { body: string } } = await response.json();

    setBody(rewritten.email.body);
    router.refresh();
  };

  const post = async (action: 'approve' | 'discard') => {
    setIsBusy(true);
    setFailure(null);

    const response = await fetch(`/api/replies/outbound/${props.email.id}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body:
        action === 'approve'
          ? JSON.stringify({ subject, body, scheduledFor: sendAt || null })
          : undefined,
    });

    setIsBusy(false);

    if (response.ok) {
      router.refresh();

      return;
    }

    const outcome: { status?: string } = await response.json();

    setFailure(
      outcome.status === 'blocked' || outcome.status === 'disabled' ? outcome.status : 'approve',
    );
  };

  return (
    <div className="space-y-3">
      <EmailMeta email={props.email} />
      <IssueBadges issues={props.email.issues} />

      {isEditable ? (
        <FieldGroup className="gap-3">
          <Field>
            <FieldLabel htmlFor={`subject-${props.email.id}`}>{t('label_subject')}</FieldLabel>
            <Input
              id={`subject-${props.email.id}`}
              value={subject}
              onChange={(event) => {
                setSubject(event.target.value);
              }}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor={`body-${props.email.id}`}>{t('label_body')}</FieldLabel>
            <Textarea
              id={`body-${props.email.id}`}
              rows={9}
              value={body}
              onChange={(event) => {
                setBody(event.target.value);
              }}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor={`send-at-${props.email.id}`}>{t('label_send_at')}</FieldLabel>
            <div className="flex flex-wrap items-center gap-2">
              <DatePicker
                id={`send-at-${props.email.id}`}
                value={sendDate}
                onValueChange={setSendDate}
                disablePast
              />
              <Input
                type="time"
                aria-label={t('label_send_time')}
                className="w-28"
                value={sendTime}
                disabled={!sendDate}
                onChange={(event) => {
                  setSendTime(event.target.value);
                }}
              />
              {sendDate && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t('button_clear_send_at')}
                  onClick={() => {
                    setSendDate('');
                  }}
                >
                  <X />
                </Button>
              )}
            </div>
            {sendAtHint() && <FieldDescription>{sendAtHint()}</FieldDescription>}
          </Field>
        </FieldGroup>
      ) : (
        <div className="space-y-1 text-sm">
          <p className="font-medium">{props.email.subject}</p>
          <p className="whitespace-pre-wrap">{props.email.body}</p>
        </div>
      )}

      {isEditable && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={isBusy}
            onClick={async () => {
              await post('approve');
            }}
          >
            {isBusy && <Spinner />}
            {approveLabel()}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isBusy}
            onClick={async () => {
              await post('discard');
            }}
          >
            {isScheduled ? t('button_cancel_send') : t('button_discard')}
          </Button>
          {canRewrite && (
            <Button
              type="button"
              variant="ghost"
              disabled={isBusy}
              onClick={async () => {
                await rewrite();
              }}
            >
              <Sparkles />
              {t('button_rewrite')}
            </Button>
          )}
        </div>
      )}

      {failure && (
        <Alert variant="destructive">
          <AlertDescription>{t(`error_${failure}`)}</AlertDescription>
        </Alert>
      )}
    </div>
  );
};
