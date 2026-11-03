'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
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

type SettingName = keyof AutomationSettingsInput;

type NumberField = {
  [Key in SettingName]: AutomationSettingsInput[Key] extends number ? Key : never;
}[SettingName];

type SectionId = 'general' | 'sending' | 'offer' | 'demo' | 'ai';

/** The numeric settings of each section that is only numbers, as the form shows them. */
const NUMBER_SECTIONS = {
  sending: ['replyDelayMinMinutes', 'replyDelayMaxMinutes', 'businessHourStart', 'businessHourEnd'],
  offer: ['monthlyPrice', 'newMonthlyPrice', 'priceIncreaseDays', 'onboardingSlotsPerMonth'],
} satisfies Partial<Record<SectionId, NumberField[]>>;

/** The numeric settings the form shows. */
type ShownNumberField =
  | (typeof NUMBER_SECTIONS)[keyof typeof NUMBER_SECTIONS][number]
  | 'confidenceThreshold';

const MODEL_FIELDS = ['classificationModel', 'writingModel'] as const;

/**
 * The form's sections, in order, with the settings each one holds. Replies are handled by
 * hand, so the mode, follow-up and nurturing settings are kept as they are but not shown.
 */
const SECTIONS: { id: SectionId; fields: SettingName[] }[] = [
  { id: 'general', fields: ['enabled'] },
  { id: 'sending', fields: NUMBER_SECTIONS.sending },
  { id: 'offer', fields: NUMBER_SECTIONS.offer },
  { id: 'demo', fields: ['whatsappBusinessNumber'] },
  { id: 'ai', fields: ['confidenceThreshold', ...MODEL_FIELDS] },
];

export const AutomationSettingsForm = (props: { settings: AutomationSettingsInput }) => {
  const t = useTranslations('AutomationSettingsForm');
  const router = useRouter();
  const [outcome, setOutcome] = useState<'saved' | 'error' | null>(null);
  const [openSections, setOpenSections] = useState<string[]>(['general']);

  const form = useForm({
    resolver: zodResolver(AutomationSettingsValidation),
    defaultValues: props.settings,
  });
  const [enabled, ...models] = useWatch({
    control: form.control,
    name: ['enabled', ...MODEL_FIELDS],
  });

  const handleSave = form.handleSubmit(
    async (values) => {
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
    },
    (errors) => {
      // A closed section would hide its errors: open every section that has one
      const failing = SECTIONS.filter((section) =>
        section.fields.some((name) => name in errors),
      ).map((section) => section.id);

      setOpenSections((open) => [...new Set([...open, ...failing])]);
    },
  );

  const numberInput = (name: ShownNumberField) => (
    <Field key={name}>
      <FieldLabel htmlFor={name}>{t(`field_${name}`)}</FieldLabel>
      <Input
        id={name}
        type="number"
        step={name === 'confidenceThreshold' ? 0.05 : 1}
        {...form.register(name, { valueAsNumber: true })}
      />
      <FieldDescription>{t(`hint_${name}`)}</FieldDescription>
      {form.formState.errors[name] && <FieldError>{t('error_number')}</FieldError>}
    </Field>
  );

  const numberInputs = (fields: ShownNumberField[]) => (
    <div className="grid gap-6 sm:grid-cols-2">{fields.map(numberInput)}</div>
  );

  const sectionContent: Record<SectionId, React.ReactNode> = {
    general: (
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
    ),
    sending: numberInputs(NUMBER_SECTIONS.sending),
    offer: numberInputs(NUMBER_SECTIONS.offer),
    demo: (
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
    ),
    ai: (
      <div className="grid gap-6 sm:grid-cols-2">
        {numberInput('confidenceThreshold')}
        <div className="hidden sm:block" />
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
            <FieldDescription>{t(`hint_${name}`)}</FieldDescription>
          </Field>
        ))}
      </div>
    ),
  };

  return (
    <form onSubmit={handleSave} className="max-w-3xl">
      <FieldGroup>
        <Accordion
          type="multiple"
          value={openSections}
          onValueChange={setOpenSections}
          className="gap-3"
        >
          {SECTIONS.map((section) => (
            <AccordionItem
              key={section.id}
              value={section.id}
              className="rounded-lg border bg-card px-4"
            >
              <AccordionTrigger className="py-4 hover:no-underline">
                <div className="flex flex-1 flex-col gap-1 pr-2">
                  <span className="flex flex-wrap items-center gap-2">
                    {t(`section_${section.id}_title`)}
                    {section.id === 'general' && (
                      <Badge variant={enabled ? 'secondary' : 'destructive'}>
                        {enabled ? t('status_on') : t('status_off')}
                      </Badge>
                    )}
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {t(`section_${section.id}_description`)}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-2 pb-5">
                {sectionContent[section.id]}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Spinner />}
            {t('button_save')}
          </Button>

          {outcome === 'saved' && (
            <span className="flex items-center gap-1 text-sm text-success">
              <Check className="size-3.5" />
              {t('saved')}
            </span>
          )}
        </div>

        {outcome === 'error' && (
          <Alert variant="destructive">
            <AlertDescription>{t('error_save')}</AlertDescription>
          </Alert>
        )}
      </FieldGroup>
    </form>
  );
};
