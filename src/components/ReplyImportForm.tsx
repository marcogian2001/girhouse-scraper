'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Link, useRouter } from '@/libs/I18nNavigation';
import { ReplyImportValidation } from '@/validations/AutomationValidation';

type ImportSummary = { imported: number; alreadyPresent: number; otherCampaigns: number };

export const ReplyImportForm = (props: { accounts: string[] }) => {
  const t = useTranslations('ReplyImportForm');
  const router = useRouter();
  const [hasError, setHasError] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const form = useForm({
    resolver: zodResolver(ReplyImportValidation),
    defaultValues: { eaccount: '' },
  });

  // `useWatch` rather than `form.watch`: the React compiler caches `watch` results
  const eaccount = useWatch({ control: form.control, name: 'eaccount' });

  const handleImport = form.handleSubmit(async (values) => {
    setHasError(false);
    setSummary(null);

    const response = await fetch('/api/replies/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });

    if (!response.ok) {
      setHasError(true);

      return;
    }

    const imported: ImportSummary = await response.json();

    setSummary(imported);
    router.refresh();
  });

  return (
    <form onSubmit={handleImport} className="max-w-2xl">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="import-eaccount">{t('label_eaccount')}</FieldLabel>

          <Select
            value={eaccount}
            onValueChange={(value) => {
              form.setValue('eaccount', value, { shouldValidate: true });
            }}
          >
            <SelectTrigger id="import-eaccount" className="w-full">
              <SelectValue placeholder={t('placeholder_eaccount')} />
            </SelectTrigger>

            <SelectContent>
              {props.accounts.map((account) => (
                <SelectItem key={account} value={account}>
                  {account}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <FieldDescription>{t('hint_eaccount')}</FieldDescription>
          {form.formState.errors.eaccount && <FieldError>{t('error_eaccount')}</FieldError>}
        </Field>

        <Button type="submit" className="w-fit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Spinner />}
          {t('button_import')}
        </Button>

        {hasError && (
          <Alert variant="destructive">
            <AlertDescription>{t('error_import')}</AlertDescription>
          </Alert>
        )}

        {summary && (
          <Alert>
            <AlertDescription>
              <p>{t('summary', summary)}</p>
              <Link href="/dashboard/replies/" className="font-medium underline">
                {t('link_replies')}
              </Link>
            </AlertDescription>
          </Alert>
        )}
      </FieldGroup>
    </form>
  );
};
