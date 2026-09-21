'use client';

import { Check, Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';

export type DraftView = {
  id: string;
  stepIndex: number;
  subject: string;
  body: string;
};

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export const EmailDraftEditor = (props: { draft: DraftView; delayDays: number | null }) => {
  const t = useTranslations('EmailDraftEditor');
  const [subject, setSubject] = useState(props.draft.subject);
  const [body, setBody] = useState(props.draft.body);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const isDirty = subject !== props.draft.subject || body !== props.draft.body;

  const handleSave = async () => {
    setSaveState('saving');

    const response = await fetch(`/api/drafts/${props.draft.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, body }),
    });

    setSaveState(response.ok ? 'saved' : 'error');
  };

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-xs font-medium text-primary">
            {props.draft.stepIndex}
          </span>
          {t('step_title', { step: props.draft.stepIndex })}
        </CardTitle>

        {props.delayDays !== null && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="size-3" />
            {t('sends_after', { days: props.delayDays })}
          </span>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        <Field>
          <FieldLabel htmlFor={`subject-${props.draft.id}`}>{t('label_subject')}</FieldLabel>
          <Input
            id={`subject-${props.draft.id}`}
            value={subject}
            onChange={(event) => {
              setSubject(event.target.value);
              setSaveState('idle');
            }}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor={`body-${props.draft.id}`}>{t('label_body')}</FieldLabel>
          <Textarea
            id={`body-${props.draft.id}`}
            rows={8}
            value={body}
            onChange={(event) => {
              setBody(event.target.value);
              setSaveState('idle');
            }}
          />
        </Field>
      </CardContent>

      <CardFooter className="items-center gap-3 border-t py-3">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!isDirty || saveState === 'saving'}
          onClick={handleSave}
        >
          {saveState === 'saving' && <Spinner />}
          {saveState === 'saving' ? t('button_saving') : t('button_save')}
        </Button>

        {saveState === 'saved' && (
          <span className="flex items-center gap-1 text-sm text-success">
            <Check className="size-3.5" />
            {t('saved')}
          </span>
        )}

        {saveState === 'error' && (
          <span className="text-sm text-destructive">{t('error_save')}</span>
        )}
      </CardFooter>
    </Card>
  );
};
