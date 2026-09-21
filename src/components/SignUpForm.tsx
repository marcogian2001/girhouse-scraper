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
import { signUp } from '@/libs/AuthClient';
import { Link, useRouter } from '@/libs/I18nNavigation';
import { SignUpValidation } from '@/validations/AuthValidation';

export const SignUpForm = () => {
  const t = useTranslations('SignUpForm');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const form = useForm({
    resolver: zodResolver(SignUpValidation),
    defaultValues: { name: '', email: '', password: '' },
  });

  const handleSignUp = form.handleSubmit(async (values) => {
    setError(null);

    const { error: signUpError } = await signUp.email(values);

    if (signUpError) {
      // The most common cause by far is an address that is already registered
      setError(t('error_sign_up'));

      return;
    }

    router.push('/dashboard');
    router.refresh();
  });

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        {/* A real heading element, so the page has one for assistive tech */}
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <form onSubmit={handleSignUp}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="name">{t('label_name')}</FieldLabel>
            <Input id="name" autoComplete="name" className="h-10" {...form.register('name')} />
            {form.formState.errors.name && <FieldError>{t('error_name')}</FieldError>}
          </Field>

          <Field>
            <FieldLabel htmlFor="email">{t('label_email')}</FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              className="h-10"
              {...form.register('email')}
            />
            {form.formState.errors.email && <FieldError>{t('error_email')}</FieldError>}
          </Field>

          <Field>
            <FieldLabel htmlFor="password">{t('label_password')}</FieldLabel>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              className="h-10"
              {...form.register('password')}
            />
            {form.formState.errors.password ? (
              <FieldError>{t('error_password')}</FieldError>
            ) : (
              <FieldDescription>{t('hint_password')}</FieldDescription>
            )}
          </Field>

          <Button type="submit" className="h-10 w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Spinner />}
            {form.formState.isSubmitting ? t('button_signing_up') : t('button_sign_up')}
          </Button>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </FieldGroup>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        {t('have_account')}{' '}
        <Link href="/sign-in/" className="font-medium text-primary hover:underline">
          {t('sign_in_link')}
        </Link>
      </p>
    </div>
  );
};
