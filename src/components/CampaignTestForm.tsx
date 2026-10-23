'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useRouter } from '@/libs/I18nNavigation';

/**
 * Edits who and where a campaign tests and what it is meant to prove. An empty target
 * or zone goes back to what the record reads off the contacts, shown as the placeholder.
 * @param props Component props.
 * @param props.campaignId The campaign.
 * @param props.target The target typed by hand, if any.
 * @param props.zone The zone typed by hand, if any.
 * @param props.hypothesis What the campaign tests, if written.
 * @param props.autoTarget The target read off the contacts.
 * @param props.autoZone The zone read off the contacts.
 * @returns The form.
 */
export const CampaignTestForm = (props: {
  campaignId: string;
  target: string | null;
  zone: string | null;
  hypothesis: string | null;
  autoTarget: string | null;
  autoZone: string | null;
}) => {
  const t = useTranslations('CampaignTests');
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setIsSaving(true);

        const response = await fetch(`/api/campaigns/${props.campaignId}/test`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            target: data.get('target'),
            zone: data.get('zone'),
            hypothesis: data.get('hypothesis'),
          }),
        });

        setIsSaving(false);
        setStatus(response.ok ? 'saved' : 'error');

        if (response.ok) {
          router.refresh();
        }
      }}
    >
      <FieldGroup className="gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="test-target">{t('label_target')}</FieldLabel>
            <Input
              id="test-target"
              name="target"
              defaultValue={props.target ?? ''}
              placeholder={props.autoTarget ?? ''}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="test-zone">{t('label_zone')}</FieldLabel>
            <Input
              id="test-zone"
              name="zone"
              defaultValue={props.zone ?? ''}
              placeholder={props.autoZone ?? ''}
            />
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="test-hypothesis">{t('label_hypothesis')}</FieldLabel>
          <Textarea
            id="test-hypothesis"
            name="hypothesis"
            rows={2}
            defaultValue={props.hypothesis ?? ''}
            placeholder={t('placeholder_hypothesis')}
          />
          <FieldDescription>{t('hint_targeting')}</FieldDescription>
        </Field>
      </FieldGroup>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isSaving}>
          {isSaving && <Spinner />}
          {t('button_save')}
        </Button>
        {status === 'saved' && <span className="text-sm text-muted-foreground">{t('saved')}</span>}
        {status === 'error' && <span className="text-sm text-destructive">{t('error_save')}</span>}
      </div>
    </form>
  );
};
