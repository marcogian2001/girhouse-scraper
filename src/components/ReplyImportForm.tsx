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
import { useRouter } from '@/libs/I18nNavigation';
import { ReplyImportValidation } from '@/validations/AutomationValidation';

type ImportResult =
  | { status: 'imported' | 'existing'; conversationId: string }
  | { status: 'no_reply' | 'other_campaign' };

type ImportError = 'error_import' | 'error_no_reply' | 'error_other_campaign';

export const ReplyImportForm = () => {
  const t = useTranslations('ReplyImportForm');
  const router = useRouter();
  const [error, setError] = useState<ImportError | null>(null);

  const form = useForm({
    resolver: zodResolver(ReplyImportValidation),
    defaultValues: { leadEmail: '' },
  });

  const handleImport = form.handleSubmit(async (values) => {
    setError(null);

    const response = await fetch('/api/replies/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });

    if (!response.ok) {
      setError('error_import');

      return;
    }

    const result: ImportResult = await response.json();

    if ('conversationId' in result) {
      router.push(`/dashboard/replies/${result.conversationId}/`);
      router.refresh();

      return;
    }

    setError(`error_${result.status}`);
  });

  return (
    <form onSubmit={handleImport} className="max-w-2xl">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="import-lead-email">{t('label_email')}</FieldLabel>
          <Input id="import-lead-email" type="email" {...form.register('leadEmail')} />
          <FieldDescription>{t('hint_email')}</FieldDescription>
          {form.formState.errors.leadEmail && <FieldError>{t('error_email')}</FieldError>}
        </Field>

        <Button type="submit" className="w-fit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Spinner />}
          {t('button_import')}
        </Button>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{t(error)}</AlertDescription>
          </Alert>
        )}
      </FieldGroup>
    </form>
  );
};
