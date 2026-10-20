'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { useRouter } from '@/libs/I18nNavigation';
import { COPYWRITING_MODELS } from '@/utils/CopywritingModels';
import type { AutomationSettingsInput } from '@/validations/AutomationValidation';
import { AutomationSettingsValidation } from '@/validations/AutomationValidation';

const CLAUDE_MODELS = COPYWRITING_MODELS.filter((model) => model.provider === 'anthropic');

type NumberField = {
  [Key in keyof AutomationSettingsInput]: AutomationSettingsInput[Key] extends number ? Key : never;
}[keyof AutomationSettingsInput];

/** The numeric settings, grouped as the form shows them. */
const NUMBER_GROUPS: {
  legend: 'review' | 'sending' | 'offer' | 'follow_up';
  fields: NumberField[];
}[] = [
  { legend: 'review', fields: ['confidenceThreshold'] },
  {
    legend: 'sending',
    fields: [
      'replyDelayMinMinutes',
      'replyDelayMaxMinutes',
      'businessHourStart',
      'businessHourEnd',
    ],
  },
  {
    legend: 'offer',
    fields: ['monthlyPrice', 'newMonthlyPrice', 'priceIncreaseDays', 'onboardingSlotsPerMonth'],
  },
  {
    legend: 'follow_up',
    fields: [
      'demoNotOpenedBusinessDays',
      'maxFollowUps',
      'whatsappAfterBusinessDays',
      'nurturingIntervalDays',
      'nurturingMaxCount',
    ],
  },
];

const MODEL_FIELDS = ['classificationModel', 'writingModel'] as const;

export const AutomationSettingsForm = (props: { settings: AutomationSettingsInput }) => {
  const t = useTranslations('AutomationSettingsForm');
  const router = useRouter();
  const [outcome, setOutcome] = useState<'saved' | 'error' | null>(null);

  const form = useForm({
    resolver: zodResolver(AutomationSettingsValidation),
    defaultValues: props.settings,
  });
  const [enabled, mode, ...models] = useWatch({
    control: form.control,
    name: ['enabled', 'mode', ...MODEL_FIELDS],
  });

  const handleSave = form.handleSubmit(async (values) => {
    setOutcome(null);

    const response = await fetch('/api/automation/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });

    setOutcome(response.ok ? 'saved' : 'error');

    if (response.ok) {
      router.refresh();
    }
  });

  return (
    <form onSubmit={handleSave} className="max-w-3xl">
      <FieldGroup>
        <FieldSet>
          <FieldLegend>{t('legend_general')}</FieldLegend>

          <Field orientation="horizontal">
            <Checkbox
              id="enabled"
              checked={enabled}
              onCheckedChange={(checked) => {
                form.setValue('enabled', checked === true, { shouldDirty: true });
              }}
            />
            <FieldContent>
              <FieldLabel htmlFor="enabled">{t('label_enabled')}</FieldLabel>
              <FieldDescription>{t('hint_enabled')}</FieldDescription>
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel htmlFor="mode">{t('label_mode')}</FieldLabel>
            <Select
              value={mode}
              onValueChange={(value) => {
                if (value === 'draft' || value === 'auto') {
                  form.setValue('mode', value, { shouldDirty: true });
                }
              }}
            >
              <SelectTrigger id="mode" className="w-full sm:w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">{t('mode_draft')}</SelectItem>
                <SelectItem value="auto">{t('mode_auto')}</SelectItem>
              </SelectContent>
            </Select>
            <FieldDescription>{t('hint_mode')}</FieldDescription>
          </Field>
        </FieldSet>

        {NUMBER_GROUPS.map((group) => (
          <FieldSet key={group.legend}>
            <FieldLegend>{t(`legend_${group.legend}`)}</FieldLegend>

            <div className="grid gap-6 sm:grid-cols-2">
              {group.fields.map((name) => (
                <Field key={name}>
                  <FieldLabel htmlFor={name}>{t(`field_${name}`)}</FieldLabel>
                  <Input
                    id={name}
                    type="number"
                    step={name === 'confidenceThreshold' ? 0.05 : 1}
                    {...form.register(name, { valueAsNumber: true })}
                  />
                  {form.formState.errors[name] && <FieldError>{t('error_number')}</FieldError>}
                </Field>
              ))}
            </div>
          </FieldSet>
        ))}

        <FieldSet>
          <FieldLegend>{t('legend_models')}</FieldLegend>

          <div className="grid gap-6 sm:grid-cols-2">
            {MODEL_FIELDS.map((name, index) => (
              <Field key={name}>
                <FieldLabel htmlFor={name}>{t(`field_${name}`)}</FieldLabel>
                <Select
                  value={models[index]}
                  onValueChange={(value) => {
                    form.setValue(name, value, { shouldDirty: true });
                  }}
                >
                  <SelectTrigger id={name} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CLAUDE_MODELS.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ))}
          </div>
        </FieldSet>

        <Field>
          <FieldLabel htmlFor="whatsapp-number">{t('label_whatsapp')}</FieldLabel>
          <Input
            id="whatsapp-number"
            placeholder="+39…"
            {...form.register('whatsappBusinessNumber', {
              // An emptied field clears the number
              setValueAs: (value: string | null) => (value?.trim() ? value.trim() : null),
            })}
          />
          <FieldDescription>{t('hint_whatsapp')}</FieldDescription>
          {form.formState.errors.whatsappBusinessNumber && (
            <FieldError>{t('error_whatsapp')}</FieldError>
          )}
        </Field>

        <Button type="submit" className="w-fit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Spinner />}
          {t('button_save')}
        </Button>

        {outcome === 'saved' && (
          <Alert>
            <AlertDescription>{t('saved')}</AlertDescription>
          </Alert>
        )}

        {outcome === 'error' && (
          <Alert variant="destructive">
            <AlertDescription>{t('error_save')}</AlertDescription>
          </Alert>
        )}
      </FieldGroup>
    </form>
  );
};
