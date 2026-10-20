'use client';

import { Sparkles } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useRouter } from '@/libs/I18nNavigation';
import type { outboundEmailSchema } from '@/models/Schema';
import { REPLY_ISSUES } from '@/utils/ReplyGuard';

type OutboundEmail = typeof outboundEmailSchema.$inferSelect;

type Failure = 'approve' | 'blocked' | 'disabled' | 'rewrite';

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
  const [subject, setSubject] = useState(props.email.subject);
  const [body, setBody] = useState(props.email.body);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const isEditable = props.email.status === 'draft' || props.email.status === 'failed';
  const canRewrite = props.email.status === 'draft' && props.email.kind === 'reply';

  const rewrite = async () => {
    setIsBusy(true);
    setFailure(null);

    const response = await fetch(`/api/replies/outbound/${props.email.id}/rewrite`, {
      method: 'POST',
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
      body: action === 'approve' ? JSON.stringify({ subject, body }) : undefined,
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
        </FieldGroup>
      ) : (
        <div className="space-y-1 text-sm">
          <p className="font-medium">{props.email.subject}</p>
          <p className="whitespace-pre-wrap">{props.email.body}</p>
        </div>
      )}

      {(isEditable || props.email.status === 'scheduled') && (
        <div className="flex flex-wrap gap-2">
          {isEditable && (
            <Button
              type="button"
              disabled={isBusy}
              onClick={async () => {
                await post('approve');
              }}
            >
              {isBusy && <Spinner />}
              {t('button_approve')}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={isBusy}
            onClick={async () => {
              await post('discard');
            }}
          >
            {isEditable ? t('button_discard') : t('button_cancel_send')}
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
