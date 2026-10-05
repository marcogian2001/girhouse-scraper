'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import type { LeadPricing } from '@/components/LeadSearchForm';
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
import type { coveragePlanSchema } from '@/models/Schema';
import { microsToUsd, USD_FORMAT } from '@/utils/UsageFormat';
import { CoveragePlanValidation, MAX_DAILY_LEADS } from '@/validations/CoverageValidation';
import { MAX_LEADS_PER_SEARCH } from '@/validations/LeadSearchValidation';

type CoveragePlan = typeof coveragePlanSchema.$inferSelect;

type Processor = CoveragePlan['processor'];

type WebsiteFilter = CoveragePlan['websiteFilter'];

const PROCESSORS: Processor[] = ['lite', 'base', 'core', 'pro'];

const WEBSITE_FILTERS: WebsiteFilter[] = ['any', 'without', 'with'];

export type CoveragePlanView = Pick<
  CoveragePlan,
  'dailyLeads' | 'leadsPerSearch' | 'websiteFilter' | 'processor' | 'isActive'
>;

export const CoveragePlanForm = (props: { plan: CoveragePlanView; pricing: LeadPricing }) => {
  const t = useTranslations('CoveragePlanForm');
  const searchT = useTranslations('LeadSearchForm');
  const settingsT = useTranslations('CampaignSettingsForm');
  const format = useFormatter();
  const router = useRouter();
  const [hasError, setHasError] = useState(false);

  const form = useForm({
    resolver: zodResolver(CoveragePlanValidation),
    defaultValues: props.plan,
  });

  // `useWatch` rather than `form.watch`: the React compiler caches `watch` results
  const dailyLeads = useWatch({ control: form.control, name: 'dailyLeads' });
  const processor = useWatch({ control: form.control, name: 'processor' });
  const websiteFilter = useWatch({ control: form.control, name: 'websiteFilter' });
  const isActive = useWatch({ control: form.control, name: 'isActive' });

  // Worst case, as on a single search: every place is researched, looked up and verified
  const perLeadMicros =
    props.pricing.placeMicros +
    props.pricing.runMicros[processor] +
    props.pricing.emailMicros +
    props.pricing.verificationMicros;
  const estimate = format.number(
    microsToUsd((Number.isFinite(dailyLeads) ? dailyLeads : 0) * perLeadMicros),
    USD_FORMAT,
  );

  const handleSave = form.handleSubmit(async (values) => {
    setHasError(false);

    const response = await fetch('/api/coverage', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });

    if (!response.ok) {
      setHasError(true);

      return;
    }

    router.refresh();
  });

  return (
    <form onSubmit={handleSave}>
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="coverage-daily">{t('label_daily_leads')}</FieldLabel>
            <Input
              id="coverage-daily"
              type="number"
              min={1}
              max={MAX_DAILY_LEADS}
              {...form.register('dailyLeads', { valueAsNumber: true })}
            />
            {form.formState.errors.dailyLeads && (
              <FieldError>{t('error_number', { max: MAX_DAILY_LEADS })}</FieldError>
            )}
          </Field>

          <Field>
            <FieldLabel htmlFor="coverage-per-search">{t('label_leads_per_search')}</FieldLabel>
            <Input
              id="coverage-per-search"
              type="number"
              min={1}
              max={MAX_LEADS_PER_SEARCH}
              {...form.register('leadsPerSearch', { valueAsNumber: true })}
            />
            {form.formState.errors.leadsPerSearch && (
              <FieldError>{t('error_number', { max: MAX_LEADS_PER_SEARCH })}</FieldError>
            )}
          </Field>

          <Field>
            <FieldLabel htmlFor="coverage-website">{searchT('label_website')}</FieldLabel>

            <Select
              value={websiteFilter}
              onValueChange={(value) => {
                const filter = WEBSITE_FILTERS.find((option) => option === value);

                if (filter) {
                  form.setValue('websiteFilter', filter);
                }
              }}
            >
              <SelectTrigger id="coverage-website" className="w-full">
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                {WEBSITE_FILTERS.map((filter) => (
                  <SelectItem key={filter} value={filter}>
                    {searchT(`website_${filter}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel htmlFor="coverage-processor">{searchT('label_processor')}</FieldLabel>

            <Select
              value={processor}
              onValueChange={(value) => {
                const next = PROCESSORS.find((option) => option === value);

                if (next) {
                  form.setValue('processor', next);
                }
              }}
            >
              <SelectTrigger id="coverage-processor" className="w-full">
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

        <Field orientation="horizontal">
          <Checkbox
            id="coverage-active"
            checked={isActive}
            onCheckedChange={(checked) => {
              form.setValue('isActive', checked === true);
            }}
          />
          <FieldContent>
            <FieldLabel htmlFor="coverage-active">{t('label_active')}</FieldLabel>
            <FieldDescription>{t('hint_active')}</FieldDescription>
          </FieldContent>
        </Field>

        <p className="text-sm text-muted-foreground">{t('estimate', { cost: estimate })}</p>

        <Button type="submit" className="w-fit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Spinner />}
          {t('button_save')}
        </Button>

        {hasError && (
          <Alert variant="destructive">
            <AlertDescription>{t('error_save')}</AlertDescription>
          </Alert>
        )}
      </FieldGroup>
    </form>
  );
};
