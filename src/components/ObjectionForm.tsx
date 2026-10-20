'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useRouter } from '@/libs/I18nNavigation';
import type { objectionSchema } from '@/models/Schema';
import { ObjectionFormValidation, toObjectionExamples } from '@/validations/AutomationValidation';

type Objection = typeof objectionSchema.$inferSelect;

/**
 * Fills the form from an objection, or leaves it blank for a new one.
 * @param objection The objection being edited, if any.
 * @returns The form's default values.
 */
const toFormValues = (objection?: Objection) => ({
  title: objection?.title ?? '',
  description: objection?.description ?? '',
  examplesText: objection?.examples.join('\n') ?? '',
  responseAngle: objection?.responseAngle ?? '',
  status: objection?.status ?? 'active',
  closesConversation: objection?.closesConversation ?? false,
});

const ObjectionKey = (props: { objection: Objection }) => {
  const t = useTranslations('ObjectionForm');

  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{props.objection.key}</code>
      {props.objection.status === 'needs_review' && (
        <Badge variant="ghost" className="bg-warning/10 text-warning">
          {t('badge_needs_review')}
        </Badge>
      )}
    </div>
  );
};

const DeleteObjectionButton = (props: { objectionId: string }) => {
  const t = useTranslations('ObjectionForm');
  const router = useRouter();

  return (
    <ConfirmDeleteButton
      label={t('button_delete')}
      title={t('dialog_title')}
      description={t('dialog_description')}
      onConfirm={async () => {
        await fetch(`/api/objections/${props.objectionId}`, { method: 'DELETE' });
        router.refresh();
      }}
    />
  );
};

export const ObjectionForm = (props: { objection?: Objection }) => {
  const t = useTranslations('ObjectionForm');
  const router = useRouter();
  const [hasError, setHasError] = useState(false);
  const id = props.objection?.id ?? 'new';

  const form = useForm({
    resolver: zodResolver(ObjectionFormValidation),
    defaultValues: toFormValues(props.objection),
  });
  const status = useWatch({ control: form.control, name: 'status' });
  const closesConversation = useWatch({ control: form.control, name: 'closesConversation' });

  const handleSave = form.handleSubmit(async (values) => {
    setHasError(false);

    const { examplesText, ...objection } = values;

    const response = await fetch(
      props.objection ? `/api/objections/${props.objection.id}` : '/api/objections',
      {
        method: props.objection ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...objection, examples: toObjectionExamples(examplesText) }),
      },
    );

    if (!response.ok) {
      setHasError(true);

      return;
    }

    if (!props.objection) {
      form.reset();
    }

    router.refresh();
  });

  return (
    <form onSubmit={handleSave}>
      <FieldGroup>
        {props.objection && <ObjectionKey objection={props.objection} />}

        <Field>
          <FieldLabel htmlFor={`title-${id}`}>{t('label_title')}</FieldLabel>
          <Input id={`title-${id}`} {...form.register('title')} />
          {form.formState.errors.title && <FieldError>{t('error_title')}</FieldError>}
        </Field>

        <Field>
          <FieldLabel htmlFor={`description-${id}`}>{t('label_description')}</FieldLabel>
          <Textarea id={`description-${id}`} rows={2} {...form.register('description')} />
          {form.formState.errors.description && <FieldError>{t('error_description')}</FieldError>}
        </Field>

        <Field>
          <FieldLabel htmlFor={`examples-${id}`}>{t('label_examples')}</FieldLabel>
          <Textarea id={`examples-${id}`} rows={3} {...form.register('examplesText')} />
          <FieldDescription>{t('hint_examples')}</FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor={`angle-${id}`}>{t('label_angle')}</FieldLabel>
          <Textarea id={`angle-${id}`} rows={3} {...form.register('responseAngle')} />
          <FieldDescription>{t('hint_angle')}</FieldDescription>
          {form.formState.errors.responseAngle && <FieldError>{t('error_angle')}</FieldError>}
        </Field>

        <Field orientation="horizontal">
          <Checkbox
            id={`active-${id}`}
            checked={status === 'active'}
            onCheckedChange={(checked) => {
              form.setValue('status', checked === true ? 'active' : 'needs_review');
            }}
          />
          <FieldContent>
            <FieldLabel htmlFor={`active-${id}`}>{t('label_active')}</FieldLabel>
            <FieldDescription>{t('hint_active')}</FieldDescription>
          </FieldContent>
        </Field>

        <Field orientation="horizontal">
          <Checkbox
            id={`closes-${id}`}
            checked={closesConversation}
            onCheckedChange={(checked) => {
              form.setValue('closesConversation', checked === true);
            }}
          />
          <FieldContent>
            <FieldLabel htmlFor={`closes-${id}`}>{t('label_closes')}</FieldLabel>
            <FieldDescription>{t('hint_closes')}</FieldDescription>
          </FieldContent>
        </Field>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Spinner />}
            {props.objection ? t('button_save') : t('button_create')}
          </Button>

          {props.objection && <DeleteObjectionButton objectionId={props.objection.id} />}
        </div>

        {hasError && (
          <Alert variant="destructive">
            <AlertDescription>{t('error_save')}</AlertDescription>
          </Alert>
        )}
      </FieldGroup>
    </form>
  );
};
