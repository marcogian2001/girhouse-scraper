'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useRouter } from '@/libs/I18nNavigation';
import { ReplySimulationValidation } from '@/validations/AutomationValidation';

export const ReplySimulationForm = () => {
  const t = useTranslations('ReplySimulationForm');
  const router = useRouter();
  const [hasError, setHasError] = useState(false);

  const form = useForm({
    resolver: zodResolver(ReplySimulationValidation),
    defaultValues: {
      company: '',
      leadEmail: '',
      previousEmail: '',
      replyText: '',
    },
  });

  const handleSimulate = form.handleSubmit(async (values) => {
    setHasError(false);

    const response = await fetch('/api/replies/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });

    if (!response.ok) {
      setHasError(true);

      return;
    }

    const created: { conversationId: string } = await response.json();

    router.push(`/dashboard/replies/${created.conversationId}/`);
    router.refresh();
  });

  return (
    <form onSubmit={handleSimulate} className="max-w-2xl">
      <FieldGroup>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="company">{t('label_company')}</FieldLabel>
            <Input id="company" {...form.register('company')} />
            {form.formState.errors.company && <FieldError>{t('error_company')}</FieldError>}
          </Field>

          <Field>
            <FieldLabel htmlFor="lead-email">{t('label_email')}</FieldLabel>
            <Input id="lead-email" type="email" {...form.register('leadEmail')} />
            <FieldDescription>{t('hint_email')}</FieldDescription>
            {form.formState.errors.leadEmail && <FieldError>{t('error_email')}</FieldError>}
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="previous-email">{t('label_previous_email')}</FieldLabel>
          <Textarea id="previous-email" rows={5} {...form.register('previousEmail')} />
          <FieldDescription>{t('hint_previous_email')}</FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="reply-text">{t('label_reply')}</FieldLabel>
          <Textarea id="reply-text" rows={4} {...form.register('replyText')} />
          {form.formState.errors.replyText && <FieldError>{t('error_reply')}</FieldError>}
        </Field>

        <Button type="submit" className="w-fit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Spinner />}
          {t('button_simulate')}
        </Button>

        {hasError && (
          <Alert variant="destructive">
            <AlertDescription>{t('error_simulate')}</AlertDescription>
          </Alert>
        )}
      </FieldGroup>
    </form>
  );
};
