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
import { signIn } from '@/libs/AuthClient';
import { Link, useRouter } from '@/libs/I18nNavigation';
import { SignInValidation } from '@/validations/AuthValidation';

export const SignInForm = () => {
  const t = useTranslations('SignInForm');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const form = useForm({
    resolver: zodResolver(SignInValidation),
    defaultValues: { email: '', password: '' },
  });

  const handleSignIn = form.handleSubmit(async (values) => {
    setError(null);

    const { error: signInError } = await signIn.email(values);

    if (signInError) {
      setError(t('error_credentials'));

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

      <form onSubmit={handleSignIn}>
        <FieldGroup>
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
              autoComplete="current-password"
              className="h-10"
              {...form.register('password')}
            />
            {form.formState.errors.password && <FieldError>{t('error_password')}</FieldError>}
          </Field>

          <Button type="submit" className="h-10 w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Spinner />}
            {form.formState.isSubmitting ? t('button_signing_in') : t('button_sign_in')}
          </Button>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </FieldGroup>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        {t('no_account')}{' '}
        <Link href="/sign-up/" className="font-medium text-primary hover:underline">
          {t('sign_up_link')}
        </Link>
      </p>
    </div>
  );
};
