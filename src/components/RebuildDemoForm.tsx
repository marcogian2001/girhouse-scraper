'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useRouter } from '@/libs/I18nNavigation';

export const RebuildDemoForm = (props: { conversationId: string; guidance: string | null }) => {
  const t = useTranslations('ConversationDemoCard');
  const router = useRouter();
  const [guidance, setGuidance] = useState(props.guidance ?? '');
  const [isBuilding, setIsBuilding] = useState(false);
  const [hasError, setHasError] = useState(false);

  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setIsBuilding(true);
        setHasError(false);

        const response = await fetch(`/api/replies/${props.conversationId}/demo?rebuild=1`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ guidance }),
        });

        setIsBuilding(false);
        setHasError(!response.ok);

        if (response.ok) {
          router.refresh();
        }
      }}
    >
      <Field>
        <FieldLabel htmlFor="demo-guidance">{t('label_guidance')}</FieldLabel>
        <Textarea
          id="demo-guidance"
          rows={4}
          maxLength={4000}
          value={guidance}
          onChange={(event) => {
            setGuidance(event.target.value);
          }}
        />
        <FieldDescription>{t('hint_guidance')}</FieldDescription>
      </Field>

      <Button type="submit" variant="outline" disabled={isBuilding}>
        {isBuilding && <Spinner />}
        {isBuilding ? t('building') : t('button_rebuild')}
      </Button>

      {hasError && (
        <Alert variant="destructive">
          <AlertDescription>{t('error_generate')}</AlertDescription>
        </Alert>
      )}
    </form>
  );
};
