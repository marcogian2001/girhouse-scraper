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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useRouter } from '@/libs/I18nNavigation';
import {
  EmailPollValidation,
  MAX_POLL_CONTACTS_PER_CAMPAIGN,
} from '@/validations/EmailPollValidation';

export const NewEmailPollForm = (props: {
  campaigns: { id: string; name: string; model: string; written: number }[];
}) => {
  const t = useTranslations('NewEmailPollForm');
  const router = useRouter();
  const [hasError, setHasError] = useState(false);

  const form = useForm({
    resolver: zodResolver(EmailPollValidation),
    defaultValues: { name: '', campaignIds: [], contactsPerCampaign: 2 },
  });
  const campaignIds = useWatch({ control: form.control, name: 'campaignIds' });

  const handleCreate = form.handleSubmit(async (values) => {
    setHasError(false);

    const response = await fetch('/api/email-polls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });

    if (!response.ok) {
      setHasError(true);

      return;
    }

    const created: { poll: { id: string } } = await response.json();

    router.push(`/dashboard/email-polls/${created.poll.id}/`);
    router.refresh();
  });

  return (
    <form onSubmit={handleCreate} className="max-w-xl">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="name">{t('label_name')}</FieldLabel>
          <Input id="name" {...form.register('name')} />
          <FieldDescription>{t('hint_name')}</FieldDescription>
          {form.formState.errors.name && <FieldError>{t('error_name')}</FieldError>}
        </Field>

        <FieldSet>
          <FieldLegend variant="label">{t('label_campaigns')}</FieldLegend>
          <FieldDescription>{t('hint_campaigns')}</FieldDescription>

          <div className="space-y-2">
            {props.campaigns.map((campaign) => (
              <FieldLabel key={campaign.id} className="flex items-center gap-2 font-normal">
                <Checkbox
                  checked={campaignIds.includes(campaign.id)}
                  disabled={campaign.written === 0}
                  onCheckedChange={(checked) => {
                    form.setValue(
                      'campaignIds',
                      checked
                        ? [...campaignIds, campaign.id]
                        : campaignIds.filter((id) => id !== campaign.id),
                      { shouldValidate: form.formState.isSubmitted },
                    );
                  }}
                />
                <span>{campaign.name}</span>
                <span className="text-muted-foreground">
                  {t('campaign_meta', { model: campaign.model, written: campaign.written })}
                </span>
              </FieldLabel>
            ))}
          </div>

          {form.formState.errors.campaignIds && <FieldError>{t('error_campaigns')}</FieldError>}
        </FieldSet>

        <Field>
          <FieldLabel htmlFor="contacts-per-campaign">{t('label_contacts')}</FieldLabel>
          {/* Wrapped, since the field stretches its direct children to full width */}
          <div>
            <Input
              id="contacts-per-campaign"
              type="number"
              min={1}
              max={MAX_POLL_CONTACTS_PER_CAMPAIGN}
              className="w-28"
              {...form.register('contactsPerCampaign', { valueAsNumber: true })}
            />
          </div>
          <FieldDescription>{t('hint_contacts')}</FieldDescription>
          {form.formState.errors.contactsPerCampaign && (
            <FieldError>{t('error_contacts', { max: MAX_POLL_CONTACTS_PER_CAMPAIGN })}</FieldError>
          )}
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
