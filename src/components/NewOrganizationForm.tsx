'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { organization } from '@/libs/AuthClient';
import { useRouter } from '@/libs/I18nNavigation';
import { createOrganizationSlug } from '@/utils/Helpers';
import { OrganizationValidation } from '@/validations/OrganizationValidation';

export const NewOrganizationForm = () => {
  const t = useTranslations('NewOrganizationForm');
  const router = useRouter();
  const [hasError, setHasError] = useState(false);

  const form = useForm({
    resolver: zodResolver(OrganizationValidation),
    defaultValues: { name: '' },
  });

  const handleCreate = form.handleSubmit(async (values) => {
    setHasError(false);

    // Creating an organization also makes it the active one
    const { error } = await organization.create({
      name: values.name,
      slug: createOrganizationSlug(values.name),
    });

    if (error) {
      setHasError(true);

      return;
    }

    router.push('/dashboard/');
    router.refresh();
  });

  return (
    <form onSubmit={handleCreate} className="max-w-md">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="name">{t('label_name')}</FieldLabel>
          <Input id="name" autoComplete="organization" {...form.register('name')} />
          {form.formState.errors.name && <FieldError>{t('error_name')}</FieldError>}
        </Field>

        <Button type="submit" className="w-fit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Spinner />}
          {t('button_create')}
        </Button>

        {hasError && (
          <Alert variant="destructive">
            <AlertDescription>{t('error_create')}</AlertDescription>
          </Alert>
        )}
      </FieldGroup>
    </form>
  );
};
