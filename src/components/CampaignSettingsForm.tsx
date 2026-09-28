'use client';

import { useFormatter, useTranslations } from 'next-intl';
import type { UseFormReturn } from 'react-hook-form';
import { useWatch } from 'react-hook-form';
import { KnowledgeMentionTextarea } from '@/components/KnowledgeMentionTextarea';
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { parallelProcessorEnum } from '@/models/Schema';
import type { CopywritingProvider, CopywritingTokens } from '@/utils/CopywritingModels';
import {
  COPYWRITING_MODELS,
  estimateCallCostMicros,
  findCopywritingModel,
} from '@/utils/CopywritingModels';
import { microsToUsd, USD_FORMAT } from '@/utils/UsageFormat';
import type { CampaignSettingsInput } from '@/validations/CampaignValidation';
import { MAX_EMAILS_PER_SEQUENCE } from '@/validations/CampaignValidation';

type Processor = (typeof parallelProcessorEnum.enumValues)[number];

const PROCESSORS: Processor[] = ['lite', 'base', 'core', 'pro'];

const PROVIDERS: CopywritingProvider[] = ['anthropic', 'openai'];

/** What model cost estimates are based on. */
export type CostBasis = { tokens: CopywritingTokens; fromHistory: boolean };

/** The wizard owns the form so answers survive stepping back and forward. */
export type CampaignSettingsFormApi = UseFormReturn<CampaignSettingsInput>;

export const CampaignSettingsForm = (props: {
  form: CampaignSettingsFormApi;
  // `missingOnOpenAI` flags PDFs uploaded before OpenAI was configured
  knowledgeAssets: {
    id: string;
    name: string;
    kind: 'prompt' | 'document';
    missingOnOpenAI: boolean;
  }[];
  contactCount: number;
  costBasis: CostBasis;
}) => {
  const t = useTranslations('CampaignSettingsForm');
  const format = useFormatter();

  // `useWatch` rather than `form.watch`: the React compiler caches `watch` results
  // on the stable `form` reference, so the UI would never reflect later changes
  const emailCount = useWatch({ control: props.form.control, name: 'emailCount' });
  const delaysDays = useWatch({ control: props.form.control, name: 'delaysDays' });
  const selectedProcessor = useWatch({ control: props.form.control, name: 'processor' });
  const selectedModel = useWatch({ control: props.form.control, name: 'copywritingModel' });
  const knowledgeAssetIds =
    useWatch({ control: props.form.control, name: 'knowledgeAssetIds' }) ?? [];
  const extraPrompt = useWatch({ control: props.form.control, name: 'extraPrompt' }) ?? '';

  const documents = props.knowledgeAssets.filter((asset) => asset.kind === 'document');

  const skipsPdfs =
    findCopywritingModel(selectedModel ?? '')?.provider === 'openai' &&
    props.knowledgeAssets.some(
      (asset) => asset.missingOnOpenAI && knowledgeAssetIds.includes(asset.id),
    );

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

      <Field>
        <FieldLabel htmlFor="copywriting-model">{t('label_model')}</FieldLabel>

        <Select
          value={selectedModel}
          onValueChange={(value) => {
            const model = COPYWRITING_MODELS.find((option) => option.id === value);

            if (model) {
              props.form.setValue('copywritingModel', model.id);
            }
          }}
        >
          <SelectTrigger id="copywriting-model" className="w-full">
            <SelectValue />
          </SelectTrigger>

          <SelectContent>
            {PROVIDERS.map((provider) => (
              <SelectGroup key={provider}>
                <SelectLabel>{t(`group_${provider}`)}</SelectLabel>

                {COPYWRITING_MODELS.filter((model) => model.provider === provider).map((model) => (
                  <SelectItem key={model.id} value={model.id} className="*:[span]:last:flex-1">
                    {model.label}
                    <span className="ml-auto text-muted-foreground tabular-nums">
                      {t('model_cost', {
                        cost: format.number(
                          microsToUsd(
                            props.contactCount *
                              estimateCallCostMicros({ model, tokens: props.costBasis.tokens }),
                          ),
                          USD_FORMAT,
                        ),
                      })}
                    </span>
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>

        <FieldDescription>
          {t(props.costBasis.fromHistory ? 'hint_model_cost_history' : 'hint_model_cost_typical', {
            count: props.contactCount,
          })}
        </FieldDescription>

        {skipsPdfs && <FieldDescription>{t('hint_model_pdf_missing')}</FieldDescription>}
      </Field>

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
        <KnowledgeMentionTextarea
          id="extra-prompt"
          rows={6}
          documents={documents}
          value={extraPrompt}
          onValueChange={(value) => {
            props.form.setValue('extraPrompt', value);
          }}
        />
        <FieldDescription>{t('hint_prompt')}</FieldDescription>
      </Field>
    </FieldGroup>
  );
};
