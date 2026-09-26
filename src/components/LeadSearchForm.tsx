'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useRouter } from '@/libs/I18nNavigation';
import type { leadSearchSchema, parallelProcessorEnum } from '@/models/Schema';
import { microsToUsd, USD_FORMAT } from '@/utils/UsageFormat';
import { LeadSearchFormValidation, MAX_LEADS_PER_SEARCH } from '@/validations/LeadSearchValidation';

type Processor = (typeof parallelProcessorEnum.enumValues)[number];

type WebsiteFilter = (typeof leadSearchSchema.$inferSelect)['websiteFilter'];

const PROCESSORS: Processor[] = ['lite', 'base', 'core', 'pro'];

const WEBSITE_FILTERS: WebsiteFilter[] = ['any', 'without', 'with'];

/** List prices of each billed step, in millionths of a US dollar. */
export type LeadPricing = {
  placeMicros: number;
  emailMicros: number;
  verificationMicros: number;
  runMicros: Record<Processor, number>;
};

export const LeadSearchForm = (props: { pricing: LeadPricing }) => {
  const t = useTranslations('LeadSearchForm');
  const settingsT = useTranslations('CampaignSettingsForm');
  const format = useFormatter();
  const router = useRouter();
  const [hasError, setHasError] = useState(false);

  const form = useForm({
    resolver: zodResolver(LeadSearchFormValidation),
    defaultValues: {
      name: '',
      searchTerms: '',
      location: '',
      maxResults: 50,
      websiteFilter: 'any' as const,
      processor: 'base' as const,
    },
  });

  // `useWatch` rather than `form.watch`: the React compiler caches `watch` results
  const maxResults = useWatch({ control: form.control, name: 'maxResults' });
  const processor = useWatch({ control: form.control, name: 'processor' }) ?? 'base';
  const websiteFilter = useWatch({ control: form.control, name: 'websiteFilter' }) ?? 'any';

  // Worst case: every place is researched, looked up on Prospeo and verified
  const perLeadMicros =
    props.pricing.placeMicros +
    props.pricing.runMicros[processor] +
    props.pricing.emailMicros +
    props.pricing.verificationMicros;
  const estimate = format.number(
    microsToUsd((Number.isFinite(maxResults) ? maxResults : 0) * perLeadMicros),
    USD_FORMAT,
  );

  const handleCreate = form.handleSubmit(async (values) => {
    setHasError(false);

    const response = await fetch('/api/lead-searches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });

    if (!response.ok) {
      setHasError(true);

      return;
    }

    const created: { id: string } = await response.json();

    router.push(`/dashboard/leads/${created.id}/`);
  });

  return (
    <form onSubmit={handleCreate} className="max-w-2xl">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="search-name">{t('label_name')}</FieldLabel>
          <Input id="search-name" {...form.register('name')} />
          {form.formState.errors.name && <FieldError>{t('error_name')}</FieldError>}
        </Field>

        <Field>
          <FieldLabel htmlFor="search-terms">{t('label_terms')}</FieldLabel>
          <Textarea
            id="search-terms"
            rows={4}
            placeholder={t('placeholder_terms')}
            {...form.register('searchTerms')}
          />
          <FieldDescription>{t('hint_terms')}</FieldDescription>
          {form.formState.errors.searchTerms && <FieldError>{t('error_terms')}</FieldError>}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="search-location">{t('label_location')}</FieldLabel>
            <Input
              id="search-location"
              placeholder={t('placeholder_location')}
              {...form.register('location')}
            />
            {form.formState.errors.location && <FieldError>{t('error_location')}</FieldError>}
          </Field>

          <Field>
            <FieldLabel htmlFor="search-max">{t('label_max_results')}</FieldLabel>
            <Input
              id="search-max"
              type="number"
              min={1}
              max={MAX_LEADS_PER_SEARCH}
              {...form.register('maxResults', { valueAsNumber: true })}
            />
            {form.formState.errors.maxResults && (
              <FieldError>{t('error_max_results', { max: MAX_LEADS_PER_SEARCH })}</FieldError>
            )}
          </Field>

          <Field>
            <FieldLabel htmlFor="search-website">{t('label_website')}</FieldLabel>

            <Select
              value={websiteFilter}
              onValueChange={(value) => {
                const filter = WEBSITE_FILTERS.find((option) => option === value);

                if (filter) {
                  form.setValue('websiteFilter', filter);
                }
              }}
            >
              <SelectTrigger id="search-website" className="w-full">
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                {WEBSITE_FILTERS.map((filter) => (
                  <SelectItem key={filter} value={filter}>
                    {t(`website_${filter}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <FieldDescription>{t('hint_website')}</FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="search-processor">{t('label_processor')}</FieldLabel>

            <Select
              value={processor}
              onValueChange={(value) => {
                const next = PROCESSORS.find((option) => option === value);

                if (next) {
                  form.setValue('processor', next);
                }
              }}
            >
              <SelectTrigger id="search-processor" className="w-full">
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                {PROCESSORS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {settingsT(`processor_${option}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <p className="text-sm text-muted-foreground">{t('estimate', { cost: estimate })}</p>

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
