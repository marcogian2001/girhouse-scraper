'use client';

import { useTranslations } from 'next-intl';
import type { UseFormReturn } from 'react-hook-form';
import { useWatch } from 'react-hook-form';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { parallelProcessorEnum } from '@/models/Schema';
import type { CampaignSettingsInput } from '@/validations/CampaignValidation';
import { MAX_EMAILS_PER_SEQUENCE } from '@/validations/CampaignValidation';

type Processor = (typeof parallelProcessorEnum.enumValues)[number];

const PROCESSORS: Processor[] = ['lite', 'base', 'core', 'pro'];

/** The wizard owns the form so answers survive stepping back and forward. */
export type CampaignSettingsFormApi = UseFormReturn<CampaignSettingsInput>;

export const CampaignSettingsForm = (props: {
  form: CampaignSettingsFormApi;
  knowledgeAssets: { id: string; name: string }[];
}) => {
  const t = useTranslations('CampaignSettingsForm');

  // `useWatch` rather than `form.watch`: the React compiler caches `watch` results
  // on the stable `form` reference, so the UI would never reflect later changes
  const emailCount = useWatch({ control: props.form.control, name: 'emailCount' });
  const delaysDays = useWatch({ control: props.form.control, name: 'delaysDays' });
  const selectedProcessor = useWatch({ control: props.form.control, name: 'processor' });
  const knowledgeAssetIds =
    useWatch({ control: props.form.control, name: 'knowledgeAssetIds' }) ?? [];

  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="campaign-name">{t('label_name')}</FieldLabel>
        <Input id="campaign-name" {...props.form.register('name')} />
        {props.form.formState.errors.name && <FieldError>{t('error_name')}</FieldError>}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="email-count">{t('label_email_count')}</FieldLabel>
          <Input
            id="email-count"
            type="number"
            min={1}
            max={MAX_EMAILS_PER_SEQUENCE}
            {...props.form.register('emailCount', {
              valueAsNumber: true,
              onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
                const next = Number(event.target.value);

                if (!Number.isFinite(next) || next < 1 || next > MAX_EMAILS_PER_SEQUENCE) {
                  return;
                }

                // Keep exactly one delay per step; the last one is never used
                props.form.setValue(
                  'delaysDays',
                  Array.from({ length: next }, (_unused, index) =>
                    index === next - 1 ? 0 : (delaysDays[index] ?? 3),
                  ),
                );
              },
            })}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="processor">{t('label_processor')}</FieldLabel>

          <Select
            value={selectedProcessor}
            onValueChange={(value) => {
              const processor = PROCESSORS.find((option) => option === value);

              if (processor) {
                props.form.setValue('processor', processor);
              }
            }}
          >
            <SelectTrigger id="processor" className="w-full">
              <SelectValue />
            </SelectTrigger>

            <SelectContent>
              {PROCESSORS.map((processor) => (
                <SelectItem key={processor} value={processor}>
                  {t(`processor_${processor}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <FieldSet>
        <FieldLegend variant="label">{t('label_delays')}</FieldLegend>
        <FieldDescription>{t('hint_delays')}</FieldDescription>

        <div className="flex flex-wrap gap-3">
          {Array.from({ length: emailCount }, (_unused, index) => index)
            .slice(0, -1)
            .map((index) => (
              <Field key={index} className="w-28">
                <FieldLabel htmlFor={`delay-${index}`} className="text-xs">
                  {t('label_delay_step', { from: index + 1, to: index + 2 })}
                </FieldLabel>
                <Input
                  id={`delay-${index}`}
                  type="number"
                  min={0}
                  max={60}
                  {...props.form.register(`delaysDays.${index}`, { valueAsNumber: true })}
                />
              </Field>
            ))}
        </div>
      </FieldSet>

      {props.knowledgeAssets.length > 0 && (
        <FieldSet>
          <FieldLegend variant="label">{t('label_knowledge')}</FieldLegend>

          <div className="space-y-2">
            {props.knowledgeAssets.map((asset) => (
              <FieldLabel key={asset.id} className="flex items-center gap-2 font-normal">
                <Checkbox
                  checked={knowledgeAssetIds.includes(asset.id)}
                  onCheckedChange={(checked) => {
                    props.form.setValue(
                      'knowledgeAssetIds',
                      checked
                        ? [...knowledgeAssetIds, asset.id]
                        : knowledgeAssetIds.filter((id) => id !== asset.id),
                    );
                  }}
                />
                {asset.name}
              </FieldLabel>
            ))}
          </div>
        </FieldSet>
      )}

      <Field>
        <FieldLabel htmlFor="extra-prompt">{t('label_prompt')}</FieldLabel>
        <Textarea id="extra-prompt" rows={6} {...props.form.register('extraPrompt')} />
        <FieldDescription>{t('hint_prompt')}</FieldDescription>
      </Field>
    </FieldGroup>
  );
};
