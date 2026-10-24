'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useRouter } from '@/libs/I18nNavigation';
import { isCustomDemoSlug, normalizeCustomDemoSlug } from '@/utils/CustomDemoSlug';

type DemoError = 'error_generate' | 'error_slug_invalid' | 'error_slug_taken' | 'error_demo_exists';

export const GenerateDemoButton = (props: { conversationId: string }) => {
  const t = useTranslations('ConversationDemoCard');
  const router = useRouter();
  const [slug, setSlug] = useState('');
  const [isBuilding, setIsBuilding] = useState(false);
  const [error, setError] = useState<DemoError | null>(null);

  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();

        if (isBuilding) {
          return;
        }

        const normalized = normalizeCustomDemoSlug(slug);

        if (normalized && !isCustomDemoSlug(normalized)) {
          setError('error_slug_invalid');
          return;
        }

        setSlug(normalized);
        setIsBuilding(true);
        setError(null);

        try {
          const response = await fetch(`/api/replies/${props.conversationId}/demo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug: normalized }),
          });

          if (response.ok) {
            router.refresh();
          } else if (response.status === 409) {
            const body: unknown = await response.json();
            const exists =
              typeof body === 'object' &&
              body !== null &&
              'error' in body &&
              body.error === 'demo_exists';
            setError(exists ? 'error_demo_exists' : 'error_slug_taken');
          } else {
            setError(response.status === 422 ? 'error_slug_invalid' : 'error_generate');
          }
        } catch {
          setError('error_generate');
        } finally {
          setIsBuilding(false);
        }
      }}
    >
      <Field>
        <FieldLabel htmlFor="demo-slug">{t('label_slug')}</FieldLabel>
        <Input
          id="demo-slug"
          value={slug}
          placeholder={t('placeholder_slug')}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          disabled={isBuilding}
          aria-invalid={error === 'error_slug_invalid'}
          aria-describedby={error ? 'demo-slug-hint demo-slug-error' : 'demo-slug-hint'}
          onChange={(event) => {
            setSlug(event.target.value);
            setError(null);
          }}
        />
        <FieldDescription id="demo-slug-hint">{t('hint_slug')}</FieldDescription>
      </Field>

      <Button type="submit" variant="outline" disabled={isBuilding}>
        {isBuilding && <Spinner />}
        {isBuilding ? t('building') : t('button_generate')}
      </Button>

      {error && (
        <Alert id="demo-slug-error" variant="destructive">
          <AlertDescription>{t(error)}</AlertDescription>
        </Alert>
      )}
    </form>
  );
};
