'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';

type Visibility = { showModel: boolean; showCost: boolean };

export const EmailPollVisibilityForm = (props: { pollId: string; visibility: Visibility }) => {
  const t = useTranslations('EmailPollVisibilityForm');
  const [visibility, setVisibility] = useState(props.visibility);
  const [hasError, setHasError] = useState(false);

  const handleChange = async (change: Partial<Visibility>) => {
    const previous = visibility;

    setHasError(false);
    setVisibility({ ...visibility, ...change });

    const response = await fetch(`/api/email-polls/${props.pollId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(change),
    });

    if (!response.ok) {
      setVisibility(previous);
      setHasError(true);
    }
  };

  const options = [
    { key: 'showModel', label: t('label_model'), hint: t('hint_model') },
    { key: 'showCost', label: t('label_cost'), hint: t('hint_cost') },
  ] as const;

  return (
    <FieldGroup className="gap-4">
      {options.map((option) => (
        <Field key={option.key} orientation="horizontal">
          <Checkbox
            id={option.key}
            checked={visibility[option.key]}
            onCheckedChange={async (checked) => {
              await handleChange({ [option.key]: checked === true });
            }}
          />
          <FieldContent>
            <FieldLabel htmlFor={option.key}>{option.label}</FieldLabel>
            <FieldDescription>{option.hint}</FieldDescription>
          </FieldContent>
        </Field>
      ))}

      {hasError && (
        <Alert variant="destructive">
          <AlertDescription>{t('error_update')}</AlertDescription>
        </Alert>
      )}
    </FieldGroup>
  );
};
